/**
 * Laravel プロジェクトアナライザー
 */

import * as fs from 'fs';
import * as path from 'path';
import { PhpParser } from '../parser/PhpParser';
import {
  RouteInfo,
  EloquentModel,
  EloquentRelation,
  ControllerInfo,
  MiddlewareInfo,
  LaravelProjectInfo
} from '../types/laravel';

export class LaravelAnalyzer {
  private phpParser: PhpParser;

  constructor() {
    this.phpParser = new PhpParser();
  }

  /**
   * Laravelプロジェクトかどうかを検出
   */
  async detectLaravelProject(rootPath: string): Promise<boolean> {
    try {
      // composer.jsonの確認
      const composerPath = path.join(rootPath, 'composer.json');
      if (!fs.existsSync(composerPath)) {
        return false;
      }

      const composerContent = await fs.promises.readFile(composerPath, 'utf-8');
      const composer = JSON.parse(composerContent);

      // laravel/framework の依存関係を確認
      return !!(
        composer.require?.['laravel/framework'] ||
        composer['require-dev']?.['laravel/framework']
      );
    } catch {
      return false;
    }
  }

  /**
   * Laravelプロジェクト情報を取得
   */
  async getProjectInfo(rootPath: string): Promise<LaravelProjectInfo | null> {
    try {
      const composerPath = path.join(rootPath, 'composer.json');
      const composerContent = await fs.promises.readFile(composerPath, 'utf-8');
      const composer = JSON.parse(composerContent);

      const version = composer.require?.['laravel/framework'] || 'unknown';

      return {
        rootPath,
        version,
        composer: {
          name: composer.name,
          dependencies: composer.require || {}
        },
        directories: {
          app: path.join(rootPath, 'app'),
          routes: path.join(rootPath, 'routes'),
          resources: path.join(rootPath, 'resources'),
          database: path.join(rootPath, 'database'),
          config: path.join(rootPath, 'config')
        }
      };
    } catch {
      return null;
    }
  }

  /**
   * ルート定義を抽出（グループ化対応）
   */
  async extractRoutes(routeFilePath: string): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    try {
      const code = await fs.promises.readFile(routeFilePath, 'utf-8');
      const lines = code.split('\n');

      // グループスタック: ネストされたグループを追跡
      interface GroupContext {
        controller?: string;
        prefix?: string;
        namePrefix?: string;
        middleware?: string[];
      }
      const groupStack: GroupContext[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;

        // グループ開始を検出
        const groupMatch = this.parseRouteGroup(line);
        if (groupMatch) {
          groupStack.push(groupMatch);
          continue;
        }

        // グループ終了を検出
        if (line.includes('});') && groupStack.length > 0) {
          groupStack.pop();
          continue;
        }

        // ルート定義を解析
        const routeInfo = this.parseRouteDefinition(line, routeFilePath, lineNumber, groupStack);
        if (routeInfo) {
          routes.push(routeInfo);
        }
      }
    } catch (error) {
      console.error(`Failed to extract routes from ${routeFilePath}:`, error);
    }

