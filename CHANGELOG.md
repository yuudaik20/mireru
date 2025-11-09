# Change Log

All notable changes to the "Mireru - AI Code Intelligence" extension will be documented in this file.

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
