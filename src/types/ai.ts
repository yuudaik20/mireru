/**
 * AI関連の型定義
 */

/**
 * サポートするAIプロバイダー
 */
export enum AIProvider {
  Claude = 'claude',
  OpenAI = 'openai',
  Gemini = 'gemini'
}

/**
 * AIプロバイダーの設定
 */
export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AIリクエスト
 */
export interface AIRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AIレスポンス
 */
export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * コード説明リクエスト
 */
export interface ExplainRequest {
  code: string;
  codeType: string;
  context?: any;
  language?: 'ja' | 'en';
}

/**
 * コード説明レスポンス
 */
export interface ExplainResponse {
  title: string;
  functionType: string;
  description: string;
  parameters?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  returnType?: string;
  returnDescription?: string;
  example?: string;
  warnings?: string[];
}
