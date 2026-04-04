# Runbook

## Web デモ
1. `.env` に `ELEVENLABS_API_KEY` と `ELEVENLABS_AGENT_ID` を設定する。
2. `npm install`
3. `npm run dev`
4. ブラウザで開始し、会話後に memo を確認する。

## 即日電話デモ
1. ElevenLabs の Phone Numbers で Twilio 連携を行い、Verified Caller ID を import する。
2. Verified Caller ID は `outbound-only` のため agent には割り当てられない。電話番号詳細画面に `この電話番号は着信通話をサポートしておらず、エージェントに割り当てることはできません` と表示されたら想定どおり。
3. ElevenLabs ダッシュボードの `発信コール` から、対象 agent を選んであなたの電話番号へ outbound call を送る。
4. 通話終了後、アプリの「最新の電話会話を取り込む」か `pnpm demo:import-last-call` を実行する。
5. 生成された `docs/demo-runs/*.md` を証跡として確認する。
6. inbound デモが必要になったら、Twilio の購入番号か SIP trunk を別途用意する。

## 将来の inbound 移行
1. Twilio 日本 `national number` の規制申請を通す。
2. 取得した番号を ElevenLabs に import する。
3. 同じ agent に inbound を割り当てる。
4. 回収処理と Markdown 生成はそのまま再利用する。

## 失敗時の切り替え
- Twilio 日本番号の審査待ち: outbound-only デモへ切り替える。
- Verified Caller ID に agent を割り当てられない: `発信コール` ベースの outbound-only デモとして進める。
- phone conversation が拾えない: `conversationId` を指定して `pnpm demo:import-last-call --conversationId=<id>` を使う。
- analysis が遅い: 数秒待って再試行する。
- WebRTC でマイク権限が拒否された: ブラウザ設定からマイク権限を許可する。
