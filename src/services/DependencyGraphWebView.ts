/**
 * 依存関係グラフWebView
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraph, SavedGraphState } from '../types/dependencyGraph';
import { DependencyGraphService } from './DependencyGraphService';

export class DependencyGraphWebView {
  private panel: vscode.WebviewPanel | undefined;
  private graphService: DependencyGraphService;
  private projectRoot: string;
  private currentGraph: DependencyGraph | undefined;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.graphService = new DependencyGraphService();
  }

  /**
   * WebViewを表示
   */
  async show(context: vscode.ExtensionContext): Promise<void> {
    // 既存のパネルがあれば再利用
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // WebViewパネルを作成
    this.panel = vscode.window.createWebviewPanel(
      'mireruDependencyGraph',
      '依存関係グラフ',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'node_modules'))
        ]
      }
    );

    // パネルが閉じられたときのハンドラ
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // メッセージハンドラを設定
    this.panel.webview.onDidReceiveMessage(
      async message => {
        await this.handleMessage(message);
      },
      undefined,
      context.subscriptions
    );

    // グラフを読み込んで表示
    await this.loadAndDisplayGraph();
  }

  /**
   * グラフを読み込んで表示
   */
  private async loadAndDisplayGraph(): Promise<void> {
    if (!this.panel) {
      return;
    }

    // 保存された状態をチェック
    const hasSaved = await this.graphService.hasSavedState(this.projectRoot);
    let savedState: SavedGraphState | null = null;

    if (hasSaved) {
      savedState = await this.graphService.loadGraphState(this.projectRoot);
    }

    // グラフを生成
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '依存関係グラフを生成中...',
        cancellable: false
      },
      async () => {
        this.currentGraph = await this.graphService.generateDependencyGraph(
          this.projectRoot
        );

        // 保存された位置情報があれば適用
        if (savedState && savedState.nodePositions) {
          for (const node of this.currentGraph.nodes) {
            const pos = savedState.nodePositions[node.id];
            if (pos) {
              node.x = pos.x;
              node.y = pos.y;
            }
          }
        }

        // HTMLを生成して表示
        if (this.panel) {
          this.panel.webview.html = this.getHtmlContent(
            this.currentGraph,
            !hasSaved
          );
        }
      }
    );
  }

  /**
   * メッセージハンドラ
   */
  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'saveState':
        // グラフの状態を保存
        if (this.currentGraph && message.nodePositions) {
          await this.graphService.saveGraphState(
            this.projectRoot,
            this.currentGraph,
            message.nodePositions
          );
          vscode.window.showInformationMessage('グラフの状態を保存しました');
        }
        break;

      case 'refresh':
        // グラフを再生成
        await this.loadAndDisplayGraph();
        vscode.window.showInformationMessage('グラフを更新しました');
        break;

      case 'openFile':
        // ファイルを開く
        if (message.filePath && message.line) {
          const uri = vscode.Uri.file(message.filePath);
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document);
          const position = new vscode.Position(message.line - 1, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          );
        }
        break;
    }
  }

  /**
   * HTML コンテンツを生成
   */
  private getHtmlContent(graph: DependencyGraph, isFirstTime: boolean): string {
    const nodesJson = JSON.stringify(graph.nodes);
    const edgesJson = JSON.stringify(graph.edges);

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>依存関係グラフ</title>
    <script src="https://unpkg.com/vis-network@9.1.9/dist/vis-network.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        #toolbar {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 10px;
            align-items: center;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #mynetwork {
            width: 100%;
            height: calc(100vh - 50px);
            border: 1px solid var(--vscode-panel-border);
        }
        .info {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button id="saveBtn">保存</button>
        <button id="refreshBtn">更新</button>
        <span class="info" id="nodeCount"></span>
        ${isFirstTime ? '<span class="info" style="color: var(--vscode-notificationsInfoIcon-foreground);">初回表示: グラフを調整して保存してください</span>' : '<span class="info" style="color: var(--vscode-testing-iconPassed);">保存された状態を読み込みました</span>'}
    </div>
    <div id="mynetwork"></div>

    <script>
        const vscode = acquireVsCodeApi();

        // ノードとエッジのデータ
        const nodesData = ${nodesJson};
        const edgesData = ${edgesJson};

        // ノードの色とアイコンを設定
        const nodes = new vis.DataSet(nodesData.map(node => ({
            id: node.id,
            label: node.label,
            title: node.filePath,
            shape: node.type === 'interface' ? 'diamond' : 'box',
            color: {
                background: node.type === 'class' ? '#3498db' :
                           node.type === 'interface' ? '#9b59b6' :
                           node.type === 'function' ? '#2ecc71' : '#95a5a6',
                border: node.type === 'class' ? '#2980b9' :
                       node.type === 'interface' ? '#8e44ad' :
                       node.type === 'function' ? '#27ae60' : '#7f8c8d',
                highlight: {
                    background: '#f39c12',
                    border: '#e67e22'
                }
            },
            font: {
                color: '#ffffff',
                size: 14
            },
            x: node.x,
            y: node.y
        })));

        // エッジの色とスタイルを設定
        const edges = new vis.DataSet(edgesData.map(edge => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            arrows: 'to',
            color: {
                color: edge.type === 'extends' ? '#e74c3c' :
                       edge.type === 'implements' ? '#9b59b6' :
                       edge.type === 'uses' ? '#3498db' : '#95a5a6',
                highlight: '#f39c12'
            },
            font: {
                size: 10,
                color: 'var(--vscode-foreground)',
                strokeWidth: 0
            },
            smooth: {
                type: 'curvedCW',
                roundness: 0.2
            }
        })));

        // ネットワークを作成
        const container = document.getElementById('mynetwork');
        const data = { nodes, edges };
        const options = {
            physics: {
                enabled: ${isFirstTime ? 'true' : 'false'},
                stabilization: {
                    iterations: 200
                },
                barnesHut: {
                    gravitationalConstant: -2000,
                    centralGravity: 0.3,
                    springLength: 95,
                    springConstant: 0.04,
                    damping: 0.09
                }
            },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true
            },
            manipulation: {
                enabled: false
            }
        };

        const network = new vis.Network(container, data, options);

        // ノード数を表示
        document.getElementById('nodeCount').textContent =
            \`ノード数: \${nodesData.length}, エッジ数: \${edgesData.length}\`;

        // 物理演算が完了したら無効化（初回のみ）
        if (${isFirstTime}) {
            network.once('stabilizationIterationsDone', function() {
                network.setOptions({ physics: false });
            });
        }

        // ノードをダブルクリックでファイルを開く
        network.on('doubleClick', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodesData.find(n => n.id === nodeId);
                if (node && node.filePath) {
                    vscode.postMessage({
                        command: 'openFile',
                        filePath: node.filePath,
                        line: node.location?.startLine || 1
                    });
                }
            }
        });

        // 保存ボタン
        document.getElementById('saveBtn').addEventListener('click', function() {
            const positions = network.getPositions();
            const nodePositions = {};
            for (const nodeId in positions) {
                nodePositions[nodeId] = positions[nodeId];
            }
            vscode.postMessage({
                command: 'saveState',
                nodePositions: nodePositions
            });
        });

        // 更新ボタン
        document.getElementById('refreshBtn').addEventListener('click', function() {
            vscode.postMessage({
                command: 'refresh'
            });
        });
    </script>
</body>
</html>`;
  }
}
