# 歯科一次受付AI デモ

ElevenLabs Agents と Next.js 15 を使った歯科一次受付AI のデモです。  
WebRTC のブラウザ会話と、実電話会話の回収・Markdown 証跡化に対応します。

## 主な機能
- WebRTC で agent と会話
- WebRTC が張れない環境では WebSocket fallback で会話を継続
- ライブ transcript 表示
- 終話後に `analysis/run` で仮受付メモを抽出
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

## よく使うコマンド
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run agent:apply-demo-config`
- `npm run demo:import-last-call`

## 主要なファイル
- `app/api/eleven/conversation-token/route.ts`
- `app/api/eleven/signed-url/route.ts`
- `app/api/eleven/analyze/route.ts`
- `app/api/demo/latency/route.ts`
- `app/api/demo/import-last-call/route.ts`
- `components/conversation-provider.tsx`
- `components/home-page.tsx`
- `lib/elevenlabs/api.ts`
- `lib/latency.ts`
- `scripts/import-last-call.ts`

## 補足
- 全体計画は `docs/demo-plan.md`
- ハイブリッド運用の方向性は `docs/AI一次受付ハイブリッド設計.md`
- 実装ログは `docs/implementation-notes.md`
- agent 設定は `docs/agent/README.md`
- デモ用の agent 文面は `docs/agent/dental-demo-config.md`
- 運用手順は `docs/runbook.md`
- クライアント向けの総覧は `docs/client/README.md`
- 証跡フォーマットは `docs/demo-runs/README.md`
- レイテンシ集計は `docs/latency-report.md`
