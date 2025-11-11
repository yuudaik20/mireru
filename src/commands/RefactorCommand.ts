/**
 * Refactor Command
 * 選択されたコードに対してリファクタリング提案を行う
 */

import * as vscode from 'vscode';
import { AIServiceManager } from '../ai/AIServiceManager';

export class RefactorCommand {
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
      vscode.window.showErrorMessage('リファクタリングしたいコードを選択してください');
      return;
    }

    // AI分析を実行
    await this.analyzeAndRefactor(editor.document, selectedText, selection);
  }

  private async analyzeAndRefactor(
    document: vscode.TextDocument,
    code: string,
    selection: vscode.Selection
  ): Promise<void> {
    // AIサービスが設定されているかチェック
    if (!this.aiService.isConfigured()) {
      vscode.window.showErrorMessage('AI APIが設定されていません。設定を確認してください。');
      return;
    }

    // ローディング表示
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'コードをリファクタリング分析中...',
        cancellable: false
      },
      async () => {
        try {
          const refactoring = await this.requestRefactoringAnalysis(code, document.languageId);

          // 結果を表示
          await this.showRefactoringResult(refactoring, code);
        } catch (error) {
          vscode.window.showErrorMessage(`リファクタリング分析エラー: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    );
  }

  private async requestRefactoringAnalysis(code: string, languageId: string): Promise<RefactoringResult> {
    const language = vscode.workspace.getConfiguration('mireru').get<string>('language', 'ja');

    const prompt = this.buildRefactoringPrompt(code, languageId, language);

    const response = await this.aiService.generate(prompt, {
      maxTokens: 4000,
      temperature: 0.3
    });

    // レスポンスをパース
    return this.parseRefactoringResponse(response);
  }

  private buildRefactoringPrompt(code: string, languageId: string, language: string): string {
    const langInstruction = language === 'ja' ? '日本語で' : 'in English';

    return `あなたはコードリファクタリングの専門家です。以下のコードを分析し、${langInstruction}改善提案を行ってください。

【分析対象コード】
\`\`\`${languageId}
${code}
\`\`\`

【リファクタリング基準】以下の9つのパターンを基準に、最も適切な改善を提案してください：

1. **変数の使いまわしをやめる**
   - 同じ変数を異なる意味で再利用しない
   - 変数名で意味を明確にする

2. **プリミティブ型をオブジェクト型に置き換える**
   - 単なる文字列や数値を意味のある型（クラス）に昇格
   - ロジックを一箇所に集約

3. **値オブジェクトに置き換える**
   - 不変（immutable）なオブジェクトとして設計
   - 新しいインスタンスを生成して返す

4. **コレクションの参照はコピーを返す**
   - 内部コレクションをそのまま返さない
   - カプセル化を守る

5. **ループで複数のことをしない**
   - 1つのループ＝1つの目的
   - 処理を分離して明確化

6. **ガード節で入れ子条件をなくす**
   - 例外的なケースで早期リターン
   - ネストを減らしてフラットに

7. **特殊ケースオブジェクトを導入する**
   - null/unknown の代わりに特殊ケースクラス
   - Nullオブジェクトパターン

8. **委譲を使ってサブクラスを置き換える**
   - 継承ではなく委譲で柔軟性を確保
   - Strategyパターンの活用

9. **委譲を使ってスーパークラスを置き換える**
   - 意味の合わない継承を避ける
   - 内部保持＋委譲で必要な操作だけ公開

【分析してほしい内容】
- どのパターンが適用できるか
- なぜそのリファクタリングが必要か
- 改善後のコードはどうなるか
- どんなメリットがあるか

【出力形式】
JSON形式で以下の構造で返してください：
\`\`\`json
{
  "hasIssues": true,
  "pattern": "適用すべきリファクタリングパターン名",
  "severity": "high|medium|low",
  "issues": [
    "問題点1",
    "問題点2"
  ],
  "originalCode": "改善前のコード（入力と同じ）",
  "improvedCode": "改善後のコード",
  "explanation": "なぜこのリファクタリングが必要かの詳細説明",
  "stepByStepExplanation": [
    "1行目: この処理の説明",
    "2-5行目: この処理の説明",
    "6行目: この処理の説明"
  ],
  "benefits": [
    "メリット1: 説明",
    "メリット2: 説明"
  ],
  "keyPoints": [
    "理解すべきポイント1",
    "理解すべきポイント2"
  ]
}
\`\`\`

【重要】
- コードに問題がない場合は、hasIssues を false にして「このコードは既に良好です」と返してください
- 改善後のコードは実際に動作する完全なコードとして提供してください
- コピペで採用できるようにしてください`;
  }

  private parseRefactoringResponse(response: string): RefactoringResult {
    try {
      // JSONブロックを抽出
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('JSON形式のレスポンスが見つかりません');
      }

      const jsonText = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonText);

      return {
        hasIssues: parsed.hasIssues ?? true,
        pattern: parsed.pattern || '一般的な改善',
        severity: parsed.severity || 'medium',
        issues: parsed.issues || [],
        originalCode: parsed.originalCode || '',
        improvedCode: parsed.improvedCode || '',
        explanation: parsed.explanation || '',
        stepByStepExplanation: parsed.stepByStepExplanation || [],
        benefits: parsed.benefits || [],
        keyPoints: parsed.keyPoints || []
      };
    } catch (error) {
      // パースエラーの場合、レスポンスをそのまま説明として返す
      return {
        hasIssues: false,
        pattern: '分析失敗',
        severity: 'low',
        issues: [],
        originalCode: '',
        improvedCode: '',
        explanation: response,
        stepByStepExplanation: [],
        benefits: [],
        keyPoints: []
      };
    }
  }

  private async showRefactoringResult(refactoring: RefactoringResult, originalCode: string): Promise<void> {
    // 現在のエディタから言語を取得
    const editor = vscode.window.activeTextEditor;
    const languageId = editor?.document.languageId || 'php';

    // Webviewパネルを作成
    const panel = vscode.window.createWebviewPanel(
      'mireruRefactor',
      'リファクタリング提案',
      vscode.ViewColumn.Two,
      {
        enableScripts: true
      }
    );

    // HTMLコンテンツを生成
    panel.webview.html = this.generateHtml(refactoring, languageId, originalCode);

    // メッセージ受信（コピーボタン用）
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'copy') {
          await vscode.env.clipboard.writeText(message.code);
          vscode.window.showInformationMessage('改善後のコードをクリップボードにコピーしました');
        }
      }
    );
  }

  private generateHtml(refactoring: RefactoringResult, languageId: string, originalCode: string): string {
    const severityColor = {
      'high': '#e74c3c',
      'medium': '#f39c12',
      'low': '#3498db'
    }[refactoring.severity] || '#95a5a6';

    const severityLabel = {
      'high': '高',
      'medium': '中',
      'low': '低'
    }[refactoring.severity] || '不明';

    if (!refactoring.hasIssues) {
      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>リファクタリング提案</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .success {
      background: var(--vscode-testing-iconPassed);
      color: white;
      padding: 20px;
      border-radius: 5px;
      text-align: center;
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div class="success">
    ✅ このコードは既に良好です！<br>
    リファクタリングの必要はありません。
  </div>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>リファクタリング提案</title>
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
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .severity-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 5px;
      color: white;
      background: ${severityColor};
      font-weight: bold;
    }
    .pattern-badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 5px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: 10px;
    }
    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .code-container {
      position: relative;
      margin: 15px 0;
    }
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-top-left-radius: 5px;
      border-top-right-radius: 5px;
    }
    .copy-button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 5px 15px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
    }
    .copy-button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    pre {
      margin: 0;
      padding: 15px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 0 0 5px 5px;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }
    code {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.5;
    }
    .issue-list {
      list-style: none;
      padding: 0;
    }
    .issue-item {
      padding: 10px;
      margin: 5px 0;
      background: var(--vscode-editor-background);
      border-left: 3px solid #e74c3c;
      border-radius: 3px;
    }
    .benefit-item {
      padding: 10px;
      margin: 5px 0;
      background: var(--vscode-editor-background);
      border-left: 3px solid #27ae60;
      border-radius: 3px;
    }
    .keypoint-item {
      padding: 10px;
      margin: 5px 0;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-notificationsInfoIcon-foreground);
      border-radius: 3px;
    }
    .comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 20px 0;
    }
    @media (max-width: 1200px) {
      .comparison {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔧 リファクタリング提案</h1>
    <div>
      <span class="severity-badge">重要度: ${severityLabel}</span>
      <span class="pattern-badge">${this.escapeHtml(refactoring.pattern)}</span>
    </div>
  </div>

  ${refactoring.issues.length > 0 ? `
  <div class="section">
    <h2>❌ 検出された問題点</h2>
    <ul class="issue-list">
      ${refactoring.issues.map(issue => `
        <li class="issue-item">${this.escapeHtml(issue)}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="section">
    <h2>📖 なぜリファクタリングが必要か</h2>
    <p>${this.escapeHtml(refactoring.explanation)}</p>
  </div>

  <div class="comparison">
    <div>
      <div class="code-container">
        <div class="code-header">
          <h3 style="margin: 0;">❌ 改善前のコード</h3>
        </div>
        <pre><code>${this.escapeHtml(originalCode)}</code></pre>
      </div>
    </div>

    <div>
      <div class="code-container">
        <div class="code-header">
          <h3 style="margin: 0;">✅ 改善後のコード</h3>
          <button class="copy-button" onclick="copyCode()">📋 コピー</button>
        </div>
        <pre><code id="improved-code">${this.escapeHtml(refactoring.improvedCode)}</code></pre>
      </div>
    </div>
  </div>

  ${refactoring.stepByStepExplanation.length > 0 ? `
  <div class="section">
    <h2>📝 改善後のコードの解説（一処理ずつ）</h2>
    <ul class="issue-list">
      ${refactoring.stepByStepExplanation.map(step => `
        <li class="keypoint-item">${this.escapeHtml(step)}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  ${refactoring.benefits.length > 0 ? `
  <div class="section">
    <h2>✨ 改善のメリット</h2>
    <ul class="issue-list">
      ${refactoring.benefits.map(benefit => `
        <li class="benefit-item">${this.escapeHtml(benefit)}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  ${refactoring.keyPoints.length > 0 ? `
  <div class="section">
    <h2>💡 理解すべきポイント</h2>
    <ul class="issue-list">
      ${refactoring.keyPoints.map(point => `
        <li class="keypoint-item">${this.escapeHtml(point)}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  <script>
    const vscode = acquireVsCodeApi();

    function copyCode() {
      const code = document.getElementById('improved-code').textContent;
      vscode.postMessage({
        command: 'copy',
        code: code
      });
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  }
}

// Type definitions
interface RefactoringResult {
  hasIssues: boolean;
  pattern: string;
  severity: 'high' | 'medium' | 'low';
  issues: string[];
  originalCode: string;
  improvedCode: string;
  explanation: string;
  stepByStepExplanation: string[]; // 改善後のコードの一処理ずつの解説
  benefits: string[];
  keyPoints: string[];
}
