/**
 * Mireru VS Code Extension
 * エントリーポイント
 */

import * as vscode from 'vscode';
import { AIServiceManager } from './ai/AIServiceManager';
import { PhpParser } from './parser/PhpParser';
import { LaravelAnalyzer } from './laravel/LaravelAnalyzer';
import { DefinitionFinder } from './services/DefinitionFinder';
import { UsageFinder } from './services/UsageFinder';
import { FunctionDetector } from './analyzer/FunctionDetector';
import { FunctionClassifier } from './analyzer/FunctionClassifier';
import { DecorationStyles } from './decoration/DecorationStyles';
import { FunctionDecorator } from './decoration/FunctionDecorator';
import { BladeHoverProvider } from './blade/BladeHoverProvider';
import { AnalyzeCodeFlowCommand } from './commands/AnalyzeCodeFlowCommand';
import { RefactorCommand } from './commands/RefactorCommand';
import { RouteTreeView } from './views/RouteTreeView';
import { RouteDetailsPanel } from './views/RouteDetailsPanel';
import { FileStructureTreeView } from './views/FileStructureTreeView';
import { FileDetailsPanel } from './views/FileDetailsPanel';
import { ProjectScanner } from './services/ProjectScanner';
import { DependencyGraphPanel } from './views/DependencyGraphPanel';
import { DependencyAnalyzer } from './services/DependencyAnalyzer';

let aiService: AIServiceManager;
let _phpParser: PhpParser;
let laravelAnalyzer: LaravelAnalyzer;
let definitionFinder: DefinitionFinder;
let usageFinder: UsageFinder;
let functionDetector: FunctionDetector;
let functionClassifier: FunctionClassifier;
let decorationStyles: DecorationStyles;
let functionDecorator: FunctionDecorator;
let routeTreeView: RouteTreeView;
let fileStructureTreeView: FileStructureTreeView;
let projectScanner: ProjectScanner;
let dependencyAnalyzer: DependencyAnalyzer;
let extensionContext: vscode.ExtensionContext;

/**
 * 拡張機能がアクティベートされたときに呼ばれる
 */
