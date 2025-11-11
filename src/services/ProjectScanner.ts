/**
 * Project Scanner
 * プロジェクト全体をスキャンしてファイル構造を取得
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileInfo, DirectoryInfo, ProjectStructure, FileFilter, FileStatistics } from '../types/project';

export class ProjectScanner {
  private excludePatterns: string[] = [
    '**/node_modules/**',
    '**/vendor/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.min.css'
  ];

  /**
   * プロジェクト構造をスキャン
   */
  async scanProject(rootPath: string): Promise<ProjectStructure> {
    const projectName = path.basename(rootPath);
    const root = await this.scanDirectory(rootPath, rootPath);

    const stats = this.calculateStatistics(root);

    return {
      name: projectName,
      rootPath,
      root,
      languageStats: stats.languageStats,
      totalFiles: stats.totalFiles,
      totalLines: stats.totalLines,
      totalSize: stats.totalSize
    };
  }

  /**
   * ディレクトリをスキャン
   */
  private async scanDirectory(dirPath: string, rootPath: string): Promise<DirectoryInfo> {
    const relativePath = path.relative(rootPath, dirPath);
    const dirName = path.basename(dirPath);

    const files: FileInfo[] = [];
    const directories: DirectoryInfo[] = [];

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // 除外パターンにマッチするかチェック
        if (this.shouldExclude(fullPath, rootPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          const subDir = await this.scanDirectory(fullPath, rootPath);
          directories.push(subDir);
        } else if (entry.isFile()) {
          const fileInfo = await this.scanFile(fullPath, rootPath);
          if (fileInfo) {
            files.push(fileInfo);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory: ${dirPath}`, error);
    }

    // 統計情報を計算
    let totalFiles = files.length;
    let totalLines = files.reduce((sum, file) => sum + file.lines, 0);

    directories.forEach(dir => {
      totalFiles += dir.totalFiles || 0;
      totalLines += dir.totalLines || 0;
    });

    return {
      name: dirName,
      path: dirPath,
      relativePath: relativePath || '.',
      files,
      directories,
      totalFiles,
      totalLines
    };
  }

  /**
   * ファイルをスキャン
   */
  private async scanFile(filePath: string, rootPath: string): Promise<FileInfo | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const fileName = path.basename(filePath);

      // ファイルを読み込んで行数をカウント
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;

      // 言語IDを判定
      const languageId = this.detectLanguageId(filePath);

      return {
        name: fileName,
        path: filePath,
        relativePath,
        size: stats.size,
        lines,
        languageId,
        lastModified: stats.mtime
      };
    } catch (error) {
      console.error(`Failed to scan file: ${filePath}`, error);
      return null;
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

  /**
   * 言語IDを検出
   */
  private detectLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      '.php': 'php',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascriptreact',
      '.tsx': 'typescriptreact',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.json': 'json',
      '.md': 'markdown',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rb': 'ruby',
      '.rs': 'rust',
      '.sql': 'sql',
      '.sh': 'shellscript',
      '.bat': 'bat',
      '.ps1': 'powershell',
      '.vue': 'vue'
    };

    // .blade.php のチェック
    if (filePath.endsWith('.blade.php')) {
      return 'blade';
    }

    return languageMap[ext] || 'plaintext';
  }

  /**
   * 統計情報を計算
   */
  private calculateStatistics(root: DirectoryInfo): {
    languageStats: Record<string, number>;
    totalFiles: number;
    totalLines: number;
    totalSize: number;
  } {
    const languageStats: Record<string, number> = {};
    let totalFiles = 0;
    let totalLines = 0;
    let totalSize = 0;

    const processDirectory = (dir: DirectoryInfo) => {
      dir.files.forEach(file => {
        totalFiles++;
        totalLines += file.lines;
        totalSize += file.size;

        if (languageStats[file.languageId]) {
          languageStats[file.languageId]++;
        } else {
          languageStats[file.languageId] = 1;
        }
      });

      dir.directories.forEach(subDir => processDirectory(subDir));
    };

    processDirectory(root);

    return { languageStats, totalFiles, totalLines, totalSize };
  }

  /**
   * ファイルをフィルタリング
   */
  filterFiles(structure: ProjectStructure, filter: FileFilter): FileInfo[] {
    const allFiles = this.collectAllFiles(structure.root);

    return allFiles.filter(file => {
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
    });
  }

  /**
   * 全ファイルを収集
   */
  private collectAllFiles(dir: DirectoryInfo): FileInfo[] {
    let files: FileInfo[] = [...dir.files];

    dir.directories.forEach(subDir => {
      files = files.concat(this.collectAllFiles(subDir));
    });

    return files;
  }

  /**
   * ファイル統計を生成
   */
  generateStatistics(structure: ProjectStructure): FileStatistics {
    const allFiles = this.collectAllFiles(structure.root);

    // 言語別統計
    const languageMap = new Map<string, { fileCount: number; totalLines: number; totalSize: number }>();
    allFiles.forEach(file => {
      const stats = languageMap.get(file.languageId) || { fileCount: 0, totalLines: 0, totalSize: 0 };
      stats.fileCount++;
      stats.totalLines += file.lines;
      stats.totalSize += file.size;
      languageMap.set(file.languageId, stats);
    });

    const byLanguage = Array.from(languageMap.entries()).map(([languageId, stats]) => ({
      languageId,
      ...stats
    })).sort((a, b) => b.fileCount - a.fileCount);

    // ディレクトリ別統計
    const directoryMap = new Map<string, { fileCount: number; totalLines: number }>();
    allFiles.forEach(file => {
      const dir = path.dirname(file.relativePath);
      const stats = directoryMap.get(dir) || { fileCount: 0, totalLines: 0 };
      stats.fileCount++;
      stats.totalLines += file.lines;
      directoryMap.set(dir, stats);
    });

    const byDirectory = Array.from(directoryMap.entries()).map(([directory, stats]) => ({
      directory,
      ...stats
    })).sort((a, b) => b.fileCount - a.fileCount).slice(0, 10);

    // 最大ファイル
    const largestFiles = allFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(file => ({
        path: file.relativePath,
        size: file.size,
        lines: file.lines
      }));

    // 最も重要なファイル（参照数が多いファイル）
    const mostImportantFiles = allFiles
      .filter(file => file.importance !== undefined)
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 10)
      .map(file => ({
        path: file.relativePath,
        referenceCount: file.importance || 0
      }));

    return {
      byLanguage,
      byDirectory,
      largestFiles,
      mostImportantFiles
    };
  }
}
