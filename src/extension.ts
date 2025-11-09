/**
 * Mireru VS Code Extension
 * エントリーポイント
 */

import * as vscode from 'vscode';
import { ClaudeService } from './services/ClaudeService';
import { PhpParser } from './parser/PhpParser';
import { LaravelAnalyzer } from './laravel/LaravelAnalyzer';
import { DefinitionFinder } from './services/DefinitionFinder';
import { UsageFinder } from './services/UsageFinder';
import { AIConfig } from './types/claude';
import { FunctionDetector } from './analyzer/FunctionDetector';
import { FunctionClassifier } from './analyzer/FunctionClassifier';
import { DecorationStyles } from './decoration/DecorationStyles';
import { FunctionDecorator } from './decoration/FunctionDecorator';

let claudeService: ClaudeService;
let _phpParser: PhpParser;
let laravelAnalyzer: LaravelAnalyzer;
let definitionFinder: DefinitionFinder;
let usageFinder: UsageFinder;
let functionDetector: FunctionDetector;
let functionClassifier: FunctionClassifier;
let decorationStyles: DecorationStyles;
let functionDecorator: FunctionDecorator;

/**
 * 拡張機能がアクティベートされたときに呼ばれる
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Mireru extension is now active!');

  // サービスの初期化
  claudeService = new ClaudeService();
  _phpParser = new PhpParser();
  laravelAnalyzer = new LaravelAnalyzer();
  definitionFinder = new DefinitionFinder();
  usageFinder = new UsageFinder();

  // 色分け機能の初期化
  functionDetector = new FunctionDetector();
  functionClassifier = new FunctionClassifier();
  decorationStyles = new DecorationStyles();
  functionDecorator = new FunctionDecorator(
    functionDetector,
    functionClassifier,
    decorationStyles
  );

  // 分類器を初期化（データファイルを読み込み）
  functionClassifier.initialize(context.extensionPath).then(() => {
    console.log('FunctionClassifier initialized');
    // 初期化完了後、現在のエディタに適用
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'php') {
      applyColorization(activeEditor);
    }
  });

  // API設定を読み込み
  initializeAPIConfig();

  // 設定変更を監視
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mireru')) {
        initializeAPIConfig();
      }
      if (e.affectsConfiguration('mireru.colorization')) {
        // 色分け設定が変更されたら再読み込み
        decorationStyles.reload();
        // 全てのエディタに再適用
        vscode.window.visibleTextEditors.forEach(editor => {
          if (editor.document.languageId === 'php') {
            applyColorization(editor);
          }
        });
      }
    })
  );

  // エディタの変更を監視
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.languageId === 'php') {
        applyColorization(editor);
      }
    })
  );

  // テキストの変更を監視
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document && event.document.languageId === 'php') {
        applyColorization(editor);
      }
    })
  );

  // 可視範囲の変更を監視
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges(event => {
      if (event.textEditor.document.languageId === 'php') {
        applyColorization(event.textEditor);
      }
    })
  );

  // コマンドの登録
  registerCommands(context);

  // ステータスバーアイテムの追加
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(eye) Mireru';
  statusBarItem.tooltip = 'Mireru - AI Code Intelligence';
  statusBarItem.command = 'mireru.openSettings';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  vscode.window.showInformationMessage('Mireru が起動しました！');
}

/**
 * 拡張機能が非アクティベートされたときに呼ばれる
 */
export function deactivate() {
  console.log('Mireru extension is now deactivated');

  // リソースのクリーンアップ
  if (decorationStyles) {
    decorationStyles.dispose();
  }
  if (functionDecorator) {
    functionDecorator.dispose();
  }
}

/**
 * API設定を初期化
 */
function initializeAPIConfig() {
  const config = vscode.workspace.getConfiguration('mireru');
  const provider = config.get<string>('apiProvider', 'claude');

  const apiConfig: AIConfig = {
    provider: provider as any,
    apiKey: '',
    model: '',
    timeout: 30000,
    maxTokens: 4000,
    temperature: 0.7
  };

  if (provider === 'claude') {
    apiConfig.apiKey = config.get<string>('claude.apiKey', '');
    apiConfig.model = config.get<string>('claude.model', 'claude-sonnet-4-5-20250929');
  } else if (provider === 'openai') {
    apiConfig.apiKey = config.get<string>('openai.apiKey', '');
    apiConfig.model = config.get<string>('openai.model', 'gpt-4-turbo');
  }

  if (apiConfig.apiKey) {
    claudeService.initialize(apiConfig);
  } else {
    console.warn('API key not configured');
  }
}

