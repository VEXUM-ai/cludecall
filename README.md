# 歯科一次受付AI デモ

ElevenLabs Agents と Next.js 15 を使った歯科一次受付AI のデモです。  
WebRTC のブラウザ会話と、実電話会話の回収・Markdown 証跡化に対応します。

## 主な機能
- WebRTC で agent と会話
- ライブ transcript 表示
- 終話後に `analysis/run` で仮受付メモを抽出
- 最新の電話会話を import
- `docs/demo-runs/*.md` にデモ証跡を保存

## セットアップ
1. `.env.example` を `.env` にコピー
2. `ELEVENLABS_API_KEY` と `ELEVENLABS_AGENT_ID` を設定
3. `npm install`
4. `npm run dev`

`npm run build` と `npm start` は、Windows の非 ASCII パス配下で `next start` が `Cannot find module './331.js'` になるケースを避けるため、`.next/server/webpack-runtime.js` の chunk 解決を自動補正する。

## よく使うコマンド
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run agent:apply-demo-config`
- `npm run demo:import-last-call`

## 主要なファイル
- `app/api/eleven/conversation-token/route.ts`
- `app/api/eleven/analyze/route.ts`
- `app/api/demo/import-last-call/route.ts`
- `components/conversation-provider.tsx`
- `components/home-page.tsx`
- `lib/elevenlabs/api.ts`
- `scripts/import-last-call.ts`

## 補足
- 全体計画は `docs/demo-plan.md`
- 実装ログは `docs/implementation-notes.md`
- agent 設定は `docs/agent/README.md`
- デモ用の agent 文面は `docs/agent/dental-demo-config.md`
- 運用手順は `docs/runbook.md`
- 証跡フォーマットは `docs/demo-runs/README.md`
