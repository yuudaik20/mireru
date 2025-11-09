/**
 * 共通型定義
 */

/**
 * コードの位置情報
 */
export interface Location {
  /** ファイルパス */
  file: string;
  /** 開始行 */
  startLine: number;
  /** 終了行 */
  endLine: number;
  /** 開始列 */
  startColumn: number;
  /** 終了列 */
  endColumn: number;
}

/**
 * コードの種別
 */
export enum CodeType {
  Function = 'function',
  Method = 'method',
  Class = 'class',
  Variable = 'variable',
  Constant = 'constant',
  Property = 'property',
  Unknown = 'unknown'
}

/**
 * 関数の種別
 */
export enum FunctionType {
  /** PHP標準関数 */
  PhpBuiltin = 'builtin',
  /** フレームワーク関数（Laravel等） */
  Framework = 'framework',
  /** ユーザー定義関数 */
  UserDefined = 'userDefined',
  /** サードパーティライブラリ */
  Library = 'library',
  /** 不明 */
  Unknown = 'unknown'
}

/**
 * コードコンテキスト
 */
export interface CodeContext {
  /** ファイルパス */
  filePath: string;
  /** 選択されたコード */
  selectedCode: string;
  /** 周辺コード（前後数行） */
  surroundingCode: string;
  /** コードの種別 */
  codeType: CodeType;
  /** 関数の種別（関数の場合） */
  functionType?: FunctionType;
  /** プロジェクトルートパス */
  projectRoot?: string;
  /** Laravelプロジェクトかどうか */
  isLaravelProject?: boolean;
}

/**
 * 関数呼び出し情報
 */
export interface FunctionCall {
  /** 関数名 */
  name: string;
  /** 関数の種別 */
  type: FunctionType;
  /** 位置情報 */
  location: Location;
  /** 引数 */
  arguments?: string[];
  /** 名前空間 */
  namespace?: string;
}

/**
 * エラー情報
 */
export interface MireruError {
  /** エラーメッセージ */
  message: string;
  /** エラーコード */
  code?: string;
  /** 詳細 */
  details?: string;
  /** スタックトレース */
  stack?: string;
}

/**
 * キャッシュエントリ
 */
export interface CacheEntry<T> {
  /** キャッシュされたデータ */
  data: T;
  /** タイムスタンプ */
  timestamp: number;
  /** 有効期限（秒） */
  ttl: number;
}