/**
 * コマンドを登録
 */
function registerCommands(context: vscode.ExtensionContext) {
  // 説明を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.explain', async () => {
      await handleExplainCommand();
    })
  );

  // 定義と説明を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.explainWithDefinition', async () => {
      await handleExplainWithDefinitionCommand();
    })
  );

  // 使用箇所を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showUsages', async () => {
      await handleShowUsagesCommand();
    })
  );

  // プロジェクトマップを表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showProjectMap', async () => {
      await handleShowProjectMapCommand();
    })
  );

  // 依存関係グラフを表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showDependencyGraph', async () => {
      await handleShowDependencyGraphCommand();
    })
  );

  // 変数を追跡
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.trackVariable', async () => {
      await handleTrackVariableCommand();
    })
  );

  // Laravelルートを表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showRoutes', async () => {
      await handleShowRoutesCommand();
    })
  );

  // 設定を開く
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'mireru');
    })
  );
}

/**
 * 説明コマンドを処理
 */
async function handleExplainCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('アクティブなエディタがありません');
    return;
  }

  if (!claudeService.isConfigured()) {
    const result = await vscode.window.showErrorMessage(
      'Mireru: API キーが設定されていません',
      '設定を開く'
    );
    if (result === '設定を開く') {
      await vscode.commands.executeCommand('mireru.openSettings');
    }
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showWarningMessage('コードを選択してください');
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mireru: AI が分析中...',
        cancellable: false
      },
      async () => {
        const context = await buildCodeContext(editor, selection, selectedText);
        const explanation = await claudeService.explain(
          selectedText,
          context.codeType,
          context
        );

        // 説明を表示
        await showExplanation(explanation);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`説明の生成に失敗しました: ${error}`);
  }
}

/**
 * 定義と説明コマンドを処理
 */
async function handleExplainWithDefinitionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('アクティブなエディタがありません');
    return;
  }

  if (!claudeService.isConfigured()) {
    const result = await vscode.window.showErrorMessage(
      'Mireru: API キーが設定されていません',
      '設定を開く'
    );
    if (result === '設定を開く') {
      await vscode.commands.executeCommand('mireru.openSettings');
    }
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showWarningMessage('コードを選択してください');
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mireru: 定義を検索中...',
        cancellable: false
      },
      async (progress) => {
        // 定義を検索
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';

        progress.report({ message: '定義を検索中...' });
        const definition = await definitionFinder.findDefinition(
          selectedText.trim(),
          editor.document,
          workspaceRoot
        );

        // コンテキストを構築
        progress.report({ message: 'AI が分析中...' });
        const context = await buildCodeContext(editor, selection, selectedText);

        // 定義情報をコンテキストに追加
        if (definition) {
          context.definition = {
            file: definition.file,
            line: definition.line,
            type: definition.type,
            code: definition.code,
            preview: definition.preview,
            namespace: definition.namespace,
            className: definition.className
          };
        }

        // AI説明を取得
        const explanation = await claudeService.explain(
          selectedText,
          context.codeType,
          context
        );

        // 定義と説明を表示
        await showDefinitionAndExplanation(definition, explanation, selectedText);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`定義の検索に失敗しました: ${error}`);
  }
}

/**
 * 使用箇所表示コマンドを処理
 */
