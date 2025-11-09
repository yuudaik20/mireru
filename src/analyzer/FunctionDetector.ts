/**
 * 関数検出システム
 * PHPコード内の全ての関数呼び出しを検出する
 */

import * as vscode from 'vscode';
import { FunctionCall, FunctionType, Location } from '../types/common';

export class FunctionDetector {
  /**
   * ドキュメント内の全ての関数呼び出しを検出
   */
  detectFunctions(document: vscode.TextDocument): FunctionCall[] {
    const text = document.getText();
    const functionCalls: FunctionCall[] = [];

    // PHP関数呼び出しのパターン
    // 1. 通常の関数呼び出し: function_name(...)
    // 2. メソッド呼び出し: $obj->method(...)
    // 3. 静的メソッド: Class::method(...)
    // 4. 名前空間付き: \Namespace\function(...)

    // パターン1: 通常の関数呼び出し
    const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;

    while ((match = functionPattern.exec(text)) !== null) {
      const functionName = match[1];
      const startOffset = match.index;
      const endOffset = match.index + functionName.length;

      // PHPキーワードを除外
      if (this.isPhpKeyword(functionName)) {
        continue;
      }

      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);

      functionCalls.push({
        name: functionName,
        type: FunctionType.Unknown,
        location: {
          file: document.fileName,
          startLine: startPos.line,
          endLine: endPos.line,
          startColumn: startPos.character,
          endColumn: endPos.character
        }
      });
    }

    // パターン2: メソッド呼び出し
    const methodPattern = /\$[a-zA-Z_][a-zA-Z0-9_]*\s*->\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    while ((match = methodPattern.exec(text)) !== null) {
      const methodName = match[1];
      const startOffset = text.indexOf(methodName, match.index);
      const endOffset = startOffset + methodName.length;

      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);

      functionCalls.push({
        name: methodName,
        type: FunctionType.Unknown,
        location: {
          file: document.fileName,
          startLine: startPos.line,
          endLine: endPos.line,
          startColumn: startPos.character,
          endColumn: endPos.character
        }
      });
    }

    // パターン3: 静的メソッド呼び出し
    const staticMethodPattern = /([a-zA-Z_][a-zA-Z0-9_\\]*)::\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    while ((match = staticMethodPattern.exec(text)) !== null) {
      const className = match[1];
      const methodName = match[2];
      const startOffset = text.indexOf(methodName, match.index);
      const endOffset = startOffset + methodName.length;

      const startPos = document.positionAt(startOffset);
      const endPos = document.positionAt(endOffset);

      // クラス名も保存
      functionCalls.push({
        name: methodName,
        type: FunctionType.Unknown,
        location: {
          file: document.fileName,
          startLine: startPos.line,
          endLine: endPos.line,
          startColumn: startPos.character,
          endColumn: endPos.character
        },
        namespace: className
      });
    }

    return functionCalls;
  }

  /**
   * 特定の範囲内の関数呼び出しを検出
   */
  detectFunctionsInRange(
    document: vscode.TextDocument,
    range: vscode.Range
  ): FunctionCall[] {
    const allFunctions = this.detectFunctions(document);
    return allFunctions.filter(func => {
      const funcRange = new vscode.Range(
        func.location.startLine,
        func.location.startColumn,
        func.location.endLine,
        func.location.endColumn
      );
      return range.contains(funcRange);
    });
  }

  /**
   * PHPキーワードかどうかをチェック
   */
  private isPhpKeyword(name: string): boolean {
    const keywords = [
      'if', 'else', 'elseif', 'endif',
      'for', 'foreach', 'endfor', 'endforeach',
      'while', 'endwhile', 'do',
      'switch', 'case', 'default', 'endswitch',
      'function', 'return',
      'class', 'interface', 'trait', 'extends', 'implements',
      'public', 'private', 'protected', 'static', 'final', 'abstract',
      'new', 'clone', 'instanceof',
      'try', 'catch', 'finally', 'throw',
      'namespace', 'use', 'as',
      'require', 'require_once', 'include', 'include_once',
      'echo', 'print', 'exit', 'die', 'eval',
      'isset', 'empty', 'unset',
      'array', 'list',
      'const', 'var',
      'and', 'or', 'xor', 'not',
      'true', 'false', 'null'
    ];
    return keywords.includes(name.toLowerCase());
  }

  /**
   * 関数呼び出しをVS Code Rangeに変換
   */
  toRange(location: Location): vscode.Range {
    return new vscode.Range(
      location.startLine,
      location.startColumn,
      location.endLine,
      location.endColumn
    );
  }
}
