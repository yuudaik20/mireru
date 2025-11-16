/**
 * 依存関係グラフ関連の型定義
 */

import { Location } from './common';

/**
 * グラフのノード（ファイルやクラスを表す）
 */
export interface GraphNode {
  /** ノードのID */
  id: string;
  /** 表示ラベル */
  label: string;
  /** ノードのタイプ */
  type: 'file' | 'class' | 'interface' | 'function';
  /** ファイルパス */
  filePath: string;
  /** 位置情報 */
  location?: Location;
  /** X座標（保存用） */
  x?: number;
  /** Y座標（保存用） */
  y?: number;
}

/**
 * グラフのエッジ（依存関係を表す）
 */
export interface GraphEdge {
  /** エッジのID */
  id: string;
  /** 開始ノードID */
  from: string;
  /** 終了ノードID */
  to: string;
  /** エッジのタイプ */
  type: 'extends' | 'implements' | 'uses' | 'calls';
  /** ラベル */
  label?: string;
}

/**
 * 依存関係グラフ
 */
export interface DependencyGraph {
  /** ノードのリスト */
  nodes: GraphNode[];
  /** エッジのリスト */
  edges: GraphEdge[];
}

/**
 * 保存されたグラフの状態
 */
export interface SavedGraphState {
  /** プロジェクトのルートパス */
  projectRoot: string;
  /** 保存時のタイムスタンプ */
  timestamp: number;
  /** ノードの位置情報 */
  nodePositions: {
    [nodeId: string]: {
      x: number;
      y: number;
    };
  };
  /** グラフデータ */
  graph: DependencyGraph;
}