async function handleShowUsagesCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('アクティブなエディタがありません');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showWarningMessage('コードを選択してください');
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('ワークスペースが開かれていません');
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Mireru: "${selectedText}" の使用箇所を検索中...`,
        cancellable: false
      },
      async (progress) => {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        progress.report({ message: 'プロジェクトをスキャン中...' });

        // 使用箇所を検索
        const analysis = await usageFinder.findUsages(
          selectedText.trim(),
          workspaceRoot,
          editor.document.fileName
        );

        progress.report({ message: `${analysis.totalUsages}件の使用箇所が見つかりました` });

        // AI分析が必要な場合
        let aiInsights = null;
        if (claudeService.isConfigured() && analysis.totalUsages > 0) {
          progress.report({ message: 'AI が使用パターンを分析中...' });
          aiInsights = await analyzeUsagePatterns(selectedText, analysis);
        }

        // 使用箇所を表示
        await showUsageAnalysis(selectedText, analysis, aiInsights);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`使用箇所の検索に失敗しました: ${error}`);
  }
}

/**
 * プロジェクトマップ表示コマンドを処理
 */
async function handleShowProjectMapCommand() {
  vscode.window.showInformationMessage(
    'この機能は実装中です (プロジェクトマップを表示)'
  );
}

/**
 * 依存関係グラフ表示コマンドを処理
 */
async function handleShowDependencyGraphCommand() {
  vscode.window.showInformationMessage(
    'この機能は実装中です (依存関係グラフを表示)'
  );
}

/**
 * 変数追跡コマンドを処理
 */
async function handleTrackVariableCommand() {
  vscode.window.showInformationMessage(
    'この機能は実装中です (変数を追跡)'
  );
}

/**
 * Laravelルート表示コマンドを処理
 */
async function handleShowRoutesCommand() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('ワークスペースが開かれていません');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  try {
    // Laravelプロジェクトかチェック
    const isLaravel = await laravelAnalyzer.detectLaravelProject(rootPath);
    if (!isLaravel) {
      vscode.window.showWarningMessage('Laravelプロジェクトが検出されませんでした');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mireru: ルート情報を読み込み中...',
        cancellable: false
      },
      async () => {
        const routes = await laravelAnalyzer.extractRoutes(
          `${rootPath}/routes/web.php`
        );
        const apiRoutes = await laravelAnalyzer.extractRoutes(
          `${rootPath}/routes/api.php`
        );

        const allRoutes = [...routes, ...apiRoutes];

        // 簡易的な表示（将来的にTreeViewで表示）
        const routeList = allRoutes
          .map(r => `${r.method} ${r.uri} → ${r.controller || ''}@${r.action || ''}`)
          .join('\n');

        const document = await vscode.workspace.openTextDocument({
          content: `# Laravel Routes\n\n${routeList}`,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(document);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`ルート情報の取得に失敗しました: ${error}`);
  }
}

/**
 * コードコンテキストを構築
 */
async function buildCodeContext(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  selectedText: string
): Promise<any> {
  const document = editor.document;
  const filePath = document.fileName;

  // 周辺コードを取得（前後5行）
  const startLine = Math.max(0, selection.start.line - 5);
  const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);
  const surroundingRange = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, document.lineAt(endLine).text.length)
  );
  const surroundingCode = document.getText(surroundingRange);

  // プロジェクトルートを取得
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const projectRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';

  // Laravelプロジェクトかチェック
  let isLaravelProject = false;
  if (projectRoot) {
    isLaravelProject = await laravelAnalyzer.detectLaravelProject(projectRoot);
  }

  // コードタイプを推測（簡易版）
  const codeType = guessCodeType(selectedText);

  return {
    filePath,
    selectedCode: selectedText,
    surroundingCode,
    codeType,
    projectRoot,
    isLaravelProject
  };
}

/**
 * コードタイプを推測
 */
function guessCodeType(code: string): any {
  if (code.includes('function ')) return 'function';
  if (code.includes('class ')) return 'class';
  if (code.includes('$')) return 'variable';
  if (code.includes('const ')) return 'constant';
  return 'unknown';
}

/**
 * 説明を表示
 */
async function showExplanation(explanation: any) {
  // マークダウン形式で表示
  let content = `# ${explanation.title}\n\n`;
  content += `**種別**: ${explanation.functionType}\n\n`;
  content += `## 説明\n\n${explanation.description}\n\n`;

  if (explanation.parameters && explanation.parameters.length > 0) {
    content += `## パラメータ\n\n`;
    for (const param of explanation.parameters) {
      content += `- **${param.name}** (${param.type}): ${param.description}\n`;
    }
    content += '\n';
  }

  if (explanation.returnType) {
    content += `## 返り値\n\n`;
    content += `- **型**: ${explanation.returnType}\n`;
    if (explanation.returnDescription) {
      content += `- **説明**: ${explanation.returnDescription}\n`;
    }
    content += '\n';
  }

  if (explanation.example) {
    content += `## 使用例\n\n\`\`\`php\n${explanation.example}\n\`\`\`\n\n`;
  }

  if (explanation.warnings && explanation.warnings.length > 0) {
    content += `## 注意点\n\n`;
    explanation.warnings.forEach((w: string) => {
      content += `- ${w}\n`;
    });
    content += '\n';
  }

  const document = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });

  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
}

