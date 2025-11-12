/**
 * Laravel Route Details Panel
 * ルートの詳細情報をWebviewで表示
 */

import * as vscode from 'vscode';
import { RouteInfo } from '../types/laravel';
import { LaravelAnalyzer } from '../laravel/LaravelAnalyzer';
import * as fs from 'fs';
import * as path from 'path';

export class RouteDetailsPanel {
  private static laravelAnalyzer: LaravelAnalyzer;
  private static rootPath: string;

  /**
   * ルート詳細をWebviewパネルで表示
   */
  static show(route: RouteInfo, context: vscode.ExtensionContext, analyzer: LaravelAnalyzer, rootPath: string): void {
    this.laravelAnalyzer = analyzer;
    this.rootPath = rootPath;
    const panel = vscode.window.createWebviewPanel(
      'mireruRouteDetails',
      `ルート詳細: ${route.method} ${route.uri}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.getHtmlContent(route);

    // メッセージハンドラー
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'jumpToDefinition':
            await this.jumpToLocation(route.location);
            break;
          case 'jumpToController':
            if (route.controller) {
              await this.jumpToController(route.controller, route.action);
            }
            break;
          case 'searchRouteUsages':
            if (route.name) {
              await this.searchRouteUsages(route.name);
            }
            break;
        }
      }
    );
  }

  /**
   * ロケーションにジャンプ
   */
  private static async jumpToLocation(location: { file: string; startLine: number; startColumn: number }): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(location.file);
      const editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(location.startLine - 1, location.startColumn);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      vscode.window.showErrorMessage(`ファイルを開けませんでした: ${location.file}`);
    }
  }

  /**
   * コントローラーにジャンプ
   */
  private static async jumpToController(controller: string, action?: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showWarningMessage('ワークスペースが開かれていません');
        return;
      }

      // app/Http/Controllers 配下を検索
      const controllerFiles = await vscode.workspace.findFiles(
        `app/Http/Controllers/**/${controller}.php`,
        '**/vendor/**'
      );

      if (controllerFiles.length > 0) {
        const document = await vscode.workspace.openTextDocument(controllerFiles[0]);
        const editor = await vscode.window.showTextDocument(document);

        // アクションメソッドを検索
        if (action) {
          const text = document.getText();
          const methodPattern = new RegExp(`function\\s+${action}\\s*\\(`);
          const match = methodPattern.exec(text);

          if (match) {
            const position = document.positionAt(match.index);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          }
        }
      } else {
        vscode.window.showWarningMessage(`コントローラーが見つかりませんでした: ${controller}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`コントローラーを開けませんでした: ${error}`);
    }
  }

