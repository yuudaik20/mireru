/**
 * Claude API関連の型定義
 */

import { CodeType, FunctionType } from './common';

/**
 * AI プロバイダー
 */
export type AIProvider = 'claude' | 'openai' | 'gemini';

/**
 * Claude モデル
 */
export type ClaudeModel =
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-20250514'
  | 'claude-3-5-sonnet-20241022';

/**
 * OpenAI モデル
 */
export type OpenAIModel = 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo';

/**
 * AI 設定
 */
export interface AIConfig {
  /** プロバイダー */
  provider: AIProvider;
  /** APIキー */
  apiKey: string;
  /** モデル */
  model: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** 最大トークン数 */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
}

/**
 * パラメータ説明
 */
export interface ParameterExplanation {
  /** パラメータ名 */
  name: string;
  /** 型 */
  type: string;
  /** 説明 */
  description: string;
}

/**
 * Laravel固有情報
 */
export interface LaravelInfo {
  /** 対応Laravelバージョン */
  version?: string;
  /** ドキュメントURL */
  documentation?: string;
  /** 関連概念 */
  relatedConcepts?: string[];
  /** ベストプラクティス */
  bestPractices?: string[];
  /** よくある間違い */
  commonMistakes?: string[];
  /** Eloquentに関する情報 */
  eloquent?: {
    /** SQLクエリ例 */
    sqlExample?: string;
    /** リレーション情報 */
    relations?: string[];
  };
  /** ルートに関する情報 */
  route?: {
    /** コントローラー */
    controller?: string;
    /** アクション */
    action?: string;
  };
}

/**
 * 説明レスポンス
 */
export interface Explanation {
  /** タイトル */
  title: string;
  /** 関数の種別 */
  functionType: FunctionType;
  /** コードの種別 */
  codeType: CodeType;
  /** 詳細な説明（マークダウン形式） */
  description: string;
  /** パラメータの説明 */
  parameters?: ParameterExplanation[];
  /** 返り値の型 */
  returnType?: string;
  /** 返り値の説明 */
  returnDescription?: string;
  /** 使用例 */
  example?: string;
  /** Laravel固有情報 */
  laravelInfo?: LaravelInfo;
  /** 定義場所 */
  definitionLocation?: {
    file: string;
    line: number;
  };
  /** 注意点 */
  warnings?: string[];
  /** 関連項目 */
  relatedItems?: string[];
}

/**
 * 使用箇所の説明
 */
export interface UsageExplanation {
  /** ファイルパス */
  file: string;
  /** 行番号 */
  line: number;
  /** コードスニペット */
  snippet: string;
  /** この箇所での使用方法の説明 */
  explanation: string;
  /** 使用目的 */
  purpose: string;
  /** 渡されている引数の意味 */
  argumentMeanings?: string[];
}

/**
 * 使用箇所一覧レスポンス
 */
export interface UsagesResponse {
  /** 総参照回数 */
  totalCount: number;
  /** 使用箇所 */
  usages: UsageExplanation[];
  /** 使用パターンの分類 */
  patterns: {
    /** 基本的な使用例 */
    basic: UsageExplanation[];
    /** 応用的な使用例 */
    advanced: UsageExplanation[];
    /** エッジケース */
    edgeCases: UsageExplanation[];
  };
  /** 統計情報 */
  statistics: {
    /** 最も使用されているファイル */
    mostUsedFiles: Array<{ file: string; count: number }>;
  };
}

/**
 * 変数追跡情報
 */
export interface VariableTracking {
  /** 変数名 */
  variableName: string;
  /** タイムライン */
  timeline: Array<{
    /** 種別 */
    type: 'definition' | 'assignment' | 'reference' | 'parameter' | 'return';
    /** ファイル */
    file: string;
    /** 行番号 */
    line: number;
    /** コードスニペット */
    snippet: string;
    /** 説明 */
    explanation: string;
    /** 値（分かる場合） */
    value?: string;
  }>;
  /** データフロー図データ */
  dataFlow?: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; label?: string }>;
  };
}

/**
 * プロンプトテンプレート
 */
export interface PromptTemplate {
  /** システムプロンプト */
  system?: string;
  /** ユーザープロンプト */
  user: string;
  /** プレースホルダー */
  placeholders: Record<string, string>;
}