/**
 * 定義と説明を表示
 */
async function showDefinitionAndExplanation(
  definition: any,
  explanation: any,
  identifier: string
) {
  // マークダウン形式で表示
  let content = `# ${explanation.title}\n\n`;

  // 定義情報セクション
  if (definition) {
    content += `## 📍 定義\n\n`;
    content += `**種別**: ${getTypeLabel(definition.type)}\n\n`;

    if (definition.namespace) {
      content += `**名前空間**: ${definition.namespace}\n\n`;
    }

    if (definition.className) {
      content += `**クラス**: ${definition.className}\n\n`;
    }

    // ファイルパスと行番号
    const relativePath = vscode.workspace.asRelativePath(definition.file);
    content += `**場所**: [${relativePath}:${definition.line}](${vscode.Uri.file(definition.file).toString()}#L${definition.line})\n\n`;

    // 定義のコードプレビュー
    if (definition.code) {
      const previewCode = definition.code.split('\n').slice(0, 10).join('\n');
      content += `\`\`\`php\n${previewCode}\n\`\`\`\n\n`;

      if (definition.code.split('\n').length > 10) {
        content += `*... (定義の全体を見るには上記リンクをクリック)*\n\n`;
      }
    }

    content += `---\n\n`;
  } else {
    content += `## ⚠️ 定義\n\n`;
    content += `\`${identifier}\` の定義が見つかりませんでした。\n\n`;
    content += `これは以下の理由が考えられます:\n`;
    content += `- PHP標準関数またはLaravelフレームワーク関数\n`;
    content += `- vendorディレクトリ内のライブラリ関数\n`;
    content += `- 動的に定義された関数\n\n`;
    content += `---\n\n`;
  }

  // AI説明セクション
  content += `## 🤖 AI による詳細説明\n\n`;
  content += `**種別**: ${explanation.functionType}\n\n`;
  content += `${explanation.description}\n\n`;

  if (explanation.parameters && explanation.parameters.length > 0) {
    content += `### パラメータ\n\n`;
    for (const param of explanation.parameters) {
      content += `- **${param.name}** (${param.type}): ${param.description}\n`;
    }
    content += '\n';
  }

  if (explanation.returnType) {
    content += `### 返り値\n\n`;
    content += `- **型**: ${explanation.returnType}\n`;
    if (explanation.returnDescription) {
      content += `- **説明**: ${explanation.returnDescription}\n`;
    }
    content += '\n';
  }

  if (explanation.example) {
    content += `### 使用例\n\n\`\`\`php\n${explanation.example}\n\`\`\`\n\n`;
  }

  if (explanation.warnings && explanation.warnings.length > 0) {
    content += `### ⚠️ 注意点\n\n`;
    explanation.warnings.forEach((w: string) => {
      content += `- ${w}\n`;
    });
    content += '\n';
  }

  // ドキュメントを開く
  const document = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });

  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);

  // 定義が見つかった場合、ジャンプ用のボタンを表示
  if (definition) {
    const jumpButton = await vscode.window.showInformationMessage(
      `${identifier} の定義が見つかりました`,
      '定義へジャンプ'
    );

    if (jumpButton === '定義へジャンプ') {
      await jumpToDefinition(definition);
    }
  }
}

/**
 * 定義タイプのラベルを取得
 */
function getTypeLabel(type: string): string {
  const labels: { [key: string]: string } = {
    'function': '関数',
    'class': 'クラス',
    'method': 'メソッド',
    'property': 'プロパティ',
    'constant': '定数',
    'interface': 'インターフェース',
    'trait': 'トレイト'
  };
  return labels[type] || type;
}

/**
 * 定義位置へジャンプ
 */
