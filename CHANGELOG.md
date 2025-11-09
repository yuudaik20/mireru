# Change Log

All notable changes to the "Mireru - AI Code Intelligence" extension will be documented in this file.

## [0.8.1] - 2025-11-09

### Changed
- **コードフロー分析の統一フォーマット化**
  - 1行のコードでも複数行のコードでも、すべて統一されたフォーマットで詳細分析を表示
  - 以下の12項目を必ず含む詳細な分析結果を提供：
    - 要約
    - 役割・目的
    - 返り値
    - 処理の流れ（1処理ずつわかりやすく）
    - 変数の説明
    - 関数・メソッドの説明
    - データの流れ
    - Laravel/フレームワーク機能
    - 使用例
    - 注意点
    - 理解すべきポイント
  - AIプロンプトを改善し、初心者にもわかりやすい説明を生成
  - 処理の流れを1ステップずつ分解して表示

### Fixed
- 1行のみの選択で警告が表示される問題を修正
- コードフロー分析が1行のコードにも対応

## [0.8.0] - 2025-11-09

### Added
- **右クリックメニューからの自動変数/関数検出**
  - カーソル位置の変数/関数を自動検出して定義検索・AI説明を表示
  - `$`、`@`、`->`などの変数/関数上で右クリックするだけで実行可能
  - テキスト選択なしでもコンテキストメニューから実行可能

- **DefinitionFinder の拡張**
  - JavaScript/TypeScript/HTMLファイルの定義検索に対応
  - 関数宣言、アロー関数、クラス、メソッド、変数代入を検索
  - PHP変数代入（`$variable = ...`）の検索に対応
  - `variable`型をサポート

- **言語サポートの拡張**
  - TypeScript言語を右クリックメニューに追加
  - HTML内のJavaScript定義検索に対応

### Changed
- コンテキストメニューの条件を`editorHasSelection`から`editorTextFocus`に変更
- 3つのコマンド（説明表示、定義と説明表示、使用箇所表示）で自動検出に対応

### Fixed
- BladeHoverProviderの定義検索機能を改善
- マルチ言語での変数/関数検出精度を向上

## [0.7.0] - Previous Release

### Added
- HTML/JavaScript/TypeScript対応
- マルチ言語ホバー機能
- コードフロー分析機能
- Webviewパネル表示（説明表示、定義と説明表示、使用箇所表示）

### Changed
- ホバーに定義検索機能を追加
- 全表示機能をMarkdownからWebviewパネルに変更
