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
   code --install-extension mireru-0.8.1.vsix
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

### v0.8.1 (2025-11-09)
- 初回リリース
- 関数の色分け表示機能
- AI駆動の説明機能
- Laravel専用機能（ルート解析）

---

**Mireru** - コードを「見える化」する
