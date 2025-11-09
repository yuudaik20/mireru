/**
 * 関数デコレーター
 * 検出・分類された関数にデコレーションを適用
 */

import * as vscode from 'vscode';
import { FunctionDetector } from '../analyzer/FunctionDetector';
import { FunctionClassifier } from '../analyzer/FunctionClassifier';
import { DecorationStyles } from './DecorationStyles';
import { FunctionCall, FunctionType } from '../types/common';

export class FunctionDecorator {
  private detector: FunctionDetector;
  private classifier: FunctionClassifier;
  private styles: DecorationStyles;
  private decorationCache: Map<string, Map<FunctionType, vscode.Range[]>>;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 500; // ミリ秒

  constructor(
    detector: FunctionDetector,
    classifier: FunctionClassifier,
    styles: DecorationStyles
  ) {
    this.detector = detector;
    this.classifier = classifier;
    this.styles = styles;
    this.decorationCache = new Map();
  }

  /**
   * エディタにデコレーションを適用
   */
  applyDecorations(editor: vscode.TextEditor): void {
    // デバウンス処理
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.applyDecorationsImmediate(editor);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * 即座にデコレーションを適用（デバウンスなし）
   */
  private applyDecorationsImmediate(editor: vscode.TextEditor): void {
    const document = editor.document;

    // PHPファイルでない場合はスキップ
    if (document.languageId !== 'php') {
      return;
    }

    // 分類器が初期化されていない場合はスキップ
    if (!this.classifier.isInitialized()) {
      console.warn('FunctionClassifier is not initialized yet');
      return;
    }

    // 可視範囲のみを処理（パフォーマンス最適化）
    const visibleRanges = editor.visibleRanges;
    if (visibleRanges.length === 0) {
      return;
    }

    // 可視範囲内の関数を検出
    const allFunctions: FunctionCall[] = [];
    for (const range of visibleRanges) {
      const functions = this.detector.detectFunctionsInRange(document, range);
      allFunctions.push(...functions);
    }

    // 関数を分類
    const classifiedFunctions = this.classifier.classifyBatch(allFunctions, document);

    // 関数タイプごとにグループ化
    const functionsByType = this.groupByType(classifiedFunctions);

    // 各タイプのデコレーションを適用
    for (const [type, functions] of functionsByType.entries()) {
      const decorationType = this.styles.getDecorationType(type);
      if (!decorationType) {
        continue;
      }

      // Rangeとホバーメッセージを作成
      const decorations: vscode.DecorationOptions[] = functions.map(func => ({
        range: this.detector.toRange(func.location),
        hoverMessage: this.styles.createHoverMessage(
          func.type,
          func.name,
          func.location.file
        )
      }));

      // デコレーションを設定
      editor.setDecorations(decorationType, decorations);
    }

    // 使用されなかったデコレーションタイプをクリア
    this.clearUnusedDecorations(editor, functionsByType.keys());
  }

  /**
   * 関数をタイプごとにグループ化
   */
  private groupByType(functions: FunctionCall[]): Map<FunctionType, FunctionCall[]> {
    const grouped = new Map<FunctionType, FunctionCall[]>();

    for (const func of functions) {
      if (func.type === FunctionType.Unknown) {
        continue; // Unknownは装飾しない
      }

      if (!grouped.has(func.type)) {
        grouped.set(func.type, []);
      }
      grouped.get(func.type)!.push(func);
    }

    return grouped;
  }

  /**
   * 使用されていないデコレーションをクリア
   */
  private clearUnusedDecorations(
    editor: vscode.TextEditor,
    usedTypes: Iterable<FunctionType>
  ): void {
    const usedTypesSet = new Set(usedTypes);
    const allTypes = [
      FunctionType.PhpBuiltin,
      FunctionType.Framework,
      FunctionType.UserDefined,
      FunctionType.Library
    ];

    for (const type of allTypes) {
      if (!usedTypesSet.has(type)) {
        const decorationType = this.styles.getDecorationType(type);
        if (decorationType) {
          editor.setDecorations(decorationType, []);
        }
      }
    }
  }

  /**
   * 全てのデコレーションをクリア
   */
  clearAllDecorations(editor: vscode.TextEditor): void {
    const allTypes = [
      FunctionType.PhpBuiltin,
      FunctionType.Framework,
      FunctionType.UserDefined,
      FunctionType.Library
    ];

    for (const type of allTypes) {
      const decorationType = this.styles.getDecorationType(type);
      if (decorationType) {
        editor.setDecorations(decorationType, []);
      }
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.decorationCache.clear();
  }

  /**
   * デバウンスタイマーをクリア
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.decorationCache.clear();
  }
}
