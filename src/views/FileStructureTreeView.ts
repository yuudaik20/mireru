/**
 * File Structure TreeView
 * プロジェクト構造をTreeView形式で表示
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectStructure, DirectoryInfo, FileInfo, FileFilter } from '../types/project';

export class FileStructureTreeView implements vscode.TreeDataProvider<FileStructureTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileStructureTreeItem | undefined | null | void> = new vscode.EventEmitter<FileStructureTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileStructureTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private structure: ProjectStructure | null = null;
  private treeView: vscode.TreeView<FileStructureTreeItem> | undefined;
  private currentFilter: FileFilter | null = null;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * TreeViewを作成して登録
   */
  createTreeView(): vscode.TreeView<FileStructureTreeItem> {
    this.treeView = vscode.window.createTreeView('mireruFileStructure', {
      treeDataProvider: this,
      showCollapseAll: true
    });

    this.context.subscriptions.push(this.treeView);
    return this.treeView;
  }

  /**
   * プロジェクト構造を更新
   */
  updateStructure(structure: ProjectStructure): void {
    this.structure = structure;
    this._onDidChangeTreeData.fire();
  }

  /**
   * フィルターを適用
   */
  applyFilter(filter: FileFilter | null): void {
    this.currentFilter = filter;
    this._onDidChangeTreeData.fire();
  }

  /**
   * TreeItemの取得
   */
  getTreeItem(element: FileStructureTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 子要素の取得
   */
  getChildren(element?: FileStructureTreeItem): Thenable<FileStructureTreeItem[]> {
    if (!this.structure) {
      return Promise.resolve([]);
    }

    if (!element) {
      // ルートレベル: プロジェクト統計とルートディレクトリ
      return Promise.resolve(this.getRootItems());
    } else if (element.contextValue === 'statistics') {
      // 統計アイテムには子要素なし
      return Promise.resolve([]);
    } else if (element.contextValue === 'directory' && element.directoryInfo) {
      // ディレクトリの子要素を取得
      return Promise.resolve(this.getDirectoryChildren(element.directoryInfo));
    } else {
      // ファイルには子要素なし
      return Promise.resolve([]);
    }
  }

  /**
   * ルートレベルのアイテムを取得
   */
  private getRootItems(): FileStructureTreeItem[] {
    if (!this.structure) {
      return [];
    }

    const items: FileStructureTreeItem[] = [];

    // プロジェクト統計を表示
    const statsItem = new FileStructureTreeItem(
      '📊 プロジェクト統計',
      this.getProjectStatsDescription(),
      vscode.TreeItemCollapsibleState.None,
      'statistics'
    );
    statsItem.iconPath = new vscode.ThemeIcon('graph');
    statsItem.tooltip = this.createProjectStatsTooltip();
    items.push(statsItem);

    // ルートディレクトリを表示
    const rootItem = this.createDirectoryItem(this.structure.root, true);
    items.push(rootItem);

    return items;
  }

  /**
   * ディレクトリの子要素を取得
   */
  private getDirectoryChildren(directory: DirectoryInfo): FileStructureTreeItem[] {
    const items: FileStructureTreeItem[] = [];

    // サブディレクトリを追加
    for (const subDir of directory.directories) {
      if (this.shouldIncludeDirectory(subDir)) {
        items.push(this.createDirectoryItem(subDir, false));
      }
    }

    // ファイルを追加
    for (const file of directory.files) {
      if (this.shouldIncludeFile(file)) {
        items.push(this.createFileItem(file));
      }
    }

    return items;
  }

  /**
   * ディレクトリアイテムを作成
   */
  private createDirectoryItem(directory: DirectoryInfo, isRoot: boolean): FileStructureTreeItem {
    const label = isRoot ? `📁 ${directory.name}` : directory.name;
    const description = `${directory.totalFiles || 0}ファイル, ${this.formatNumber(directory.totalLines || 0)}行`;

    const item = new FileStructureTreeItem(
      label,
      description,
      vscode.TreeItemCollapsibleState.Collapsed,
      'directory'
    );

    item.directoryInfo = directory;
    item.iconPath = vscode.ThemeIcon.Folder;
    item.tooltip = this.createDirectoryTooltip(directory);

    return item;
  }

  /**
   * ファイルアイテムを作成
   */
  private createFileItem(file: FileInfo): FileStructureTreeItem {
    const label = file.name;
    const description = this.getFileDescription(file);

    const item = new FileStructureTreeItem(
      label,
      description,
      vscode.TreeItemCollapsibleState.None,
      'file'
    );

    item.fileInfo = file;
    item.iconPath = this.getIconForFile(file);
    item.tooltip = this.createFileTooltip(file);

    // クリック時のコマンド
    item.command = {
      command: 'mireru.showFileDetails',
      title: 'ファイル詳細を表示',
      arguments: [file]
    };

    return item;
  }

  /**
   * プロジェクト統計の説明文を生成
   */
  private getProjectStatsDescription(): string {
    if (!this.structure) {
      return '';
    }

    return `${this.structure.totalFiles}ファイル, ${this.formatNumber(this.structure.totalLines)}行`;
  }

  /**
   * ファイルの説明文を生成
   */
  private getFileDescription(file: FileInfo): string {
    const parts: string[] = [];

    // ファイルサイズ
    parts.push(this.formatFileSize(file.size));

    // 行数
    parts.push(`${this.formatNumber(file.lines)}行`);

    // 言語
    if (file.languageId && file.languageId !== 'plaintext') {
      parts.push(file.languageId);
    }

    // ファイルの役割（AI要約）
    if (file.role) {
      parts.push(`[${file.role}]`);
    }

    return parts.join(' • ');
  }

  /**
   * プロジェクト統計のツールチップを生成
   */
  private createProjectStatsTooltip(): vscode.MarkdownString {
    if (!this.structure) {
      return new vscode.MarkdownString();
    }

    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**プロジェクト統計**\n\n`);
    tooltip.appendMarkdown(`- **総ファイル数:** ${this.structure.totalFiles}\n`);
    tooltip.appendMarkdown(`- **総行数:** ${this.formatNumber(this.structure.totalLines)}\n`);
    tooltip.appendMarkdown(`- **総サイズ:** ${this.formatFileSize(this.structure.totalSize)}\n\n`);

    // 言語別統計
    tooltip.appendMarkdown(`**言語別ファイル数:**\n\n`);
    const sortedLanguages = Object.entries(this.structure.languageStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [lang, count] of sortedLanguages) {
      tooltip.appendMarkdown(`- ${lang}: ${count}ファイル\n`);
    }

    return tooltip;
  }

  /**
   * ディレクトリのツールチップを生成
   */
  private createDirectoryTooltip(directory: DirectoryInfo): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**ディレクトリ:** \`${directory.name}\`\n\n`);
    tooltip.appendMarkdown(`- **パス:** ${directory.relativePath}\n`);
    tooltip.appendMarkdown(`- **ファイル数:** ${directory.totalFiles || 0}\n`);
    tooltip.appendMarkdown(`- **総行数:** ${this.formatNumber(directory.totalLines || 0)}\n`);
    tooltip.appendMarkdown(`- **サブディレクトリ:** ${directory.directories.length}\n`);
    tooltip.appendMarkdown(`- **ファイル:** ${directory.files.length}\n`);

    return tooltip;
  }

  /**
   * ファイルのツールチップを生成
   */
  private createFileTooltip(file: FileInfo): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**ファイル:** \`${file.name}\`\n\n`);
    tooltip.appendMarkdown(`- **パス:** ${file.relativePath}\n`);
    tooltip.appendMarkdown(`- **サイズ:** ${this.formatFileSize(file.size)}\n`);
    tooltip.appendMarkdown(`- **行数:** ${this.formatNumber(file.lines)}\n`);
    tooltip.appendMarkdown(`- **言語:** ${file.languageId}\n`);
    tooltip.appendMarkdown(`- **最終更新:** ${file.lastModified.toLocaleString()}\n\n`);

    // ファイルの役割
    if (file.role) {
      tooltip.appendMarkdown(`**役割:** ${file.role}\n\n`);
    }

    // 定義されている要素
    if (file.definitions) {
      if (file.definitions.classes && file.definitions.classes.length > 0) {
        tooltip.appendMarkdown(`**クラス:** ${file.definitions.classes.join(', ')}\n\n`);
      }
      if (file.definitions.functions && file.definitions.functions.length > 0) {
        tooltip.appendMarkdown(`**関数:** ${file.definitions.functions.join(', ')}\n\n`);
      }
      if (file.definitions.interfaces && file.definitions.interfaces.length > 0) {
        tooltip.appendMarkdown(`**インターフェース:** ${file.definitions.interfaces.join(', ')}\n\n`);
      }
    }

    // 依存関係
    if (file.dependencies && file.dependencies.length > 0) {
      tooltip.appendMarkdown(`**依存関係:** ${file.dependencies.length}ファイル\n\n`);
    }

    tooltip.appendMarkdown(`_クリックして詳細を表示_`);

    return tooltip;
  }

  /**
   * ファイルに応じたアイコンを取得
   */
  private getIconForFile(file: FileInfo): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      'typescript': 'file-code',
      'javascript': 'file-code',
      'typescriptreact': 'file-code',
      'javascriptreact': 'file-code',
      'php': 'file-code',
      'python': 'file-code',
      'java': 'file-code',
      'csharp': 'file-code',
      'go': 'file-code',
      'rust': 'file-code',
      'html': 'file-code',
      'css': 'file-code',
      'json': 'json',
      'markdown': 'markdown',
      'xml': 'file-code',
      'yaml': 'file-code',
      'sql': 'database',
      'blade': 'file-code'
    };

    const iconId = iconMap[file.languageId] || 'file';
    return new vscode.ThemeIcon(iconId);
  }

  /**
   * ファイルサイズをフォーマット
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  }

  /**
   * 数値をフォーマット（カンマ区切り）
   */
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * ディレクトリを含めるべきかチェック（フィルタリング）
   */
  private shouldIncludeDirectory(directory: DirectoryInfo): boolean {
    // フィルタが適用されていない場合は全て表示
    if (!this.currentFilter) {
      return true;
    }

    // ディレクトリ内にフィルタに一致するファイルがあれば表示
    return this.hasMatchingFiles(directory);
  }

  /**
   * ディレクトリ内にフィルタに一致するファイルがあるかチェック
   */
  private hasMatchingFiles(directory: DirectoryInfo): boolean {
    // 直下のファイルをチェック
    for (const file of directory.files) {
      if (this.shouldIncludeFile(file)) {
        return true;
      }
    }

    // サブディレクトリを再帰的にチェック
    for (const subDir of directory.directories) {
      if (this.hasMatchingFiles(subDir)) {
        return true;
      }
    }

    return false;
  }

  /**
   * ファイルを含めるべきかチェック（フィルタリング）
   */
  private shouldIncludeFile(file: FileInfo): boolean {
    if (!this.currentFilter) {
      return true;
    }

    const filter = this.currentFilter;

    // ファイルタイプフィルター
    if (filter.fileTypes && filter.fileTypes.length > 0) {
      const ext = path.extname(file.name).toLowerCase();
      if (!filter.fileTypes.includes(ext)) {
        return false;
      }
    }

    // 言語IDフィルター
    if (filter.languageIds && filter.languageIds.length > 0) {
      if (!filter.languageIds.includes(file.languageId)) {
        return false;
      }
    }

    // サイズフィルター
    if (filter.minSize !== undefined && file.size < filter.minSize) {
      return false;
    }
    if (filter.maxSize !== undefined && file.size > filter.maxSize) {
      return false;
    }

    // 行数フィルター
    if (filter.minLines !== undefined && file.lines < filter.minLines) {
      return false;
    }
    if (filter.maxLines !== undefined && file.lines > filter.maxLines) {
      return false;
    }

    // 検索クエリフィルター
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      if (!file.name.toLowerCase().includes(query) &&
          !file.relativePath.toLowerCase().includes(query)) {
        return false;
      }
    }

    // 役割フィルター
    if (filter.roleFilter && file.role) {
      if (!file.role.toLowerCase().includes(filter.roleFilter.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * TreeViewを表示
   */
  reveal(item: FileStructureTreeItem): void {
    if (this.treeView) {
      this.treeView.reveal(item, { select: true, focus: true });
    }
  }

  /**
   * リフレッシュ
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * プロジェクト構造を取得
   */
  getStructure(): ProjectStructure | null {
    return this.structure;
  }
}

/**
 * TreeViewのアイテム
 */
export class FileStructureTreeItem extends vscode.TreeItem {
  public directoryInfo?: DirectoryInfo;
  public fileInfo?: FileInfo;

  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.contextValue = contextValue;
  }
}
