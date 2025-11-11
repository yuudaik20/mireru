/**
 * Dependency Graph Panel (Simplified)
 * 依存関係を軽量なリスト形式で表示
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyAnalysisResult } from '../types/dependency';

export class DependencyGraphPanel {
  /**
   * 依存関係グラフパネルを表示
   */
  static show(result: DependencyAnalysisResult, context: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'mireruDependencyGraph',
      `依存関係: ${path.basename(result.rootPath)}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.getHtmlContent(result);

    // Webviewからのメッセージを処理
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'openFile':
            await this.openFile(message.filePath, message.line);
            break;
          case 'showCircular':
            await this.showCircularDependencies(result.circularDependencies);
            break;
        }
      },
      undefined,
      context.subscriptions
    );
  }

  /**
   * HTMLコンテンツを生成（シンプル版）
   */
  private static getHtmlContent(result: DependencyAnalysisResult): string {
    const graph = result.graph;

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>依存関係</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }
    .header {
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      border-radius: 5px;
      border: 1px solid var(--vscode-panel-border);
    }
    .stat-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: var(--vscode-editor-foreground);
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .node-list {
      display: grid;
      gap: 8px;
    }
    .node-item {
      padding: 12px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 3px;
      cursor: pointer;
      transition: background-color 0.2s;
      border: 1px solid transparent;
    }
    .node-item:hover {
      background-color: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }
    .node-name {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 14px;
    }
    .node-stats {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 15px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-high {
      background-color: var(--vscode-charts-red);
      color: white;
    }
    .badge-medium {
      background-color: var(--vscode-charts-orange);
      color: white;
    }
    .badge-low {
      background-color: var(--vscode-charts-green);
      color: white;
    }
    .warning-box {
      background-color: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
      cursor: pointer;
    }
    .warning-box:hover {
      opacity: 0.8;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 依存関係分析</h1>
    <p style="color: var(--vscode-descriptionForeground);">プロジェクト: ${this.escapeHtml(path.basename(result.rootPath))}</p>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">総ファイル数</div>
      <div class="stat-value">${graph.statistics.totalNodes}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">依存関係数</div>
      <div class="stat-value">${graph.statistics.totalEdges}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">循環依存</div>
      <div class="stat-value">${result.circularDependencies.length}</div>
    </div>
  </div>

  ${result.circularDependencies.length > 0 ? `
  <div class="warning-box" onclick="showCircular()">
    ⚠️ ${result.circularDependencies.length}個の循環依存が検出されました。クリックして詳細を表示
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">🔝 最も依存されているファイル（Top 10）</div>
    ${graph.statistics.mostDepended.length > 0 ? `
      <div class="node-list">
        ${graph.statistics.mostDepended.slice(0, 10).map(node => `
          <div class="node-item" onclick="openFile('${this.escapeHtml(node.filePath || '')}', 1)">
            <div class="node-name">📄 ${this.escapeHtml(node.label)}</div>
            <div class="node-stats">
              <span>被依存: ${node.incomingCount}ファイル</span>
              <span>依存: ${node.outgoingCount}ファイル</span>
              <span class="badge ${this.getImportanceBadge(node.importance)}">${this.getImportanceLabel(node.importance)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-state">依存されているファイルがありません</div>'}
  </div>

  <div class="section">
    <div class="section-title">🔗 最も多く依存しているファイル（Top 10）</div>
    ${graph.statistics.mostDepending.length > 0 ? `
      <div class="node-list">
        ${graph.statistics.mostDepending.slice(0, 10).map(node => `
          <div class="node-item" onclick="openFile('${this.escapeHtml(node.filePath || '')}', 1)">
            <div class="node-name">📄 ${this.escapeHtml(node.label)}</div>
            <div class="node-stats">
              <span>依存: ${node.outgoingCount}ファイル</span>
              <span>被依存: ${node.incomingCount}ファイル</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty-state">依存しているファイルがありません</div>'}
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function openFile(filePath, line) {
      vscode.postMessage({
        command: 'openFile',
        filePath: filePath,
        line: line
      });
    }

    function showCircular() {
      vscode.postMessage({ command: 'showCircular' });
    }
  </script>
</body>
</html>`;
  }

  /**
   * 重要度のバッジクラスを取得
   */
  private static getImportanceBadge(importance: number): string {
    if (importance > 10) return 'badge-high';
    if (importance > 5) return 'badge-medium';
    return 'badge-low';
  }

  /**
   * 重要度のラベルを取得
   */
  private static getImportanceLabel(importance: number): string {
    if (importance > 10) return '重要度: 高';
    if (importance > 5) return '重要度: 中';
    return '重要度: 低';
  }

  /**
   * ファイルを開く
   */
  private static async openFile(filePath: string, line: number): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      vscode.window.showErrorMessage(`ファイルを開けませんでした: ${error}`);
    }
  }

  /**
   * 循環依存を表示
   */
  private static async showCircularDependencies(circularDeps: any[]): Promise<void> {
    if (circularDeps.length === 0) {
      vscode.window.showInformationMessage('循環依存は検出されませんでした');
      return;
    }

    const items = circularDeps.map((dep, index) => ({
      label: `循環 ${index + 1}: ${dep.length}ファイル`,
      description: `重要度: ${dep.severity ? dep.severity.toFixed(1) : 'N/A'}`,
      detail: dep.path.map((p: string) => path.basename(p)).join(' → ')
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '循環依存を選択してください'
    });

    if (selected) {
      const index = items.indexOf(selected);
      const dep = circularDeps[index];
      vscode.window.showWarningMessage(
        `循環依存: ${dep.path.map((p: string) => path.basename(p)).join(' → ')}`
      );
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
}
