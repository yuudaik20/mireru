/**
 * 関数分類システム
 * 検出された関数を4つのカテゴリに分類する
 */

import * as fs from 'fs';
import * as path from 'path';
import { FunctionCall, FunctionType } from '../types/common';
import * as vscode from 'vscode';

export class FunctionClassifier {
  private phpBuiltinFunctions: Set<string>;
  private laravelFunctions: Set<string>;
  private laravelMethods: Map<string, Set<string>>; // Facade -> methods
  private userDefinedFunctions: Set<string>;
  private initialized: boolean = false;

  constructor() {
    this.phpBuiltinFunctions = new Set();
    this.laravelFunctions = new Set();
    this.laravelMethods = new Map();
    this.userDefinedFunctions = new Set();
  }

  /**
   * 初期化（データファイルを読み込み）
   */
  async initialize(extensionPath: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // PHP標準関数を読み込み
      const phpFunctionsPath = path.join(extensionPath, 'data', 'php-functions.json');
      const phpFunctionsData = JSON.parse(
        await fs.promises.readFile(phpFunctionsPath, 'utf-8')
      );

      // 全カテゴリの関数を統合
      for (const category in phpFunctionsData.categories) {
        const functions = phpFunctionsData.categories[category];
        functions.forEach((func: string) => this.phpBuiltinFunctions.add(func));
      }

      // Laravel関数を読み込み
      const laravelFunctionsPath = path.join(extensionPath, 'data', 'laravel-functions.json');
      const laravelFunctionsData = JSON.parse(
        await fs.promises.readFile(laravelFunctionsPath, 'utf-8')
      );

      // Laravelヘルパー関数
      if (laravelFunctionsData.categories.helpers?.functions) {
        laravelFunctionsData.categories.helpers.functions.forEach((func: string) => {
          this.laravelFunctions.add(func);
        });
      }

      // Eloquentメソッド
      if (laravelFunctionsData.categories.eloquent?.methods) {
        laravelFunctionsData.categories.eloquent.methods.forEach((method: string) => {
          this.laravelFunctions.add(method);
        });
      }

      // Collectionメソッド
      if (laravelFunctionsData.categories.collection?.methods) {
        laravelFunctionsData.categories.collection.methods.forEach((method: string) => {
          this.laravelFunctions.add(method);
        });
      }

      // Facadeメソッド
      if (laravelFunctionsData.categories.facades?.facades) {
        const facades = laravelFunctionsData.categories.facades.facades;
        for (const facade in facades) {
          const methods = new Set<string>(facades[facade]);
          this.laravelMethods.set(facade, methods);

          // Facadeメソッドも全体に追加
          facades[facade].forEach((method: string) => {
            this.laravelFunctions.add(method);
          });
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize FunctionClassifier:', error);
      this.initialized = false;
    }
  }

  /**
   * 関数を分類
   */
  classify(functionCall: FunctionCall, document: vscode.TextDocument): FunctionType {
    const functionName = functionCall.name;
    const namespace = functionCall.namespace;

    // 1. PHP標準関数をチェック
    if (this.isPhpBuiltin(functionName)) {
      return FunctionType.PhpBuiltin;
    }

    // 2. Laravelフレームワーク関数をチェック
    if (this.isLaravelFunction(functionName, namespace)) {
      return FunctionType.Framework;
    }

    // 3. ユーザー定義関数をチェック（簡易版）
    // 将来的にはプロジェクト全体をスキャンして判定
    if (this.isUserDefined(functionName, document)) {
      return FunctionType.UserDefined;
    }

    // 4. vendor内の関数（サードパーティライブラリ）
    // 簡易判定: 名前空間がある、または大文字で始まるクラス名
    if (namespace || /^[A-Z]/.test(functionName)) {
      return FunctionType.Library;
    }

    // デフォルトはUnknown
    return FunctionType.Unknown;
  }

  /**
   * 複数の関数呼び出しを一括分類
   */
  classifyBatch(
    functionCalls: FunctionCall[],
    document: vscode.TextDocument
  ): FunctionCall[] {
    return functionCalls.map(func => ({
      ...func,
      type: this.classify(func, document)
    }));
  }

  /**
   * PHP標準関数かどうかをチェック
   */
  private isPhpBuiltin(name: string): boolean {
    return this.phpBuiltinFunctions.has(name);
  }

  /**
   * Laravel関数かどうかをチェック
   */
  private isLaravelFunction(name: string, namespace?: string): boolean {
    // 直接的なヘルパー関数
    if (this.laravelFunctions.has(name)) {
      return true;
    }

    // Facadeメソッド
    if (namespace) {
      // 名前空間からFacade名を抽出
      const facadeName = namespace.split('\\').pop() || namespace;
      const methods = this.laravelMethods.get(facadeName);
      if (methods && methods.has(name)) {
        return true;
      }
    }

    // Eloquentモデルのメソッドかチェック
    // （簡易版: よく使われるメソッド名）
    const eloquentMethods = ['find', 'where', 'create', 'update', 'delete', 'save'];
    if (eloquentMethods.includes(name)) {
      return true;
    }

    return false;
  }

  /**
   * ユーザー定義関数かどうかをチェック（簡易版）
   */
  private isUserDefined(name: string, document: vscode.TextDocument): boolean {
    // 現在のドキュメント内で定義されているかチェック
    const text = document.getText();
    const functionDefPattern = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
    const methodDefPattern = new RegExp(`(public|private|protected)\\s+function\\s+${name}\\s*\\(`, 'g');

    return functionDefPattern.test(text) || methodDefPattern.test(text);
  }

  /**
   * ユーザー定義関数のキャッシュを更新
   */
  updateUserDefinedFunctions(projectPath: string, functions: string[]): void {
    this.userDefinedFunctions = new Set(functions);
  }

  /**
   * 初期化済みかどうかをチェック
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
