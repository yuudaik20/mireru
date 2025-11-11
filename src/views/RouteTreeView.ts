/**
 * Laravel Route TreeView
 * ルート一覧をTreeView形式で表示
 */

import * as vscode from 'vscode';
import { RouteInfo } from '../types/laravel';

export class RouteTreeView implements vscode.TreeDataProvider<RouteTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<RouteTreeItem | undefined | null | void> = new vscode.EventEmitter<RouteTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<RouteTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private routes: RouteInfo[] = [];
  private treeView: vscode.TreeView<RouteTreeItem> | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * TreeViewを作成して登録
   */
  createTreeView(): vscode.TreeView<RouteTreeItem> {
    this.treeView = vscode.window.createTreeView('mireruRoutes', {
      treeDataProvider: this,
      showCollapseAll: true
    });

    this.context.subscriptions.push(this.treeView);
    return this.treeView;
  }

  /**
   * ルートデータを更新
   */
  updateRoutes(routes: RouteInfo[]): void {
    this.routes = routes;
    this._onDidChangeTreeData.fire();
  }

  /**
   * TreeItemの取得
   */
  getTreeItem(element: RouteTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 子要素の取得
   */
  getChildren(element?: RouteTreeItem): Thenable<RouteTreeItem[]> {
    if (!element) {
      // ルートレベル: HTTPメソッドでグループ化
      return Promise.resolve(this.getMethodGroups());
    } else if (element.contextValue === 'methodGroup') {
      // メソッドグループ配下: そのメソッドのルート一覧
      return Promise.resolve(this.getRoutesForMethod(element.label as string));
    } else {
      // ルートアイテム配下: 詳細情報
      return Promise.resolve([]);
    }
  }

  /**
   * HTTPメソッドでグループ化したTreeItemを取得
   */
  private getMethodGroups(): RouteTreeItem[] {
    const methodCounts = new Map<string, number>();

    // 各メソッドの出現回数をカウント
    this.routes.forEach(route => {
      const method = route.method.toUpperCase();
      methodCounts.set(method, (methodCounts.get(method) || 0) + 1);
    });

    // メソッドグループを作成
    const groups: RouteTreeItem[] = [];
    const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'ANY'];

    methodOrder.forEach(method => {
      const count = methodCounts.get(method);
      if (count && count > 0) {
        const item = new RouteTreeItem(
          method,
          `${count}個のルート`,
          vscode.TreeItemCollapsibleState.Collapsed,
          'methodGroup'
        );
        item.iconPath = this.getIconForMethod(method);
        groups.push(item);
      }
    });

    return groups;
  }

  /**
   * 指定されたメソッドのルート一覧を取得
   */
  private getRoutesForMethod(method: string): RouteTreeItem[] {
    const filteredRoutes = this.routes.filter(
      route => route.method.toUpperCase() === method
    );

    return filteredRoutes.map(route => {
      const label = route.uri;
      const description = this.getRouteDescription(route);

      const item = new RouteTreeItem(
        label,
        description,
        vscode.TreeItemCollapsibleState.None,
        'route'
      );

      // ツールチップ
      item.tooltip = this.createTooltip(route);

      // クリック時のコマンド
      item.command = {
        command: 'mireru.showRouteDetails',
        title: 'ルート詳細を表示',
        arguments: [route]
      };

      // アイコン
      item.iconPath = new vscode.ThemeIcon('symbol-method');

      // ルート情報を保存
      item.route = route;

      return item;
    });
  }

  /**
   * ルートの説明文を生成
   */
  private getRouteDescription(route: RouteInfo): string {
    const parts: string[] = [];

    if (route.controller && route.action) {
      parts.push(`${route.controller}@${route.action}`);
    } else if (route.controller) {
      parts.push(route.controller);
    }

    if (route.name) {
      parts.push(`[${route.name}]`);
    }

    if (route.middleware.length > 0) {
      parts.push(`{${route.middleware.join(', ')}}`);
    }

    return parts.join(' ');
  }

  /**
   * ツールチップを生成
   */
  private createTooltip(route: RouteInfo): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**${route.method.toUpperCase()}** \`${route.uri}\`\n\n`);

    if (route.controller && route.action) {
      tooltip.appendMarkdown(`**コントローラー:** ${route.controller}\n\n`);
      tooltip.appendMarkdown(`**アクション:** ${route.action}\n\n`);
    }

    if (route.name) {
      tooltip.appendMarkdown(`**ルート名:** ${route.name}\n\n`);
    }

    if (route.middleware.length > 0) {
      tooltip.appendMarkdown(`**ミドルウェア:** ${route.middleware.join(', ')}\n\n`);
    }

    tooltip.appendMarkdown(`**定義場所:** ${route.location.file}:${route.location.startLine}\n\n`);

    tooltip.appendMarkdown(`_クリックして詳細を表示_`);

    return tooltip;
  }

  /**
   * HTTPメソッドに応じたアイコンを取得
   */
  private getIconForMethod(method: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      'GET': 'arrow-down',
      'POST': 'add',
      'PUT': 'edit',
      'PATCH': 'pencil',
      'DELETE': 'trash',
      'OPTIONS': 'info',
      'ANY': 'circle-large-filled'
    };

    const iconId = iconMap[method] || 'symbol-method';
    return new vscode.ThemeIcon(iconId);
  }

  /**
   * TreeViewを表示
   */
  reveal(item: RouteTreeItem): void {
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
}

/**
 * TreeViewのアイテム
 */
export class RouteTreeItem extends vscode.TreeItem {
  public route?: RouteInfo;

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