export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  console.log('Mireru extension is now active!');

  // サービスの初期化
  aiService = new AIServiceManager();
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

  // Laravel Route TreeViewの初期化
  routeTreeView = new RouteTreeView(context);
  routeTreeView.createTreeView();

  // File Structure TreeViewの初期化
  fileStructureTreeView = new FileStructureTreeView(context);
  fileStructureTreeView.createTreeView();

  // ProjectScannerの初期化
  projectScanner = new ProjectScanner();

  // DependencyAnalyzerの初期化
  dependencyAnalyzer = new DependencyAnalyzer();

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

  // BladeのHoverProviderを登録（PHP, Blade, HTML, JavaScriptに対応）
  const bladeHoverProvider = new BladeHoverProvider(aiService);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['blade', 'php', 'html', 'javascript', 'typescript'],
      bladeHoverProvider
    )
  );

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
  // AIServiceManagerが自動的に設定を読み込むため、再読み込みのみ実行
  aiService.reloadConfiguration();
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

  // ルート詳細を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showRouteDetails', async (route) => {
      if (route) {
        RouteDetailsPanel.show(route, context);
      }
    })
  );

  // ファイル詳細を表示
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.showFileDetails', async (file) => {
      if (file) {
        FileDetailsPanel.show(file, context);
      }
    })
  );

  // コードフロー分析
  const analyzeCodeFlowCommand = new AnalyzeCodeFlowCommand(aiService);
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.analyzeCodeFlow', async () => {
      await analyzeCodeFlowCommand.execute();
    })
  );

  // リファクタリング提案
  const refactorCommand = new RefactorCommand(aiService);
  context.subscriptions.push(
    vscode.commands.registerCommand('mireru.refactor', async () => {
      await refactorCommand.execute();
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

  if (!aiService.isConfigured()) {
    const result = await vscode.window.showErrorMessage(
      'Mireru: API キーが設定されていません',
      '設定を開く'
    );
    if (result === '設定を開く') {
      await vscode.commands.executeCommand('mireru.openSettings');
    }
    return;
  }

  let selection = editor.selection;
  let selectedText = editor.document.getText(selection);

  // 選択がない場合は、カーソル位置の変数/関数を自動検出
  if (!selectedText) {
    const identifierInfo = getIdentifierAtCursor(editor.document, editor.selection.active);
    if (!identifierInfo) {
      vscode.window.showWarningMessage('カーソル位置に変数または関数が見つかりません。コードを選択してください。');
      return;
    }
    selectedText = identifierInfo.identifier;
    selection = new vscode.Selection(identifierInfo.range.start, identifierInfo.range.end);
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
        const config = vscode.workspace.getConfiguration('mireru');
        const language = config.get<string>('language', 'ja') as 'ja' | 'en';

        const explanation = await aiService.explainCode({
          code: selectedText,
          codeType: context.codeType,
          context,
          language
        });

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

  if (!aiService.isConfigured()) {
    const result = await vscode.window.showErrorMessage(
      'Mireru: API キーが設定されていません',
      '設定を開く'
    );
    if (result === '設定を開く') {
      await vscode.commands.executeCommand('mireru.openSettings');
    }
    return;
  }

  let selection = editor.selection;
  let selectedText = editor.document.getText(selection);

  // 選択がない場合は、カーソル位置の変数/関数を自動検出
  if (!selectedText) {
    const identifierInfo = getIdentifierAtCursor(editor.document, editor.selection.active);
    if (!identifierInfo) {
      vscode.window.showWarningMessage('カーソル位置に変数または関数が見つかりません。コードを選択してください。');
      return;
    }
    selectedText = identifierInfo.identifier;
    selection = new vscode.Selection(identifierInfo.range.start, identifierInfo.range.end);
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
        const config = vscode.workspace.getConfiguration('mireru');
        const language = config.get<string>('language', 'ja') as 'ja' | 'en';

        const explanation = await aiService.explainCode({
          code: selectedText,
          codeType: context.codeType,
          context,
          language
        });

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

  let selection = editor.selection;
  let selectedText = editor.document.getText(selection);

  // 選択がない場合は、カーソル位置の変数/関数を自動検出
  if (!selectedText) {
    const identifierInfo = getIdentifierAtCursor(editor.document, editor.selection.active);
    if (!identifierInfo) {
      vscode.window.showWarningMessage('カーソル位置に変数または関数が見つかりません。コードを選択してください。');
      return;
    }
    selectedText = identifierInfo.identifier;
    selection = new vscode.Selection(identifierInfo.range.start, identifierInfo.range.end);
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
        if (aiService.isConfigured() && analysis.totalUsages > 0) {
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
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('ワークスペースが開かれていません');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mireru: プロジェクト構造をスキャン中...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 10, message: 'ディレクトリを走査中...' });

        // プロジェクトをスキャン
        const structure = await projectScanner.scanProject(rootPath);

        progress.report({ increment: 80, message: 'ツリービューを更新中...' });

        // TreeViewを更新
        fileStructureTreeView.updateStructure(structure);

        progress.report({ increment: 10, message: '完了！' });

        vscode.window.showInformationMessage(
          `プロジェクト構造をスキャンしました: ${structure.totalFiles}ファイル, ${structure.totalLines.toLocaleString()}行`
        );
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`プロジェクト構造のスキャンに失敗しました: ${error}`);
    console.error('Project scan error:', error);
  }
}

/**
 * 依存関係グラフ表示コマンドを処理
 */
async function handleShowDependencyGraphCommand() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('ワークスペースが開かれていません');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Mireru: 依存関係を分析中...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 10, message: 'ファイルを収集中...' });

        // 依存関係を分析
        const result = await dependencyAnalyzer.analyzeProject(rootPath, {
          detectCircular: true
        });

        progress.report({ increment: 80, message: 'グラフを構築中...' });

        // グラフパネルを表示
        DependencyGraphPanel.show(result, extensionContext);

        progress.report({ increment: 10, message: '完了！' });

        const circularInfo = result.circularDependencies.length > 0
          ? ` (${result.circularDependencies.length}個の循環依存を検出)`
          : '';

        vscode.window.showInformationMessage(
          `依存関係を分析しました: ${result.graph.statistics.totalNodes}ノード, ${result.graph.statistics.totalEdges}依存関係${circularInfo}`
        );
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`依存関係の分析に失敗しました: ${error}`);
    console.error('Dependency analysis error:', error);
  }
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

        // RouteTreeViewを更新
        routeTreeView.updateRoutes(allRoutes);

        // TreeViewを表示
        vscode.window.showInformationMessage(
          `${allRoutes.length}個のルートが見つかりました。サイドバーの「Laravel Routes」ビューで確認できます。`
        );
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`ルート情報の取得に失敗しました: ${error}`);
  }
}