    return routes;
  }

  /**
   * グループ定義を解析
   */
  private parseRouteGroup(line: string): { controller?: string; prefix?: string; namePrefix?: string; middleware?: string[] } | null {
    // Route::controller(CategoryController::class)->prefix('category')->name('category.')->group(function () {
    const groupPattern = /Route::(controller|prefix|name|middleware|group)/;
    if (!groupPattern.test(line) || !line.includes('->group(')) {
      return null;
    }

    const context: { controller?: string; prefix?: string; namePrefix?: string; middleware?: string[] } = {};

    // controller を抽出
    const controllerMatch = line.match(/->controller\s*\(\s*([^:]+)::class\s*\)/);
    if (controllerMatch) {
      context.controller = controllerMatch[1];
    }

    // prefix を抽出
    const prefixMatch = line.match(/->prefix\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (prefixMatch) {
      context.prefix = prefixMatch[1];
    }

    // name を抽出（プレフィックスとして保存）
    const nameMatch = line.match(/->name\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (nameMatch) {
      context.namePrefix = nameMatch[1];
    }

    // middleware を抽出
    const middlewareMatch = line.match(/->middleware\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (middlewareMatch) {
      context.middleware = [middlewareMatch[1]];
    }

    return context;
  }

  /**
   * ルート定義を解析（グループコンテキストを適用）
   */
  private parseRouteDefinition(
    line: string,
    filePath: string,
    lineNumber: number,
    groupStack: Array<{ controller?: string; prefix?: string; namePrefix?: string; middleware?: string[] }>
  ): RouteInfo | null {
    // Route::get('/path', [Controller::class, 'method']) or Route::get('/', 'method')
    const routePattern = /Route::(get|post|put|patch|delete|any|match|resource)\s*\(\s*['"]([^'"]+)['"]/;
    const match = line.match(routePattern);

    if (!match) return null;

    const method = match[1].toUpperCase();
    let uri = match[2];

    // グループスタックからコンテキストを取得
    let controller: string | undefined;
    let action: string | undefined;
    const middleware: string[] = [];
    let routeName: string | undefined;

    // グループスタックからcontroller, prefix, namePrefix, middlewareを収集
    let prefixParts: string[] = [];
    let namePrefixParts: string[] = [];

    for (const group of groupStack) {
      if (group.controller && !controller) {
        controller = group.controller;
      }
      if (group.prefix) {
        prefixParts.push(group.prefix);
      }
      if (group.namePrefix) {
        namePrefixParts.push(group.namePrefix);
      }
      if (group.middleware) {
        middleware.push(...group.middleware);
      }
    }

    // URIにプレフィックスを適用
    if (prefixParts.length > 0) {
      const prefix = prefixParts.join('/');
      uri = uri === '/' ? prefix : `${prefix}/${uri}`.replace(/\/+/g, '/');
    }

    // コントローラーとアクションを抽出
    const controllerPattern = /\[([^:]+)::class,\s*['"]([^'"]+)['"]\]/;
    const controllerMatch = line.match(controllerPattern);

    if (controllerMatch) {
      controller = controllerMatch[1];
      action = controllerMatch[2];
    } else {
      // グループのcontrollerを使用する形式: Route::get('/', 'method')
      const methodPattern = /Route::[^(]+\([^,]+,\s*['"]([^'"]+)['"]/;
      const methodMatch = line.match(methodPattern);
      if (methodMatch) {
        action = methodMatch[1];
        // controller is already set from group context
      } else {
        // 古い形式: 'Controller@method'
        const oldPattern = /['"]([^@]+)@([^'"]+)['"]/;
        const oldMatch = line.match(oldPattern);
        if (oldMatch) {
          controller = oldMatch[1];
          action = oldMatch[2];
        }
      }
    }

    // ルート名を抽出
    const namePattern = /->name\s*\(\s*['"]([^'"]+)['"]/;
    const nameMatch = line.match(namePattern);
    if (nameMatch) {
      routeName = nameMatch[1];
    }

    // グループのnamePrefixを適用
    if (namePrefixParts.length > 0 && routeName) {
      const namePrefix = namePrefixParts.join('');
      routeName = `${namePrefix}${routeName}`;
    }

    // ミドルウェアを抽出（行レベル）
    const middlewarePattern = /->middleware\s*\(\s*['"]([^'"]+)['"]/;
    const middlewareMatch = line.match(middlewarePattern);
    if (middlewareMatch) {
      middleware.push(middlewareMatch[1]);
    }

    return {
      method,
      uri,
      controller,
      action,
      middleware,
      name: routeName,
      location: {
        file: filePath,
        startLine: lineNumber,
        endLine: lineNumber,
        startColumn: 0,
        endColumn: line.length
      }
    };
  }

  /**
   * Eloquentモデルを抽出
   */
  async extractEloquentModels(modelsPath: string): Promise<EloquentModel[]> {
    const models: EloquentModel[] = [];

    try {
      const files = await this.findPhpFiles(modelsPath);

      for (const file of files) {
        const parsed = await this.phpParser.parseFile(file);

        for (const cls of parsed.classes) {
          // Eloquentモデルかどうかを判定（extendsがModel）
          if (this.isEloquentModel(cls.extends)) {
            const model = await this.analyzeEloquentModel(file, cls);
            models.push(model);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to extract Eloquent models from ${modelsPath}:`, error);
    }

    return models;
  }

  /**
   * Eloquentモデルかどうかを判定
   */
  private isEloquentModel(extendsClass?: string): boolean {
    if (!extendsClass) return false;
    return extendsClass === 'Model' || extendsClass.endsWith('\\Model');
  }

  /**
   * Eloquentモデルを詳細解析
   */
  private async analyzeEloquentModel(filePath: string, cls: any): Promise<EloquentModel> {
    const code = await fs.promises.readFile(filePath, 'utf-8');
    const relations: EloquentRelation[] = [];

    // リレーションメソッドを検出
    for (const method of cls.methods) {
      const relation = this.detectRelation(method.name, code);
      if (relation) {
        relations.push({
          ...relation,
          location: method.location
        });
      }
    }

    // プロパティから情報を抽出
    const table = this.extractPropertyValue(code, 'table');
    const primaryKey = this.extractPropertyValue(code, 'primaryKey');
    const fillable = this.extractArrayProperty(code, 'fillable');
    const guarded = this.extractArrayProperty(code, 'guarded');

    return {
      name: cls.name,
      table,
      primaryKey,
      timestamps: !code.includes('public $timestamps = false'),
      softDeletes: code.includes('use SoftDeletes'),
      fillable,
      guarded,
      casts: {},
      relations,
      location: cls.location,
      namespace: cls.namespace
    };
  }

  /**
   * リレーションを検出
   */
  private detectRelation(methodName: string, code: string): Omit<EloquentRelation, 'location'> | null {
    const relationTypes = [
      'hasOne', 'hasMany', 'belongsTo', 'belongsToMany',
      'hasManyThrough', 'morphTo', 'morphMany', 'morphToMany'
    ];

    for (const relationType of relationTypes) {
      const pattern = new RegExp(`function\\s+${methodName}.*?return\\s+\\$this->${relationType}\\s*\\(\\s*([^)]+)\\)`, 's');
      const match = code.match(pattern);

      if (match) {
        // 関連モデルを抽出
        const args = match[1].split(',').map(a => a.trim());
        const relatedModel = args[0]?.replace(/::class|['"]/g, '') || '';

        return {
          name: methodName,
          type: relationType as any,
          relatedModel,
          foreignKey: args[1]?.replace(/['"]/g, ''),
          localKey: args[2]?.replace(/['"]/g, '')
        };
      }
    }

    return null;
  }

  /**
   * プロパティ値を抽出
   */
  private extractPropertyValue(code: string, propertyName: string): string | undefined {
    const pattern = new RegExp(`protected\\s+\\$${propertyName}\\s*=\\s*['"]([^'"]+)['"]`);
    const match = code.match(pattern);
    return match?.[1];
  }

  /**
   * 配列プロパティを抽出
   */
  private extractArrayProperty(code: string, propertyName: string): string[] | undefined {
    const pattern = new RegExp(`protected\\s+\\$${propertyName}\\s*=\\s*\\[([^\\]]+)\\]`);
    const match = code.match(pattern);
    if (!match) return undefined;

    return match[1]
      .split(',')
      .map(item => item.trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }

  /**
   * コントローラーを抽出
   */
  async extractControllers(controllersPath: string): Promise<ControllerInfo[]> {
    const controllers: ControllerInfo[] = [];

    try {
      const files = await this.findPhpFiles(controllersPath);

      for (const file of files) {
        const parsed = await this.phpParser.parseFile(file);

        for (const cls of parsed.classes) {
          if (this.isController(cls.name)) {
            controllers.push({
              name: cls.name,
              actions: cls.methods.map(m => ({
                name: m.name,
                location: m.location
              })),
              location: cls.location,
              namespace: cls.namespace,
              isResourceController: this.isResourceController(cls.methods.map(m => m.name))
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to extract controllers from ${controllersPath}:`, error);
    }

    return controllers;
  }

  /**
   * コントローラーかどうかを判定
   */
  private isController(className: string): boolean {
    return className.endsWith('Controller');
  }

  /**
   * リソースコントローラーかどうかを判定
   */
  private isResourceController(methods: string[]): boolean {
    const resourceMethods = ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy'];
    return resourceMethods.filter(m => methods.includes(m)).length >= 5;
  }

  /**
   * PHPファイルを再帰的に検索
   */
  private async findPhpFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          files.push(...await this.findPhpFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.php')) {
          files.push(fullPath);
        }
      }
    } catch {
      // ディレクトリが存在しない場合は空配列を返す
    }

    return files;
  }

  /**
   * ミドルウェアを解析
   */
  async analyzeMiddleware(kernelPath: string): Promise<MiddlewareInfo[]> {
    const middleware: MiddlewareInfo[] = [];

    try {
      const code = await fs.promises.readFile(kernelPath, 'utf-8');

      // グローバルミドルウェアを抽出
      const globalPattern = /protected\s+\$middleware\s*=\s*\[([\s\S]*?)\]/;
      const globalMatch = code.match(globalPattern);
      if (globalMatch) {
        const items = this.extractArrayItems(globalMatch[1]);
        items.forEach(item => {
          middleware.push({
            name: item,
            className: item,
            isGlobal: true
          });
        });
      }

      // ルートミドルウェアを抽出
      const routePattern = /protected\s+\$routeMiddleware\s*=\s*\[([\s\S]*?)\]/;
      const routeMatch = code.match(routePattern);
      if (routeMatch) {
        const items = this.extractMiddlewareAliases(routeMatch[1]);
        items.forEach(({ alias, className }) => {
          middleware.push({
            name: className,
            className,
            alias,
            isGlobal: false
          });
        });
      }
    } catch (error) {
      console.error(`Failed to analyze middleware from ${kernelPath}:`, error);
    }

    return middleware;
  }

  /**
   * 配列要素を抽出
   */
  private extractArrayItems(content: string): string[] {
    return content
      .split(',')
      .map(item => item.trim().replace(/['"\\]/g, ''))
      .filter(Boolean);
  }

  /**
   * ミドルウェアエイリアスを抽出
   */
  private extractMiddlewareAliases(content: string): Array<{ alias: string; className: string }> {
    const items: Array<{ alias: string; className: string }> = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/['"]([^'"]+)['"]\s*=>\s*([^,]+)/);
      if (match) {
        items.push({
          alias: match[1],
          className: match[2].trim().replace(/['"\\::class]/g, '')
        });
      }
    }

    return items;
  }

  /**
   * ルート名の使用箇所を検索
   */
  async findRouteNameUsages(rootPath: string, routeName: string): Promise<Array<{ file: string; line: number; content: string; usage: string }>> {
    const usages: Array<{ file: string; line: number; content: string; usage: string }> = [];

    try {
      // プロジェクト内の全PHPファイルとBladeファイルを検索
      const files = await this.findAllProjectFiles(rootPath);

      for (const file of files) {
        const content = await fs.promises.readFile(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // route('route.name')パターン
          const routePattern = new RegExp(`route\\s*\\(\\s*['"]${routeName}['"]`, 'g');
          if (routePattern.test(line)) {
            usages.push({
              file,
              line: i + 1,
              content: line.trim(),
              usage: 'route()'
            });
          }

          // {{ route('route.name') }}パターン（Blade）
          const bladePattern = new RegExp(`{{.*route\\s*\\(\\s*['"]${routeName}['"]`, 'g');
          if (bladePattern.test(line)) {
            usages.push({
              file,
              line: i + 1,
              content: line.trim(),
              usage: 'Blade: route()'
            });
          }

          // redirect()->route('route.name')パターン
          const redirectPattern = new RegExp(`redirect\\s*\\(\\s*\\)\\s*->\\s*route\\s*\\(\\s*['"]${routeName}['"]`, 'g');
          if (redirectPattern.test(line)) {
            usages.push({
              file,
              line: i + 1,
              content: line.trim(),
              usage: 'redirect()->route()'
            });
          }

          // to_route('route.name')パターン
          const toRoutePattern = new RegExp(`to_route\\s*\\(\\s*['"]${routeName}['"]`, 'g');
          if (toRoutePattern.test(line)) {
            usages.push({
              file,
              line: i + 1,
              content: line.trim(),
              usage: 'to_route()'
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to find route name usages for ${routeName}:`, error);
    }

    return usages;
  }

  /**
   * プロジェクト内の全PHPとBladeファイルを検索
   */
  private async findAllProjectFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', 'vendor', '.git', 'storage', 'bootstrap/cache'];

    const walk = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            const relativePath = path.relative(rootPath, fullPath);
            if (!excludeDirs.some(exclude => relativePath.startsWith(exclude))) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.php' || entry.name.endsWith('.blade.php')) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは無視
      }
    };

    await walk(rootPath);
    return files;
  }

  /**
   * コントローラーとアクションからルートを検索
   */
  async findRouteByControllerAction(rootPath: string, controller: string, action: string): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    try {
      // routes/web.php と routes/api.php を検索
      const routeFiles = [
        path.join(rootPath, 'routes', 'web.php'),
        path.join(rootPath, 'routes', 'api.php')
      ];

      for (const routeFile of routeFiles) {
        if (fs.existsSync(routeFile)) {
          const allRoutes = await this.extractRoutes(routeFile);

          // コントローラーとアクションが一致するルートを検索
          const matchingRoutes = allRoutes.filter(route => {
            // コントローラー名の比較（クラス名のみで比較）
            const routeController = route.controller?.split('\\').pop()?.replace('Controller', '');
            const targetController = controller.split('\\').pop()?.replace('Controller', '');

            return routeController === targetController && route.action === action;
          });

          routes.push(...matchingRoutes);
        }
      }
    } catch (error) {
      console.error(`Failed to find route for ${controller}@${action}:`, error);
    }

    return routes;
  }
}
