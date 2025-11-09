/**
 * PHPコードパーサー
 */

import * as phpParser from 'php-parser';
import * as fs from 'fs';
import {
  ParsedFile,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  VariableInfo,
  UseStatement,
  NamespaceInfo,
  ParameterInfo,
  MethodInfo,
  PropertyInfo
} from '../types/parser';
import { Location } from '../types/common';

export class PhpParser {
  private parser: phpParser.Engine;

  constructor() {
    this.parser = new phpParser.Engine({
      parser: {
        extractDoc: true,
        php7: true
      },
      ast: {
        withPositions: true
      }
    });
  }

  /**
   * ファイルをパースする
   */
  async parseFile(filePath: string): Promise<ParsedFile> {
    try {
      const code = await fs.promises.readFile(filePath, 'utf-8');
      return this.parseCode(code, filePath);
    } catch (error) {
      throw new Error(`Failed to parse file ${filePath}: ${error}`);
    }
  }

  /**
   * コードをパースする
   */
  parseCode(code: string, filePath: string = ''): ParsedFile {
    const result: ParsedFile = {
      filePath,
      uses: [],
      classes: [],
      interfaces: [],
      functions: [],
      variables: [],
      errors: []
    };

    try {
      const ast = this.parser.parseCode(code, filePath || '');

      if (!ast || !ast.children) {
        return result;
      }

      // ASTを走査して情報を抽出
      this.traverseAST(ast.children, result, filePath);
    } catch (error: any) {
      result.errors.push({
        message: error.message || 'Parse error',
        line: error.lineNumber || 0,
        column: error.columnNumber || 0
      });
    }

    return result;
  }

  /**
   * ASTを走査して情報を抽出
   */
  private traverseAST(nodes: any[], result: ParsedFile, filePath: string): void {
    for (const node of nodes) {
      if (!node) continue;

      switch (node.kind) {
        case 'namespace':
          result.namespace = this.extractNamespace(node, filePath);
          if (node.children) {
            this.traverseAST(node.children, result, filePath);
          }
          break;

        case 'usegroup':
          result.uses.push(...this.extractUseStatements(node, filePath));
          break;

        case 'class':
          result.classes.push(this.extractClass(node, filePath));
          break;

        case 'interface':
          result.interfaces.push(this.extractInterface(node, filePath));
          break;

        case 'function':
          result.functions.push(this.extractFunction(node, filePath));
          break;

        case 'assign':
          // グローバル変数の抽出
          if (node.left && node.left.kind === 'variable') {
            result.variables.push(this.extractVariable(node.left, filePath, 'global'));
          }
          break;
      }

      // 子ノードを再帰的に処理
      if (node.children && Array.isArray(node.children)) {
        this.traverseAST(node.children, result, filePath);
      }
      if (node.body && Array.isArray(node.body)) {
        this.traverseAST(node.body, result, filePath);
      }
    }
  }

  /**
   * 名前空間を抽出
   */
  private extractNamespace(node: any, filePath: string): NamespaceInfo {
    return {
      name: node.name || '',
      location: this.getLocation(node, filePath)
    };
  }

  /**
   * use文を抽出
   */
  private extractUseStatements(node: any, filePath: string): UseStatement[] {
    const uses: UseStatement[] = [];

    if (node.items && Array.isArray(node.items)) {
      for (const item of node.items) {
        uses.push({
          name: item.name || '',
          alias: item.alias || undefined,
          type: node.type || 'class',
          location: this.getLocation(item, filePath)
        });
      }
    }

    return uses;
  }

  /**
   * クラスを抽出
   */
  private extractClass(node: any, filePath: string): ClassInfo {
    const properties: PropertyInfo[] = [];
    const methods: MethodInfo[] = [];
    const traits: string[] = [];

    if (node.body && Array.isArray(node.body)) {
      for (const member of node.body) {
        if (member.kind === 'propertystatement') {
          properties.push(...this.extractProperties(member, filePath));
        } else if (member.kind === 'method') {
          methods.push(this.extractMethod(member, filePath));
        } else if (member.kind === 'traituse') {
          if (member.traits) {
            traits.push(...member.traits.map((t: any) => t.name || ''));
          }
        }
      }
    }

    return {
      name: node.name?.name || node.name || '',
      extends: node.extends?.name || undefined,
      implements: node.implements?.map((i: any) => i.name || '') || [],
      properties,
      methods,
      location: this.getLocation(node, filePath),
      namespace: undefined, // 後で設定
      docBlock: node.leadingComments?.[0]?.value || undefined,
      isAbstract: node.isAbstract || false,
      isFinal: node.isFinal || false,
      traits
    };
  }

