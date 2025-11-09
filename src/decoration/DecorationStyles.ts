/**
 * デコレーションスタイル定義
 * 関数の種別ごとの色とスタイルを管理
 */

import * as vscode from 'vscode';
import { FunctionType } from '../types/common';

export interface DecorationConfig {
  color: string;
  underlineStyle: vscode.TextEditorDecorationType | null;
  hoverMessage: string;
}

export class DecorationStyles {
  private decorationTypes: Map<FunctionType, vscode.TextEditorDecorationType>;
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.decorationTypes = new Map();
    this.config = vscode.workspace.getConfiguration('mireru.colorization');
    this.initializeDecorations();
  }

  /**
   * デコレーションタイプを初期化
   */
  private initializeDecorations(): void {
    // 設定から色を取得
    const phpBuiltinColor = this.config.get<string>('phpBuiltin', '#4A90E2');
    const frameworkColor = this.config.get<string>('framework', '#50C878');
    const userDefinedColor = this.config.get<string>('userDefined', '#FF8C00');
    const libraryColor = this.config.get<string>('library', '#9B59B6');
    const showUnderline = this.config.get<boolean>('showUnderline', true);

    // PHP標準関数のデコレーション（青色、点線）
    this.decorationTypes.set(
      FunctionType.PhpBuiltin,
      vscode.window.createTextEditorDecorationType({
        color: phpBuiltinColor,
        textDecoration: showUnderline ? 'underline dotted' : 'none',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      })
    );

    // フレームワーク関数のデコレーション（緑色、波線）
    this.decorationTypes.set(
      FunctionType.Framework,
      vscode.window.createTextEditorDecorationType({
        color: frameworkColor,
        textDecoration: showUnderline ? 'underline wavy' : 'none',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      })
    );

    // ユーザー定義関数のデコレーション（オレンジ色、実線）
    this.decorationTypes.set(
      FunctionType.UserDefined,
      vscode.window.createTextEditorDecorationType({
        color: userDefinedColor,
        textDecoration: showUnderline ? 'underline solid' : 'none',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      })
    );

    // サードパーティライブラリのデコレーション（紫色、二重線）
    this.decorationTypes.set(
      FunctionType.Library,
      vscode.window.createTextEditorDecorationType({
        color: libraryColor,
        textDecoration: showUnderline ? 'underline double' : 'none',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      })
    );
  }

  /**
   * 指定された関数タイプのデコレーションを取得
   */
  getDecorationType(type: FunctionType): vscode.TextEditorDecorationType | undefined {
    return this.decorationTypes.get(type);
  }

  /**
   * ホバーメッセージを生成
   */
  createHoverMessage(
    type: FunctionType,
    functionName: string,
    definitionLocation?: string
  ): vscode.MarkdownString {
    const message = new vscode.MarkdownString();
    message.isTrusted = true;
    message.supportHtml = true;

    switch (type) {
      case FunctionType.PhpBuiltin:
        message.appendMarkdown(`**PHP標準関数**\n\n`);
        message.appendMarkdown(`\`${functionName}()\`\n\n`);
        message.appendMarkdown(
          `[PHP公式ドキュメント](https://www.php.net/manual/ja/function.${functionName.replace(
            /_/g,
            '-'
          )}.php)`
        );
        break;

      case FunctionType.Framework:
        message.appendMarkdown(`**Laravel フレームワーク関数**\n\n`);
        message.appendMarkdown(`\`${functionName}()\`\n\n`);
        message.appendMarkdown(
          `Laravelが提供する関数またはメソッドです。\n\n`
        );
        message.appendMarkdown(
          `[Laravel公式ドキュメント](https://laravel.com/docs)`
        );
        break;

      case FunctionType.UserDefined:
        message.appendMarkdown(`**プロジェクト内関数**\n\n`);
        message.appendMarkdown(`\`${functionName}()\`\n\n`);
        if (definitionLocation) {
          message.appendMarkdown(`定義: ${definitionLocation}\n\n`);
        }
        message.appendMarkdown(`このプロジェクトで定義された関数です。`);
        break;

      case FunctionType.Library:
        message.appendMarkdown(`**サードパーティライブラリ**\n\n`);
        message.appendMarkdown(`\`${functionName}()\`\n\n`);
        message.appendMarkdown(
          `Composerでインストールされたライブラリの関数またはメソッドです。`
        );
        break;

      default:
        message.appendMarkdown(`**関数**\n\n`);
        message.appendMarkdown(`\`${functionName}()\``);
    }

    return message;
  }

  /**
   * 設定が変更されたときに再初期化
   */
  reload(): void {
    // 既存のデコレーションを破棄
    this.decorationTypes.forEach(decoration => decoration.dispose());
    this.decorationTypes.clear();

    // 設定を再読み込み
    this.config = vscode.workspace.getConfiguration('mireru.colorization');

    // デコレーションを再初期化
    this.initializeDecorations();
  }

  /**
   * リソースを破棄
   */
  dispose(): void {
    this.decorationTypes.forEach(decoration => decoration.dispose());
    this.decorationTypes.clear();
  }

  /**
   * 色の設定を取得
   */
  getColorConfig(): Record<FunctionType, string> {
    return {
      [FunctionType.PhpBuiltin]: this.config.get<string>('phpBuiltin', '#4A90E2'),
      [FunctionType.Framework]: this.config.get<string>('framework', '#50C878'),
      [FunctionType.UserDefined]: this.config.get<string>('userDefined', '#FF8C00'),
      [FunctionType.Library]: this.config.get<string>('library', '#9B59B6'),
      [FunctionType.Unknown]: '#CCCCCC'
    };
  }
}
