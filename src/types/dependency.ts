/**
 * 依存関係の型定義
 */

import { Location } from './common';

/**
 * 依存関係の種別
 */
export enum DependencyType {
  /** import/require文による依存 */
  Import = 'import',
  /** 関数呼び出しによる依存 */
  FunctionCall = 'functionCall',
  /** クラス継承による依存 */
  Extends = 'extends',
  /** インターフェース実装による依存 */
  Implements = 'implements',
  /** トレイト使用による依存 */
  Uses = 'uses',
  /** 型ヒントによる依存 */
  TypeHint = 'typeHint',
  /** 変数参照による依存 */
  VariableReference = 'variableReference'
}

/**
 * 依存関係の強度
 */
export enum DependencyStrength {
  /** 強い依存（継承、実装） */
  Strong = 'strong',
  /** 中程度の依存（import、トレイト） */
  Medium = 'medium',
  /** 弱い依存（関数呼び出し、変数参照） */
  Weak = 'weak'
}

/**
 * ファイル間の依存関係
 */
export interface FileDependency {
  /** 依存元ファイル */
  from: string;
  /** 依存先ファイル */
  to: string;
  /** 依存の種別 */
  type: DependencyType;
  /** 依存の強度 */
  strength: DependencyStrength;
  /** 依存が発生している場所 */
  locations: Location[];
  /** 依存の詳細説明 */
  description?: string;
  /** 依存している要素（クラス名、関数名など） */
  references?: string[];
}

/**
 * 関数/メソッド間の依存関係
 */
export interface FunctionDependency {
  /** 呼び出し元の関数 */
  from: {
    /** 関数名 */
    name: string;
    /** ファイルパス */
    file: string;
    /** 位置情報 */
    location: Location;
  };
  /** 呼び出し先の関数 */
  to: {
    /** 関数名 */
    name: string;
    /** ファイルパス */
    file: string;
    /** 位置情報 */
    location?: Location;
  };
  /** 呼び出し回数 */
  callCount: number;
  /** 依存の強度 */
  strength: DependencyStrength;
}

/**
 * クラス間の依存関係
 */
export interface ClassDependency {
  /** 依存元クラス */
  from: {
    /** クラス名 */
    name: string;
    /** ファイルパス */
    file: string;
    /** 位置情報 */
    location: Location;
  };
  /** 依存先クラス */
  to: {
    /** クラス名 */
    name: string;
    /** ファイルパス */
    file: string;
    /** 位置情報 */
    location?: Location;
  };
  /** 依存の種別 */
  type: DependencyType;
  /** 依存の強度 */
  strength: DependencyStrength;
}

/**
 * 依存関係グラフのノード
 */
export interface DependencyNode {
  /** ノードID（ファイルパスまたは関数名） */
  id: string;
  /** 表示ラベル */
  label: string;
  /** ノードの種別 */
  type: 'file' | 'function' | 'class';
  /** ファイルパス */
  filePath?: string;
  /** 定義位置 */
  location?: Location;
  /** 被依存数（このノードに依存しているノードの数） */
  incomingCount: number;
  /** 依存数（このノードが依存しているノードの数） */
  outgoingCount: number;
  /** 重要度スコア */
  importance: number;
  /** メタデータ */
  metadata?: Record<string, any>;
}

/**
 * 依存関係グラフのエッジ
 */
export interface DependencyEdge {
  /** エッジID */
  id: string;
  /** 依存元ノードID */
  from: string;
  /** 依存先ノードID */
  to: string;
  /** 依存の種別 */
  type: DependencyType;
  /** 依存の強度 */
  strength: DependencyStrength;
  /** エッジの重み（依存の回数） */
  weight: number;
  /** ラベル */
  label?: string;
  /** メタデータ */
  metadata?: Record<string, any>;
}

/**
 * 依存関係グラフ
 */
export interface DependencyGraph {
  /** ノード一覧 */
  nodes: DependencyNode[];
  /** エッジ一覧 */
  edges: DependencyEdge[];
  /** グラフの統計情報 */
  statistics: {
    /** 総ノード数 */
    totalNodes: number;
    /** 総エッジ数 */
    totalEdges: number;
    /** 最も依存されているノード */
    mostDepended: DependencyNode[];
    /** 最も多く依存しているノード */
    mostDepending: DependencyNode[];
    /** 循環依存の数 */
    circularDependencies: number;
    /** 循環依存のパス */
    circularPaths?: string[][];
  };
}

/**
 * 依存関係分析オプション
 */
export interface DependencyAnalysisOptions {
  /** 分析対象のファイルパターン */
  includePatterns?: string[];
  /** 除外するファイルパターン */
  excludePatterns?: string[];
  /** 分析の深さ（依存関係をたどる階層数） */
  depth?: number;
  /** 最小依存強度（これより弱い依存は除外） */
  minStrength?: DependencyStrength;
  /** 外部ライブラリを含めるか */
  includeExternal?: boolean;
  /** 循環依存を検出するか */
  detectCircular?: boolean;
}

/**
 * 循環依存の情報
 */
export interface CircularDependency {
  /** 循環しているファイル/関数のパス */
  path: string[];
  /** 循環の長さ */
  length: number;
  /** 影響度（循環に関与するノードの重要度の合計） */
  severity: number;
  /** 依存の種別 */
  types: DependencyType[];
}

/**
 * 依存関係分析結果
 */
export interface DependencyAnalysisResult {
  /** ファイル間の依存関係 */
  fileDependencies: FileDependency[];
  /** 関数間の依存関係 */
  functionDependencies: FunctionDependency[];
  /** クラス間の依存関係 */
  classDependencies: ClassDependency[];
  /** 依存関係グラフ */
  graph: DependencyGraph;
  /** 循環依存 */
  circularDependencies: CircularDependency[];
  /** 分析日時 */
  analyzedAt: Date;
  /** 分析対象のルートパス */
  rootPath: string;
}
