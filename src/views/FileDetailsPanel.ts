/**
 * File Details Panel
 * ファイル詳細をWebviewで表示
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileInfo } from '../types/project';

export class FileDetailsPanel {
  /**
   * ファイル詳細パネルを表示
   */
  static show(file: FileInfo, context: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'mireruFileDetails',
      `ファイル詳細: ${file.name}`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.getHtmlContent(file);

    // Webviewからのメッセージを処理
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile':
            await this.openFile(file.path);
            break;
          case 'revealInExplorer':
            await this.revealInExplorer(file.path);
            break;
          case 'copyPath':
            await vscode.env.clipboard.writeText(file.path);
            vscode.window.showInformationMessage('パスをクリップボードにコピーしました');
            break;
          case 'analyzeDependencies':
            vscode.commands.executeCommand('mireru.showDependencyGraph', file);
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    // パネルアイコン
    panel.iconPath = {
      light: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icon-light.svg')),
      dark: vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icon-dark.svg'))
    };
  }

  /**
   * HTMLコンテンツを生成
   */
  private static getHtmlContent(file: FileInfo): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ファイル詳細: ${this.escapeHtml(file.name)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      color: var(--vscode-editor-foreground);
    }
    .file-path {
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
      margin-top: 5px;
      font-family: var(--vscode-editor-font-family);
    }
    .section {
      margin-bottom: 25px;
      padding: 15px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 12px;
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    .info-label {
      color: var(--vscode-descriptionForeground);
      font-weight: bold;
    }
    .info-value {
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 12px;
      margin-right: 5px;
      margin-bottom: 5px;
    }
    .role-badge {
      background-color: var(--vscode-charts-blue);
      color: white;
      padding: 5px 12px;
      border-radius: 5px;
      font-weight: bold;
      display: inline-block;
      margin-top: 5px;
    }
    .list {
      margin: 10px 0;
      padding-left: 20px;
    }
    .list-item {
      margin: 5px 0;
      color: var(--vscode-editor-foreground);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    .btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
      font-family: var(--vscode-font-family);
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .code-block {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      overflow-x: auto;
      margin: 10px 0;
    }
    .empty-state {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      text-align: center;
      padding: 20px;
    }
    .importance-indicator {
      display: inline-block;
      width: 100px;
      height: 10px;
      background-color: var(--vscode-progressBar-background);
      border-radius: 5px;
      overflow: hidden;
      margin-left: 10px;
      vertical-align: middle;
    }
    .importance-fill {
      height: 100%;
      background-color: var(--vscode-charts-green);
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📄 ${this.escapeHtml(file.name)}</h1>
    <div class="file-path">${this.escapeHtml(file.relativePath)}</div>
  </div>

  ${this.generateBasicInfoSection(file)}
  ${this.generateRoleSection(file)}
  ${this.generateDefinitionsSection(file)}
  ${this.generateDependenciesSection(file)}
  ${this.generateStatisticsSection(file)}

  <div class="actions">
    <button class="btn" onclick="openFile()">📂 ファイルを開く</button>
    <button class="btn btn-secondary" onclick="revealInExplorer()">🔍 エクスプローラーで表示</button>
    <button class="btn btn-secondary" onclick="copyPath()">📋 パスをコピー</button>
    ${file.dependencies && file.dependencies.length > 0 ?
      '<button class="btn btn-secondary" onclick="analyzeDependencies()">🔗 依存関係を分析</button>' : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function openFile() {
      vscode.postMessage({ command: 'openFile' });
    }

    function revealInExplorer() {
      vscode.postMessage({ command: 'revealInExplorer' });
    }

    function copyPath() {
      vscode.postMessage({ command: 'copyPath' });
    }

    function analyzeDependencies() {
      vscode.postMessage({ command: 'analyzeDependencies' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * 基本情報セクションを生成
   */
  private static generateBasicInfoSection(file: FileInfo): string {
    const lastModified = new Date(file.lastModified).toLocaleString('ja-JP');

    return `
  <div class="section">
    <div class="section-title">📊 基本情報</div>
    <div class="info-grid">
      <div class="info-label">ファイル名:</div>
      <div class="info-value">${this.escapeHtml(file.name)}</div>

      <div class="info-label">相対パス:</div>
      <div class="info-value">${this.escapeHtml(file.relativePath)}</div>

      <div class="info-label">絶対パス:</div>
      <div class="info-value code-block">${this.escapeHtml(file.path)}</div>

      <div class="info-label">ファイルサイズ:</div>
      <div class="info-value">${this.formatFileSize(file.size)}</div>

      <div class="info-label">行数:</div>
      <div class="info-value">${this.formatNumber(file.lines)}行</div>

      <div class="info-label">言語:</div>
      <div class="info-value"><span class="badge">${this.escapeHtml(file.languageId)}</span></div>

      <div class="info-label">最終更新:</div>
      <div class="info-value">${lastModified}</div>

      ${file.importance !== undefined ? `
      <div class="info-label">重要度:</div>
      <div class="info-value">
        ${file.importance}
        <div class="importance-indicator">
          <div class="importance-fill" style="width: ${Math.min(file.importance * 10, 100)}%"></div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>`;
  }

  /**
   * 役割セクションを生成
   */
  private static generateRoleSection(file: FileInfo): string {
    if (!file.role) {
      return '';
    }

    return `
  <div class="section">
    <div class="section-title">🎯 ファイルの役割</div>
    <div class="role-badge">${this.escapeHtml(file.role)}</div>
    <p style="margin-top: 15px; color: var(--vscode-descriptionForeground);">
      このファイルの主な目的と責務を示しています。
    </p>
  </div>`;
  }

  /**
   * 定義セクションを生成
   */
  private static generateDefinitionsSection(file: FileInfo): string {
    if (!file.definitions ||
        (!file.definitions.classes?.length &&
         !file.definitions.functions?.length &&
         !file.definitions.interfaces?.length)) {
      return '';
    }

    let content = `
  <div class="section">
    <div class="section-title">🔧 定義されている要素</div>`;

    if (file.definitions.classes && file.definitions.classes.length > 0) {
      content += `
    <div style="margin-bottom: 15px;">
      <strong>クラス (${file.definitions.classes.length}):</strong>
      <div class="list">
        ${file.definitions.classes.map(c => `<div class="list-item">• ${this.escapeHtml(c)}</div>`).join('')}
      </div>
    </div>`;
    }

    if (file.definitions.functions && file.definitions.functions.length > 0) {
      content += `
    <div style="margin-bottom: 15px;">
      <strong>関数 (${file.definitions.functions.length}):</strong>
      <div class="list">
        ${file.definitions.functions.map(f => `<div class="list-item">• ${this.escapeHtml(f)}</div>`).join('')}
      </div>
    </div>`;
    }

    if (file.definitions.interfaces && file.definitions.interfaces.length > 0) {
      content += `
    <div style="margin-bottom: 15px;">
      <strong>インターフェース (${file.definitions.interfaces.length}):</strong>
      <div class="list">
        ${file.definitions.interfaces.map(i => `<div class="list-item">• ${this.escapeHtml(i)}</div>`).join('')}
      </div>
    </div>`;
    }

    content += `
  </div>`;

    return content;
  }

  /**
   * 依存関係セクションを生成
   */
  private static generateDependenciesSection(file: FileInfo): string {
    if (!file.dependencies || file.dependencies.length === 0) {
      return '';
    }

    return `
  <div class="section">
    <div class="section-title">🔗 依存関係 (${file.dependencies.length})</div>
    <p style="color: var(--vscode-descriptionForeground); margin-bottom: 10px;">
      このファイルが依存している他のファイル:
    </p>
    <div class="list">
      ${file.dependencies.map(dep => `<div class="list-item">• ${this.escapeHtml(dep)}</div>`).join('')}
    </div>
  </div>`;
  }

  /**
   * 統計セクションを生成
   */
  private static generateStatisticsSection(file: FileInfo): string {
    // 計算された統計情報
    const avgLineLength = file.lines > 0 ? Math.round(file.size / file.lines) : 0;
    const isLargeFile = file.lines > 500 || file.size > 100000;
    const complexity = this.estimateComplexity(file);

    return `
  <div class="section">
    <div class="section-title">📈 統計情報</div>
    <div class="info-grid">
      <div class="info-label">平均行長:</div>
      <div class="info-value">${avgLineLength}文字</div>

      <div class="info-label">ファイルサイズ:</div>
      <div class="info-value">
        ${isLargeFile ? '<span class="badge" style="background-color: var(--vscode-charts-orange);">大きいファイル</span>' : '<span class="badge" style="background-color: var(--vscode-charts-green);">標準サイズ</span>'}
      </div>

      <div class="info-label">推定複雑度:</div>
      <div class="info-value"><span class="badge">${complexity}</span></div>

      ${file.definitions ? `
      <div class="info-label">定義数:</div>
      <div class="info-value">
        ${(file.definitions.classes?.length || 0) + (file.definitions.functions?.length || 0) + (file.definitions.interfaces?.length || 0)}個
      </div>
      ` : ''}

      ${file.dependencies ? `
      <div class="info-label">依存ファイル数:</div>
      <div class="info-value">${file.dependencies.length}個</div>
      ` : ''}
    </div>
  </div>`;
  }

  /**
   * ファイルの複雑度を推定
   */
  private static estimateComplexity(file: FileInfo): string {
    let score = 0;

    // 行数による評価
    if (file.lines > 1000) score += 3;
    else if (file.lines > 500) score += 2;
    else if (file.lines > 200) score += 1;

    // 定義数による評価
    if (file.definitions) {
      const totalDefs = (file.definitions.classes?.length || 0) +
                       (file.definitions.functions?.length || 0) +
                       (file.definitions.interfaces?.length || 0);
      if (totalDefs > 20) score += 3;
      else if (totalDefs > 10) score += 2;
      else if (totalDefs > 5) score += 1;
    }

    // 依存関係による評価
    if (file.dependencies) {
      if (file.dependencies.length > 20) score += 2;
      else if (file.dependencies.length > 10) score += 1;
    }

    if (score >= 6) return '高';
    if (score >= 3) return '中';
    return '低';
  }

  /**
   * ファイルを開く
   */
  private static async openFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(`ファイルを開けませんでした: ${error}`);
    }
  }

  /**
   * エクスプローラーで表示
   */
  private static async revealInExplorer(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } catch (error) {
      vscode.window.showErrorMessage(`エクスプローラーで表示できませんでした: ${error}`);
    }
  }

  /**
   * HTMLエスケープ
   */
  private static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * ファイルサイズをフォーマット
   */
  private static formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * 数値をフォーマット
   */
  private static formatNumber(num: number): string {
    return num.toLocaleString();
  }
}