/**
 * カーソル位置の変数・関数を自動検出
 */
function getIdentifierAtCursor(
  document: vscode.TextDocument,
  position: vscode.Position
): { identifier: string; range: vscode.Range } | null {
  const languageId = document.languageId;
  const line = document.lineAt(position.line).text;
  const charPos = position.character;

  // 言語ごとの変数・関数検出パターン
  let patterns: RegExp[] = [];

  if (languageId === 'javascript' || languageId === 'typescript') {
    // JavaScript/TypeScript: 変数、プロパティアクセス、関数呼び出し
    patterns = [
      /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/g,
      /\b(?:const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
    ];
  } else {
    // PHP/Blade/HTML: $変数、@ディレクティブ、関数呼び出し
    patterns = [
      /\$[a-zA-Z_][a-zA-Z0-9_]*(?:->[a-zA-Z_][a-zA-Z0-9_]*|\[[^\]]+\])*/g,
      /@[a-zA-Z_][a-zA-Z0-9_]*/g,
      /[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g
    ];
  }

  // 各パターンを試す
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(line)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      // カーソルが一致範囲内にあるかチェック
      if (charPos >= matchStart && charPos <= matchEnd) {
        let identifier = match[1] || match[0]; // グループがあればそれを使用

        // クリーンアップ: 末尾の ( や : を削除
        identifier = identifier.replace(/[(:]+$/, '').trim();

        // $や@を除去
        const cleanIdentifier = identifier.replace(/^\$|^@/, '');

        if (cleanIdentifier) {
          const range = new vscode.Range(
            position.line,
            matchStart,
            position.line,
            matchEnd
          );

          return { identifier: cleanIdentifier, range };
        }
      }
    }
  }

  // 一致しない場合は、カーソル位置の単語を取得
  const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_$][a-zA-Z0-9_$]*/);
  if (wordRange) {
    const word = document.getText(wordRange);
    if (word) {
      return { identifier: word, range: wordRange };
    }
  }

  return null;
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
 * 説明を表示（Webview版）
 */
