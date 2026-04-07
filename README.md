# えみは総合歯科 - AI電話対応エージェント

Retell AI を使用した歯科医院の受付AI電話対応エージェントです。

## 機能

- 📞 **自動電話対応**: 患者さんからの電話を自動で対応
- 🦷 **症状聞き取り**: 歯の症状を丁寧にヒアリング
- 🚨 **緊急対応**: 強い痛みの場合は優先的に予約枠を確保
- 📅 **予約受付**: 名前・電話番号・希望日時を収集して予約
- 📊 **通話後分析**: 通話内容を自動分析（患者名、症状、緊急度など）

## 会話フロー

```
挨拶 → 症状聞き取り → 緊急判定 → 情報収集 → 空き確認 → 予約登録 → 確認・終了
```

## セットアップ

### 1. 前提条件

- Node.js 18以上
- Retell AI アカウント（[https://dashboard.retellai.com](https://dashboard.retellai.com)）

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env` ファイルを作成し、APIキーを設定してください。

```bash
cp .env.example .env
# .env を編集して RETELL_API_KEY を設定
```

### 4. デプロイ

```bash
npm run deploy
```

これにより以下が自動的に作成されます：
1. **Conversation Flow** - 会話フロー（全ノードとエッジ）
2. **Voice Agent** - 日本語対応の音声エージェント

## 3つのワークフロー

| ワークフロー | 説明 | 実装方法 |
|---|---|---|
| 空き状況確認 | 患者の希望に応じて空き枠を提案 | Conversation Flow ノード |
| 予約登録 | 患者情報と日時を確認して予約を登録 | Conversation Flow ノード |
| 通話後分析 | 通話内容を自動分析・データ抽出 | post_call_analysis_data |

## ファイル構成

```
src/
├── config.js         # 設定・環境変数
├── retell-client.js  # Retell SDK クライアント
├── create-flow.js    # 会話フロー作成
├── create-agent.js   # エージェント作成
└── deploy.js         # 一括デプロイ
```

## デプロイ後の確認

1. [Retell AI ダッシュボード](https://dashboard.retellai.com) を開く
2. 作成されたエージェント「えみは総合歯科 受付AI」を確認
3. 「Test」ボタンからテスト通話を実施
4. 必要に応じて音声やプロンプトを調整
5. 電話番号を割り当てて本番運用を開始

## カスタマイズ

### 音声の変更
`src/config.js` の `voiceId` を変更してください。利用可能な日本語音声は Retell AI ダッシュボードで確認できます。

### 診療時間の変更
`src/config.js` の `businessHours` を変更してください。

### 空き状況の実装
`src/create-flow.js` の `check_availability` ノードを編集し、実際の予約管理システムのAPIと連携してください。
