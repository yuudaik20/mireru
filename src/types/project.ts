/**
 * プロジェクト構造関連の型定義
 */

import { Location } from './common';

/**
 * ファイル情報
 */
export interface FileInfo {
  /** ファイル名 */
  name: string;
  /** フルパス */
  path: string;
  /** 相対パス */
  relativePath: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** 行数 */
  lines: number;
  /** 言語ID */
  languageId: string;
  /** 最終更新日時 */
  lastModified: Date;
  /** ファイルの役割（AI要約） */
  role?: string;
  /** 主要な定義 */
  definitions?: {
    /** クラス */
    classes?: string[];
    /** 関数 */
    functions?: string[];
    /** インターフェース */
    interfaces?: string[];
  };
  /** 依存関係 */
  dependencies?: string[];
  /** 重要度（他のファイルからの参照数） */
  importance?: number;
}

/**
 * ディレクトリ情報
 */
export interface DirectoryInfo {
  /** ディレクトリ名 */
  name: string;
  /** フルパス */
  path: string;
  /** 相対パス */
  relativePath: string;
  /** 子ファイル */
  files: FileInfo[];
  /** 子ディレクトリ */
  directories: DirectoryInfo[];
  /** 総ファイル数（再帰的） */
  totalFiles?: number;
  /** 総行数（再帰的） */
  totalLines?: number;
}

/**
 * プロジェクト構造
 */
export interface ProjectStructure {
  /** プロジェクト名 */
  name: string;
  /** ルートパス */
  rootPath: string;
  /** ルートディレクトリ */
  root: DirectoryInfo;
  /** 言語別ファイル数 */
  languageStats: Record<string, number>;
  /** 総ファイル数 */
  totalFiles: number;
  /** 総行数 */
  totalLines: number;
  /** 総サイズ（バイト） */
  totalSize: number;
}

/**
 * ファイルフィルター
 */
export interface FileFilter {
  /** ファイルタイプ（拡張子） */
  fileTypes?: string[];
  /** 言語ID */
  languageIds?: string[];
  /** 最小ファイルサイズ */
  minSize?: number;
  /** 最大ファイルサイズ */
  maxSize?: number;
  /** 最小行数 */
  minLines?: number;
  /** 最大行数 */
  maxLines?: number;
  /** 検索クエリ */
  searchQuery?: string;
  /** 役割で絞り込み */
  roleFilter?: string;
}

/**
 * ファイル統計情報
 */
export interface FileStatistics {
  /** 言語別統計 */
  byLanguage: Array<{
    /** 言語ID */
    languageId: string;
    /** ファイル数 */
    fileCount: number;
    /** 総行数 */
    totalLines: number;
    /** 総サイズ */
    totalSize: number;
  }>;
  /** ディレクトリ別統計 */
  byDirectory: Array<{
    /** ディレクトリ名 */
    directory: string;
    /** ファイル数 */
    fileCount: number;
    /** 総行数 */
    totalLines: number;
  }>;
  /** 最大ファイル */
  largestFiles: Array<{
    /** ファイルパス */
    path: string;
    /** サイズ */
    size: number;
    /** 行数 */
    lines: number;
  }>;
  /** 最も参照されているファイル */
  mostImportantFiles: Array<{
    /** ファイルパス */
    path: string;
    /** 参照数 */
    referenceCount: number;
  }>;
}
