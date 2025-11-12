/**
 * Dependency Graph Panel
 * 依存関係を図形と線で可視化
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyAnalysisResult, FileDependency } from '../types/dependency';

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

    // データをJSON化して渡す
    const graphData = this.prepareGraphData(result);
    panel.webview.html = this.getHtmlContent(result, graphData);

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
   * グラフデータを準備
   */
  private static prepareGraphData(result: DependencyAnalysisResult) {
    const { graph, fileDependencies } = result;

    // ノードデータ
    const nodes = graph.nodes.map(node => ({
      id: node.id,
      label: node.label,
      filePath: node.filePath,
      incomingCount: node.incomingCount,
      outgoingCount: node.outgoingCount,
      importance: node.importance
    }));

    // エッジデータ（依存関係情報を含む）
    const edges = graph.edges.map(edge => {
      // このエッジに対応するFileDependencyを探す
      const sourceNode = graph.nodes.find(n => n.id === edge.from);
      const targetNode = graph.nodes.find(n => n.id === edge.to);

      const matchingDeps = fileDependencies.filter(dep =>
        dep.from === sourceNode?.filePath && dep.to === targetNode?.filePath
      );

      return {
        source: edge.from,
        target: edge.to,
        type: edge.type,
        strength: edge.strength,
        dependencies: matchingDeps.map(dep => ({
          type: dep.type,
          strength: dep.strength,
          locations: dep.locations,
          references: dep.references,
          description: dep.description
        }))
      };
    });

    return { nodes, edges };
  }

  /**
   * HTMLコンテンツを生成
   */
  private static getHtmlContent(result: DependencyAnalysisResult, graphData: any): string {
    const graph = result.graph;

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
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 15px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-editor-background);
      z-index: 10;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 5px;
    }
    .stats {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 20px;
    }
    .container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .graph-area {
      flex: 1;
      position: relative;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
    }
    #graph-svg {
      width: 100%;
      height: 100%;
      cursor: grab;
    }
    #graph-svg:active {
      cursor: grabbing;
    }
    .sidebar {
      width: 350px;
      border-left: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-sideBar-background);
      overflow-y: auto;
      padding: 20px;
      display: none;
    }
    .sidebar.visible {
      display: block;
    }
    .sidebar h2 {
      font-size: 16px;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .dependency-list {
      margin-top: 15px;
    }
    .dependency-item {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      padding: 10px;
      margin-bottom: 8px;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .dependency-item:hover {
      background-color: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }
    .dep-type {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
      margin-bottom: 5px;
    }
    .dep-location {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .dep-code {
      margin-top: 5px;
      padding: 5px;
      background-color: var(--vscode-textCodeBlock-background);
      border-radius: 2px;
      font-family: monospace;
      font-size: 11px;
      overflow-x: auto;
    }
    .controls {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 5px;
      z-index: 5;
    }
    .control-btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 12px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .control-btn:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .node {
      cursor: pointer;
    }
    .node rect {
      stroke: var(--vscode-panel-border);
      stroke-width: 2;
    }
    .node.selected rect {
      stroke: var(--vscode-focusBorder);
      stroke-width: 3;
    }
    .node text {
      font-size: 12px;
      fill: var(--vscode-foreground);
      pointer-events: none;
    }
    .edge {
      stroke: var(--vscode-textLink-foreground);
      stroke-width: 1.5;
      fill: none;
      opacity: 0.6;
    }
    .edge-arrow {
      fill: var(--vscode-textLink-foreground);
      opacity: 0.6;
    }
    .legend {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      padding: 10px;
      border-radius: 3px;
      font-size: 11px;
      border: 1px solid var(--vscode-panel-border);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 5px 0;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 依存関係グラフ</h1>
    <div class="stats">
      <span>📄 ${graph.statistics.totalNodes} ファイル</span>
      <span>🔗 ${graph.statistics.totalEdges} 依存</span>
      <span>⚠️ ${result.circularDependencies.length} 循環依存</span>
    </div>
  </div>

  <div class="container">
    <div class="graph-area">
      <div class="controls">
        <button class="control-btn" onclick="zoomIn()">🔍 拡大</button>
        <button class="control-btn" onclick="zoomOut()">🔍 縮小</button>
        <button class="control-btn" onclick="resetView()">🔄 リセット</button>
      </div>
      <svg id="graph-svg"></svg>
      <div class="legend">
        <div class="legend-item">
          <div class="legend-color" style="background-color: #4CAF50;"></div>
          <span>低依存度</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #FF9800;"></div>
          <span>中依存度</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #F44336;"></div>
          <span>高依存度</span>
        </div>
      </div>
    </div>

    <div class="sidebar" id="sidebar">
      <h2 id="sidebar-title">依存関係の詳細</h2>
      <div id="sidebar-content"></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${JSON.stringify(graphData)};

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let selectedNodeId = null;

    // グラフを描画
    function renderGraph() {
      const svg = document.getElementById('graph-svg');
      const width = svg.clientWidth;
      const height = svg.clientHeight;

      // レイアウト計算（シンプルな階層レイアウト）
      const layout = calculateLayout(graphData.nodes, graphData.edges, width, height);

      // SVG内容をクリア
      svg.innerHTML = '';

      // グループ要素を作成（変換用）
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.id = 'graph-group';
      svg.appendChild(g);

      // マーカー定義（矢印）
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrowhead');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3, 0 6');
      polygon.setAttribute('class', 'edge-arrow');
      marker.appendChild(polygon);
      defs.appendChild(marker);
      g.appendChild(defs);

      // エッジを描画
      graphData.edges.forEach(edge => {
        const sourcePos = layout.nodePositions[edge.source];
        const targetPos = layout.nodePositions[edge.target];

        if (sourcePos && targetPos) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('class', 'edge');
          path.setAttribute('d', \`M \${sourcePos.x} \${sourcePos.y} L \${targetPos.x} \${targetPos.y}\`);
          path.setAttribute('marker-end', 'url(#arrowhead)');
          g.appendChild(path);
        }
      });

      // ノードを描画
      graphData.nodes.forEach(node => {
        const pos = layout.nodePositions[node.id];
        if (!pos) return;

        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.setAttribute('class', 'node');
        nodeGroup.setAttribute('data-id', node.id);
        nodeGroup.style.cursor = 'pointer';

        // ノードの色（重要度に基づく）
        const color = getNodeColor(node.importance);

        // 矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pos.x - 60);
        rect.setAttribute('y', pos.y - 20);
        rect.setAttribute('width', '120');
        rect.setAttribute('height', '40');
        rect.setAttribute('rx', '5');
        rect.setAttribute('fill', color);
        nodeGroup.appendChild(rect);

        // テキスト
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label;
        nodeGroup.appendChild(text);

        // クリックイベント
        nodeGroup.addEventListener('click', () => selectNode(node));

        g.appendChild(nodeGroup);
      });

      updateTransform();
    }

    // シンプルな階層レイアウト
    function calculateLayout(nodes, edges, width, height) {
      const nodePositions = {};
      const padding = 100;
      const availableWidth = width - padding * 2;
      const availableHeight = height - padding * 2;

      // 入次数を計算（依存されている数）
      const inDegree = {};
      nodes.forEach(n => inDegree[n.id] = 0);
      edges.forEach(e => inDegree[e.target]++);

      // レベル分け（トポロジカルソート風）
      const levels = [];
      const visited = new Set();
      const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);

      if (queue.length === 0 && nodes.length > 0) {
        queue.push(nodes[0].id);
      }

      while (queue.length > 0 || visited.size < nodes.length) {
        const level = [];
        const currentSize = queue.length || 1;

        for (let i = 0; i < currentSize; i++) {
          const nodeId = queue.shift() || nodes.find(n => !visited.has(n.id))?.id;
          if (!nodeId || visited.has(nodeId)) continue;

          visited.add(nodeId);
          level.push(nodeId);

          // 子ノードをキューに追加
          edges.filter(e => e.source === nodeId).forEach(e => {
            if (!visited.has(e.target)) {
              queue.push(e.target);
            }
          });
        }

        if (level.length > 0) {
          levels.push(level);
        }

        if (levels.length > 20) break; // 安全策
      }

      // 位置を計算
      const levelHeight = levels.length > 0 ? availableHeight / levels.length : 100;

      levels.forEach((level, levelIndex) => {
        const levelWidth = availableWidth / (level.length + 1);
        level.forEach((nodeId, index) => {
          nodePositions[nodeId] = {
            x: padding + levelWidth * (index + 1),
            y: padding + levelHeight * (levelIndex + 0.5)
          };
        });
      });

      return { nodePositions };
    }

    // ノードの色を取得
    function getNodeColor(importance) {
      if (importance > 10) return '#F44336';
      if (importance > 5) return '#FF9800';
      return '#4CAF50';
    }

    // ノード選択
    function selectNode(node) {
      selectedNodeId = node.id;

      // 選択状態を更新
      document.querySelectorAll('.node').forEach(n => n.classList.remove('selected'));
      document.querySelector(\`.node[data-id="\${node.id}"]\`)?.classList.add('selected');

      // サイドバーを表示
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.add('visible');

      // 詳細を表示
      showNodeDetails(node);
    }

    // ノードの詳細を表示
    function showNodeDetails(node) {
      const title = document.getElementById('sidebar-title');
      const content = document.getElementById('sidebar-content');

      title.textContent = node.label;

      // このノードに関連するエッジを取得
      const outgoing = graphData.edges.filter(e => e.source === node.id);
      const incoming = graphData.edges.filter(e => e.target === node.id);

      let html = \`
        <div style="margin-bottom: 20px;">
          <p><strong>ファイル:</strong> \${node.filePath || 'N/A'}</p>
          <p><strong>被依存:</strong> \${node.incomingCount} ファイル</p>
          <p><strong>依存:</strong> \${node.outgoingCount} ファイル</p>
          <p><strong>重要度:</strong> \${node.importance}</p>
        </div>
      \`;

      if (outgoing.length > 0) {
        html += '<h3 style="margin-bottom: 10px;">依存先 (\${outgoing.length})</h3><div class="dependency-list">';
        outgoing.forEach(edge => {
          const targetNode = graphData.nodes.find(n => n.id === edge.target);
          if (edge.dependencies && edge.dependencies.length > 0) {
            edge.dependencies.forEach(dep => {
              dep.locations.forEach(loc => {
                html += \`
                  <div class="dependency-item" onclick='openFile("\${loc.file}", \${loc.startLine})'>
                    <div class="dep-type">→ \${targetNode?.label || 'Unknown'}</div>
                    <div class="dep-location">📍 \${loc.file}:\${loc.startLine}</div>
                    <div class="dep-type" style="font-size: 10px; font-weight: normal;">種別: \${dep.type}</div>
                    \${dep.references ? \`<div class="dep-code">\${dep.references.join(', ')}</div>\` : ''}
                  </div>
                \`;
              });
            });
          }
        });
        html += '</div>';
      }

      content.innerHTML = html;
    }

    // ファイルを開く
    function openFile(filePath, line) {
      vscode.postMessage({
        command: 'openFile',
        filePath: filePath,
        line: line || 1
      });
    }

    // ズーム・パン機能
    function zoomIn() {
      scale *= 1.2;
      updateTransform();
    }

    function zoomOut() {
      scale /= 1.2;
      updateTransform();
    }

    function resetView() {
      scale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    }

    function updateTransform() {
      const g = document.getElementById('graph-group');
      if (g) {
        g.setAttribute('transform', \`translate(\${translateX}, \${translateY}) scale(\${scale})\`);
      }
    }

    // ドラッグ機能
    const svg = document.getElementById('graph-svg');
    svg.addEventListener('mousedown', (e) => {
      if (e.target === svg || e.target.id === 'graph-group') {
        isDragging = true;
        dragStartX = e.clientX - translateX;
        dragStartY = e.clientY - translateY;
      }
    });

    svg.addEventListener('mousemove', (e) => {
      if (isDragging) {
        translateX = e.clientX - dragStartX;
        translateY = e.clientY - dragStartY;
        updateTransform();
      }
    });

    svg.addEventListener('mouseup', () => {
      isDragging = false;
    });

    svg.addEventListener('mouseleave', () => {
      isDragging = false;
    });

    // 初期描画
    renderGraph();

    // リサイズ対応
    window.addEventListener('resize', () => {
      renderGraph();
    });
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
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
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
}
