/**
 * OpenAI Provider
 */

import { IAIProvider } from './IAIProvider';
import { AIRequest, AIResponse, ExplainRequest, ExplainResponse, AIProvider } from '../types/ai';

export class OpenAIProvider implements IAIProvider {
  readonly name = 'OpenAI';
  readonly availableModels = [
    'gpt-4-turbo-preview',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4o-mini'
  ];
  readonly defaultModel = 'gpt-4o';

  private apiKey: string = '';
  private model: string = this.defaultModel;
  private baseURL = 'https://api.openai.com/v1';

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setModel(model: string): void {
    if (this.availableModels.includes(model)) {
      this.model = model;
    }
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const messages: any[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    messages.push({
      role: 'user',
      content: request.prompt
    });

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 4096
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data: any = await response.json();

    return {
      content: data.choices[0].message.content,
      provider: AIProvider.OpenAI,
      model: this.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }

  async explainCode(request: ExplainRequest): Promise<ExplainResponse> {
    const language = request.language || 'ja';
    const isJapanese = language === 'ja';

    const systemPrompt = isJapanese
      ? 'あなたはPHP/Laravelの専門家です。コードを分かりやすく説明してください。JSON形式で回答してください。'
      : 'You are a PHP/Laravel expert. Explain code clearly and return JSON format.';

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
- 使用パターン: ${usageData.usagePatterns?.map((p: any) => `${p.pattern} (${p.count}件)`).join(', ') || 'なし'}

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
      systemPrompt: 'あなたはコード分析の専門家です。JSON形式で返してください。',
      temperature: 0.3,
      maxTokens: 1024
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error);
    }

    return {
      mainPurpose: `${identifier} は主に使用されています`,
      characteristics: [],
      bestPractices: [],
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

以下の形式のJSONで返してください:
{
  "title": "コードのタイトル",
  "functionType": "関数の種類",
  "description": "詳しい説明",
  "parameters": [{"name": "パラメータ名", "type": "型", "description": "説明"}],
  "returnType": "返り値の型",
  "returnDescription": "返り値の説明",
  "example": "使用例のコード",
  "warnings": ["注意点1"]
}
`;
    } else {
      return `
Explain the following PHP/Laravel code.

Code:
\`\`\`php
${request.code}
\`\`\`

Return JSON format:
{
  "title": "Code title",
  "functionType": "Function type",
  "description": "Description",
  "parameters": [{"name": "param", "type": "type", "description": "desc"}],
  "returnType": "Return type",
  "returnDescription": "Return description",
  "example": "Usage example",
  "warnings": ["Warning 1"]
}
`;
    }
  }

  private parseExplanation(content: string): ExplainResponse {
    try {
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

    return {
      title: 'コードの説明',
      functionType: '不明',
      description: content.substring(0, 500),
      parameters: [],
      warnings: []
    };
  }
}