  /**
   * インターフェースを抽出
   */
  private extractInterface(node: any, filePath: string): InterfaceInfo {
    const methods: MethodInfo[] = [];

    if (node.body && Array.isArray(node.body)) {
      for (const member of node.body) {
        if (member.kind === 'method') {
          methods.push(this.extractMethod(member, filePath));
        }
      }
    }

    return {
      name: node.name?.name || node.name || '',
      extends: node.extends?.map((i: any) => i.name || '') || [],
      methods,
      location: this.getLocation(node, filePath),
      namespace: undefined,
      docBlock: node.leadingComments?.[0]?.value || undefined
    };
  }

  /**
   * 関数を抽出
   */
  private extractFunction(node: any, filePath: string): FunctionInfo {
    return {
      name: node.name?.name || node.name || '',
      params: this.extractParameters(node.arguments || []),
      returnType: node.type?.name || undefined,
      location: this.getLocation(node, filePath),
      docBlock: node.leadingComments?.[0]?.value || undefined,
      namespace: undefined,
      isStatic: node.isStatic || false,
      isAbstract: node.isAbstract || false
    };
  }

  /**
   * メソッドを抽出
   */
  private extractMethod(node: any, filePath: string): MethodInfo {
    return {
      name: node.name?.name || node.name || '',
      params: this.extractParameters(node.arguments || []),
      returnType: node.type?.name || undefined,
      location: this.getLocation(node, filePath),
      visibility: node.visibility || 'public',
      docBlock: node.leadingComments?.[0]?.value || undefined,
      isStatic: node.isStatic || false,
      isAbstract: node.isAbstract || false,
      isFinal: node.isFinal || false
    };
  }

  /**
   * プロパティを抽出
   */
  private extractProperties(node: any, filePath: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    if (node.properties && Array.isArray(node.properties)) {
      for (const prop of node.properties) {
        properties.push({
          name: prop.name?.name || prop.name || '',
          type: node.type?.name || undefined,
          defaultValue: prop.value ? this.nodeToString(prop.value) : undefined,
          location: this.getLocation(prop, filePath),
          visibility: node.visibility || 'public',
          isStatic: node.isStatic || false,
          docBlock: node.leadingComments?.[0]?.value || undefined
        });
      }
    }

    return properties;
  }

  /**
   * パラメータを抽出
   */
  private extractParameters(args: any[]): ParameterInfo[] {
    return args.map(arg => ({
      name: arg.name?.name || arg.name || '',
      type: arg.type?.name || undefined,
      defaultValue: arg.value ? this.nodeToString(arg.value) : undefined,
      isVariadic: arg.variadic || false,
      isReference: arg.byref || false,
      isNullable: arg.nullable || false
    }));
  }

  /**
   * 変数を抽出
   */
  private extractVariable(node: any, filePath: string, scope: string): VariableInfo {
    return {
      name: node.name || '',
      type: undefined,
      location: this.getLocation(node, filePath),
      scope: scope as any
    };
  }

  /**
   * 位置情報を取得
   */
  private getLocation(node: any, filePath: string): Location {
    return {
      file: filePath,
      startLine: node.loc?.start?.line || 0,
      endLine: node.loc?.end?.line || 0,
      startColumn: node.loc?.start?.column || 0,
      endColumn: node.loc?.end?.column || 0
    };
  }

  /**
   * ノードを文字列に変換
   */
  private nodeToString(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (node.kind === 'string') return node.value || '';
    if (node.kind === 'number') return String(node.value || '');
    if (node.kind === 'boolean') return String(node.value || false);
    if (node.kind === 'array') return 'array';
    return '';
  }

  /**
   * 関数呼び出しを抽出
   */
  extractFunctionCalls(ast: any): Array<{ name: string; location: Location }> {
    const calls: Array<{ name: string; location: Location }> = [];
    this.traverseForCalls(ast, calls, '');
    return calls;
  }

  /**
   * 関数呼び出しを探して走査
   */
  private traverseForCalls(node: any, calls: Array<{ name: string; location: Location }>, filePath: string): void {
    if (!node) return;

    if (node.kind === 'call') {
      const name = this.getCallName(node.what);
      if (name) {
        calls.push({
          name,
          location: this.getLocation(node, filePath)
        });
      }
    }

    // 子ノードを再帰的に処理
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if (Array.isArray(node[key])) {
          for (const child of node[key]) {
            this.traverseForCalls(child, calls, filePath);
          }
        } else {
          this.traverseForCalls(node[key], calls, filePath);
        }
      }
    }
  }

  /**
   * 関数呼び出しの名前を取得
   */
  private getCallName(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.kind === 'name') return node.name || '';
    if (node.kind === 'identifier') return node.name || '';
    if (node.kind === 'propertylookup' && node.offset) {
      return node.offset.name || '';
    }
    return '';
  }
}
