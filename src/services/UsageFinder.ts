/**
 * Usage Finder Service
 * コードの使用箇所を検索するサービス
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';

export interface UsageLocation {
  file: string;
  line: number;
  column: number;
  code: string; // 使用箇所のコード行
  context: string; // 前後のコンテキスト
  type: 'function_call' | 'method_call' | 'class_instantiation' | 'static_call' | 'import' | 'extends' | 'implements';
  preview: string; // プレビュー用の短い文字列
}

export interface UsageAnalysis {
  identifier: string;
  totalUsages: number;
  usageLocations: UsageLocation[];
  usagePatterns: UsagePattern[];
  commonContexts: string[];
}

export interface UsagePattern {
  pattern: string;
  count: number;
  examples: string[];
  description: string;
}

export class UsageFinder {
  private cache: Map<string, UsageAnalysis>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * 指定された識別子の使用箇所を検索
   */
  async findUsages(
    identifier: string,
    workspaceRoot: string,
    currentFile?: string
  ): Promise<UsageAnalysis> {
    const cacheKey = `${identifier}@${workspaceRoot}`;

    // キャッシュをチェック
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const usageLocations: UsageLocation[] = [];

    try {
      // PHPファイルを検索
      const phpFiles = await glob('**/*.php', {
        cwd: workspaceRoot,
        ignore: ['**/vendor/**', '**/node_modules/**', '**/storage/**', '**/cache/**'],
        absolute: true
      });

      // 各ファイルで使用箇所を検索
      for (const file of phpFiles) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const fileUsages = await this.findUsagesInDocument(identifier, document);
          usageLocations.push(...fileUsages);
        } catch (error) {
          // ファイルが開けない場合はスキップ
          continue;
        }
      }

      // 使用パターンを分析
      const patterns = this.analyzeUsagePatterns(usageLocations, identifier);

      // 共通コンテキストを抽出
      const commonContexts = this.extractCommonContexts(usageLocations);

      const analysis: UsageAnalysis = {
        identifier,
        totalUsages: usageLocations.length,
        usageLocations,
        usagePatterns: patterns,
        commonContexts
      };

      // キャッシュに保存
      this.cache.set(cacheKey, analysis);

      return analysis;
    } catch (error) {
      console.error('Error finding usages:', error);
      return {
        identifier,
        totalUsages: 0,
        usageLocations: [],
        usagePatterns: [],
        commonContexts: []
      };
    }
  }

  /**
   * ドキュメント内で使用箇所を検索
   */
  private async findUsagesInDocument(
    identifier: string,
    document: vscode.TextDocument
  ): Promise<UsageLocation[]> {
    const usages: UsageLocation[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // 様々な使用パターンを検索
    const patterns = [
      // 関数呼び出し: identifier()
      new RegExp(`\\b${this.escapeRegex(identifier)}\\s*\\(`, 'g'),
      // メソッド呼び出し: ->identifier()
      new RegExp(`->\\s*${this.escapeRegex(identifier)}\\s*\\(`, 'g'),
      // 静的呼び出し: ::identifier()
      new RegExp(`::\\s*${this.escapeRegex(identifier)}\\s*\\(`, 'g'),
      // クラスのインスタンス化: new identifier()
      new RegExp(`new\\s+${this.escapeRegex(identifier)}\\s*\\(`, 'g'),
      // クラスの継承: extends identifier
      new RegExp(`extends\\s+${this.escapeRegex(identifier)}\\b`, 'g'),
      // インターフェースの実装: implements identifier
      new RegExp(`implements\\s+[^{]*${this.escapeRegex(identifier)}\\b`, 'g'),
      // use文でのインポート: use identifier
      new RegExp(`use\\s+[^;]*${this.escapeRegex(identifier)}\\b`, 'g')
    ];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // コメント行はスキップ
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
        continue;
      }

      for (const pattern of patterns) {
        pattern.lastIndex = 0; // リセット
        let match;

        while ((match = pattern.exec(line)) !== null) {
          const column = match.index;
          const type = this.determineUsageType(match[0]);

          // コンテキストを取得（前後2行）
          const startLine = Math.max(0, lineIndex - 2);
          const endLine = Math.min(lines.length - 1, lineIndex + 2);
          const context = lines.slice(startLine, endLine + 1).join('\n');

          usages.push({
            file: document.fileName,
            line: lineIndex + 1,
            column,
            code: line.trim(),
            context,
            type,
            preview: this.createUsagePreview(line.trim(), identifier)
          });
        }
      }
    }

    return usages;
  }

  /**
   * 使用タイプを判定
   */
  private determineUsageType(matchedText: string): UsageLocation['type'] {
    if (matchedText.startsWith('new ')) {
      return 'class_instantiation';
    } else if (matchedText.includes('->')) {
      return 'method_call';
    } else if (matchedText.includes('::')) {
      return 'static_call';
    } else if (matchedText.startsWith('extends')) {
      return 'extends';
    } else if (matchedText.startsWith('implements')) {
      return 'implements';
    } else if (matchedText.startsWith('use')) {
      return 'import';
    } else {
      return 'function_call';
    }
  }

  /**
   * 使用パターンを分析
   */
  private analyzeUsagePatterns(
    usages: UsageLocation[],
    identifier: string
  ): UsagePattern[] {
    const patternMap = new Map<string, { count: number; examples: string[] }>();

    // タイプごとにグループ化
    for (const usage of usages) {
      const patternKey = this.getPatternKey(usage);

      if (!patternMap.has(patternKey)) {
        patternMap.set(patternKey, { count: 0, examples: [] });
      }

      const pattern = patternMap.get(patternKey)!;
      pattern.count++;

      // 最大3つの例を保存
      if (pattern.examples.length < 3) {
        pattern.examples.push(usage.code);
      }
    }

    // パターンを配列に変換してソート
    const patterns: UsagePattern[] = [];
    for (const [patternKey, data] of patternMap.entries()) {
      patterns.push({
        pattern: patternKey,
        count: data.count,
        examples: data.examples,
        description: this.getPatternDescription(patternKey)
      });
    }

    // 出現頻度でソート
    patterns.sort((a, b) => b.count - a.count);

    return patterns;
  }

  /**
   * パターンキーを取得
   */
  private getPatternKey(usage: UsageLocation): string {
    switch (usage.type) {
      case 'function_call':
        return '関数呼び出し';
      case 'method_call':
        return 'メソッド呼び出し';
      case 'static_call':
        return '静的メソッド呼び出し';
      case 'class_instantiation':
        return 'クラスのインスタンス化';
      case 'extends':
        return 'クラスの継承';
      case 'implements':
        return 'インターフェースの実装';
      case 'import':
        return 'インポート (use文)';
      default:
        return '不明';
    }
  }

  /**
   * パターンの説明を取得
   */
  private getPatternDescription(patternKey: string): string {
    const descriptions: { [key: string]: string } = {
      '関数呼び出し': '通常の関数として呼び出されています',
      'メソッド呼び出し': 'オブジェクトのメソッドとして呼び出されています',
      '静的メソッド呼び出し': '静的メソッドとして呼び出されています',
      'クラスのインスタンス化': 'newキーワードでインスタンス化されています',
      'クラスの継承': '他のクラスに継承されています',
      'インターフェースの実装': 'インターフェースとして実装されています',
      'インポート (use文)': 'use文でインポートされています'
    };
    return descriptions[patternKey] || '';
  }

  /**
   * 共通コンテキストを抽出
   */
  private extractCommonContexts(usages: UsageLocation[]): string[] {
    const contexts = new Set<string>();

    for (const usage of usages) {
      // ファイルの種類を判定
      const fileName = path.basename(usage.file);
      if (fileName.includes('Controller')) {
        contexts.add('コントローラー内での使用');
      } else if (fileName.includes('Model')) {
        contexts.add('モデル内での使用');
      } else if (fileName.includes('Service')) {
        contexts.add('サービス内での使用');
      } else if (fileName.includes('Test')) {
        contexts.add('テストコード内での使用');
      } else if (fileName.includes('Repository')) {
        contexts.add('リポジトリ内での使用');
      }

      // ディレクトリ構造から判定
      if (usage.file.includes('/app/Http/')) {
        contexts.add('HTTPレイヤーでの使用');
      } else if (usage.file.includes('/database/')) {
        contexts.add('データベース関連での使用');
      } else if (usage.file.includes('/routes/')) {
        contexts.add('ルート定義での使用');
      }
    }

    return Array.from(contexts);
  }

  /**
   * 使用箇所のプレビューを作成
   */
  private createUsagePreview(code: string, identifier: string): string {
    // 長すぎる場合は省略
    if (code.length > 80) {
      const index = code.indexOf(identifier);
      if (index !== -1) {
        const start = Math.max(0, index - 30);
        const end = Math.min(code.length, index + identifier.length + 30);
        return '...' + code.substring(start, end) + '...';
      }
      return code.substring(0, 77) + '...';
    }
    return code;
  }

  /**
   * 正規表現用にエスケープ
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache.clear();
  }
}
