# 歯科一次受付AI デモ

ElevenLabs Agents と Next.js 15 を使った歯科一次受付AI のデモです。  
WebRTC のブラウザ会話と、実電話会話の回収・Markdown 証跡化に対応します。

## 主な機能
- WebRTC で agent と会話
- WebRTC が張れない環境では WebSocket fallback で会話を継続
- ライブ transcript 表示
- 終話後に `analysis/run` で仮受付メモを抽出
- 通常受付は終話後に `direct_auto` で候補枠確認と Apotool 投入を自動実行
- Apotool 投入結果、要確認、急患 handoff を Slack に通知
- 急患や人対応希望は ElevenLabs の live transfer tool で電話をそのまま人へ転送
- 最新の電話会話を import
- Web と電話のレイテンシを計測して `docs/latency-report.md` に集計
- `docs/demo-runs/*.md` にデモ証跡を保存

## セットアップ
1. `.env.example` を `.env` にコピー
2. `ELEVENLABS_API_KEY` と `ELEVENLABS_AGENT_ID` を設定
3. `npm install`
4. `npm run dev`

`ELEVENLABS_TTS_MODEL_ID` と `ELEVENLABS_VOICE_ID` を入れると、`npm run agent:apply-demo-config` が TTS モデルと voice をその値に固定する。未設定なら現在の live agent の値を保持する。

電話デモでアプリから架電する場合は、`DEMO_OUTBOUND_TARGET_NUMBER` に実際の着信先番号を入れる。`TWILIO_CALLER_ID` や `ELEVENLABS_AGENT_PHONE_NUMBER` と同じ番号を着信先にすると、自己発信になって正常な会話にならない。
Verified Caller ID に自分の携帯番号を使っている場合、自分の携帯を着信先にすると caller ID と着信先が同一になる。自分で受けるデモをしたい場合は、別の caller ID / 購入番号 / 別端末を用意する。

`npm run build` と `npm start` は、Windows の非 ASCII パス配下で `next start` が `Cannot find module './331.js'` になるケースを避けるため、`.next/server/webpack-runtime.js` の chunk 解決を自動補正する。

## 現在の予約フロー
現在の本線は `確認後登録` ではなく、次の自動フローです。

1. 通話が終わる
2. ElevenLabs の分析結果から `appointmentDraft` を作る
3. `general_initial` かつ通常受付なら、自動で候補枠確認と Apotool 投入を実行する
4. 結果を Slack に通知する

例外フローは次のとおりです。

- 急患、強い痛み、腫れ、出血、人対応希望:
  live transfer tool でその場で人へ電話を転送する
- 自動選定できる候補がない:
  `requires_manual_followup` にして Slack に通知する
- Apotool 実行失敗:
  `failed` にして Slack に通知する

既定値は `APPOINTMENT_TOOL_MODE=direct_auto` と `APPOINTMENT_EXECUTION_POLICY=test_only` です。つまり、コード上は自動投入フローが本線ですが、実運用前はテスト予約条件でガードされます。

## 実装済みの運用補助
- `POST /api/eleven/post-call-webhook`
  ElevenLabs の post-call webhook を受けて、再分析と自動予約フローを起動する
- `POST /api/notifications/slack/test`
  Slack 通知の疎通確認をする
- `GET /api/system-readiness`
  Apotool、Slack、urgent transfer の設定状態を返す
- ホーム画面
  `conversationOutcome`、`notificationState`、`handoffState` を表示し、手動再実行や補正に使える

## 重要な env
最低限必要な設定は次です。

- ElevenLabs:
  `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- 自動予約:
  `APPOINTMENT_TOOL_MODE`, `APPOINTMENT_TOOL_PROVIDER`, `APPOINTMENT_EXECUTION_POLICY`
- Apotool:
  `APOTOOL_EMAIL`, `APOTOOL_PASSWORD`, `APOTOOL_LOGIN_URL`, `APOTOOL_CLINIC_NAME`
- Slack 通知:
  `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_CHANNEL_LABEL`
- 急患 live transfer:
  `URGENT_TRANSFER_PHONE_NUMBER`, `URGENT_TRANSFER_MODE`

`.env.example` は現在の推奨値に合わせて更新済みです。`APPOINTMENT_TOOL_MODE=direct_auto`、`APPOINTMENT_EXECUTION_POLICY=test_only` が既定です。

## 外部設定で必要なもの
- ElevenLabs 側で post-call webhook をこのアプリの `/api/eleven/post-call-webhook` に向ける
- 通知先 Slack workspace で bot token を発行し、`SLACK_BOT_TOKEN` と `SLACK_CHANNEL_ID` を設定する
- 急患転送先の電話番号を `URGENT_TRANSFER_PHONE_NUMBER` に設定する
- 本番で live transfer を安定運用する場合は、Verified Caller ID 前提のデモ番号ではなく、inbound 対応の Twilio 番号を ElevenLabs agent に割り当てる

## いまの制約
- `general_initial` の通常受付を自動投入の対象にしている
- 急患は自動予約せず、その場で人に電話をつなぐ前提
- Slack token/channel と転送先番号が未設定だと、その部分は `skipped` になる
- 電話番号認識精度の改善はこの段階では未対応

## よく使うコマンド
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run agent:apply-demo-config`
- `npm run demo:import-last-call`
- `curl -X POST http://localhost:3000/api/notifications/slack/test`
- `curl http://localhost:3000/api/system-readiness`

## 主要なファイル
- `app/api/eleven/conversation-token/route.ts`
- `app/api/eleven/signed-url/route.ts`
- `app/api/eleven/analyze/route.ts`
- `app/api/eleven/post-call-webhook/route.ts`
- `app/api/demo/latency/route.ts`
- `app/api/demo/import-last-call/route.ts`
- `app/api/notifications/slack/test/route.ts`
- `app/api/system-readiness/route.ts`
- `components/conversation-provider.tsx`
- `components/home-page.tsx`
- `lib/appointment-automation.ts`
- `lib/appointment-notifications.ts`
- `lib/elevenlabs/api.ts`
- `lib/latency.ts`
- `lib/notifications/slack.ts`
- `scripts/import-last-call.ts`
- `scripts/apply-agent-demo-config.ts`

## 補足
- 全体計画は `docs/demo-plan.md`
- ハイブリッド運用の方向性は `docs/AI一次受付ハイブリッド設計.md`
- 自動予約と急患 live transfer の直近計画は `docs/client/auto-booking-live-handoff-plan-2026-04-10.md`
- Slack デモ bot の作成手順は `docs/client/slack-demo-bot-setup.md`
- Web 音声比較ラボの研究・実装・評価は `docs/voice-benchmark/latest-research-2026-04.md`、`docs/voice-benchmark/implementation-plan.md`、`docs/voice-benchmark/evaluation-rubric.md`
- 実装ログは `docs/implementation-notes.md`
- agent 設定は `docs/agent/README.md`
- デモ用の agent 文面は `docs/agent/dental-demo-config.md`
- 運用手順は `docs/runbook.md`
- クライアント向けの総覧は `docs/client/README.md`
- 証跡フォーマットは `docs/demo-runs/README.md`
- レイテンシ集計は `docs/latency-report.md`
