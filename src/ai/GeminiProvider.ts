/**
 * Google Gemini Provider
 */

import { IAIProvider } from './IAIProvider';
import { AIRequest, AIResponse, ExplainRequest, ExplainResponse, AIProvider } from '../types/ai';

export class GeminiProvider implements IAIProvider {
  readonly name = 'Gemini';
  readonly availableModels = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro'
  ];
  readonly defaultModel = 'gemini-1.5-pro';

  private apiKey: string = '';
  private model: string = this.defaultModel;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
      throw new Error('Gemini API key not configured');
    }

    const contents: any[] = [];

    // Geminiはsystem promptを別のフィールドで扱う
    let systemInstruction = undefined;
    if (request.systemPrompt) {
      systemInstruction = {
        parts: [{ text: request.systemPrompt }]
      };
    }

    contents.push({
      role: 'user',
      parts: [{ text: request.prompt }]
    });

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.maxTokens || 4096
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    const url = `${this.baseURL}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data: any = await response.json();

    const candidate = data.candidates[0];
    const content = candidate.content.parts[0].text;

    return {
      content,
      provider: AIProvider.Gemini,
      model: this.model,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0
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

JSON形式で返してください:
{
  "mainPurpose": "主な使用目的",
  "characteristics": ["特徴1"],
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
      // Geminiの応答からJSONを抽出
      let jsonStr = response.content;

      // ```json と ``` で囲まれている場合は抽出
      const codeBlockMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      // JSON部分を抽出
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
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
      return `以下のPHP/Laravelコードを説明してください。

コード:
\`\`\`php
${request.code}
\`\`\`

以下の形式のJSONで返してください（\`\`\`json は付けずに、JSONのみを返してください）:
{
  "title": "コードのタイトル",
  "functionType": "関数の種類",
  "description": "詳しい説明",
  "parameters": [{"name": "パラメータ名", "type": "型", "description": "説明"}],
  "returnType": "返り値の型",
  "returnDescription": "返り値の説明",
  "example": "使用例のコード",
  "warnings": ["注意点1"]
}`;
    } else {
      return `Explain the following PHP code.

Code:
\`\`\`php
${request.code}
\`\`\`

Return JSON format (JSON only, without \`\`\`json markers):
{
  "title": "Code title",
  "functionType": "Function type",
  "description": "Description",
  "parameters": [{"name": "param", "type": "type", "description": "desc"}],
  "returnType": "Return type",
  "returnDescription": "Return description",
  "example": "Usage example",
  "warnings": ["Warning 1"]
}`;
    }
  }


  private parseExplanation(content: string): ExplainResponse {
    try {
      // ```json と ``` で囲まれている場合は抽出
      let jsonStr = content;
      const codeBlockMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
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
