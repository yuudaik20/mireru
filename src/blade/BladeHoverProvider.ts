/**
 * Blade Hover Provider
 * Bladeテンプレート内の変数にホバーした時に説明を表示
 */

import * as vscode from 'vscode';
import { BladeVariableAnalyzer } from './BladeVariableAnalyzer';
import { AIServiceManager } from '../ai/AIServiceManager';

export class BladeHoverProvider implements vscode.HoverProvider {
  private analyzer: BladeVariableAnalyzer;
  private aiService: AIServiceManager;

  constructor(aiService: AIServiceManager) {
    this.analyzer = new BladeVariableAnalyzer();
    this.aiService = aiService;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // カーソル位置の単語を取得（より広範なパターン）
    const wordRange = document.getWordRangeAtPosition(position, /\$[\w>-]+|[\w]+/);

    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    // $で始まる変数、Blade式内、またはPHPタグ内のみ対象
    const inBlade = this.isInBladeExpression(document, position);
    const inPhpTag = this.isInPhpTag(document, position);

    if (!word.startsWith('$') && !inBlade && !inPhpTag) {
      return null;
    }

    // Blade式またはPHP式全体を取得
    let fullExpression = this.getFullBladeExpression(document, position);

    if (!fullExpression && inPhpTag) {
      fullExpression = this.getFullPhpExpression(document, position);
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

    // Markdownで説明を構築
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    // タイトル
    markdown.appendMarkdown(`### 🔍 ${context.variable}\n\n`);

    // タイプ
    const typeLabel = this.getTypeLabel(context.type);
    markdown.appendMarkdown(`**種別**: ${typeLabel}\n\n`);

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

    return new vscode.Hover(markdown, wordRange);
  }

  /**
   * PHPタグの中にいるかチェック
   */
  private isInPhpTag(document: vscode.TextDocument, position: vscode.Position): boolean {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // <?php ?> の中にいるかチェック
    let inPhp = false;

    for (let i = 0; i < charPos; i++) {
      if (line.substring(i, i + 5) === '<?php' || line.substring(i, i + 2) === '<?') {
        inPhp = true;
      } else if (line.substring(i, i + 2) === '?>') {
        inPhp = false;
      }
    }

    return inPhp;
  }

  /**
   * PHP式全体を取得
   * 例: <?php echo $row->category->name; ?> から $row->category->name を取得
   */
  private getFullPhpExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // $から始まる変数チェーンを抽出
    let startPos = charPos;

    // $の位置まで戻る
    while (startPos > 0 && line[startPos] !== '$') {
      startPos--;
    }

    if (line[startPos] !== '$') {
      return null;
    }

    // 変数チェーンの終わりを探す
    let endPos = startPos + 1;
    while (endPos < line.length) {
      const char = line[endPos];
      // 変数名、->、[]、:: などが続く限り
      if (/[a-zA-Z0-9_]/.test(char) || char === '-' || char === '>' || char === '[' || char === ']' || char === ':') {
        endPos++;
      } else {
        break;
      }
    }

    const expression = line.substring(startPos, endPos);
    return expression || null;
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
   * Blade式全体を取得
   * 例: {{ $row->category->name }} 全体を取得
   */
  private getFullBladeExpression(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string | null {
    const line = document.lineAt(position.line).text;
    const charPos = position.character;

    // {{ の位置を探す
    let startPos = charPos;
    while (startPos > 0) {
      if (line[startPos] === '{' && line[startPos + 1] === '{') {
        break;
      }
      startPos--;
    }

    // }} の位置を探す
    let endPos = charPos;
    while (endPos < line.length - 1) {
      if (line[endPos] === '}' && line[endPos + 1] === '}') {
        endPos += 2;
        break;
      }
      endPos++;
    }

    if (startPos >= 0 && endPos > startPos) {
      const expression = line.substring(startPos, endPos);

      // {{ }} があるか確認
      if (expression.includes('{{') && expression.includes('}}')) {
        return expression;
      }
    }

    // {!! !!} も対応
    startPos = charPos;
    while (startPos > 0) {
      if (line[startPos] === '{' && line[startPos + 1] === '!' && line[startPos + 2] === '!') {
        break;
      }
      startPos--;
    }

    endPos = charPos;
    while (endPos < line.length - 2) {
      if (line[endPos] === '!' && line[endPos + 1] === '!' && line[endPos + 2] === '}') {
        endPos += 3;
        break;
      }
      endPos++;
    }

    if (startPos >= 0 && endPos > startPos) {
      const expression = line.substring(startPos, endPos);

      if (expression.includes('{!!') && expression.includes('!!}')) {
        return expression;
      }
    }

    return null;
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
