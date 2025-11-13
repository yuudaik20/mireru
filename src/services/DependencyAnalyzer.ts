/**
 * Dependency Analyzer
 * プロジェクト内の依存関係を分析
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  DependencyType,
  DependencyStrength,
  FileDependency,
  FunctionDependency,
  ClassDependency,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  DependencyAnalysisOptions,
  DependencyAnalysisResult,
  CircularDependency
} from '../types/dependency';
import { Location } from '../types/common';
import { LaravelAnalyzer } from '../laravel/LaravelAnalyzer';

export class DependencyAnalyzer {
  private excludePatterns: string[] = [
    '**/node_modules/**',
    '**/vendor/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/coverage/**'
  ];

  // Laravel専用の分析対象ディレクトリ
  private laravelTargetDirectories: string[] = [
    'resources/views',
    'app/Repositories',
    'app/Models',
    'app/Http/Requests',
    'app/Http/Controllers',
    'app/Services'
  ];

  /**
   * プロジェクト全体の依存関係を分析
   */
  async analyzeProject(
    rootPath: string,
    options?: DependencyAnalysisOptions
  ): Promise<DependencyAnalysisResult> {
    const fileDependencies: FileDependency[] = [];
    const functionDependencies: FunctionDependency[] = [];
    const classDependencies: ClassDependency[] = [];

    // ファイル一覧を取得
    const files = await this.collectFiles(rootPath, options);
    console.log(`[DependencyAnalyzer] Collected ${files.length} files for analysis`);

    // 各ファイルを分析
    for (const file of files) {
      try {
        const deps = await this.analyzeFile(file, rootPath);
        fileDependencies.push(...deps.fileDeps);
        functionDependencies.push(...deps.functionDeps);
        classDependencies.push(...deps.classDeps);
      } catch (error) {
        console.error(`Failed to analyze file: ${file}`, error);
      }
    }

    console.log(`[DependencyAnalyzer] Found ${fileDependencies.length} file dependencies`);

    // 依存関係グラフを構築
    const graph = this.buildGraph(fileDependencies, files);
    console.log(`[DependencyAnalyzer] Built graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`);

    // 循環依存を検出
    const circularDependencies = options?.detectCircular !== false
      ? this.detectCircularDependencies(graph)
      : [];

    return {
      fileDependencies,
      functionDependencies,
      classDependencies,
      graph,
      circularDependencies,
      analyzedAt: new Date(),
      rootPath
    };
  }

  /**
   * 特定のファイルの依存関係を分析
   */
  async analyzeFile(
    filePath: string,
    rootPath: string
  ): Promise<{
    fileDeps: FileDependency[];
    functionDeps: FunctionDependency[];
    classDeps: ClassDependency[];
  }> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const isBladeFile = filePath.endsWith('.blade.php');

    const fileDeps: FileDependency[] = [];
    const functionDeps: FunctionDependency[] = [];
    const classDeps: ClassDependency[] = [];

    // 言語ごとに異なる解析を実行
    if (ext === '.php') {
      this.analyzePHPFile(content, filePath, rootPath, fileDeps, classDeps);
    } else if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      this.analyzeTypeScriptFile(content, filePath, rootPath, fileDeps, classDeps);
    }

    // Bladeファイルの場合、route()呼び出しを解析してController依存関係を追加
    if (isBladeFile) {
      await this.analyzeBladeRoutes(content, filePath, rootPath, fileDeps);
    }

    return { fileDeps, functionDeps, classDeps };
  }

  /**
   * PHPファイルを解析
   */
  private analyzePHPFile(
    content: string,
    filePath: string,
    rootPath: string,
    fileDeps: FileDependency[],
    classDeps: ClassDependency[]
  ): void {
    const lines = content.split('\n');

    // use文を検出
    const useRegex = /use\s+([A-Za-z0-9\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?;/g;
    let match;
    while ((match = useRegex.exec(content)) !== null) {
      const className = match[1];
      const alias = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      fileDeps.push({
        from: filePath,
        to: this.resolvePhpClassName(className, rootPath),
        type: DependencyType.Import,
        strength: DependencyStrength.Medium,
        locations: [{
          file: filePath,
          startLine: lineNumber,
          endLine: lineNumber,
          startColumn: 0,
          endColumn: match[0].length
        }],
        references: [alias || className]
      });
    }

    // require/include文を検出
    const requireRegex = /(?:require|include)(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const requiredPath = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const resolvedPath = this.resolveFilePath(requiredPath, filePath, rootPath);

      if (resolvedPath) {
        fileDeps.push({
          from: filePath,
          to: resolvedPath,
          type: DependencyType.Import,
          strength: DependencyStrength.Strong,
          locations: [{
            file: filePath,
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: match[0].length
          }]
        });
      }
    }

    // extends（継承）を検出
    const extendsRegex = /class\s+([A-Za-z0-9_]+)\s+extends\s+([A-Za-z0-9_\\]+)/g;
    while ((match = extendsRegex.exec(content)) !== null) {
      const className = match[1];
      const parentClass = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      classDeps.push({
        from: {
          name: className,
          file: filePath,
          location: {
            file: filePath,
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: match[0].length
          }
        },
        to: {
          name: parentClass,
          file: this.resolvePhpClassName(parentClass, rootPath)
        },
        type: DependencyType.Extends,
        strength: DependencyStrength.Strong
      });
    }

    // implements（実装）を検出
    const implementsRegex = /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+[A-Za-z0-9_\\]+)?\s+implements\s+([A-Za-z0-9_\\,\s]+)/g;
    while ((match = implementsRegex.exec(content)) !== null) {
      const className = match[1];
      const interfaces = match[2].split(',').map(i => i.trim());
      const lineNumber = content.substring(0, match.index).split('\n').length;

      for (const interfaceName of interfaces) {
        classDeps.push({
          from: {
            name: className,
            file: filePath,
            location: {
              file: filePath,
              startLine: lineNumber,
              endLine: lineNumber,
              startColumn: 0,
              endColumn: match[0].length
            }
          },
          to: {
            name: interfaceName,
            file: this.resolvePhpClassName(interfaceName, rootPath)
          },
          type: DependencyType.Implements,
          strength: DependencyStrength.Strong
        });
      }
    }

    // use trait を検出
    const useTraitRegex = /use\s+([A-Za-z0-9_\\]+)\s*;/g;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // クラス内のuseのみを検出（インデントがある）
      if (/^\s{2,}use\s+/.test(line)) {
        const match = useTraitRegex.exec(line);
        if (match) {
          const traitName = match[1];

          classDeps.push({
            from: {
              name: 'UnknownClass',
              file: filePath,
              location: {
                file: filePath,
                startLine: i + 1,
                endLine: i + 1,
                startColumn: 0,
                endColumn: line.length
              }
            },
            to: {
              name: traitName,
              file: this.resolvePhpClassName(traitName, rootPath)
            },
            type: DependencyType.Uses,
            strength: DependencyStrength.Medium
          });
        }
      }
    }
  }

  /**
   * TypeScript/JavaScriptファイルを解析
   */
  private analyzeTypeScriptFile(
    content: string,
    filePath: string,
    rootPath: string,
    fileDeps: FileDependency[],
    classDeps: ClassDependency[]
  ): void {
    // import文を検出
    const importRegex = /import\s+(?:{[^}]+}|[A-Za-z0-9_*]+|\*\s+as\s+[A-Za-z0-9_]+)(?:\s+from)?\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const resolvedPath = this.resolveFilePath(importPath, filePath, rootPath);

      if (resolvedPath) {
        fileDeps.push({
          from: filePath,
          to: resolvedPath,
          type: DependencyType.Import,
          strength: DependencyStrength.Medium,
          locations: [{
            file: filePath,
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: match[0].length
          }]
        });
      }
    }

    // require文を検出
    const requireRegex = /(?:const|let|var)\s+[A-Za-z0-9_{}]+\s*=\s*require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const requirePath = match[1];
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const resolvedPath = this.resolveFilePath(requirePath, filePath, rootPath);

      if (resolvedPath) {
        fileDeps.push({
          from: filePath,
          to: resolvedPath,
          type: DependencyType.Import,
          strength: DependencyStrength.Medium,
          locations: [{
            file: filePath,
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: match[0].length
          }]
        });
      }
    }

    // extendsを検出
    const extendsRegex = /class\s+([A-Za-z0-9_]+)\s+extends\s+([A-Za-z0-9_]+)/g;
    while ((match = extendsRegex.exec(content)) !== null) {
      const className = match[1];
      const parentClass = match[2];
      const lineNumber = content.substring(0, match.index).split('\n').length;

      classDeps.push({
        from: {
          name: className,
          file: filePath,
          location: {
            file: filePath,
            startLine: lineNumber,
            endLine: lineNumber,
            startColumn: 0,
            endColumn: match[0].length
          }
        },
        to: {
          name: parentClass,
          file: filePath
        },
        type: DependencyType.Extends,
        strength: DependencyStrength.Strong
      });
    }

    // implementsを検出
    const implementsRegex = /class\s+([A-Za-z0-9_]+)(?:\s+extends\s+[A-Za-z0-9_]+)?\s+implements\s+([A-Za-z0-9_,\s]+)/g;
    while ((match = implementsRegex.exec(content)) !== null) {
      const className = match[1];
      const interfaces = match[2].split(',').map(i => i.trim());
      const lineNumber = content.substring(0, match.index).split('\n').length;

      for (const interfaceName of interfaces) {
        classDeps.push({
          from: {
            name: className,
            file: filePath,
            location: {
              file: filePath,
              startLine: lineNumber,
              endLine: lineNumber,
              startColumn: 0,
              endColumn: match[0].length
            }
          },
          to: {
            name: interfaceName,
            file: filePath
          },
          type: DependencyType.Implements,
          strength: DependencyStrength.Strong
        });
      }
    }
  }

  /**
   * Bladeファイル内のroute()呼び出しを解析してController依存関係を追加
   */
  private async analyzeBladeRoutes(
    content: string,
    bladeFilePath: string,
    rootPath: string,
    fileDeps: FileDependency[]
  ): Promise<void> {
    // route()呼び出しのパターンを検出
    // {{ route('name') }}, {!! route('name') !!}, route('name'), @php route('name') @endphp など
    const routePatterns = [
      /\{\{\s*route\(['"]([^'"]+)['"]\s*(?:,\s*[^\)]+)?\)\s*\}\}/g,  // {{ route('name') }}
      /\{!!\s*route\(['"]([^'"]+)['"]\s*(?:,\s*[^\)]+)?\)\s*!!\}/g,  // {!! route('name') !!}
      /route\(['"]([^'"]+)['"]\s*(?:,\s*[^\)]+)?\)/g                  // route('name')
    ];

    const routeNames = new Set<string>();
    const routeLocations = new Map<string, Location[]>();

    // すべてのパターンでマッチング
    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const routeName = match[1];
        const lineNumber = content.substring(0, match.index).split('\n').length;

        routeNames.add(routeName);

        if (!routeLocations.has(routeName)) {
          routeLocations.set(routeName, []);
        }

        routeLocations.get(routeName)!.push({
          file: bladeFilePath,
          startLine: lineNumber,
          endLine: lineNumber,
          startColumn: match.index - content.lastIndexOf('\n', match.index) - 1,
          endColumn: match.index - content.lastIndexOf('\n', match.index) - 1 + match[0].length
        });
      }
    }

    if (routeNames.size === 0) {
      return;
    }

    // LaravelAnalyzerをインスタンス化
    const analyzer = new LaravelAnalyzer();

    // 各ルート名について依存関係を追加
    for (const routeName of routeNames) {
      try {
        // ルート名からコントローラー/メソッドを推測
        const inferred = analyzer.inferControllerFromRouteName(routeName);
        if (!inferred) {
          continue;
        }

        // コントローラーファイルを検索
        const controllerPath = await analyzer.findControllerFile(rootPath, inferred.controller);
        if (!controllerPath) {
          continue;
        }

        // メソッドの行番号を取得
        const lineNumber = await analyzer.findMethodLineInController(controllerPath, inferred.method);

        // 依存関係を追加
        fileDeps.push({
          from: bladeFilePath,
          to: controllerPath,
          type: DependencyType.FunctionCall,
          strength: DependencyStrength.Medium,
          locations: routeLocations.get(routeName) || [],
          references: [`${routeName} → ${inferred.controller}::${inferred.method}()`]
        });

        console.log(`[DependencyAnalyzer] Added Blade → Controller dependency: ${path.basename(bladeFilePath)} → ${path.basename(controllerPath)} (${routeName})`);
      } catch (error) {
        console.error(`[DependencyAnalyzer] Failed to analyze route ${routeName}:`, error);
      }
    }
  }

  /**
   * 依存関係グラフを構築
   */
  private buildGraph(
    fileDependencies: FileDependency[],
    allFiles: string[]
  ): DependencyGraph {
    const nodeMap = new Map<string, DependencyNode>();
    const edges: DependencyEdge[] = [];

    // 全ファイルをノードとして追加
    for (const file of allFiles) {
      nodeMap.set(file, {
        id: file,
        label: path.basename(file),
        type: 'file',
        filePath: file,
        incomingCount: 0,
        outgoingCount: 0,
        importance: 0
      });
    }

    // 依存関係からエッジを作成
    for (const dep of fileDependencies) {
      const fromNode = nodeMap.get(dep.from);
      const toNode = nodeMap.get(dep.to);

      if (fromNode && toNode) {
        fromNode.outgoingCount++;
        toNode.incomingCount++;

        edges.push({
          id: `${dep.from}->${dep.to}`,
          from: dep.from,
          to: dep.to,
          type: dep.type,
          strength: dep.strength,
          weight: 1,
          label: dep.type
        });
      }
    }

    // 重要度を計算（被依存数が多いほど重要）
    for (const node of nodeMap.values()) {
      node.importance = node.incomingCount + node.outgoingCount * 0.5;
    }

    const nodes = Array.from(nodeMap.values());

    // 統計情報を計算
    const sortedByIncoming = [...nodes].sort((a, b) => b.incomingCount - a.incomingCount);
    const sortedByOutgoing = [...nodes].sort((a, b) => b.outgoingCount - a.outgoingCount);

    return {
      nodes,
      edges,
      statistics: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        mostDepended: sortedByIncoming.slice(0, 10),
        mostDepending: sortedByOutgoing.slice(0, 10),
        circularDependencies: 0
      }
    };
  }

  /**
   * 循環依存を検出
   */
  private detectCircularDependencies(graph: DependencyGraph): CircularDependency[] {
    const circularDeps: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const edgeMap = new Map<string, DependencyEdge[]>();

    // エッジマップを構築
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.from)) {
        edgeMap.set(edge.from, []);
      }
      edgeMap.get(edge.from)!.push(edge);
    }

    // DFSで循環を検出
    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const edges = edgeMap.get(nodeId) || [];
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          dfs(edge.to, [...path]);
        } else if (recursionStack.has(edge.to)) {
          // 循環を検出
          const cycleStartIndex = path.indexOf(edge.to);
          const cyclePath = path.slice(cycleStartIndex);
          cyclePath.push(edge.to); // 循環を閉じる

          // 重要度を計算
          const severity = cyclePath.reduce((sum, nodeId) => {
            const node = graph.nodes.find(n => n.id === nodeId);
            return sum + (node?.importance || 0);
          }, 0);

          circularDeps.push({
            path: cyclePath,
            length: cyclePath.length - 1,
            severity,
            types: [edge.type]
          });
        }
      }

      recursionStack.delete(nodeId);
    };

    // 全ノードから検索開始
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    // 重複を除去（同じ循環の異なる開始点）
    const uniqueCircular = this.deduplicateCircular(circularDeps);

    return uniqueCircular;
  }

  /**
   * 循環依存の重複を除去
   */
  private deduplicateCircular(circularDeps: CircularDependency[]): CircularDependency[] {
    const seen = new Set<string>();
    const unique: CircularDependency[] = [];

    for (const dep of circularDeps) {
      // パスを正規化（最小の要素から開始するように回転）
      const normalized = this.normalizeCircularPath(dep.path);
      const key = normalized.join('->');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push({ ...dep, path: normalized });
      }
    }

    return unique;
  }

  /**
   * 循環パスを正規化
   */
  private normalizeCircularPath(path: string[]): string[] {
    if (path.length === 0) {
      return path;
    }

    // 辞書順で最小の要素を見つける
    const minElement = path.reduce((min, current) => current < min ? current : min);
    const minIndex = path.indexOf(minElement);
    return [...path.slice(minIndex), ...path.slice(0, minIndex)];
  }

  /**
   * ファイルパスを解決
   */
  private resolveFilePath(
    importPath: string,
    currentFile: string,
    rootPath: string
  ): string | null {
    // 相対パス
    if (importPath.startsWith('.')) {
      const dir = path.dirname(currentFile);
      let resolved = path.resolve(dir, importPath);

      // 拡張子を補完
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.php', '.blade.php'];
      if (!path.extname(resolved)) {
        for (const ext of extensions) {
          const withExt = resolved + ext;
          if (fs.existsSync(withExt)) {
            return withExt;
          }
        }
        // index.tsなどを試す
        for (const ext of extensions) {
          const indexFile = path.join(resolved, `index${ext}`);
          if (fs.existsSync(indexFile)) {
            return indexFile;
          }
        }
      }

      return fs.existsSync(resolved) ? resolved : null;
    }

    // 絶対パスまたはnode_modules
    // 簡易実装：node_modulesは無視
    return null;
  }

  /**
   * PHPクラス名をファイルパスに解決
   */
  private resolvePhpClassName(className: string, rootPath: string): string {
    // 簡易実装：PSR-4の一般的なマッピング
    // App\Services\MyService -> app/Services/MyService.php
    const relativePath = className.replace(/\\/g, '/').replace(/^App\//, 'app/');
    return path.join(rootPath, relativePath + '.php');
  }

  /**
   * ファイル一覧を収集
   */
  private async collectFiles(
    rootPath: string,
    options?: DependencyAnalysisOptions
  ): Promise<string[]> {
    const files: string[] = [];

    // Laravelプロジェクトかチェック
    const isLaravel = await this.isLaravelProject(rootPath);

    if (isLaravel) {
      // Laravelプロジェクトの場合は特定ディレクトリのみを走査
      console.log(`[DependencyAnalyzer] Laravel project detected. Scanning specific directories only.`);

      for (const targetDir of this.laravelTargetDirectories) {
        const fullTargetPath = path.join(rootPath, targetDir);

        if (fs.existsSync(fullTargetPath)) {
          console.log(`[DependencyAnalyzer] Scanning: ${targetDir}`);
          await this.walkDirectory(fullTargetPath, rootPath, files);
        }
      }
    } else {
      // 通常のプロジェクトの場合は全体を走査
      await this.walkDirectory(rootPath, rootPath, files);
    }

    return files;
  }

  /**
   * ディレクトリを再帰的に走査
   */
  private async walkDirectory(
    dir: string,
    rootPath: string,
    files: string[]
  ): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (this.shouldExclude(fullPath, rootPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, rootPath, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.php', '.ts', '.tsx', '.js', '.jsx', '.blade.php'].includes(ext) ||
              entry.name.endsWith('.blade.php')) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // ディレクトリアクセスエラーは無視
      console.error(`[DependencyAnalyzer] Failed to read directory: ${dir}`, error);
    }
  }

  /**
   * Laravelプロジェクトかどうかを判定
   */
  private async isLaravelProject(rootPath: string): Promise<boolean> {
    try {
      const composerPath = path.join(rootPath, 'composer.json');
      if (!fs.existsSync(composerPath)) {
        return false;
      }

      const composerContent = await fs.promises.readFile(composerPath, 'utf-8');
      const composer = JSON.parse(composerContent);

      return !!(
        composer.require?.['laravel/framework'] ||
        composer['require-dev']?.['laravel/framework']
      );
    } catch {
      return false;
    }
  }

  /**
   * 除外すべきかチェック
   */
  private shouldExclude(filePath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, filePath);

    for (const pattern of this.excludePatterns) {
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');

      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(relativePath)) {
        return true;
      }
    }

    return false;
  }
}
