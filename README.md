# Mireru - AI Code Intelligence for VS Code

**見える** - AI駆動のPHP/Laravelコードインテリジェンス拡張機能

## 概要

Mirerは、AI（Claude API等）を活用してコードの理解、ナビゲーション、全体把握を支援するVS Code拡張機能です。

## 主要機能

### 🎨 関数の色分け表示
- **PHP標準関数**: 青色で表示
- **Laravelフレームワーク関数**: 緑色で表示
- **ユーザー定義関数**: オレンジ色で表示
- **サードパーティライブラリ関数**: 紫色で表示

### 🤖 AI駆動の詳細説明
- 選択したコード片をAIが日本語で詳しく説明
- コンテキストに応じた説明
- パラメータ、返り値、使用例を表示

### 🔍 Laravel専用機能
- ルート解析と可視化
- Eloquentリレーションの図示
- MVC構造の可視化
- ミドルウェア追跡

### 📊 プロジェクト可視化
- ファイル構造マップ
- 依存関係グラフ
- 変数・定数追跡

## インストール

### 前提条件
- VS Code 1.85.0 以上
- PHP 7.4 以上（プロジェクト側）
- Claude API キー（またはOpenAI API キー）

### インストール手順

1. VS Code拡張機能マーケットプレイスから「Mireru」を検索してインストール

   または

   VSIXファイルから手動インストール:
   ```bash
   code --install-extension mireru-0.1.0.vsix
   ```

2. API キーの設定
   - `Ctrl+,` で設定を開く
   - 「Mireru」で検索
   - `Mireru: Claude Api Key` にClaude APIキーを入力

## 使用方法

### 関数の色分け表示
PHPファイルを開くと自動的に関数が色分けされます。

### コードの説明を表示
1. コード（関数名、変数名等）を選択
2. 右クリック
3. 「Mireru: 説明を表示」を選択

### Laravelルートの表示
1. コマンドパレット（`Ctrl+Shift+P`）を開く
2. 「Mireru: Laravelルートを表示」を実行

### 依存関係グラフの表示
1. コマンドパレット（`Ctrl+Shift+P`）を開く
2. 「Mireru: 依存関係グラフを表示」を実行

## 設定

主要な設定項目:

- `mireru.apiProvider`: 使用するAIプロバイダー（claude/openai/gemini）
- `mireru.claude.apiKey`: Claude API キー
- `mireru.claude.model`: 使用するClaudeモデル
- `mireru.colorization.enabled`: 色分け表示の有効/無効
- `mireru.language`: 説明文の言語（ja/en）

詳細は設定画面を参照してください。

## 開発

### ビルド
```bash
npm install
npm run compile
```

### テスト
```bash
npm test
```

### デバッグ
1. VS Codeで本プロジェクトを開く
2. F5キーを押す
3. Extension Development Hostが起動

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照

## 貢献

バグ報告や機能提案は、GitHubのIssuesでお願いします。

## サポート

- GitHub Issues: [https://github.com/your-username/mireru/issues](https://github.com/your-username/mireru/issues)
- ドキュメント: [https://github.com/your-username/mireru/wiki](https://github.com/your-username/mireru/wiki)

## 更新履歴

### v0.8.7 (2025-11-11)
- **修正**: 依存関係グラフが表示されない問題を修正
- **追加**: 右クリックメニューから依存関係グラフとプロジェクトマップを表示可能に
- **改善**: Laravelルート名の使用箇所検索機能を大幅に改善
  - route()ヘルパー、Blade、redirect()->route()などのパターンを正確に検出
  - QuickPickで使用箇所を表示し、直接ジャンプ可能

### v0.8.6 (2025-11-11)
- 依存関係グラフ機能を実装
- インタラクティブなForce-directedグラフ表示
- 循環依存の自動検出

### v0.8.5 (2025-11-11)
- ファイル構造マップ機能を実装
- プロジェクト全体の構造を階層的に可視化
- ファイル詳細パネルで統計情報を表示

### v0.8.4 (2025-11-11)
- Laravelルート解析機能を実装
- TreeView形式でルート一覧を表示
- ルート詳細パネルを追加

### v0.8.3 (2025-11-11)
- リファクタリング提案機能の改善
- 改善後のコードの詳細解説を追加

### v0.8.2 (2025-11-11)
- リファクタリング提案機能を実装

### v0.8.1 (2025-11-09)
- コードフロー分析の統一フォーマット化

### v0.8.0 (2025-11-09)
- 右クリックメニューからの自動変数/関数検出

### v0.1.0 (2025-11-09)
- 初回リリース
- 関数の色分け表示機能
- AI駆動の説明機能
- Laravel専用機能（ルート解析）

---

**Mireru** - コードを「見える化」する