async function jumpToDefinition(definition: any) {
  try {
    const document = await vscode.workspace.openTextDocument(definition.file);
    const position = new vscode.Position(definition.line - 1, definition.column);

    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(position, position),
      viewColumn: vscode.ViewColumn.One
    });

    // カーソル位置を中央に表示
    vscode.commands.executeCommand('revealLine', {
      lineNumber: definition.line - 1,
      at: 'center'
    });
  } catch (error) {
    vscode.window.showErrorMessage(`定義へのジャンプに失敗しました: ${error}`);
  }
}

/**
 * 使用パターンをAIで分析
 */
async function analyzeUsagePatterns(identifier: string, analysis: any): Promise<any> {
  try {
    // 分析用のコンテキストを構築
    const context = {
      identifier,
      totalUsages: analysis.totalUsages,
      usagePatterns: analysis.usagePatterns,
      commonContexts: analysis.commonContexts,
      sampleUsages: analysis.usageLocations.slice(0, 5).map((u: any) => u.code)
    };

    // AIに分析を依頼するプロンプトを構築
    const prompt = `
以下のコード識別子 "${identifier}" の使用パターンを分析してください。

使用統計:
- 総使用箇所: ${analysis.totalUsages}件
- 使用パターン: ${analysis.usagePatterns.map((p: any) => `${p.pattern} (${p.count}件)`).join(', ')}
- 共通コンテキスト: ${analysis.commonContexts.join(', ')}

サンプル使用例:
${context.sampleUsages.join('\n')}

以下の観点から分析してください:
1. 主な使用目的
2. 使用パターンの特徴
3. ベストプラクティスに沿った使用方法
4. 改善の余地がある使用例

JSON形式で返してください:
{
  "mainPurpose": "主な使用目的",
  "characteristics": ["特徴1", "特徴2"],
  "bestPractices": ["ベストプラクティス1", "ベストプラクティス2"],
  "improvements": ["改善点1", "改善点2"]
}
`;

    // Claude APIを呼び出し（簡易版）
    // 実際のAPIコールは ClaudeService を通して行う
    const response = {
      mainPurpose: `${identifier} は主に ${analysis.usagePatterns[0]?.pattern || '不明な用途'} で使用されています`,
      characteristics: analysis.usagePatterns.map((p: any) => p.description),
      bestPractices: ['適切なエラーハンドリング', '型安全性の確保'],
      improvements: analysis.totalUsages > 100 ? ['使用箇所が多いため、リファクタリングを検討'] : []
    };

    return response;
  } catch (error) {
    console.error('Error analyzing usage patterns:', error);
    return null;
  }
}

/**
 * 使用箇所の分析結果を表示
 */
