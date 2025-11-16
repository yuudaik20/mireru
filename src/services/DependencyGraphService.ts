/**
 * 依存関係グラフサービス
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PhpParser } from '../parser/PhpParser';
import {
  DependencyGraph,
  GraphNode,
  GraphEdge,
  SavedGraphState
} from '../types/dependencyGraph';
import { ParsedFile } from '../types/parser';

export class DependencyGraphService {
  private parser: PhpParser;
  private readonly GRAPH_STATE_FILE = '.mireru-graph-state.json';

  constructor() {
    this.parser = new PhpParser();
  }

  /**
   * プロジェクト内のPHPファイルをスキャンして依存関係グラフを生成
   */
  async generateDependencyGraph(projectRoot: string): Promise<DependencyGraph> {
    const phpFiles = await this.findPhpFiles(projectRoot);
    const parsedFiles: ParsedFile[] = [];

    // すべてのPHPファイルをパース
    for (const filePath of phpFiles) {
      try {
        const parsed = await this.parser.parseFile(filePath);
        parsedFiles.push(parsed);
      } catch (error) {
        console.error(`Failed to parse ${filePath}:`, error);
      }
    }

    return this.buildGraph(parsedFiles, projectRoot);
  }

  /**
   * PHPファイルを検索
   */
  private async findPhpFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['vendor', 'node_modules', 'storage', 'public', 'bootstrap/cache'];

    const scanDirectory = async (dir: string) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // 除外ディレクトリをスキップ
            const relativePath = path.relative(projectRoot, fullPath);
            const shouldExclude = excludeDirs.some(exclude =>
              relativePath.startsWith(exclude)
            );

            if (!shouldExclude) {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile() && entry.name.endsWith('.php')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    };

    await scanDirectory(projectRoot);
    return files;
  }

  /**
   * パース結果からグラフを構築
   */
  private buildGraph(parsedFiles: ParsedFile[], projectRoot: string): DependencyGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // ノードを作成
    for (const file of parsedFiles) {
      const relativePath = path.relative(projectRoot, file.filePath);

      // クラスごとにノードを作成
      for (const cls of file.classes) {
        const nodeId = this.generateNodeId(file.filePath, cls.name);
        const node: GraphNode = {
          id: nodeId,
          label: cls.name,
          type: 'class',
          filePath: file.filePath,
          location: cls.location
        };
        nodes.push(node);
        nodeMap.set(nodeId, node);
      }

      // インターフェースごとにノードを作成
      for (const iface of file.interfaces) {
        const nodeId = this.generateNodeId(file.filePath, iface.name);
        const node: GraphNode = {
          id: nodeId,
          label: iface.name,
          type: 'interface',
          filePath: file.filePath,
          location: iface.location
        };
        nodes.push(node);
        nodeMap.set(nodeId, node);
      }

      // ファイルレベルの関数がある場合
      if (file.functions.length > 0 && file.classes.length === 0 && file.interfaces.length === 0) {
        const nodeId = this.generateNodeId(file.filePath, relativePath);
        const node: GraphNode = {
          id: nodeId,
          label: path.basename(file.filePath),
          type: 'file',
          filePath: file.filePath
        };
        nodes.push(node);
        nodeMap.set(nodeId, node);
      }
    }

    // エッジを作成（依存関係）
    for (const file of parsedFiles) {
      // クラスの継承とインターフェース実装
      for (const cls of file.classes) {
        const fromId = this.generateNodeId(file.filePath, cls.name);

        // 継承
        if (cls.extends) {
          const toNode = this.findNodeByClassName(nodeMap, cls.extends);
          if (toNode) {
            edges.push({
              id: `${fromId}-extends-${toNode.id}`,
              from: fromId,
              to: toNode.id,
              type: 'extends',
              label: 'extends'
            });
          }
        }

        // インターフェース実装
        if (cls.implements) {
          for (const iface of cls.implements) {
            const toNode = this.findNodeByClassName(nodeMap, iface);
            if (toNode) {
              edges.push({
                id: `${fromId}-implements-${toNode.id}`,
                from: fromId,
                to: toNode.id,
                type: 'implements',
                label: 'implements'
              });
            }
          }
        }
      }

      // use文による依存関係
      for (const use of file.uses) {
        const className = use.alias || use.name.split('\\').pop() || use.name;
        const fromNodes = nodes.filter(n => n.filePath === file.filePath);
        const toNode = this.findNodeByClassName(nodeMap, className);

        if (toNode && fromNodes.length > 0) {
          for (const fromNode of fromNodes) {
            const edgeId = `${fromNode.id}-uses-${toNode.id}`;
            // 重複チェック
            if (!edges.find(e => e.id === edgeId)) {
              edges.push({
                id: edgeId,
                from: fromNode.id,
                to: toNode.id,
                type: 'uses',
                label: 'uses'
              });
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * ノードIDを生成
   */
  private generateNodeId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
  }

  /**
   * クラス名でノードを検索
   */
  private findNodeByClassName(nodeMap: Map<string, GraphNode>, className: string): GraphNode | undefined {
    for (const [_, node] of nodeMap) {
      if (node.label === className) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * グラフの状態を保存
   */
  async saveGraphState(
    projectRoot: string,
    graph: DependencyGraph,
    nodePositions: { [nodeId: string]: { x: number; y: number } }
  ): Promise<void> {
    const state: SavedGraphState = {
      projectRoot,
      timestamp: Date.now(),
      nodePositions,
      graph
    };

    const stateFilePath = path.join(projectRoot, this.GRAPH_STATE_FILE);
    await fs.promises.writeFile(
      stateFilePath,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }

  /**
   * 保存されたグラフの状態を読み込み
   */
  async loadGraphState(projectRoot: string): Promise<SavedGraphState | null> {
    const stateFilePath = path.join(projectRoot, this.GRAPH_STATE_FILE);

    try {
      const content = await fs.promises.readFile(stateFilePath, 'utf-8');
      const state: SavedGraphState = JSON.parse(content);
      return state;
    } catch (error) {
      // ファイルが存在しない場合はnullを返す
      return null;
    }
  }

  /**
   * 保存されたグラフの状態が存在するかチェック
   */
  async hasSavedState(projectRoot: string): Promise<boolean> {
    const stateFilePath = path.join(projectRoot, this.GRAPH_STATE_FILE);
    try {
      await fs.promises.access(stateFilePath);
      return true;
    } catch {
      return false;
    }
  }
}