async function showExplanation(explanation: any) {
  const panel = vscode.window.createWebviewPanel(
    'mireruExplanation',
    '説明',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  const escapeHtml = (text: string): string => {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  };

  panel.webview.html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(explanation.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1, h2 { color: var(--vscode-editor-foreground); }
    h1 { font-size: 24px; border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px; }
    h2 { font-size: 20px; margin-top: 30px; color: var(--vscode-textLink-foreground); }
    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .parameter, .warning {
      margin: 10px 0;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 3px;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>📖 ${escapeHtml(explanation.title)}</h1>

  <div class="section">
    <p><strong>種別</strong>: ${escapeHtml(explanation.functionType || '')}</p>
  </div>

  <div class="section">
    <h2>説明</h2>
    <p>${escapeHtml(explanation.description || '')}</p>
  </div>

  ${explanation.parameters && explanation.parameters.length > 0 ? `
  <div class="section">
    <h2>📋 パラメータ</h2>
    ${explanation.parameters.map((param: any) => `
      <div class="parameter">
        <strong>${escapeHtml(param.name)}</strong> (<code>${escapeHtml(param.type)}</code>): ${escapeHtml(param.description)}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${explanation.returnType ? `
  <div class="section">
    <h2>↩️ 返り値</h2>
    <p><strong>型</strong>: <code>${escapeHtml(explanation.returnType)}</code></p>
    ${explanation.returnDescription ? `<p>${escapeHtml(explanation.returnDescription)}</p>` : ''}
  </div>
  ` : ''}

  ${explanation.example ? `
  <div class="section">
    <h2>💻 使用例</h2>
    <pre><code>${escapeHtml(explanation.example)}</code></pre>
  </div>
  ` : ''}

  ${explanation.warnings && explanation.warnings.length > 0 ? `
  <div class="section">
    <h2>⚠️ 注意点</h2>
    ${explanation.warnings.map((w: string) => `
      <div class="warning">
        ${escapeHtml(w)}
      </div>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;
}

/**
 * 定義と説明を表示（Webview版）
 */
async function showDefinitionAndExplanation(
  definition: any,
  explanation: any,
  identifier: string
) {
  const panel = vscode.window.createWebviewPanel(
    'mireruDefinitionExplanation',
    '定義と説明',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  const escapeHtml = (text: string): string => {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  };

  const relativePath = definition ? vscode.workspace.asRelativePath(definition.file) : '';
  const fileUri = definition ? vscode.Uri.file(definition.file).toString() : '';

  panel.webview.html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(explanation.title)}</title>
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
    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .parameter, .warning {
      margin: 10px 0;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-radius: 3px;
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <h1>📖 ${escapeHtml(explanation.title)}</h1>

  ${definition ? `
  <div class="section">
    <h2>📍 定義</h2>
    <p><strong>種別</strong>: ${escapeHtml(getTypeLabel(definition.type))}</p>
    ${definition.namespace ? `<p><strong>名前空間</strong>: ${escapeHtml(definition.namespace)}</p>` : ''}
    ${definition.className ? `<p><strong>クラス</strong>: ${escapeHtml(definition.className)}</p>` : ''}
    <p><strong>場所</strong>: <a href="${fileUri}#L${definition.line}">${escapeHtml(relativePath)}:${definition.line}</a></p>
    ${definition.code ? `
      <h3>コードプレビュー</h3>
      <pre><code>${escapeHtml(definition.code.split('\n').slice(0, 10).join('\n'))}</code></pre>
      ${definition.code.split('\n').length > 10 ? '<p><em>... (定義の全体を見るには上記リンクをクリック)</em></p>' : ''}
    ` : ''}
  </div>
  ` : `
  <div class="section">
    <h2>⚠️ 定義</h2>
    <p><code>${escapeHtml(identifier)}</code> の定義が見つかりませんでした。</p>
    <p>これは以下の理由が考えられます:</p>
    <ul>
      <li>PHP標準関数またはLaravelフレームワーク関数</li>
      <li>vendorディレクトリ内のライブラリ関数</li>
      <li>動的に定義された関数</li>
    </ul>
  </div>
  `}

  <div class="section">
    <h2>🤖 AI による詳細説明</h2>
    <p><strong>種別</strong>: ${escapeHtml(explanation.functionType || '')}</p>
    <p>${escapeHtml(explanation.description || '')}</p>
  </div>

  ${explanation.parameters && explanation.parameters.length > 0 ? `
  <div class="section">
    <h3>📋 パラメータ</h3>
    ${explanation.parameters.map((param: any) => `
      <div class="parameter">
        <strong>${escapeHtml(param.name)}</strong> (<code>${escapeHtml(param.type)}</code>): ${escapeHtml(param.description)}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${explanation.returnType ? `
  <div class="section">
    <h3>↩️ 返り値</h3>
    <p><strong>型</strong>: <code>${escapeHtml(explanation.returnType)}</code></p>
    ${explanation.returnDescription ? `<p>${escapeHtml(explanation.returnDescription)}</p>` : ''}
  </div>
  ` : ''}

  ${explanation.example ? `
  <div class="section">
    <h3>💻 使用例</h3>
    <pre><code>${escapeHtml(explanation.example)}</code></pre>
  </div>
  ` : ''}

  ${explanation.warnings && explanation.warnings.length > 0 ? `
  <div class="section">
    <h3>⚠️ 注意点</h3>
    ${explanation.warnings.map((w: string) => `
      <div class="warning">
        ${escapeHtml(w)}
      </div>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;
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

    // AIServiceを使って分析
    return await aiService.analyzeUsages(identifier, {
      totalUsages: analysis.totalUsages,
      usagePatterns: analysis.usagePatterns,
      sampleUsages: context.sampleUsages
    });
  } catch (error) {
    console.error('Error analyzing usage patterns:', error);
    return null;
  }
}

/**
 * 使用箇所の分析結果を表示（Webview版）
 */
async function showUsageAnalysis(identifier: string, analysis: any, aiInsights: any) {
  const panel = vscode.window.createWebviewPanel(
    'mireruUsageAnalysis',
    `使用箇所: ${identifier}`,
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  const escapeHtml = (text: string): string => {
    const div = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => div[m as keyof typeof div]);
  };

  const displayCount = Math.min(20, analysis.usageLocations?.length || 0);

  panel.webview.html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>使用箇所: ${escapeHtml(identifier)}</title>
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
    .section {
      margin: 20px 0;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .usage-item {
      margin: 15px 0;
      padding: 10px;
      background: var(--vscode-editor-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 5px;
      overflow-x: auto;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
  </style>
</head>
<body>
  <h1>📊 "${escapeHtml(identifier)}" の使用箇所</h1>

  <div class="section">
    <h2>サマリー</h2>
    <p><strong>総使用箇所</strong>: ${analysis.totalUsages}件</p>
    <p><strong>検索範囲</strong>: プロジェクト全体 (vendor除く)</p>
  </div>

  ${analysis.totalUsages === 0 ? `
  <div class="section">
    <h2>⚠️ 使用箇所が見つかりませんでした</h2>
    <p>以下の理由が考えられます:</p>
    <ul>
      <li>新しく定義されたが、まだ使用されていない</li>
      <li>vendorディレクトリ内でのみ使用されている</li>
      <li>検索パターンに一致しない方法で使用されている</li>
    </ul>
  </div>
  ` : `
    ${analysis.usagePatterns && analysis.usagePatterns.length > 0 ? `
    <div class="section">
      <h2>📈 使用パターン</h2>
      ${analysis.usagePatterns.map((pattern: any) => {
        const percentage = ((pattern.count / analysis.totalUsages) * 100).toFixed(1);
        return `
        <div class="usage-item">
          <h3>${escapeHtml(pattern.pattern)} <span class="badge">${pattern.count}件 / ${percentage}%</span></h3>
          <p>${escapeHtml(pattern.description || '')}</p>
          ${pattern.examples && pattern.examples.length > 0 ? `
            <p><strong>例:</strong></p>
            ${pattern.examples.slice(0, 2).map((ex: string) => `
              <pre><code>${escapeHtml(ex)}</code></pre>
            `).join('')}
          ` : ''}
        </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    ${analysis.commonContexts && analysis.commonContexts.length > 0 ? `
    <div class="section">
      <h2>🎯 共通の使用コンテキスト</h2>
      <ul>
        ${analysis.commonContexts.map((ctx: string) => `
          <li>${escapeHtml(ctx)}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${aiInsights ? `
    <div class="section">
      <h2>🤖 AI による分析</h2>
      <p><strong>主な用途</strong>: ${escapeHtml(aiInsights.mainPurpose || '')}</p>

      ${aiInsights.characteristics && aiInsights.characteristics.length > 0 ? `
        <h3>特徴</h3>
        <ul>
          ${aiInsights.characteristics.map((char: string) => `<li>${escapeHtml(char)}</li>`).join('')}
        </ul>
      ` : ''}

      ${aiInsights.bestPractices && aiInsights.bestPractices.length > 0 ? `
        <h3>ベストプラクティス</h3>
        <ul>
          ${aiInsights.bestPractices.map((bp: string) => `<li>${escapeHtml(bp)}</li>`).join('')}
        </ul>
      ` : ''}

      ${aiInsights.improvements && aiInsights.improvements.length > 0 ? `
        <h3>改善の余地</h3>
        <ul>
          ${aiInsights.improvements.map((imp: string) => `<li>${escapeHtml(imp)}</li>`).join('')}
        </ul>
      ` : ''}
    </div>
    ` : ''}

    <div class="section">
      <h2>📍 使用箇所一覧</h2>
      <p><em>表示: ${displayCount}件 / 全${analysis.totalUsages}件</em></p>
      ${analysis.usageLocations?.slice(0, 20).map((usage: any, i: number) => {
        const relativePath = vscode.workspace.asRelativePath(usage.file);
        const fileUri = vscode.Uri.file(usage.file).toString();
        const typeLabel = getUsageTypeLabel(usage.type);
        return `
        <div class="usage-item">
          <h3>${i + 1}. <a href="${fileUri}#L${usage.line}">${escapeHtml(relativePath)}:${usage.line}</a> <span class="badge">${escapeHtml(typeLabel)}</span></h3>
          <pre><code>${escapeHtml(usage.code || '')}</code></pre>
        </div>
        `;
      }).join('')}
      ${analysis.totalUsages > displayCount ? `
        <p><em>... 他 ${analysis.totalUsages - displayCount}件の使用箇所</em></p>
      ` : ''}
    </div>
  `}
</body>
</html>`;
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
