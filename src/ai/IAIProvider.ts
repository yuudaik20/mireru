/**
 * AIプロバイダーのインターフェース
 */

import { AIRequest, AIResponse, ExplainRequest, ExplainResponse } from '../types/ai';

export interface IAIProvider {
  /**
   * プロバイダー名
   */
  readonly name: string;

  /**
   * 使用可能なモデル一覧
   */
  readonly availableModels: string[];

  /**
   * デフォルトモデル
   */
  readonly defaultModel: string;

  /**
   * 設定済みかどうか
   */
  isConfigured(): boolean;

  /**
   * APIキーを設定
   */
  setApiKey(apiKey: string): void;

  /**
   * モデルを設定
   */
  setModel(model: string): void;

  /**
   * 汎用的なテキスト生成
   */
  generate(request: AIRequest): Promise<AIResponse>;

  /**
   * コード説明の生成
   */
  explainCode(request: ExplainRequest): Promise<ExplainResponse>;

  /**
   * 使用箇所の分析
   */
  analyzeUsages(identifier: string, usageData: any): Promise<any>;
}
