/**
 * Claude API サービス
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIConfig, Explanation, UsagesResponse, VariableTracking } from '../types/claude';
import { CodeContext, CodeType, FunctionType } from '../types/common';
import { PromptBuilder } from './PromptBuilder';

export class ClaudeService {
  private client: Anthropic | null = null;
  private config: AIConfig | null = null;
  private promptBuilder: PromptBuilder;

  constructor() {
    this.promptBuilder = new PromptBuilder();
  }

  /**
   * API設定を初期化
   */
  initialize(config: AIConfig): void {
    this.config = config;

    if (config.provider === 'claude') {
      this.client = new Anthropic({
        apiKey: config.apiKey
      });
    }
  }

  /**
   * API設定が有効かチェック
   */
  isConfigured(): boolean {
    return this.client !== null && this.config !== null;
  }

  /**
   * コードの説明を生成
   */
  async explain(
    code: string,
    codeType: CodeType,
    context: CodeContext
  ): Promise<Explanation> {
    if (!this.isConfigured()) {
      throw new Error('Claude API is not configured. Please set your API key in settings.');
    }

    try {
      const prompt = this.promptBuilder.buildExplanationPrompt(code, codeType, context);
      const response = await this.callAPI(prompt);
      return this.parseExplanation(response);
    } catch (error) {
      throw new Error(`Failed to generate explanation: ${error}`);
    }
  }

  /**
   * 使用箇所の説明を生成
   */
  async explainUsages(
    code: string,
    usages: Array<{ file: string; line: number; snippet: string }>
  ): Promise<UsagesResponse> {
    if (!this.isConfigured()) {
      throw new Error('Claude API is not configured.');
    }

    try {
      const prompt = this.promptBuilder.buildUsagesPrompt(code, usages);
      const response = await this.callAPI(prompt);
      return this.parseUsagesResponse(response);
    } catch (error) {
      throw new Error(`Failed to generate usage explanations: ${error}`);
    }
  }

  /**
   * 変数追跡情報を生成
   */
  async trackVariable(
    variableName: string,
    timeline: Array<{ type: string; file: string; line: number; snippet: string }>
  ): Promise<VariableTracking> {
    if (!this.isConfigured()) {
      throw new Error('Claude API is not configured.');
    }

    try {
      const prompt = this.promptBuilder.buildVariableTrackingPrompt(variableName, timeline);
      const response = await this.callAPI(prompt);
      return this.parseVariableTracking(response, variableName, timeline);
    } catch (error) {
      throw new Error(`Failed to track variable: ${error}`);
    }
  }

  /**
   * Claude APIを呼び出し
   */
  private async callAPI(prompt: string): Promise<string> {
    if (!this.client || !this.config) {
      throw new Error('API client not initialized');
    }

    const message = await this.client.messages.create({
      model: this.config.model as any,
      max_tokens: this.config.maxTokens || 4000,
      temperature: this.config.temperature || 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    if (message.content[0].type === 'text') {
      return message.content[0].text;
    }

    throw new Error('Unexpected response format from Claude API');
  }

  /**
   * 説明をパース
   */
  private parseExplanation(response: string): Explanation {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          title: parsed.title || '',
          functionType: parsed.functionType || FunctionType.Unknown,
          codeType: parsed.codeType || CodeType.Unknown,
          description: parsed.description || '',
          parameters: parsed.parameters || [],
          returnType: parsed.returnType,
          returnDescription: parsed.returnDescription,
          example: parsed.example,
          laravelInfo: parsed.laravelInfo,
          definitionLocation: parsed.definitionLocation,
          warnings: parsed.warnings || [],
          relatedItems: parsed.relatedItems || []
        };
      }

      // JSONブロックがない場合はプレーンテキストとして扱う
      return {
        title: 'コードの説明',
        functionType: FunctionType.Unknown,
        codeType: CodeType.Unknown,
        description: response,
        parameters: [],
        warnings: [],
        relatedItems: []
      };
    } catch (error) {
      // パースエラーの場合はプレーンテキストとして返す
      return {
        title: 'コードの説明',
        functionType: FunctionType.Unknown,
        codeType: CodeType.Unknown,
        description: response,
        parameters: [],
        warnings: [],
        relatedItems: []
      };
    }
  }

  /**
   * 使用箇所レスポンスをパース
   */
  private parseUsagesResponse(response: string): UsagesResponse {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // デフォルトレスポンス
      return {
        totalCount: 0,
        usages: [],
        patterns: {
          basic: [],
          advanced: [],
          edgeCases: []
        },
        statistics: {
          mostUsedFiles: []
        }
      };
    } catch {
      return {
        totalCount: 0,
        usages: [],
        patterns: {
          basic: [],
          advanced: [],
          edgeCases: []
        },
        statistics: {
          mostUsedFiles: []
        }
      };
    }
  }

  /**
   * 変数追跡情報をパース
   */
  private parseVariableTracking(
    response: string,
    variableName: string,
    timeline: Array<{ type: string; file: string; line: number; snippet: string }>
  ): VariableTracking {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          variableName,
          timeline: parsed.timeline || timeline.map((t: any) => ({
            ...t,
            explanation: ''
          })),
          dataFlow: parsed.dataFlow
        };
      }

      // デフォルトレスポンス
      return {
        variableName,
        timeline: timeline.map(t => ({
          type: t.type as any,
          file: t.file,
          line: t.line,
          snippet: t.snippet,
          explanation: ''
        }))
      };
    } catch {
      return {
        variableName,
        timeline: timeline.map(t => ({
          type: t.type as any,
          file: t.file,
          line: t.line,
          snippet: t.snippet,
          explanation: ''
        }))
      };
    }
  }

  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const message = await this.client!.messages.create({
        model: this.config!.model as any,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      });

      return message.content.length > 0;
    } catch {
      return false;
    }
  }
}