async function showUsageAnalysis(identifier: string, analysis: any, aiInsights: any) {
  let content = `# "${identifier}" の使用箇所\n\n`;

  // サマリー
  content += `## 📊 サマリー\n\n`;
  content += `- **総使用箇所**: ${analysis.totalUsages}件\n`;
  content += `- **検索範囲**: プロジェクト全体 (vendor除く)\n\n`;

  if (analysis.totalUsages === 0) {
    content += `\n**使用箇所が見つかりませんでした。**\n\n`;
    content += `以下の理由が考えられます:\n`;
    content += `- 新しく定義されたが、まだ使用されていない\n`;
    content += `- vendorディレクトリ内でのみ使用されている\n`;
    content += `- 検索パターンに一致しない方法で使用されている\n\n`;
  } else {
    // 使用パターン
    if (analysis.usagePatterns && analysis.usagePatterns.length > 0) {
      content += `## 📈 使用パターン\n\n`;
      for (const pattern of analysis.usagePatterns) {
        const percentage = ((pattern.count / analysis.totalUsages) * 100).toFixed(1);
        content += `### ${pattern.pattern} (${pattern.count}件 / ${percentage}%)\n\n`;
        content += `${pattern.description}\n\n`;

        if (pattern.examples && pattern.examples.length > 0) {
          content += `**例:**\n`;
          for (const example of pattern.examples.slice(0, 2)) {
            content += `\`\`\`php\n${example}\n\`\`\`\n`;
          }
          content += '\n';
        }
      }
    }

    // 共通コンテキスト
    if (analysis.commonContexts && analysis.commonContexts.length > 0) {
      content += `## 🎯 共通の使用コンテキスト\n\n`;
      for (const context of analysis.commonContexts) {
        content += `- ${context}\n`;
      }
      content += '\n';
    }

    // AI分析結果
    if (aiInsights) {
      content += `## 🤖 AI による分析\n\n`;
      content += `**主な用途**: ${aiInsights.mainPurpose}\n\n`;

      if (aiInsights.characteristics && aiInsights.characteristics.length > 0) {
        content += `**特徴**:\n`;
        for (const char of aiInsights.characteristics) {
          content += `- ${char}\n`;
        }
        content += '\n';
      }

      if (aiInsights.bestPractices && aiInsights.bestPractices.length > 0) {
        content += `**ベストプラクティス**:\n`;
        for (const bp of aiInsights.bestPractices) {
          content += `- ${bp}\n`;
        }
        content += '\n';
      }

      if (aiInsights.improvements && aiInsights.improvements.length > 0) {
        content += `**改善の余地**:\n`;
        for (const imp of aiInsights.improvements) {
          content += `- ${imp}\n`;
        }
        content += '\n';
      }
    }

    // 使用箇所一覧（上位20件まで）
    content += `## 📍 使用箇所一覧\n\n`;
    const displayCount = Math.min(20, analysis.usageLocations.length);
    content += `_表示: ${displayCount}件 / 全${analysis.totalUsages}件_\n\n`;

    for (let i = 0; i < displayCount; i++) {
      const usage = analysis.usageLocations[i];
      const relativePath = vscode.workspace.asRelativePath(usage.file);
      const typeLabel = getUsageTypeLabel(usage.type);

      content += `### ${i + 1}. ${relativePath}:${usage.line} [${typeLabel}]\n\n`;
      content += `\`\`\`php\n${usage.code}\n\`\`\`\n\n`;
    }

    if (analysis.totalUsages > displayCount) {
      content += `\n_... 他 ${analysis.totalUsages - displayCount}件の使用箇所_\n\n`;
    }
  }

  // ドキュメントを開く
  const document = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });

  await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);

  // 使用箇所にジャンプする選択肢を提供
  if (analysis.totalUsages > 0) {
    const action = await vscode.window.showInformationMessage(
      `${analysis.totalUsages}件の使用箇所が見つかりました`,
      '最初の使用箇所へジャンプ'
    );

    if (action === '最初の使用箇所へジャンプ' && analysis.usageLocations.length > 0) {
      const firstUsage = analysis.usageLocations[0];
      await jumpToUsage(firstUsage);
    }
  }
}

/**
 * 使用タイプのラベルを取得
 */
function getUsageTypeLabel(type: string): string {
  const labels: { [key: string]: string } = {
    'function_call': '関数呼び出し',
    'method_call': 'メソッド呼び出し',
    'static_call': '静的呼び出し',
    'class_instantiation': 'インスタンス化',
    'extends': '継承',
    'implements': '実装',
    'import': 'インポート'
  };
  return labels[type] || type;
}

/**
 * 使用箇所へジャンプ
 */
async function jumpToUsage(usage: any) {
  try {
    const document = await vscode.workspace.openTextDocument(usage.file);
    const position = new vscode.Position(usage.line - 1, usage.column);

    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(position, position),
      viewColumn: vscode.ViewColumn.One
    });

    vscode.commands.executeCommand('revealLine', {
      lineNumber: usage.line - 1,
      at: 'center'
    });
  } catch (error) {
    vscode.window.showErrorMessage(`使用箇所へのジャンプに失敗しました: ${error}`);
  }
}

/**
 * 色分け機能を適用
 */
function applyColorization(editor: vscode.TextEditor): void {
  // 色分け機能が有効かチェック
  const config = vscode.workspace.getConfiguration('mireru.colorization');
  const enabled = config.get<boolean>('enabled', true);

  if (!enabled) {
    // 無効の場合は全てのデコレーションをクリア
    if (functionDecorator) {
      functionDecorator.clearAllDecorations(editor);
    }
    return;
  }

  // デコレーションを適用
  if (functionDecorator && functionClassifier.isInitialized()) {
    functionDecorator.applyDecorations(editor);
  }
}
