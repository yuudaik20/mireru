/**
 * Claude AI Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import { IAIProvider } from './IAIProvider';
import { AIRequest, AIResponse, ExplainRequest, ExplainResponse, AIProvider } from '../types/ai';

export class ClaudeProvider implements IAIProvider {
  readonly name = 'Claude';
  readonly availableModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ];
  readonly defaultModel = 'claude-3-5-sonnet-20241022';

  private client: Anthropic | null = null;
  private apiKey: string = '';
  private model: string = this.defaultModel;

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey });
  }

  setModel(model: string): void {
    if (this.availableModels.includes(model)) {
      this.model = model;
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Claude API key not configured');
    }

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: request.prompt }
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 0.7,
      system: request.systemPrompt,
      messages
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';

    return {
      content: text,
      provider: AIProvider.Claude,
      model: this.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }

  async explainCode(request: ExplainRequest): Promise<ExplainResponse> {
    const language = request.language || 'ja';
    const isJapanese = language === 'ja';

    const systemPrompt = isJapanese
      ? 'あなたはPHP/Laravelの専門家です。コードを分かりやすく説明してください。'
      : 'You are a PHP/Laravel expert. Explain code clearly and concisely.';

    const prompt = this.buildExplainPrompt(request, isJapanese);

    const response = await this.generate({
      prompt,
      systemPrompt,
      temperature: 0.3,
      maxTokens: 2048
    });

    return this.parseExplanation(response.content);
  }

  async analyzeUsages(identifier: string, usageData: any): Promise<any> {
    const prompt = `
以下のコード識別子 "${identifier}" の使用パターンを分析してください。

使用統計:
- 総使用箇所: ${usageData.totalUsages}件
- 使用パターン: ${usageData.usagePatterns.map((p: any) => `${p.pattern} (${p.count}件)`).join(', ')}

サンプル使用例:
${usageData.sampleUsages?.join('\n') || 'なし'}

以下の観点から分析してください:
1. 主な使用目的
2. 使用パターンの特徴
3. ベストプラクティスに沿った使用方法
4. 改善の余地がある使用例

JSON形式で返してください:
{
  "mainPurpose": "主な使用目的",
  "characteristics": ["特徴1", "特徴2"],
  "bestPractices": ["ベストプラクティス1"],
  "improvements": ["改善点1"]
}
`;

    const response = await this.generate({
      prompt,
      systemPrompt: 'あなたはコード分析の専門家です。使用パターンを分析してJSON形式で返してください。',
      temperature: 0.3,
      maxTokens: 1024
    });

    try {
      // JSONを抽出
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error);
    }

    // フォールバック
    return {
      mainPurpose: `${identifier} は主に使用されています`,
      characteristics: usageData.usagePatterns.map((p: any) => p.description),
      bestPractices: ['適切なエラーハンドリング', '型安全性の確保'],
      improvements: []
    };
  }

  private buildExplainPrompt(request: ExplainRequest, isJapanese: boolean): string {
    if (isJapanese) {
      return `
以下のPHP/Laravelコードを説明してください。

コード:
\`\`\`php
${request.code}
\`\`\`

コンテキスト:
${JSON.stringify(request.context, null, 2)}

以下の形式でJSON形式で返してください:
{
  "title": "コードのタイトル",
  "functionType": "関数の種類（PHP標準関数、Laravel関数、ユーザー定義関数等）",
  "description": "詳しい説明（200文字程度）",
  "parameters": [{"name": "パラメータ名", "type": "型", "description": "説明"}],
  "returnType": "返り値の型",
  "returnDescription": "返り値の説明",
  "example": "使用例のコード",
  "warnings": ["注意点1", "注意点2"]
}
`;
    } else {
      return `
Explain the following PHP/Laravel code.

Code:
\`\`\`php
${request.code}
\`\`\`

Context:
${JSON.stringify(request.context, null, 2)}

Return in JSON format:
{
  "title": "Code title",
  "functionType": "Function type (PHP builtin, Laravel, user-defined, etc.)",
  "description": "Detailed description",
  "parameters": [{"name": "param name", "type": "type", "description": "description"}],
  "returnType": "Return type",
  "returnDescription": "Return description",
  "example": "Usage example code",
  "warnings": ["Warning 1", "Warning 2"]
}
`;
    }
  }

  private parseExplanation(content: string): ExplainResponse {
    try {
      // JSONを抽出
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || 'コードの説明',
          functionType: parsed.functionType || '不明',
          description: parsed.description || '',
          parameters: parsed.parameters || [],
          returnType: parsed.returnType,
          returnDescription: parsed.returnDescription,
          example: parsed.example,
          warnings: parsed.warnings || []
        };
      }
    } catch (error) {
      console.error('Failed to parse explanation:', error);
    }

    // フォールバック
    return {
      title: 'コードの説明',
      functionType: '不明',
      description: content.substring(0, 500),
      parameters: [],
      warnings: []
    };
  }
}
