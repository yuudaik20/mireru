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
   * ルート定義を抽出
   */
  async extractRoutes(routeFilePath: string): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];

    try {
      const code = await fs.promises.readFile(routeFilePath, 'utf-8');
      // ASTパースは将来の機能で使用予定
      const _ast = this.phpParser.parseCode(code, routeFilePath);

      // シンプルなパターンマッチングでルートを抽出
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const routeMatch = this.parseRouteLine(line, routeFilePath, i + 1);
        if (routeMatch) {
          routes.push(routeMatch);
        }
      }
    } catch (error) {
      console.error(`Failed to extract routes from ${routeFilePath}:`, error);
    }

    return routes;
  }

  /**
   * ルート行をパース
   */
  private parseRouteLine(line: string, filePath: string, lineNumber: number): RouteInfo | null {
    // Route::get('/path', [Controller::class, 'method'])
    const routePattern = /Route::(get|post|put|patch|delete|any|match|resource)\s*\(\s*['"]([^'"]+)['"]/;
    const match = line.match(routePattern);

    if (!match) return null;

    const method = match[1].toUpperCase();
    const uri = match[2];

    // コントローラーとアクションを抽出
    const controllerPattern = /\[([^:]+)::class,\s*['"]([^'"]+)['"]\]/;
    const controllerMatch = line.match(controllerPattern);

    let controller: string | undefined;
    let action: string | undefined;

    if (controllerMatch) {
      controller = controllerMatch[1];
      action = controllerMatch[2];
    } else {
      // 古い形式: 'Controller@method'
      const oldPattern = /['"]([^@]+)@([^'"]+)['"]/;
      const oldMatch = line.match(oldPattern);
      if (oldMatch) {
        controller = oldMatch[1];
        action = oldMatch[2];
      }
    }

    // ミドルウェアを抽出
    const middleware: string[] = [];
    const middlewarePattern = /->middleware\s*\(\s*['"]([^'"]+)['"]/;
    const middlewareMatch = line.match(middlewarePattern);
    if (middlewareMatch) {
      middleware.push(middlewareMatch[1]);
    }

    // ルート名を抽出
    const namePattern = /->name\s*\(\s*['"]([^'"]+)['"]/;
    const nameMatch = line.match(namePattern);
    const name = nameMatch?.[1];

    return {
      method,
      uri,
      controller,
      action,
      middleware,
      name,
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
}
