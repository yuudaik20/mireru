/**
 * Laravel関連の型定義
 */

import { Location } from './common';

/**
 * ルート情報
 */
export interface RouteInfo {
  /** HTTPメソッド */
  method: string;
  /** URI */
  uri: string;
  /** コントローラー */
  controller?: string;
  /** アクション */
  action?: string;
  /** ミドルウェア */
  middleware: string[];
  /** ルート名 */
  name?: string;
  /** 位置情報 */
  location: Location;
  /** グループ情報 */
  group?: {
    /** プレフィックス */
    prefix?: string;
    /** ミドルウェア */
    middleware?: string[];
    /** 名前空間 */
    namespace?: string;
  };
}

/**
 * Eloquentリレーション情報
 */
export interface EloquentRelation {
  /** リレーション名 */
  name: string;
  /** リレーション種別 */
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany' | 'hasManyThrough' | 'morphTo' | 'morphMany' | 'morphToMany';
  /** 関連モデル */
  relatedModel: string;
  /** 外部キー */
  foreignKey?: string;
  /** ローカルキー */
  localKey?: string;
  /** ピボットテーブル（belongsToMany の場合） */
  pivotTable?: string;
  /** 位置情報 */
  location: Location;
}

/**
 * Eloquentモデル情報
 */
export interface EloquentModel {
  /** モデル名 */
  name: string;
  /** テーブル名 */
  table?: string;
  /** 主キー */
  primaryKey?: string;
  /** タイムスタンプ使用 */
  timestamps?: boolean;
  /** ソフトデリート使用 */
  softDeletes?: boolean;
  /** Fillable属性 */
  fillable?: string[];
  /** Guarded属性 */
  guarded?: string[];
  /** Casts */
  casts?: Record<string, string>;
  /** リレーション */
  relations: EloquentRelation[];
  /** 位置情報 */
  location: Location;
  /** 名前空間 */
  namespace?: string;
}

/**
 * コントローラー情報
 */
export interface ControllerInfo {
  /** コントローラー名 */
  name: string;
  /** アクション一覧 */
  actions: Array<{
    /** アクション名 */
    name: string;
    /** HTTPメソッド */
    httpMethods?: string[];
    /** 対応するルート */
    routes?: RouteInfo[];
    /** 位置情報 */
    location: Location;
  }>;
  /** 使用しているモデル */
  usedModels?: string[];
  /** 位置情報 */
  location: Location;
  /** 名前空間 */
  namespace?: string;
  /** リソースコントローラーか */
  isResourceController?: boolean;
}

/**
 * ミドルウェア情報
 */
export interface MiddlewareInfo {
  /** ミドルウェア名 */
  name: string;
  /** クラス名 */
  className?: string;
  /** エイリアス */
  alias?: string;
  /** グローバルミドルウェアか */
  isGlobal?: boolean;
  /** 優先度 */
  priority?: number;
  /** 位置情報 */
  location?: Location;
}

/**
 * サービスプロバイダー情報
 */
export interface ServiceProviderInfo {
  /** プロバイダー名 */
  name: string;
  /** 提供するサービス */
  provides?: string[];
  /** 遅延ロードか */
  isDeferred?: boolean;
  /** 位置情報 */
  location: Location;
  /** 登録されているバインディング */
  bindings?: Array<{
    /** 抽象クラス/インターフェース */
    abstract: string;
    /** 具象クラス */
    concrete: string;
    /** シングルトンか */
    isSingleton?: boolean;
  }>;
}

/**
 * マイグレーション情報
 */
export interface MigrationInfo {
  /** ファイル名 */
  fileName: string;
  /** テーブル名 */
  tableName?: string;
  /** 操作種別 */
  operation: 'create' | 'update' | 'drop' | 'rename';
  /** カラム定義 */
  columns?: Array<{
    /** カラム名 */
    name: string;
    /** 型 */
    type: string;
    /** nullable */
    nullable?: boolean;
    /** デフォルト値 */
    default?: string;
  }>;
  /** インデックス */
  indexes?: Array<{
    /** カラム */
    columns: string[];
    /** unique */
    unique?: boolean;
  }>;
  /** 外部キー制約 */
  foreignKeys?: Array<{
    /** カラム */
    column: string;
    /** 参照テーブル */
    references: string;
    /** 参照カラム */
    on: string;
    /** onDelete */
    onDelete?: string;
    /** onUpdate */
    onUpdate?: string;
  }>;
  /** 位置情報 */
  location: Location;
  /** タイムスタンプ */
  timestamp: string;
}

/**
 * イベント情報
 */
export interface EventInfo {
  /** イベント名 */
  name: string;
  /** リスナー */
  listeners: string[];
  /** 位置情報 */
  location: Location;
}

/**
 * 設定ファイル情報
 */
export interface ConfigInfo {
  /** ファイル名 */
  fileName: string;
  /** 設定キー */
  keys: Array<{
    /** キー名 */
    key: string;
    /** デフォルト値 */
    defaultValue?: string;
    /** 環境変数参照 */
    envVariable?: string;
    /** 使用箇所 */
    usages?: Location[];
  }>;
  /** 位置情報 */
  location: Location;
}

/**
 * MVC構造
 */
export interface MVCStructure {
  /** モデル */
  models: EloquentModel[];
  /** ビュー */
  views: Array<{
    /** ビュー名 */
    name: string;
    /** ファイルパス */
    path: string;
    /** 使用されているコントローラー */
    usedByControllers?: string[];
  }>;
  /** コントローラー */
  controllers: ControllerInfo[];
  /** 関係性 */
  relationships: Array<{
    /** モデル */
    model: string;
    /** コントローラー */
    controller: string;
    /** ビュー */
    views: string[];
  }>;
}

/**
 * Laravel プロジェクト情報
 */
export interface LaravelProjectInfo {
  /** プロジェクトルート */
  rootPath: string;
  /** Laravelバージョン */
  version?: string;
  /** composer.json情報 */
  composer?: {
    /** パッケージ名 */
    name?: string;
    /** 依存パッケージ */
    dependencies: Record<string, string>;
  };
  /** ディレクトリ構造 */
  directories: {
    /** app */
    app: string;
    /** routes */
    routes: string;
    /** resources */
    resources: string;
    /** database */
    database: string;
    /** config */
    config: string;
  };
}
