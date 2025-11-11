/**
 * Dependency Graph Panel
 * 依存関係グラフをWebviewで表示
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyAnalysisResult, DependencyGraph, DependencyNode, DependencyEdge } from '../types/dependency';

export class DependencyGraphPanel {
  /**
   * 依存関係グラフパネルを表示
   */
  static show(result: DependencyAnalysisResult, context: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'mireruDependencyGraph',
      `依存関係グラフ: ${path.basename(result.rootPath)}`,
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
   * HTMLコンテンツを生成
   */
  private static getHtmlContent(result: DependencyAnalysisResult): string {
    const graph = result.graph;
    const graphData = JSON.stringify({
      nodes: graph.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        filePath: n.filePath,
        incomingCount: n.incomingCount,
        outgoingCount: n.outgoingCount,
        importance: n.importance
      })),
      edges: graph.edges.map(e => ({
        id: e.id,
        from: e.from,
        to: e.to,
        type: e.type,
        strength: e.strength,
        weight: e.weight
      }))
    });

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>依存関係グラフ</title>
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
      overflow: hidden;
    }
    .container {
      display: flex;
      height: 100vh;
    }
    .sidebar {
      width: 300px;
      background-color: var(--vscode-sideBar-background);
      border-right: 1px solid var(--vscode-panel-border);
      overflow-y: auto;
      padding: 15px;
    }
    .graph-container {
      flex: 1;
      position: relative;
    }
    canvas {
      display: block;
      cursor: grab;
    }
    canvas:active {
      cursor: grabbing;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 5px;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      font-size: 13px;
    }
    .stat-label {
      color: var(--vscode-descriptionForeground);
    }
    .stat-value {
      color: var(--vscode-editor-foreground);
      font-weight: bold;
    }
    .node-item {
      padding: 8px;
      margin: 5px 0;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .node-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .node-name {
      font-weight: bold;
      margin-bottom: 3px;
    }
    .node-stats {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .controls {
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 10px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .btn-small {
      padding: 4px 8px;
      font-size: 11px;
    }
    .legend {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 10px;
      font-size: 11px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .info-panel {
      position: absolute;
      top: 60px;
      right: 10px;
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 5px;
      padding: 10px;
      max-width: 300px;
      display: none;
      font-size: 12px;
    }
    .info-panel.visible {
      display: block;
    }
    .circular-warning {
      background-color: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 10px;
      border-radius: 3px;
      margin-bottom: 15px;
      font-size: 12px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="section">
        <div class="section-title">📊 統計情報</div>
        <div class="stat-item">
          <span class="stat-label">総ノード数:</span>
          <span class="stat-value">${graph.statistics.totalNodes}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">総依存関係数:</span>
          <span class="stat-value">${graph.statistics.totalEdges}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">循環依存:</span>
          <span class="stat-value">${result.circularDependencies.length}</span>
        </div>
      </div>

      ${result.circularDependencies.length > 0 ? `
      <div class="circular-warning" onclick="showCircular()">
        ⚠️ ${result.circularDependencies.length}個の循環依存が検出されました。クリックして詳細を表示
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">🔝 最も依存されているファイル</div>
        ${graph.statistics.mostDepended.slice(0, 5).map(node => `
          <div class="node-item" onclick="focusNode('${this.escapeHtml(node.id)}')">
            <div class="node-name">${this.escapeHtml(node.label)}</div>
            <div class="node-stats">被依存数: ${node.incomingCount}</div>
          </div>
        `).join('')}
      </div>

      <div class="section">
        <div class="section-title">🔗 最も多く依存しているファイル</div>
        ${graph.statistics.mostDepending.slice(0, 5).map(node => `
          <div class="node-item" onclick="focusNode('${this.escapeHtml(node.id)}')">
            <div class="node-name">${this.escapeHtml(node.label)}</div>
            <div class="node-stats">依存数: ${node.outgoingCount}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="graph-container">
      <canvas id="graph-canvas"></canvas>

      <div class="controls">
        <button class="btn btn-small" onclick="resetView()">🔄 リセット</button>
        <button class="btn btn-small" onclick="zoomIn()">➕ ズームイン</button>
        <button class="btn btn-small" onclick="zoomOut()">➖ ズームアウト</button>
      </div>

      <div class="legend">
        <div class="legend-item">
          <div class="legend-color" style="background-color: #4A90E2;"></div>
          <span>通常ノード</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #E24A4A;"></div>
          <span>重要ノード（依存多数）</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #50C878;"></div>
          <span>選択中</span>
        </div>
      </div>

      <div id="info-panel" class="info-panel"></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${graphData};

    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');

    let width = canvas.parentElement.clientWidth;
    let height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // グラフレイアウト用のデータ
    let nodes = graphData.nodes.map(n => ({
      ...n,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      radius: Math.max(5, Math.min(15, 5 + n.importance))
    }));

    let edges = graphData.edges;
    let selectedNode = null;
    let isDragging = false;
    let dragNode = null;
    let offset = { x: 0, y: 0 };
    let scale = 1;
    let panX = 0;
    let panY = 0;

    // Force-directedレイアウト
    function simulate() {
      const alpha = 0.3;
      const repulsion = 5000;
      const attraction = 0.01;
      const centerGravity = 0.01;

      // 反発力
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);

          nodes[i].vx -= (dx / dist) * force;
          nodes[i].vy -= (dy / dist) * force;
          nodes[j].vx += (dx / dist) * force;
          nodes[j].vy += (dy / dist) * force;
        }
      }

      // 引力（エッジに沿って）
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.from);
        const target = nodes.find(n => n.id === edge.to);

        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * attraction;

          source.vx += (dx / dist) * force;
          source.vy += (dy / dist) * force;
          target.vx -= (dx / dist) * force;
          target.vy -= (dy / dist) * force;
        }
      }

      // 中心への重力
      const centerX = width / 2;
      const centerY = height / 2;
      for (const node of nodes) {
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        node.vx += dx * centerGravity;
        node.vy += dy * centerGravity;
      }

      // 速度を適用
      for (const node of nodes) {
        if (node !== dragNode) {
          node.x += node.vx * alpha;
          node.y += node.vy * alpha;
          node.vx *= 0.9;
          node.vy *= 0.9;

          // 画面内に収める
          node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
          node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // エッジを描画
      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.from);
        const target = nodes.find(n => n.id === edge.to);

        if (source && target) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
          ctx.lineWidth = edge.weight;
          ctx.stroke();

          // 矢印を描画
          const angle = Math.atan2(target.y - source.y, target.x - source.x);
          const arrowSize = 8;
          ctx.save();
          ctx.translate(target.x, target.y);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(-arrowSize, -arrowSize / 2);
          ctx.lineTo(0, 0);
          ctx.lineTo(-arrowSize, arrowSize / 2);
          ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }

      // ノードを描画
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        // 色を決定
        if (node === selectedNode) {
          ctx.fillStyle = '#50C878';
        } else if (node.importance > 10) {
          ctx.fillStyle = '#E24A4A';
        } else {
          ctx.fillStyle = '#4A90E2';
        }
        ctx.fill();

        // ラベルを描画
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label.substring(0, 15), node.x, node.y + node.radius + 12);
      }

      ctx.restore();
    }

    function animate() {
      simulate();
      draw();
      requestAnimationFrame(animate);
    }

    // マウスイベント
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / scale;
      const y = (e.clientY - rect.top - panY) / scale;

      dragNode = nodes.find(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx * dx + dy * dy) < n.radius;
      });

      if (dragNode) {
        isDragging = true;
        offset = { x: x - dragNode.x, y: y - dragNode.y };
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - panX) / scale;
      const y = (e.clientY - rect.top - panY) / scale;

      if (isDragging && dragNode) {
        dragNode.x = x - offset.x;
        dragNode.y = y - offset.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
      }

      // ホバー情報を表示
      const hoveredNode = nodes.find(n => {
        const dx = n.x - x;
        const dy = n.y - y;
        return Math.sqrt(dx * dx + dy * dy) < n.radius;
      });

      if (hoveredNode) {
        showNodeInfo(hoveredNode);
      } else {
        hideNodeInfo();
      }
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
      dragNode = null;
    });

    canvas.addEventListener('click', (e) => {
      if (!isDragging) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - panX) / scale;
        const y = (e.clientY - rect.top - panY) / scale;

        const clickedNode = nodes.find(n => {
          const dx = n.x - x;
          const dy = n.y - y;
          return Math.sqrt(dx * dx + dy * dy) < n.radius;
        });

        if (clickedNode) {
          selectedNode = clickedNode;
          vscode.postMessage({
            command: 'openFile',
            filePath: clickedNode.filePath,
            line: 1
          });
        }
      }
    });

    function showNodeInfo(node) {
      const panel = document.getElementById('info-panel');
      panel.innerHTML = \`
        <div style="margin-bottom: 5px;"><strong>\${node.label}</strong></div>
        <div style="color: var(--vscode-descriptionForeground); font-size: 11px;">
          被依存数: \${node.incomingCount}<br>
          依存数: \${node.outgoingCount}<br>
          重要度: \${node.importance.toFixed(1)}
        </div>
      \`;
      panel.classList.add('visible');
    }

    function hideNodeInfo() {
      const panel = document.getElementById('info-panel');
      panel.classList.remove('visible');
    }

    function focusNode(nodeId) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        selectedNode = node;
        panX = width / 2 - node.x * scale;
        panY = height / 2 - node.y * scale;
      }
    }

    function resetView() {
      scale = 1;
      panX = 0;
      panY = 0;
      selectedNode = null;
    }

    function zoomIn() {
      scale *= 1.2;
    }

    function zoomOut() {
      scale /= 1.2;
    }

    function showCircular() {
      vscode.postMessage({ command: 'showCircular' });
    }

    // ウィンドウリサイズ対応
    window.addEventListener('resize', () => {
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width = width;
      canvas.height = height;
    });

    animate();
  </script>
</body>
</html>`;
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
      description: `重要度: ${dep.severity.toFixed(1)}`,
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
