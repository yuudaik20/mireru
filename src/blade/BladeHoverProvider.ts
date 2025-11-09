/**
 * Blade Hover Provider
 * Bladeテンプレート内の変数にホバーした時に説明を表示
 */

import * as vscode from 'vscode';
import { BladeVariableAnalyzer } from './BladeVariableAnalyzer';
import { AIServiceManager } from '../ai/AIServiceManager';
import { DefinitionFinder } from '../services/DefinitionFinder';

export class BladeHoverProvider implements vscode.HoverProvider {
  private analyzer: BladeVariableAnalyzer;
  private aiService: AIServiceManager;
  private definitionFinder: DefinitionFinder;

  constructor(aiService: AIServiceManager) {
    this.analyzer = new BladeVariableAnalyzer();
    this.aiService = aiService;
    this.definitionFinder = new DefinitionFinder();
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const languageId = document.languageId;

    // 言語ごとの変数・関数検出パターン
    let wordRange;
    if (languageId === 'javascript' || languageId === 'typescript') {
      // JavaScript/TypeScript: 変数、プロパティアクセス、関数呼び出し
      wordRange = document.getWordRangeAtPosition(
        position,
        /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*(?:\s*\()?|\b(?:const|let|var|function|class)\b/
      );
    } else {
      // PHP/Blade/HTML: $変数、@ディレクティブ、関数呼び出し
      wordRange = document.getWordRangeAtPosition(
        position,
        /\$[a-zA-Z_][a-zA-Z0-9_]*(?:->[a-zA-Z_][a-zA-Z0-9_]*|\[[^\]]+\])*|@[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*\s*\(/
      );
    }

    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    // 言語ごとのコンテキスト判定
    if (languageId === 'javascript' || languageId === 'typescript') {
      // JavaScript/TypeScriptの場合は常に有効
      const jsExpression = this.getJavaScriptExpression(document, position);
      if (!jsExpression) {
        return null;
      }
    } else {
      // PHP/Blade/HTMLの場合は従来のロジック
      const inBlade = this.isInBladeExpression(document, position);
      const inPhpTag = this.isInPhpTag(document, position);
      const inBladeDirective = this.isInBladeDirective(document, position);

      const isVariable = word.startsWith('$');
      const isBladeDirective = word.startsWith('@');
      const isFunction = word.includes('(');
      const inValidContext = inBlade || inPhpTag || inBladeDirective;

      if (!isVariable && !isBladeDirective && !isFunction && !inValidContext) {
        return null;
      }
    }

    // 式全体を取得（言語ごとに分岐）
    let fullExpression = null;
    let expressionRange = null;

    if (languageId === 'javascript' || languageId === 'typescript') {
      // JavaScriptの式を取得
      const jsExpr = this.getJavaScriptExpression(document, position);
      if (jsExpr) {
        fullExpression = jsExpr.expression;
        expressionRange = jsExpr.range;
      }
    } else {
      // PHP/Blade/HTMLの式を取得（優先順位付き）
      const inBlade = this.isInBladeExpression(document, position);
      const inPhpTag = this.isInPhpTag(document, position);
      const inBladeDirective = this.isInBladeDirective(document, position);

      // 1. Blade式から取得を試みる
      if (inBlade) {
        const bladeExpr = this.getFullBladeExpression(document, position);
        if (bladeExpr) {
          fullExpression = bladeExpr.expression;
          expressionRange = bladeExpr.range;
        }
      }

      // 2. PHPタグ内から取得を試みる
      if (!fullExpression && inPhpTag) {
        const phpExpr = this.getFullPhpExpression(document, position);
        if (phpExpr) {
          fullExpression = phpExpr.expression;
          expressionRange = phpExpr.range;
        }
      }

      // 3. Bladeディレクティブ内から取得を試みる
      if (!fullExpression && inBladeDirective) {
        const directiveExpr = this.getBladeDirectiveExpression(document, position);
        if (directiveExpr) {
          fullExpression = directiveExpr.expression;
          expressionRange = directiveExpr.range;
        }
      }
    }

    if (!fullExpression) {
      return null;
    }

    // 変数コンテキストを解析
    const context = this.analyzer.analyzeVariable(
      fullExpression,
      document.getText(),
      document.fileName
    );

    // 定義を検索（プロジェクト内）
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let definition = null;
    if (workspaceFolders && workspaceFolders.length > 0) {
      try {
        // 変数名や関数名を抽出（$や@を除く）
        const cleanExpression = fullExpression.replace(/^\$|^@/, '').split('->')[0].split('.')[0].trim();
        if (cleanExpression) {
          definition = await this.definitionFinder.findDefinition(
            cleanExpression,
            document,
            workspaceFolders[0].uri.fsPath
          );
        }
      } catch (error) {
        // 定義検索エラーは無視
        console.log('Definition search error:', error);
      }
    }

    // Markdownで説明を構築
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // タイトル
    markdown.appendMarkdown(`### 🔍 ${context.variable}\n\n`);

    // 定義情報があれば表示
    if (definition) {
      const relativePath = vscode.workspace.asRelativePath(definition.file);
      markdown.appendMarkdown(`**📍 定義**: [${relativePath}:${definition.line}](${vscode.Uri.file(definition.file).toString()}#L${definition.line})\n\n`);

      if (definition.type) {
        const typeLabels: { [key: string]: string } = {
          'function': '関数',
          'class': 'クラス',
          'method': 'メソッド',
          'property': 'プロパティ',
          'variable': '変数',
          'constant': '定数'
        };
        markdown.appendMarkdown(`**種類**: ${typeLabels[definition.type] || definition.type}\n\n`);
      }

      // 定義のプレビュー（最初の3行）
      if (definition.code) {
        const previewLines = definition.code.split('\n').slice(0, 3).join('\n');
        markdown.appendMarkdown(`**プレビュー**:\n\`\`\`${languageId}\n${previewLines}\n\`\`\`\n\n`);
      }
    } else {
      // タイプ
      const typeLabel = this.getTypeLabel(context.type);
      markdown.appendMarkdown(`**種別**: ${typeLabel}\n\n`);
    }

    // モデル名
    if (context.modelName) {
      markdown.appendMarkdown(`**モデル**: ${context.modelName}\n\n`);
    }

    // 説明
    markdown.appendMarkdown(`${context.description}\n\n`);

    // プロパティチェーン
    if (context.propertyChain && context.propertyChain.length > 0) {
      markdown.appendMarkdown(`**プロパティチェーン**: \n`);
      markdown.appendMarkdown(`\`${context.variable} → ${context.propertyChain.join(' → ')}\`\n\n`);
    }

    // 可能な値
    if (context.possibleValues && context.possibleValues.length > 0) {
      markdown.appendMarkdown(`**値**: ${context.possibleValues.join(', ')}\n\n`);
    }

    // AI説明を取得（非同期、オプション）
    if (this.aiService.isConfigured()) {
      markdown.appendMarkdown(`\n\n---\n\n`);
      markdown.appendMarkdown(`💡 *右クリック → 「Mireru: 説明を表示」でAIによる詳細な説明を取得できます*`);
    }

    return new vscode.Hover(markdown, expressionRange || wordRange);
  }

  /**
   * Bladeディレクティブの中にいるかチェック
   * @if, @foreach, @while などの () 内にいるかチェック
   */
  private isInBladeDirective(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // @directive(...) のパターンを探す
    const directivePattern = /@(if|elseif|unless|foreach|for|while|switch|isset|empty|auth|guest)\s*\(/g;
    let match;

    while ((match = directivePattern.exec(line)) !== null) {
      const openParenPos = line.indexOf('(', match.index);
      if (openParenPos === -1) {continue;}

      // 対応する閉じ括弧を探す
      let depth = 1;
      let closeParenPos = openParenPos + 1;

      while (closeParenPos < line.length && depth > 0) {
        if (line[closeParenPos] === '(') {
          depth++;
        } else if (line[closeParenPos] === ')') {
          depth--;
        }
        closeParenPos++;
      }

      // カーソルが () の中にいるかチェック
      if (charPos > openParenPos && charPos < closeParenPos) {
        return true;
      }
    }

    return false;
  }

  /**
   * Bladeディレクティブ内の式を取得
   */
  private getBladeDirectiveExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { expression: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // @directive(...) のパターンを探す
    const directivePattern = /@(if|elseif|unless|foreach|for|while|switch|isset|empty|auth|guest)\s*\(/g;
    let match;

    while ((match = directivePattern.exec(line)) !== null) {
      const openParenPos = line.indexOf('(', match.index);
      if (openParenPos === -1) {continue;}

      // 対応する閉じ括弧を探す
      let depth = 1;
      let closeParenPos = openParenPos + 1;

      while (closeParenPos < line.length && depth > 0) {
        if (line[closeParenPos] === '(') {
          depth++;
        } else if (line[closeParenPos] === ')') {
          depth--;
        }
        closeParenPos++;
      }

      // カーソルが () の中にいる場合、その内容を返す
      if (charPos > openParenPos && charPos < closeParenPos) {
        const expression = line.substring(openParenPos + 1, closeParenPos - 1).trim();
        const range = new vscode.Range(
          position.line,
          openParenPos + 1,
          position.line,
          closeParenPos - 1
        );
        return { expression, range };
      }
    }

    return null;
  }

  /**
   * PHPタグの中にいるかチェック（複数行対応）
   */
  private isInPhpTag(document: vscode.TextDocument, position: vscode.Position): boolean {
    // 現在行から前方にスキャンして最も近いPHPタグを探す
    let inPhp = false;

    for (let lineNum = position.line; lineNum >= Math.max(0, position.line - 50); lineNum--) {
      const line = document.lineAt(lineNum).text;
      const endChar = lineNum === position.line ? position.character : line.length;

      // 現在行の場合はカーソル位置まで、それ以外は行末までチェック
      for (let i = endChar - 1; i >= 0; i--) {
        if (line.substring(i, i + 2) === '?>') {
          return false; // 閉じタグが見つかった = PHP外
        }
        if (line.substring(i, i + 5) === '<?php' ||
            (line.substring(i, i + 2) === '<?' && line[i + 2] !== '?')) {
          return true; // 開始タグが見つかった = PHP内
        }
      }
    }

    return false;
  }

  /**
   * PHP式全体を取得（改善版）
   * 変数チェーン、関数呼び出し、配列アクセスなどを正確に抽出
   */
  private getFullPhpExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { expression: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // まず、カーソル位置の文字を確認
    let startPos = charPos;

    // $または関数名の開始位置まで戻る
    while (startPos > 0) {
      const char = line[startPos - 1];
      if (char === '$') {
        startPos--;
        break;
      } else if (/[a-zA-Z_]/.test(char)) {
        startPos--;
      } else if (char === ' ' || char === '\t') {
        // スペースの後に文字がある場合は、それが関数名の可能性
        break;
      } else {
        break;
      }
    }

    // 式の終わりを探す（より正確に）
    let endPos = charPos;
    let depth = 0; // 括弧のネスト深度
    let inString = false;
    let stringChar = '';

    while (endPos < line.length) {
      const char = line[endPos];

      // 文字列の開始/終了を追跡
      if ((char === '"' || char === "'") && (endPos === 0 || line[endPos - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }

      if (!inString) {
        // 括弧の深度を追跡
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          if (depth > 0) {
            depth--;
          } else {
            break; // 括弧が閉じられたら終了
          }
        }

        // 変数名、プロパティアクセス、配列アクセス、関数呼び出しの一部
        if (/[a-zA-Z0-9_]/.test(char) ||
            char === '$' || char === '-' || char === '>' ||
            char === '(' || char === ')' ||
            char === '[' || char === ']' ||
            char === ':' || char === '\\' || char === ' ') {
          endPos++;
        } else if (depth > 0) {
          // 括弧内であれば、ほとんどの文字を許可
          endPos++;
        } else {
          break;
        }
      } else {
        endPos++;
      }
    }

    if (startPos >= endPos) {
      return null;
    }

    const expression = line.substring(startPos, endPos).trim();

    // 有効な式かチェック（$で始まるか、識別子を含む）
    if (!expression || (!expression.includes('$') && !expression.match(/[a-zA-Z_]/))) {
      return null;
    }

    const range = new vscode.Range(
      position.line,
      startPos,
      position.line,
      endPos
    );

    return { expression, range };
  }

  /**
   * Blade式の中にいるかチェック
   */
  private isInBladeExpression(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // {{ }} の中にいるかチェック
    let inExpression = false;
    let braceCount = 0;

    for (let i = 0; i < charPos; i++) {
      if (line[i] === '{' && line[i + 1] === '{') {
        inExpression = true;
        braceCount++;
        i++; // skip next {
      } else if (line[i] === '}' && line[i + 1] === '}' && braceCount > 0) {
        braceCount--;
        if (braceCount === 0) {
          inExpression = false;
        }
        i++; // skip next }
      }
    }

    return inExpression;
  }

  /**
   * Blade式全体を取得（改善版）
   * {{ }}, {!! !!}, {{{ }}} などに対応
   */
  private getFullBladeExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { expression: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // 複数のBladeパターンをチェック
    const patterns = [
      { open: '{{', close: '}}', offset: 2 },
      { open: '{!!', close: '!!}', offset: 3 },
      { open: '{{{', close: '}}}', offset: 3 }
    ];

    for (const pattern of patterns) {
      // 開始タグの位置を探す
      let startPos = charPos;
      while (startPos >= 0) {
        if (line.substring(startPos, startPos + pattern.offset) === pattern.open) {
          break;
        }
        startPos--;
      }

      if (startPos < 0) {
        continue;
      }

      // 終了タグの位置を探す
      let endPos = charPos;
      while (endPos < line.length) {
        if (line.substring(endPos, endPos + pattern.offset) === pattern.close) {
          endPos += pattern.offset;
          break;
        }
        endPos++;
      }

      // カーソルが開始タグと終了タグの間にある場合
      if (startPos <= charPos && charPos <= endPos) {
        // タグ内の式を抽出（タグ自体は除く）
        const innerExpression = line.substring(
          startPos + pattern.offset,
          endPos - pattern.offset
        ).trim();

        if (innerExpression) {
          const range = new vscode.Range(
            position.line,
            startPos + pattern.offset,
            position.line,
            endPos - pattern.offset
          );

          return { expression: innerExpression, range };
        }
      }
    }

    return null;
  }

  /**
   * JavaScript式全体を取得
   * 変数、プロパティアクセス、関数呼び出しなどを正確に抽出
   */
  private getJavaScriptExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { expression: string; range: vscode.Range } | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // カーソル位置から式の開始位置まで戻る
    let startPos = charPos;
    while (startPos > 0) {
      const char = line[startPos - 1];
      // 識別子、ドット、括弧、$が続く限り戻る
      if (/[a-zA-Z0-9_$.]/.test(char) || char === '[' || char === ']') {
        startPos--;
      } else if (char === ' ' || char === '\t') {
        // スペースの前の文字をチェック
        if (startPos >= 2 && /[a-zA-Z_$]/.test(line[startPos - 2])) {
          startPos--;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // 式の終わりを探す
    let endPos = charPos;
    let depth = 0;
    let inString = false;
    let stringChar = '';

    while (endPos < line.length) {
      const char = line[endPos];

      // 文字列の開始/終了を追跡
      if ((char === '"' || char === "'" || char === '`') &&
          (endPos === 0 || line[endPos - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }

      if (!inString) {
        // 括弧の深度を追跡
        if (char === '(' || char === '[' || char === '{') {
          depth++;
          endPos++;
        } else if (char === ')' || char === ']' || char === '}') {
          if (depth > 0) {
            depth--;
            endPos++;
          } else {
            break;
          }
        } else if (/[a-zA-Z0-9_$.]/.test(char) || char === ' ') {
          endPos++;
        } else if (depth > 0) {
          // 括弧内であれば、ほとんどの文字を許可
          endPos++;
        } else {
          break;
        }
      } else {
        endPos++;
      }
    }

    if (startPos >= endPos) {
      return null;
    }

    const expression = line.substring(startPos, endPos).trim();

    // 有効な式かチェック
    if (!expression || !expression.match(/[a-zA-Z_$]/)) {
      return null;
    }

    const range = new vscode.Range(
      position.line,
      startPos,
      position.line,
      endPos
    );

    return { expression, range };
  }

  /**
   * タイプのラベルを取得
   */
  private getTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'model': 'Eloquentモデル',
      'collection': 'コレクション',
      'property': 'プロパティ',
      'unknown': '変数'
    };

    return labels[type] || type;
  }
}
