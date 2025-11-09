/**
 * Analyze Code Flow Command
 * 複数行のコードブロックの流れ、役割、変数・関数の連携を分析
 */

import * as vscode from 'vscode';
import { AIServiceManager } from '../ai/AIServiceManager';

export class AnalyzeCodeFlowCommand {
  constructor(private aiService: AIServiceManager) {}

  async execute(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('エディタが開かれていません');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText || selectedText.trim().length === 0) {
      vscode.window.showErrorMessage('コードを選択してください');
      return;
    }

    // どんなコード（1行でも複数行でも）でも分析可能
    // AI分析を実行
    await this.analyzeCodeFlow(editor.document, selectedText, selection);
  }

  private async analyzeCodeFlow(
    editor: vscode.TextDocument,
    code: string,
    selection: vscode.Selection
  ): Promise<void> {
    // 周辺コンテキストを収集
    const context = this.collectContext(editor, selection);

    // AIサービスが設定されているかチェック
    if (!this.aiService.isConfigured()) {
      vscode.window.showErrorMessage('AI APIが設定されていません。設定を確認してください。');
      return;
    }

    // ローディング表示
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'コードフローを分析中...',
        cancellable: false
      },
      async () => {
        try {
          const analysis = await this.requestCodeFlowAnalysis(code, context);

          // 結果を表示
          await this.showAnalysisResult(analysis);
        } catch (error) {
          vscode.window.showErrorMessage(`分析エラー: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
  }

  private collectContext(document: vscode.TextDocument, selection: vscode.Selection): CodeContext {
    // 選択範囲の前後10行を取得
    const startLine = Math.max(0, selection.start.line - 10);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + 10);

    const beforeCode = this.getLines(document, startLine, selection.start.line);
    const afterCode = this.getLines(document, selection.end.line + 1, endLine + 1);

    return {
      filePath: document.fileName,
      language: document.languageId,
      beforeCode,
      afterCode,
      lineStart: selection.start.line + 1,
      lineEnd: selection.end.line + 1
    };
  }

  private getLines(document: vscode.TextDocument, start: number, end: number): string {
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      if (i >= 0 && i < document.lineCount) {
        lines.push(document.lineAt(i).text);
      }
    }
    return lines.join('\n');
  }

  private async requestCodeFlowAnalysis(code: string, context: CodeContext): Promise<CodeFlowAnalysis> {
    const language = vscode.workspace.getConfiguration('mireru').get<string>('language', 'ja');

    const prompt = this.buildAnalysisPrompt(code, context, language);

    const response = await this.aiService.generate(prompt, {
      maxTokens: 3000,
      temperature: 0.3
    });

    // レスポンスをパース
    return this.parseAnalysisResponse(response);
  }

  private buildAnalysisPrompt(code: string, context: CodeContext, language: string): string {
    const langInstruction = language === 'ja' ? '日本語で' : 'in English';

    // 言語ごとの専門家役割とフレームワーク機能
    let expertRole = 'コード';
    let frameworkFeatureLabel = 'フレームワーク固有の機能';

    if (context.language === 'php' || context.language === 'blade') {
      expertRole = 'PHP/Laravel';
      frameworkFeatureLabel = 'Laravelの機能';
    } else if (context.language === 'javascript' || context.language === 'typescript') {
      expertRole = 'JavaScript/TypeScript';
      frameworkFeatureLabel = 'フレームワーク/ライブラリの機能';
    } else if (context.language === 'html') {
      expertRole = 'HTML/Web';
      frameworkFeatureLabel = 'HTML/Web技術の機能';
    }

    return `あなたは${expertRole}の専門家です。以下のコードを分析し、${langInstruction}統一フォーマットで詳細に説明してください。

【重要】1行でも複数行でも、すべての項目を必ず含めて分析してください。該当しない項目は「該当なし」と明記してください。

【分析対象コード】
\`\`\`${context.language}
${code}
\`\`\`

【コンテキスト情報】
- ファイル: ${context.filePath}
- 行範囲: ${context.lineStart}-${context.lineEnd}

【前のコード（参考）】
\`\`\`${context.language}
${context.beforeCode}
\`\`\`

【後のコード（参考）】
\`\`\`${context.language}
${context.afterCode}
\`\`\`

【必須分析項目】以下のすべての項目を必ず分析してください：

1. **要約（summary）**: このコードが何をしているかを1-2文で簡潔に説明

2. **役割・目的（purpose）**: このコードの詳細な目的、なぜこのコードが必要か

3. **パラメータ（parameters）**: 関数/メソッドの場合は各パラメータを詳細に。変数代入などの場合は空配列

4. **返り値（returnValue）**: 関数/メソッドの返り値の型と意味。該当しない場合はnull

5. **処理の流れ（flow）**: コードを1処理ずつ分解して説明。1行のコードでも最低1つのステップを作成
   - 各ステップは具体的に「何をしているか」を説明
   - 初心者にもわかるよう、専門用語は噛み砕いて説明

6. **変数の説明（variables）**: 使用されているすべての変数を説明
   - 変数名、型、説明、どのように使われているか

7. **関数・メソッドの説明（functions）**: 呼び出されているすべての関数/メソッド
   - 名前、種類（builtin/framework/userDefined/library）、説明、この処理での役割

8. **データの流れ（dataFlow）**: データがどのように入力され、変換され、出力されるか

9. **${frameworkFeatureLabel}（laravelFeatures）**: 使用されているフレームワーク固有の機能やパターン

10. **使用例（usageExamples）**: このコードの実際の使用例を1つ以上提示

11. **注意点（warnings）**: 理解すべき注意点、よくある間違い、改善の余地

12. **理解すべきポイント（insights）**: このコードから学べる重要な概念やベストプラクティス

【出力形式】
JSON形式で以下の構造で返してください。すべてのフィールドは必須です：
\`\`\`json
{
  "summary": "コードの要約（1-2文で簡潔に）【必須】",
  "purpose": "このコードの役割・目的の詳細説明【必須】",
  "parameters": [
    {
      "name": "パラメータ名",
      "type": "型",
      "description": "詳細説明",
      "required": true
    }
  ],
  "returnValue": {
    "type": "返り値の型",
    "description": "返り値の説明"
  },
  "flow": [
    {
      "step": 1,
      "description": "1つ目の処理の説明（初心者にもわかりやすく）",
      "code": "該当するコード行"
    },
    {
      "step": 2,
      "description": "2つ目の処理の説明",
      "code": "該当するコード行"
    }
  ],
  "variables": [
    {
      "name": "変数名",
      "type": "型",
      "description": "変数の説明",
      "usage": "どのように使われているか"
    }
  ],
  "functions": [
    {
      "name": "関数・メソッド名",
      "type": "builtin|framework|userDefined|library",
      "description": "関数の説明",
      "purpose": "この処理での役割"
    }
  ],
  "dataFlow": "データがどのように入力され、変換され、出力されるかの流れを詳細に説明【必須】",
  "laravelFeatures": [
    {
      "feature": "機能名（例: Eloquent ORM、Blade、ルーティング）",
      "description": "機能の説明と使用方法"
    }
  ],
  "usageExamples": [
    {
      "title": "使用例1のタイトル",
      "code": "実際に動作するサンプルコード",
      "description": "使用例の説明"
    }
  ],
  "warnings": [
    "注意点1: 具体的な警告や改善点",
    "注意点2: よくある間違いと対処法"
  ],
  "insights": [
    "理解すべきポイント1: このコードから学べる重要な概念",
    "理解すべきポイント2: ベストプラクティスや設計パターン"
  ]
}
\`\`\`

【重要な注意事項】
- 配列フィールド（parameters, flow, variables, functions, laravelFeatures, usageExamples, warnings, insights）は、該当がない場合でも空配列[]を返してください
- returnValueは該当しない場合はnullを返してください
- すべての説明は具体的で詳細に、初心者にもわかりやすく記述してください
- 1行のコードでもflowは最低1つのステップを作成してください`;
  }

  private parseAnalysisResponse(response: string): CodeFlowAnalysis {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('JSON形式のレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      return {
        summary: parsed.summary || '',
        purpose: parsed.purpose || '',
        parameters: parsed.parameters || [],
        returnValue: parsed.returnValue,
        flow: parsed.flow || [],
        variables: parsed.variables || [],
        functions: parsed.functions || [],
        dataFlow: parsed.dataFlow || '',
        laravelFeatures: parsed.laravelFeatures || [],
        usageExamples: parsed.usageExamples || [],
        warnings: parsed.warnings || [],
        insights: parsed.insights || []
      };
    } catch (error) {
      // パースエラーの場合、レスポンスをそのまま要約として返す
      return {
        summary: response.substring(0, 200),
        purpose: response,
        parameters: [],
        returnValue: undefined,
        flow: [],
        variables: [],
        functions: [],
        dataFlow: '',
        laravelFeatures: [],
        usageExamples: [],
        warnings: [],
        insights: []
      };
    }
  }

  private async showAnalysisResult(analysis: CodeFlowAnalysis): Promise<void> {
    // 現在のエディタから言語を取得
    const editor = vscode.window.activeTextEditor;
    const languageId = editor?.document.languageId || 'php';

    // Webviewパネルを作成
    const panel = vscode.window.createWebviewPanel(
      'mireruCodeFlow',
      'コードフロー分析',
      vscode.ViewColumn.Two,
      {
        enableScripts: true
      }
    );

    // HTMLコンテンツを生成
    panel.webview.html = this.generateHtml(analysis, languageId);
  }

  private generateHtml(analysis: CodeFlowAnalysis, languageId: string): string {
    // 言語ごとのフレームワーク機能ラベル
    let frameworkLabel = 'フレームワーク機能';
    if (languageId === 'php' || languageId === 'blade') {
      frameworkLabel = 'Laravel機能';
    } else if (languageId === 'javascript' || languageId === 'typescript') {
      frameworkLabel = 'フレームワーク/ライブラリ機能';
    } else if (languageId === 'html') {
      frameworkLabel = 'HTML/Web技術';
    }

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>コードフロー分析</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1, h2, h3 { color: var(--vscode-editor-foreground); }
    h1 { font-size: 24px; border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px; }
    h2 { font-size: 20px; margin-top: 30px; color: var(--vscode-textLink-foreground); }
    h3 { font-size: 16px; margin-top: 20px; }
    .summary {
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textLink-foreground);
      padding: 15px;
      margin: 20px 0;
      font-size: 16px;
    }
    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .flow-step {
      margin: 10px 0;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    .flow-step .step-number {
      display: inline-block;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 50%;
      width: 30px;
      height: 30px;
      text-align: center;
      line-height: 30px;
      font-weight: bold;
      margin-right: 10px;
    }
    .variable, .function {
      margin: 10px 0;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 3px;
    }
    .variable-name, .function-name {
      font-family: 'Courier New', monospace;
      color: var(--vscode-debugTokenExpression-name);
      font-weight: bold;
    }
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      margin-left: 5px;
    }
    .type-builtin { background: #4A90E2; color: white; }
    .type-framework { background: #50C878; color: white; }
    .type-userDefined { background: #FF8C00; color: white; }
    .type-library { background: #9B59B6; color: white; }
    .insight {
      padding: 10px;
      margin: 5px 0;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  <h1>🔍 コードフロー分析</h1>

  <div class="summary">
    <strong>📝 要約:</strong> ${this.escapeHtml(analysis.summary)}
  </div>

  <div class="section">
    <h2>🎯 役割・目的</h2>
    <p>${this.escapeHtml(analysis.purpose)}</p>
  </div>

  ${analysis.parameters.length > 0 ? `
  <div class="section">
    <h2>📋 パラメータ</h2>
    ${analysis.parameters.map(param => `
      <div class="variable">
        <div>
          <span class="variable-name">${this.escapeHtml(param.name)}</span>
          <span class="type-badge">${this.escapeHtml(param.type)}</span>
          ${param.required ? '<span class="type-badge" style="background: #e74c3c;">必須</span>' : '<span class="type-badge" style="background: #95a5a6;">任意</span>'}
        </div>
        <p>${this.escapeHtml(param.description)}</p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.returnValue ? `
  <div class="section">
    <h2>↩️ 返り値</h2>
    <div class="variable">
      <div>
        <span class="type-badge">${this.escapeHtml(analysis.returnValue.type)}</span>
      </div>
      <p>${this.escapeHtml(analysis.returnValue.description)}</p>
    </div>
  </div>
  ` : ''}

  ${analysis.flow.length > 0 ? `
  <div class="section">
    <h2>⚙️ 処理の流れ</h2>
    ${analysis.flow.map(step => `
      <div class="flow-step">
        <span class="step-number">${step.step}</span>
        <strong>${this.escapeHtml(step.description)}</strong>
        ${step.code ? `<br><code>${this.escapeHtml(step.code)}</code>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.variables.length > 0 ? `
  <div class="section">
    <h2>📦 変数の説明</h2>
    ${analysis.variables.map(v => `
      <div class="variable">
        <div>
          <span class="variable-name">${this.escapeHtml(v.name)}</span>
          ${v.type ? `<span class="type-badge">${this.escapeHtml(v.type)}</span>` : ''}
        </div>
        <p><strong>説明:</strong> ${this.escapeHtml(v.description)}</p>
        ${v.usage ? `<p><strong>使用方法:</strong> ${this.escapeHtml(v.usage)}</p>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.functions.length > 0 ? `
  <div class="section">
    <h2>🔧 関数・メソッドの説明</h2>
    ${analysis.functions.map(f => `
      <div class="function">
        <div>
          <span class="function-name">${this.escapeHtml(f.name)}</span>
          <span class="type-badge type-${f.type}">${this.getFunctionTypeLabel(f.type)}</span>
        </div>
        <p><strong>説明:</strong> ${this.escapeHtml(f.description)}</p>
        ${f.purpose ? `<p><strong>この処理での役割:</strong> ${this.escapeHtml(f.purpose)}</p>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.dataFlow ? `
  <div class="section">
    <h2>🔄 データの流れ</h2>
    <p>${this.escapeHtml(analysis.dataFlow)}</p>
  </div>
  ` : ''}

  ${analysis.laravelFeatures.length > 0 ? `
  <div class="section">
    <h2>🚀 ${frameworkLabel}</h2>
    ${analysis.laravelFeatures.map(feature => `
      <div class="variable">
        <p><strong>${this.escapeHtml(feature.feature)}:</strong> ${this.escapeHtml(feature.description)}</p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.usageExamples.length > 0 ? `
  <div class="section">
    <h2>💻 使用例</h2>
    ${analysis.usageExamples.map(example => `
      <div class="variable">
        <h3>${this.escapeHtml(example.title)}</h3>
        <pre style="background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 5px; overflow-x: auto;"><code>${this.escapeHtml(example.code)}</code></pre>
        <p>${this.escapeHtml(example.description)}</p>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.warnings.length > 0 ? `
  <div class="section">
    <h2>⚠️ 注意点</h2>
    ${analysis.warnings.map(warning => `
      <div class="insight" style="border-left-color: var(--vscode-notificationsErrorIcon-foreground);">
        ${this.escapeHtml(warning)}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${analysis.insights.length > 0 ? `
  <div class="section">
    <h2>💡 理解すべきポイント</h2>
    ${analysis.insights.map(insight => `
      <div class="insight">
        ${this.escapeHtml(insight)}
      </div>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  }

  private getFunctionTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'builtin': 'PHP標準',
      'framework': 'Laravel',
      'userDefined': 'ユーザー定義',
      'library': 'ライブラリ'
    };
    return labels[type] || type;
  }
}

// Type definitions
interface CodeContext {
  filePath: string;
  language: string;
  beforeCode: string;
  afterCode: string;
  lineStart: number;
  lineEnd: number;
}

interface CodeFlowAnalysis {
  summary: string;
  purpose: string;
  parameters: ParameterInfo[];
  returnValue?: ReturnValueInfo;
  flow: FlowStep[];
  variables: VariableInfo[];
  functions: FunctionInfo[];
  dataFlow: string;
  laravelFeatures: LaravelFeature[];
  usageExamples: UsageExample[];
  warnings: string[];
  insights: string[];
}

interface ParameterInfo {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

interface ReturnValueInfo {
  type: string;
  description: string;
}

interface UsageExample {
  title: string;
  code: string;
  description: string;
}

interface FlowStep {
  step: number;
  description: string;
  code?: string;
}

interface VariableInfo {
  name: string;
  type?: string;
  description: string;
  usage?: string;
}

interface FunctionInfo {
  name: string;
  type: 'builtin' | 'framework' | 'userDefined' | 'library';
  description: string;
  purpose?: string;
}

interface LaravelFeature {
  feature: string;
  description: string;
}
