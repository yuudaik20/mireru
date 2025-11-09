/**
 * AI Service Manager
 * 複数のAIプロバイダーを管理し、設定に基づいて適切なプロバイダーを使用する
 */

import * as vscode from 'vscode';
import { IAIProvider } from './IAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { AIProvider, ExplainRequest, ExplainResponse } from '../types/ai';

export class AIServiceManager {
  private providers: Map<AIProvider, IAIProvider>;
  private currentProvider: AIProvider;

  constructor() {
    this.providers = new Map();
    this.providers.set(AIProvider.Claude, new ClaudeProvider());
    this.providers.set(AIProvider.OpenAI, new OpenAIProvider());
    this.providers.set(AIProvider.Gemini, new GeminiProvider());

    // デフォルトはClaude
    this.currentProvider = AIProvider.Claude;

    // 設定を読み込んで初期化
    this.loadConfiguration();
  }

  /**
   * 設定を読み込む
   */
  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('mireru');

    // プロバイダー選択
    const providerName = config.get<string>('aiProvider', 'claude');
    this.currentProvider = this.getProviderFromName(providerName);

    console.log(`[Mireru] AI Provider selected: ${providerName} (${this.currentProvider})`);

    // APIキーの設定
    const claudeApiKey = config.get<string>('claude.apiKey', '');
    if (claudeApiKey) {
      this.providers.get(AIProvider.Claude)?.setApiKey(claudeApiKey);
      console.log(`[Mireru] Claude API key configured (${claudeApiKey.substring(0, 10)}...)`);
    }

    const openaiApiKey = config.get<string>('openai.apiKey', '');
    if (openaiApiKey) {
      this.providers.get(AIProvider.OpenAI)?.setApiKey(openaiApiKey);
      console.log(`[Mireru] OpenAI API key configured (${openaiApiKey.substring(0, 10)}...)`);
    }

    const geminiApiKey = config.get<string>('gemini.apiKey', '');
    if (geminiApiKey) {
      this.providers.get(AIProvider.Gemini)?.setApiKey(geminiApiKey);
      console.log(`[Mireru] Gemini API key configured (${geminiApiKey.substring(0, 10)}...)`);
    }

    // モデルの設定
    const claudeModel = config.get<string>('claude.model', 'claude-3-5-sonnet-20241022');
    this.providers.get(AIProvider.Claude)?.setModel(claudeModel);

    const openaiModel = config.get<string>('openai.model', 'gpt-4o');
    this.providers.get(AIProvider.OpenAI)?.setModel(openaiModel);
    console.log(`[Mireru] OpenAI model: ${openaiModel}`);

    const geminiModel = config.get<string>('gemini.model', 'gemini-1.5-pro');
    this.providers.get(AIProvider.Gemini)?.setModel(geminiModel);

    console.log(`[Mireru] Current provider configured: ${this.isConfigured()}`);
  }

  /**
   * プロバイダー名から列挙型に変換
   */
  private getProviderFromName(name: string): AIProvider {
    switch (name.toLowerCase()) {
      case 'openai':
        return AIProvider.OpenAI;
      case 'gemini':
        return AIProvider.Gemini;
      case 'claude':
      default:
        return AIProvider.Claude;
    }
  }

  /**
   * 現在のプロバイダーを取得
   */
  getCurrentProvider(): IAIProvider {
    const provider = this.providers.get(this.currentProvider);
    if (!provider) {
      throw new Error('No AI provider configured');
    }
    return provider;
  }

  /**
   * プロバイダーを切り替え
   */
  switchProvider(providerType: AIProvider): void {
    if (this.providers.has(providerType)) {
      this.currentProvider = providerType;
    }
  }

  /**
   * 設定済みかチェック
   */
  isConfigured(): boolean {
    const provider = this.getCurrentProvider();
    return provider.isConfigured();
  }

  /**
   * コードを説明
   */
  async explainCode(request: ExplainRequest): Promise<ExplainResponse> {
    const provider = this.getCurrentProvider();
    if (!provider.isConfigured()) {
      throw new Error(`${provider.name} API key not configured`);
    }
    return await provider.explainCode(request);
  }

  /**
   * 使用箇所を分析
   */
  async analyzeUsages(identifier: string, usageData: any): Promise<any> {
    const provider = this.getCurrentProvider();
    if (!provider.isConfigured()) {
      throw new Error(`${provider.name} API key not configured`);
    }
    return await provider.analyzeUsages(identifier, usageData);
  }

  /**
   * 利用可能なプロバイダー一覧を取得
   */
  getAvailableProviders(): Array<{ name: string; type: AIProvider; configured: boolean }> {
    const result: Array<{ name: string; type: AIProvider; configured: boolean }> = [];

    for (const [type, provider] of this.providers.entries()) {
      result.push({
        name: provider.name,
        type,
        configured: provider.isConfigured()
      });
    }

    return result;
  }

  /**
   * 現在のプロバイダー名を取得
   */
  getCurrentProviderName(): string {
    return this.getCurrentProvider().name;
  }

  /**
   * 設定を再読み込み
   */
  reloadConfiguration(): void {
    this.loadConfiguration();
  }
}