  /**
   * ルート使用箇所を検索
   */
  private static async searchRouteUsages(routeName: string): Promise<void> {
    try {
      // LaravelAnalyzerを使ってルート名の使用箇所を検索
      const usages = await this.laravelAnalyzer.findRouteNameUsages(this.rootPath, routeName);

      if (usages.length === 0) {
        vscode.window.showInformationMessage(`ルート名 '${routeName}' の使用箇所が見つかりませんでした`);
        return;
      }

      // QuickPickで使用箇所を表示
      const items = usages.map(usage => ({
        label: `$(file) ${path.basename(usage.file)}:${usage.line}`,
        description: usage.usage,
        detail: usage.content,
        usage
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${usages.length}個の使用箇所が見つかりました。選択してジャンプ`,
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        // 選択した箇所にジャンプ
        const document = await vscode.workspace.openTextDocument(selected.usage.file);
        const editor = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(selected.usage.line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`ルート名の使用箇所検索に失敗しました: ${error}`);
    }
  }

  /**
   * HTMLコンテンツを生成
   */
  private static getHtmlContent(route: RouteInfo): string {
    const methodColor = this.getMethodColor(route.method);

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ルート詳細</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1, h2, h3 { color: var(--vscode-editor-foreground); }
    h1 { font-size: 24px; border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 20px; }
    h2 { font-size: 20px; margin-top: 30px; color: var(--vscode-textLink-foreground); }
    h3 { font-size: 16px; margin-top: 20px; }

    .header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
    }

    .method-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 5px;
      color: white;
      background: ${methodColor};
      font-weight: bold;
      font-size: 14px;
    }

    .uri {
      font-family: 'Courier New', monospace;
      font-size: 18px;
      color: var(--vscode-textLink-foreground);
    }

    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin: 10px 0;
    }

    .info-label {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }

    .info-value {
      font-family: 'Courier New', monospace;
    }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      margin: 2px;
      border-radius: 3px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 12px;
    }

    .action-button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
      margin: 5px 5px 5px 0;
    }

    .action-button:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--vscode-button-secondaryBackground);
    }

    code {
      font-family: 'Courier New', monospace;
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }

    .location {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: underline;
    }

    .location:hover {
      color: var(--vscode-textLink-activeForeground);
    }

    .empty-state {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .actions {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="method-badge">${this.escapeHtml(route.method.toUpperCase())}</span>
    <span class="uri">${this.escapeHtml(route.uri)}</span>
  </div>

  ${route.name ? `
  <div class="section">
    <h2>📛 ルート名</h2>
    <code>${this.escapeHtml(route.name)}</code>
  </div>
  ` : ''}

  ${route.controller && route.action ? `
  <div class="section">
    <h2>🎯 コントローラーとアクション</h2>
    <div class="info-grid">
      <div class="info-label">コントローラー:</div>
      <div class="info-value">${this.escapeHtml(route.controller)}</div>
      <div class="info-label">アクション:</div>
      <div class="info-value">${this.escapeHtml(route.action)}</div>
    </div>
    <button class="action-button" onclick="jumpToController()">
      📂 コントローラーを開く
    </button>
  </div>
  ` : ''}

  ${route.middleware && route.middleware.length > 0 ? `
  <div class="section">
    <h2>🛡️ ミドルウェア</h2>
    <div>
      ${route.middleware.map(m => `<span class="badge">${this.escapeHtml(m)}</span>`).join('')}
    </div>
  </div>
  ` : ''}

  ${route.group ? `
  <div class="section">
    <h2>📦 グループ情報</h2>
    <div class="info-grid">
      ${route.group.prefix ? `
        <div class="info-label">プレフィックス:</div>
        <div class="info-value">${this.escapeHtml(route.group.prefix)}</div>
      ` : ''}
      ${route.group.namespace ? `
        <div class="info-label">名前空間:</div>
        <div class="info-value">${this.escapeHtml(route.group.namespace)}</div>
      ` : ''}
      ${route.group.middleware && route.group.middleware.length > 0 ? `
        <div class="info-label">グループミドルウェア:</div>
        <div>
          ${route.group.middleware.map(m => `<span class="badge">${this.escapeHtml(m)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>📍 定義場所</h2>
    <div>
      <span class="location" onclick="jumpToDefinition()">
        ${this.escapeHtml(route.location.file)}:${route.location.startLine}
      </span>
    </div>
  </div>

  ${route.name ? `
  <div class="section">
    <h2>🔍 使用例</h2>
    <div>
      <p>Bladeテンプレート内:</p>
      <code>&lt;a href="{{ route('${this.escapeHtml(route.name)}') }}"&gt;リンク&lt;/a&gt;</code>
      <br><br>
      <p>コントローラー内:</p>
      <code>return redirect()->route('${this.escapeHtml(route.name)}');</code>
    </div>
  </div>
  ` : ''}

  <div class="actions">
    <h2>📌 アクション</h2>
    <button class="action-button" onclick="jumpToDefinition()">
      📄 定義に移動
    </button>
    <button class="action-button" onclick="jumpToController()" ${!route.controller ? 'disabled title="コントローラーが定義されていません"' : ''}>
      📂 コントローラーを開く
    </button>
    <button class="action-button" onclick="searchRouteUsages()" ${!route.name ? 'disabled title="ルート名が定義されていません"' : ''}>
      🔎 使用箇所を検索
    </button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function jumpToDefinition() {
      vscode.postMessage({ command: 'jumpToDefinition' });
    }

    function jumpToController() {
      vscode.postMessage({ command: 'jumpToController' });
    }

    function searchRouteUsages() {
      vscode.postMessage({ command: 'searchRouteUsages' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * HTTPメソッドに応じた色を取得
   */
  private static getMethodColor(method: string): string {
    const colorMap: Record<string, string> = {
      'GET': '#61affe',
      'POST': '#49cc90',
      'PUT': '#fca130',
      'PATCH': '#50e3c2',
      'DELETE': '#f93e3e',
      'OPTIONS': '#0d5aa7',
      'ANY': '#808080'
    };

    return colorMap[method.toUpperCase()] || '#808080';
  }

  /**
   * HTMLエスケープ
   */
  private static escapeHtml(text: string): string {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  }
}
