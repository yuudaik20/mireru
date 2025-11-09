/**
 * パーサー関連の型定義
 */

import { Location } from './common';

/**
 * パラメータ情報
 */
export interface ParameterInfo {
  /** パラメータ名 */
  name: string;
  /** 型（型ヒントがある場合） */
  type?: string;
  /** デフォルト値 */
  defaultValue?: string;
  /** 可変長引数か */
  isVariadic?: boolean;
  /** 参照渡しか */
  isReference?: boolean;
  /** nullable か */
  isNullable?: boolean;
}

/**
 * 関数情報
 */
export interface FunctionInfo {
  /** 関数名 */
  name: string;
  /** パラメータ */
  params: ParameterInfo[];
  /** 返り値の型 */
  returnType?: string;
  /** 位置情報 */
  location: Location;
  /** DocBlockコメント */
  docBlock?: string;
  /** Laravelヘルパー関数か */
  isLaravelHelper?: boolean;
  /** 名前空間 */
  namespace?: string;
  /** 可視性（public/protected/private） */
  visibility?: 'public' | 'protected' | 'private';
  /** staticか */
  isStatic?: boolean;
  /** abstractか */
  isAbstract?: boolean;
}

/**
 * プロパティ情報
 */
export interface PropertyInfo {
  /** プロパティ名 */
  name: string;
  /** 型 */
  type?: string;
  /** デフォルト値 */
  defaultValue?: string;
  /** 位置情報 */
  location: Location;
  /** 可視性 */
  visibility: 'public' | 'protected' | 'private';
  /** staticか */
  isStatic?: boolean;
  /** DocBlockコメント */
  docBlock?: string;
}

/**
 * メソッド情報
 */
export interface MethodInfo extends FunctionInfo {
  /** 可視性 */
  visibility: 'public' | 'protected' | 'private';
  /** finalか */
  isFinal?: boolean;
}

/**
 * クラス情報
 */
export interface ClassInfo {
  /** クラス名 */
  name: string;
  /** 継承元クラス */
  extends?: string;
  /** 実装しているインターフェース */
  implements?: string[];
  /** プロパティ */
  properties: PropertyInfo[];
  /** メソッド */
  methods: MethodInfo[];
  /** 位置情報 */
  location: Location;
  /** Eloquentモデルか */
  isEloquentModel?: boolean;
  /** Laravelコントローラーか */
  isController?: boolean;
  /** 名前空間 */
  namespace?: string;
  /** DocBlockコメント */
  docBlock?: string;
  /** abstractか */
  isAbstract?: boolean;
  /** finalか */
  isFinal?: boolean;
  /** use トレイト */
  traits?: string[];
}

/**
 * インターフェース情報
 */
export interface InterfaceInfo {
  /** インターフェース名 */
  name: string;
  /** 継承元インターフェース */
  extends?: string[];
  /** メソッド */
  methods: MethodInfo[];
  /** 位置情報 */
  location: Location;
  /** 名前空間 */
  namespace?: string;
  /** DocBlockコメント */
  docBlock?: string;
}

/**
 * 変数情報
 */
export interface VariableInfo {
  /** 変数名 */
  name: string;
  /** 型（推測） */
  type?: string;
  /** 位置情報 */
  location: Location;
  /** スコープ */
  scope: 'global' | 'local' | 'parameter' | 'property';
}

/**
 * use文（インポート）情報
 */
export interface UseStatement {
  /** インポートするクラス/関数/定数 */
  name: string;
  /** エイリアス */
  alias?: string;
  /** 種別 */
  type: 'class' | 'function' | 'const';
  /** 位置情報 */
  location: Location;
}

/**
 * 名前空間情報
 */
export interface NamespaceInfo {
  /** 名前空間 */
  name: string;
  /** 位置情報 */
  location: Location;
}

/**
 * ファイル解析結果
 */
export interface ParsedFile {
  /** ファイルパス */
  filePath: string;
  /** 名前空間 */
  namespace?: NamespaceInfo;
  /** use文 */
  uses: UseStatement[];
  /** クラス */
  classes: ClassInfo[];
  /** インターフェース */
  interfaces: InterfaceInfo[];
  /** 関数 */
  functions: FunctionInfo[];
  /** 変数（グローバル） */
  variables: VariableInfo[];
  /** パースエラー */
  errors: Array<{ message: string; line: number; column: number }>;
}
