/**
 * Definition Finder Service
 * コード内の定義を検索するサービス
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';
import { PhpParser } from '../parser/PhpParser';

export interface DefinitionLocation {
  file: string;
  line: number;
  column: number;
  type: 'function' | 'class' | 'method' | 'property' | 'constant' | 'interface' | 'trait';
  name: string;
  namespace?: string;
  className?: string;
  code: string; // 定義のコード全体
  preview: string; // プレビュー用の短いコード
}

export class DefinitionFinder {
  private parser: PhpParser;
  private definitionCache: Map<string, DefinitionLocation[]>;

  constructor() {
    this.parser = new PhpParser();
    this.definitionCache = new Map();
  }

  /**
   * 指定された識別子の定義を検索
   */
  async findDefinition(
    identifier: string,
    currentDocument: vscode.TextDocument,
    workspaceRoot: string
  ): Promise<DefinitionLocation | null> {
    // まず現在のファイルで検索
    const localDef = await this.findInDocument(identifier, currentDocument);
    if (localDef) {
      return localDef;
    }

    // プロジェクト全体で検索
    return await this.findInWorkspace(identifier, workspaceRoot);
  }

  /**
   * 現在のドキュメント内で定義を検索
   */
  private async findInDocument(
    identifier: string,
    document: vscode.TextDocument
  ): Promise<DefinitionLocation | null> {
    const text = document.getText();
    const filePath = document.fileName;

    try {
      // PHPパーサーでパース
      const parsed = this.parser.parseCode(text, filePath);

      // 関数定義を検索
      for (const func of parsed.functions) {
        if (func.name === identifier) {
          const paramNames = func.params.map(p => p.name);
          return {
            file: filePath,
            line: func.location.startLine,
            column: func.location.startColumn,
            type: 'function',
            name: func.name,
            namespace: parsed.namespace?.name,
            code: this.extractCodeBlock(text, func.location.startLine, func.location.endLine),
            preview: this.createPreview(func.name, 'function', paramNames)
          };
        }
      }

      // クラス定義を検索
      for (const cls of parsed.classes) {
        if (cls.name === identifier) {
          return {
            file: filePath,
            line: cls.location.startLine,
            column: cls.location.startColumn,
            type: 'class',
            name: cls.name,
            namespace: parsed.namespace?.name,
            code: this.extractCodeBlock(text, cls.location.startLine, cls.location.endLine),
            preview: this.createPreview(cls.name, 'class')
          };
        }

        // クラスのメソッドを検索
        for (const method of cls.methods) {
          if (method.name === identifier) {
            const paramNames = method.params.map(p => p.name);
            return {
              file: filePath,
              line: method.location.startLine,
              column: method.location.startColumn,
              type: 'method',
              name: method.name,
              namespace: parsed.namespace?.name,
              className: cls.name,
              code: this.extractCodeBlock(text, method.location.startLine, method.location.endLine),
              preview: this.createPreview(method.name, 'method', paramNames, cls.name)
            };
          }
        }

        // プロパティを検索
        for (const prop of cls.properties) {
          if (prop.name === identifier || prop.name === `$${identifier}`) {
            return {
              file: filePath,
              line: prop.location.startLine,
              column: prop.location.startColumn,
              type: 'property',
              name: prop.name,
              namespace: parsed.namespace?.name,
              className: cls.name,
              code: `${prop.visibility} ${prop.name};`,
              preview: `${cls.name}::${prop.name}`
            };
          }
        }
      }

      // インターフェース定義を検索
      for (const iface of parsed.interfaces) {
        if (iface.name === identifier) {
          return {
            file: filePath,
            line: iface.location.startLine,
            column: iface.location.startColumn,
            type: 'interface',
            name: iface.name,
            namespace: parsed.namespace?.name,
            code: this.extractCodeBlock(text, iface.location.startLine, iface.location.endLine),
            preview: this.createPreview(iface.name, 'interface')
          };
        }
      }
    } catch (error) {
      console.error('Error parsing document:', error);
    }

    return null;
  }

  /**
   * ワークスペース全体で定義を検索
   */
  private async findInWorkspace(
    identifier: string,
    workspaceRoot: string
  ): Promise<DefinitionLocation | null> {
    try {
      // PHPファイルを検索（vendorディレクトリを除外）
      const phpFiles = await glob('**/*.php', {
        cwd: workspaceRoot,
        ignore: ['**/vendor/**', '**/node_modules/**'],
        absolute: true
      });

      // 各ファイルを検索
      for (const file of phpFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const definition = await this.findInDocument(identifier, document);

          if (definition) {
            return definition;
          }
        } catch (error) {
          // ファイルが開けない場合はスキップ
          continue;
        }
      }
    } catch (error) {
      console.error('Error searching workspace:', error);
    }

    return null;
  }

  /**
   * コードブロックを抽出
   */
  private extractCodeBlock(text: string, startLine: number, endLine: number): string {
    const lines = text.split('\n');
    const codeLines = lines.slice(startLine - 1, endLine);
    return codeLines.join('\n');
  }

  /**
   * プレビュー文字列を生成
   */
  private createPreview(
    name: string,
    type: string,
    parameters?: string[],
    className?: string
  ): string {
    let preview = '';

    if (className) {
      preview = `${className}::`;
    }

    preview += name;

    if (parameters) {
      preview += `(${parameters.join(', ')})`;
    } else if (type === 'function' || type === 'method') {
      preview += '()';
    }

    return preview;
  }

  /**
   * VS Codeの組み込み定義検索を使用（フォールバック）
   */
  async findDefinitionWithVSCode(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location[]> {
    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
      );

      return locations || [];
    } catch (error) {
      console.error('Error using VS Code definition provider:', error);
      return [];
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.definitionCache.clear();
  }
}
