# Mireru インストールガイド

VS Code拡張機能「Mireru」のインストール方法

## 📦 VSIXファイルからのインストール

### 方法1: VS Code UIからインストール

1. VS Codeを開く
2. 拡張機能ビュー（`Ctrl+Shift+X` または `Cmd+Shift+X`）を開く
3. 右上の「...」メニューをクリック
4. 「VSIXからのインストール...」を選択
5. `mireru-0.1.0.vsix` ファイルを選択
6. インストール完了後、VS Codeを再読み込み

### 方法2: コマンドラインからインストール

```bash
code --install-extension mireru-0.1.0.vsix
```

## ⚙️ 初期設定

### 1. Claude API キーの設定

拡張機能を使用するには、Claude API キーが必要です。

1. VS Code の設定を開く（`Ctrl+,` または `Cmd+,`）
2. 「Mireru」で検索
3. 「Mireru: Claude Api Key」にClaude APIキーを入力

または、settings.jsonに直接記述:

```json
{
  "mireru.claude.apiKey": "your-api-key-here"
}
```

### 2. Claude APIキーの取得方法

1. [Anthropic Console](https://console.anthropic.com/)にアクセス
2. アカウントを作成（まだの場合）
3. 「API Keys」セクションで新しいキーを作成
4. キーをコピーして、Mireruの設定に貼り付け

## 🎯 基本的な使い方

### コードの説明を表示

1. PHPファイルを開く
2. 説明を見たいコード（関数名、変数名等）を選択
3. 右クリックして「Mireru: 説明を表示」を選択
4. 横に新しいタブが開き、AI による詳細な説明が表示されます

### Laravel ルートの表示

1. Laravel プロジェクトを開く
2. コマンドパレット（`Ctrl+Shift+P` または `Cmd+Shift+P`）を開く
3. 「Mireru: Laravel ルートを表示」と入力して実行
4. プロジェクトのルート一覧が表示されます

## 🔧 設定オプション

### 使用するAIモデルの変更

```json
{
  "mireru.apiProvider": "claude",
  "mireru.claude.model": "claude-sonnet-4-5-20250929"
}
```

利用可能なモデル:
- `claude-sonnet-4-5-20250929` (デフォルト - 推奨)
- `claude-opus-4-20250514` (最高品質)
- `claude-3-5-sonnet-20241022`

### 説明文の言語

```json
{
  "mireru.language": "ja"
}
```

- `ja`: 日本語（デフォルト）
- `en`: 英語

## 📚 利用可能な機能

現在実装されている機能:

✅ **コードの説明表示**
- 選択したコードについてAIが詳しく説明
- パラメータ、返り値、使用例を表示
- Laravel固有の要素にも対応

✅ **Laravel ルート表示**
- プロジェクト内の全ルートを一覧表示
- HTTPメソッド、URI、コントローラー、アクションを表示

🚧 **今後実装予定の機能:**
- 関数の色分け表示
- 定義ジャンプ＋説明
- 使用箇所の表示と説明
- 依存関係グラフ
- 変数追跡
- プロジェクトマップ

## ❗ トラブルシューティング

### 「API キーが設定されていません」エラー

→ 設定でClaude API キーを入力してください

### 「Laravelプロジェクトが検出されませんでした」警告

→ プロジェクトルートに `composer.json` があり、`laravel/framework` への依存関係があることを確認してください

### 説明の生成に失敗する

1. APIキーが正しいか確認
2. インターネット接続を確認
3. Claude APIの使用制限に達していないか確認

## 📞 サポート

- GitHub Issues: https://github.com/mireru/mireru/issues
- ドキュメント: README.md

## 📄 ライセンス

MIT License - 詳細は LICENSE ファイルを参照
