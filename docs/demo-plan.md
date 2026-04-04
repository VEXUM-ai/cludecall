# 歯科一次受付AI デモ計画

## 目的
- `Web会話` `実電話会話` `終話後メモ回収` `Markdown証跡化` まで一貫して動くデモを成立させる。
- デモの評価軸は「自然会話」そのものよりも、「歯科の一次受付として破綻せず、院内確認用メモを確実に残せること」に置く。
- 即日で動く経路と、最終的な inbound 電話デモの経路を分けて進める。

## 前提
- LLM は `Gemini 3 Flash Preview`、fallback は `Gemini 2.5 Flash` を想定する。
- 音声会話基盤は ElevenLabs Agents を使い、電話連携は `native Twilio integration` を本線にする。
- 実装は音声ブリッジを自作せず、アプリ側は `会話UI` `analysis/run` `メモ整形` `ドキュメント化` に集中する。
- 初回デモは匿名ダミー前提とし、repo に実番号や音声ファイルは残さない。

## フェーズ構成

### フェーズ0: 当日中に必要な前提を通す
- ElevenLabs private agent を作成する。
- prompt、guardrail、Data Collection、音声設定を固定する。
- Vercel 公開先を用意する。
- Twilio は `Verified Caller ID` または既存番号で outbound-only デモを成立させる。
- 並行で Twilio 日本 `national number` の規制申請を開始する。

### フェーズ1: WebRTC デモ
- Next.js 15 + TypeScript + App Router + `@elevenlabs/react` v1 を使う。
- `GET /api/eleven/conversation-token` と `POST /api/eleven/analyze` を実装する。
- UI は `開始/終了` `接続状態` `ライブ transcript` `最終メモ` `エラー表示` の最小構成にする。
- ブラウザ会話で prompt と抽出精度を先に詰める。

### フェーズ2: 即日版の実電話デモ
- ElevenLabs から利用者の電話へ outbound call をかける。
- 会話終了後、最新 completed phone conversation を取得して `analysis/run` を実行する。
- 結果を `docs/demo-runs/YYYY-MM-DD-HHmm-<conversationId>.md` に保存する。
- この時点で `実際に電話で話す` `終話後に回収する` `ドキュメントに残す` を達成する。

### フェーズ3: 最終版の inbound 電話デモ
- Twilio 日本着信用番号の審査通過後、その番号を ElevenLabs に import して agent に割り当てる。
- 利用者の電話から AI 番号へ直接かける構成に切り替える。
- フェーズ2で作った回収・ドキュメント化パイプラインをそのまま再利用する。

### フェーズ4: 仕上げ
- セットアップ手順、デモ手順、失敗時の切り替え手順を runbook 化する。
- webhook 自動保存は後続拡張とし、初回成功条件からは外す。

## Agent 設定方針
- LLM: `Gemini 3 Flash Preview`
- Fallback: `Gemini 2.5 Flash`
- Voice model: `Eleven v3 Conversational`
- 日本語向け voice を採用し、Live Moderation voice は使わない
- text normalization: `elevenlabs`
- turn timeout: `6-8秒`
- soft timeout: 有効
- interruptions: 有効
- 返答長: `1-2文`
- 1ターン1質問

## Prompt / Guardrail 方針

### Prompt 制約
- 歯科の一次受付
- 仮受付のみ
- 予約確定とは言わない
- 診断しない、治療判断しない
- 必要時は人に確認が必要と伝える
- 流れは `氏名 -> 新患/再診 -> 用件 -> 希望日時候補 -> 連絡先 -> 最終確認`

### Guardrail
- Focus guardrail
- `医療判断をしない`
- `予約確定を言わない`
- `不明点を推測しない`

## Data Collection
- `patient_name`
- `phone_number`
- `is_new_patient`
- `visit_reason`
- `preferred_date_1`
- `preferred_time_range_1`
- `preferred_date_2`
- `preferred_time_range_2`
- `callback_ok`
- `unresolved_questions`
- `notes_for_staff`
- `booking_status`

`booking_status` は常に `pending_manual_confirmation` を既定値にする。

## アプリの責務
- 会話開始と transcript 表示
- conversation analysis と memo 整形
- 実電話結果の import と Markdown 生成

## API と生成物

### API
- `GET /api/eleven/conversation-token`
  - WebRTC 会話用 token を返す
- `POST /api/eleven/analyze`
  - 入力: `conversationId`
  - 出力: `conversationId` `status` `transcript` `analysis` `memo`
- `POST /api/demo/import-last-call`
  - 最新の completed conversation を取得し、正規化した `DemoRun` を返す

### `DemoRun`
- `conversationId`
- `channel`
- `callMeta`
- `memo`
- `analysis`
- `transcriptSummary`
- `cost`

### ファイル出力
- `docs/demo-runs/YYYY-MM-DD-HHmm-<conversationId>.md`
- `artifacts/demo-runs/YYYY-MM-DD-HHmm-<conversationId>.json`

Markdown には `日時` `conversation_id` `通話時間` `仮受付メモ` `要約` `未解決事項` `次アクション` `概算コスト` を残す。電話番号は Markdown 上でマスクし、音声ファイルは保存しない。

## 実行戦略
- `Web基盤`: Next.js 初期化、env、型、Vercel 設定
- `Voice UI`: ConversationProvider、ステータス、transcript
- `Analyze`: ElevenLabs client、polling、memo 整形
- `Import/Docs`: latest call import、Markdown renderer、CLI
- `Agent設定`: prompt、guardrail、Data Collection、Twilio import
- `QA/Runbook`: 検証シナリオ、運用手順、デモ当日手順

合流点は `conversationId` と `DemoRun` の shape に限定する。

## 受け入れ条件

### フェーズ1
- Web で会話を開始できる
- `idle -> connecting -> listening/speaking -> analyzing` が見える
- transcript が逐次表示される
- 終話後に memo が表示される

### フェーズ2
- AI から利用者の電話へ実際に着信する
- 日本語で仮受付会話が完走する
- 最新通話を import できる
- `docs/demo-runs/...md` が生成される

### フェーズ3
- 利用者の電話から AI 番号へ着信できる
- inbound でも同じ memo shape が取れる
- outbound 用に作った回収処理を変更せずに再利用できる

## 最低検証シナリオ
- 新患のクリーニング予約
- 再診の痛み相談で診断要求が入るケース
- 希望日時が曖昧で `unresolved_questions` が残るケース
- 電話番号や日付の聞き直しが入るケース

## 現在の実装範囲
- WebRTC デモ UI
- ElevenLabs conversation token API
- ElevenLabs conversation analysis API
- 最新電話会話の import API
- Markdown/JSON 証跡出力 CLI
- agent 設定ドキュメント
- runbook と実装メモ

## 後続タスク
- ElevenLabs 側の private agent 設定を実環境で反映する
- Twilio outbound-only の接続を実機で確認する
- Twilio 日本着信用番号の審査を進める
- Vercel 本番環境へ env を投入する
- 実会話ログを `docs/demo-runs` に蓄積して改善点を詰める
