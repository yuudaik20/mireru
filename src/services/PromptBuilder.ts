/**
 * プロンプトビルダー
 */

import { CodeContext, CodeType } from '../types/common';

export class PromptBuilder {
  /**
   * 説明用プロンプトを生成
   */
  buildExplanationPrompt(code: string, codeType: CodeType, context: CodeContext): string {
    const language = 'ja'; // 将来的に設定から取得

    const basePrompt = this.getBaseExplanationPrompt(language);
    const codeTypeDescription = this.getCodeTypeDescription(codeType, language);
    const laravelContext = context.isLaravelProject ? this.getLaravelContext(language) : '';

    return `${basePrompt}

${codeTypeDescription}

【コード】
\`\`\`php
${code}
\`\`\`

【コンテキスト】
- ファイルパス: ${context.filePath}
- コードの種別: ${codeType}
${context.functionType ? `- 関数の種別: ${context.functionType}` : ''}
${context.isLaravelProject ? '- Laravelプロジェクト: はい' : ''}

【周辺コード】
\`\`\`php
${context.surroundingCode}
\`\`\`

${laravelContext}

【説明してほしい内容】
1. このコードの役割と目的
2. パラメータの詳細説明（ある場合）
3. 返り値の説明（ある場合）
4. 具体的な使用例
${context.isLaravelProject ? '5. Laravel固有の情報（該当する場合）\n6. Laravelのベストプラクティスとの比較' : ''}
7. 注意点やよくある間違い
8. 関連する概念や関数

【出力形式】
必ずJSON形式で以下の構造で返してください:
\`\`\`json
{
  "title": "説明のタイトル",
  "functionType": "builtin|framework|userDefined|library|unknown",
  "codeType": "function|method|class|variable|constant|property|unknown",
  "description": "詳細な説明（マークダウン形式）",
  "parameters": [
    {
      "name": "パラメータ名",
      "type": "型",
      "description": "説明"
    }
  ],
  "returnType": "返り値の型",
  "returnDescription": "返り値の説明",
  "example": "使用例のコード",
  "laravelInfo": {
    "version": "対応Laravelバージョン",
    "documentation": "ドキュメントURL",
    "relatedConcepts": ["関連概念1", "関連概念2"],
    "bestPractices": ["ベストプラクティス1"],
    "commonMistakes": ["よくある間違い1"]
  },
  "warnings": ["注意点1", "注意点2"],
  "relatedItems": ["関連項目1", "関連項目2"]
}
\`\`\`
`;
  }

  /**
   * 使用箇所説明用プロンプトを生成
   */
  buildUsagesPrompt(
    code: string,
    usages: Array<{ file: string; line: number; snippet: string }>
  ): string {
    const usagesList = usages
      .map((u, i) => `### 使用箇所 ${i + 1}\n- ファイル: ${u.file}\n- 行番号: ${u.line}\n\`\`\`php\n${u.snippet}\n\`\`\``)
      .join('\n\n');

    return `以下のコードがプロジェクト内でどのように使用されているか、各使用箇所について詳しく説明してください。

【対象コード】
\`\`\`php
${code}
\`\`\`

【使用箇所一覧】
${usagesList}

【説明してほしい内容】
各使用箇所について:
1. この箇所での使用目的
2. 渡されている引数の意味
3. 使用パターンの分類（基本的/応用的/エッジケース）

【出力形式】
JSON形式で以下の構造で返してください:
\`\`\`json
{
  "totalCount": ${usages.length},
  "usages": [
    {
      "file": "ファイルパス",
      "line": 行番号,
      "snippet": "コードスニペット",
      "explanation": "この箇所での使用方法の説明",
      "purpose": "使用目的",
      "argumentMeanings": ["引数1の意味", "引数2の意味"]
    }
  ],
  "patterns": {
    "basic": [],
    "advanced": [],
    "edgeCases": []
  },
  "statistics": {
    "mostUsedFiles": [
      {"file": "ファイル名", "count": 回数}
    ]
  }
}
\`\`\`
`;
  }

  /**
   * 変数追跡用プロンプトを生成
   */
  buildVariableTrackingPrompt(
    variableName: string,
    timeline: Array<{ type: string; file: string; line: number; snippet: string }>
  ): string {
    const timelineList = timeline
      .map((t, i) => `### ${i + 1}. ${t.type}\n- ファイル: ${t.file}\n- 行番号: ${t.line}\n\`\`\`php\n${t.snippet}\n\`\`\``)
      .join('\n\n');

    return `変数「${variableName}」の使用状況を分析してください。

【タイムライン】
${timelineList}

【説明してほしい内容】
1. 各ポイントでなぜこの値が代入/使用されているか
2. 値の変化の意図
3. データフローの全体像

【出力形式】
JSON形式で以下の構造で返してください:
\`\`\`json
{
  "timeline": [
    {
      "type": "definition|assignment|reference|parameter|return",
      "file": "ファイル",
      "line": 行番号,
      "snippet": "コード",
      "explanation": "説明",
      "value": "値（分かる場合）"
    }
  ],
  "dataFlow": {
    "nodes": [
      {"id": "node1", "label": "ラベル", "type": "種別"}
    ],
    "edges": [
      {"from": "node1", "to": "node2", "label": "ラベル"}
    ]
  }
}
\`\`\`
`;
  }

  /**
   * 基本説明プロンプトを取得
   */
  private getBaseExplanationPrompt(language: string): string {
    if (language === 'ja') {
      return 'あなたはPHP/Laravelの専門家です。以下のコードについて、初心者にも分かりやすく、かつ詳細に日本語で説明してください。';
    }
    return 'You are a PHP/Laravel expert. Please explain the following code in detail in a way that is easy to understand for beginners.';
  }

  /**
   * コード種別の説明を取得
   */
  private getCodeTypeDescription(codeType: CodeType, language: string): string {
    if (language === 'ja') {
      const descriptions: Record<CodeType, string> = {
        [CodeType.Function]: 'これは関数です。',
        [CodeType.Method]: 'これはクラスのメソッドです。',
        [CodeType.Class]: 'これはクラス定義です。',
        [CodeType.Variable]: 'これは変数です。',
        [CodeType.Constant]: 'これは定数です。',
        [CodeType.Property]: 'これはクラスのプロパティです。',
        [CodeType.Unknown]: 'コードの種別を分析してください。'
      };
      return descriptions[codeType] || '';
    }
    return '';
  }

  /**
   * Laravelコンテキストを取得
   */
  private getLaravelContext(language: string): string {
    if (language === 'ja') {
      return `【Laravel固有の情報】
このコードがLaravel固有の要素（Eloquent、ルート、ミドルウェア、ヘルパー関数等）に関連する場合は、以下も説明してください:
- 対応Laravelバージョン
- 公式ドキュメントへのリンク
- Laravelでの推奨される使い方
- よくあるアンチパターン
- 代替手段との比較`;
    }
    return '';
  }
}
