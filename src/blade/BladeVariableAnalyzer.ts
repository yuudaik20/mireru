/**
 * Blade Variable Context Analyzer
 * Bladeテンプレート内の変数のコンテキストを推測する
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface VariableContext {
  variable: string;
  type: 'model' | 'collection' | 'property' | 'unknown';
  modelName?: string;
  propertyChain?: string[];
  description: string;
  possibleValues?: string[];
}

export class BladeVariableAnalyzer {
  /**
   * Blade変数を解析してコンテキストを取得
   */
  analyzeVariable(
    variableExpression: string,
    documentText: string,
    filePath: string
  ): VariableContext {
    // {{ $row->category->name }} のような表現から変数とプロパティチェーンを抽出
    const cleanExpr = variableExpression.trim().replace(/\{\{|\}\}/g, '').trim();

    // プロパティチェーンを分解
    const chain = this.extractPropertyChain(cleanExpr);

    if (chain.length === 0) {
      return {
        variable: variableExpression,
        type: 'unknown',
        description: '変数を解析できませんでした'
      };
    }

    const rootVariable = chain[0];
    const properties = chain.slice(1);

    // コントローラーからのコンテキストを推測
    const context = this.inferContext(rootVariable, properties, documentText, filePath);

    return context;
  }

  /**
   * プロパティチェーンを抽出
   * 例: "$row->category->name" => ["$row", "category", "name"]
   */
  private extractPropertyChain(expression: string): string[] {
    // -> または . で分割
    const parts = expression.split(/->|\./).map(p => p.trim());
    return parts.filter(p => p.length > 0);
  }

  /**
   * 変数のコンテキストを推測
   */
  private inferContext(
    rootVar: string,
    properties: string[],
    documentText: string,
    filePath: string
  ): VariableContext {
    // @foreachなどのループコンテキストを検索
    const loopContext = this.findLoopContext(rootVar, documentText);

    if (loopContext) {
      return this.buildContextFromLoop(rootVar, properties, loopContext);
    }

    // コントローラーから推測
    const controllerContext = this.inferFromFilePath(rootVar, properties, filePath);

    if (controllerContext) {
      return controllerContext;
    }

    // 一般的なLaravelの変数パターン
    return this.inferFromCommonPatterns(rootVar, properties);
  }

  /**
   * @foreachなどのループコンテキストを検索
   */
  private findLoopContext(variable: string, documentText: string): string | null {
    // @foreach($rows as $row) のようなパターンを検索
    const foreachPattern = new RegExp(
      `@foreach\\s*\\(\\s*\\$([\\w]+)\\s+as\\s+\\${variable.replace('$', '')}\\s*\\)`,
      'i'
    );

    const match = documentText.match(foreachPattern);
    if (match) {
      return match[1]; // $rowsの"rows"部分
    }

    // @forelse も対応
    const forelsePattern = new RegExp(
      `@forelse\\s*\\(\\s*\\$([\\w]+)\\s+as\\s+\\${variable.replace('$', '')}\\s*\\)`,
      'i'
    );

    const forelseMatch = documentText.match(forelsePattern);
    if (forelseMatch) {
      return forelseMatch[1];
    }

    return null;
  }

  /**
   * ループコンテキストから変数情報を構築
   */
  private buildContextFromLoop(
    rootVar: string,
    properties: string[],
    collectionName: string
  ): VariableContext {
    // "rows" から "Row" モデルを推測
    const modelName = this.singularizeAndCapitalize(collectionName);

    let description = `ループ変数 ${rootVar}`;

    if (properties.length > 0) {
      description += `\n\n**プロパティチェーン**: ${rootVar}`;
      properties.forEach((prop, index) => {
        description += ` → ${prop}`;

        if (index === 0) {
          // 最初のプロパティはリレーション or カラム
          description += this.describeProperty(modelName, prop);
        }
      });
    } else {
      description += `\n\n${modelName}モデルのインスタンスです。`;
      description += `\n\n**利用可能なプロパティ**: id, created_at, updated_at など`;
    }

    return {
      variable: rootVar,
      type: 'model',
      modelName,
      propertyChain: properties,
      description
    };
  }

  /**
   * ファイルパスからコンテキストを推測
   */
  private inferFromFilePath(
    rootVar: string,
    properties: string[],
    filePath: string
  ): VariableContext | null {
    // resources/views/users/index.blade.php -> User モデル
    const viewPath = filePath.toLowerCase();

    if (viewPath.includes('/views/')) {
      const pathParts = viewPath.split('/views/')[1].split('/');
      if (pathParts.length > 0) {
        const resourceName = pathParts[0];
        const modelName = this.singularizeAndCapitalize(resourceName);

        // $user, $users などの変数名がリソース名と一致するか確認
        if (rootVar.toLowerCase().includes(resourceName.toLowerCase().slice(0, -1))) {
          let description = `${modelName}モデルのインスタンス`;

          if (properties.length > 0) {
            description += `\n\n**アクセスしているプロパティ**: ${properties.join(' → ')}`;
          }

          return {
            variable: rootVar,
            type: 'model',
            modelName,
            propertyChain: properties,
            description
          };
        }
      }
    }

    return null;
  }

  /**
   * 一般的なパターンから推測
   */
  private inferFromCommonPatterns(
    rootVar: string,
    properties: string[]
  ): VariableContext {
    const varName = rootVar.replace('$', '').toLowerCase();

    // 一般的なLaravelの変数名
    const commonPatterns: { [key: string]: string } = {
      'user': 'Userモデル - 認証されたユーザー',
      'auth': '認証情報',
      'request': 'HTTPリクエスト情報',
      'errors': 'バリデーションエラー',
      'old': '前回の入力値',
      'session': 'セッションデータ',
      'config': '設定値',
      'route': 'ルート情報',
      'app': 'アプリケーションコンテナ'
    };

    let description = commonPatterns[varName] || '変数';

    if (properties.length > 0) {
      description += `\n\n**プロパティ**: ${properties.join(' → ')}`;
    }

    return {
      variable: rootVar,
      type: varName in commonPatterns ? 'property' : 'unknown',
      propertyChain: properties,
      description,
      possibleValues: this.suggestPossibleValues(varName, properties)
    };
  }

  /**
   * プロパティの説明を生成
   */
  private describeProperty(modelName: string, property: string): string {
    // Eloquentリレーションの可能性
    if (this.isLikelyRelation(property)) {
      return ` (${this.singularizeAndCapitalize(property)}モデルへのリレーション)`;
    }

    // 一般的なカラム名
    const commonColumns: { [key: string]: string } = {
      'id': ' (ID)',
      'name': ' (名前)',
      'title': ' (タイトル)',
      'description': ' (説明)',
      'created_at': ' (作成日時)',
      'updated_at': ' (更新日時)',
      'deleted_at': ' (削除日時)',
      'email': ' (メールアドレス)',
      'password': ' (パスワード)',
      'status': ' (ステータス)',
      'type': ' (タイプ)',
      'category': ' (カテゴリー)'
    };

    return commonColumns[property.toLowerCase()] || '';
  }

  /**
   * Eloquentリレーションっぽいかチェック
   */
  private isLikelyRelation(property: string): boolean {
    // 複数形や明らかなリレーション名
    return property.endsWith('s') ||
           property.includes('_') ||
           /[A-Z]/.test(property); // camelCase
  }

  /**
   * 単数形にして先頭を大文字に
   */
  private singularizeAndCapitalize(word: string): string {
    // 簡易的な単数形化
    let singular = word;

    if (word.endsWith('ies')) {
      singular = word.slice(0, -3) + 'y';
    } else if (word.endsWith('es')) {
      singular = word.slice(0, -2);
    } else if (word.endsWith('s')) {
      singular = word.slice(0, -1);
    }

    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }

  /**
   * 可能な値を提案
   */
  private suggestPossibleValues(varName: string, properties: string[]): string[] | undefined {
    if (varName === 'errors' && properties.length > 0) {
      return ['フィールドのエラーメッセージ'];
    }

    if (varName === 'old' && properties.length > 0) {
      return ['前回入力された値'];
    }

    return undefined;
  }
}
