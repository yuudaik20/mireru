/**
 * Mireru VS Code Extension
 * エントリーポイント
 */

import * as vscode from 'vscode';
import { ClaudeService } from './services/ClaudeService';
import { PhpParser } from './parser/PhpParser';
import { LaravelAnalyzer } from './laravel/LaravelAnalyzer';
import { AIConfig } from './types/claude';

let claudeService: ClaudeService;
let _phpParser: PhpParser;
let laravelAnalyzer: LaravelAnalyzer;

/**
 * 拡張機能がアクティベートされたときに呼ばれる
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Mireru extension is now active!');

  // サービスの初期化
  claudeService = new ClaudeService();
  _phpParser = new PhpParser();
  laravelAnalyzer = new LaravelAnalyzer();

  // API設定を読み込み
  initializeAPIConfig();

  // 設定変更を監視
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mireru')) {
        initializeAPIConfig();
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
  vscode.window.showInformationMessage(
    'この機能は実装中です (定義と説明を表示)'
  );
}

/**
 * 使用箇所表示コマンドを処理
 */
async function handleShowUsagesCommand() {
  vscode.window.showInformationMessage(
    'この機能は実装中です (使用箇所を表示)'
  );
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
