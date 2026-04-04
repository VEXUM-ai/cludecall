# 実装メモ

## 2026-04-04 初期スキャフォールド
- 空リポジトリから Next.js 15 + TypeScript の土台を手動で作成。
- 依存関係は `@elevenlabs/react`、`next`、`react`、`zod`、`tsx` を採用。
- `.env.example` に ElevenLabs / Twilio / デモ用タイムゾーンの変数を定義。
- ここから先は小さめの単位でコミットし、必要な運用メモはこのファイルに追記する。

## 2026-04-04 コア実装
- `GET /api/eleven/conversation-token` を追加し、サーバー側の API key で WebRTC token を返すようにした。
- `POST /api/eleven/analyze` を追加し、`analysis/run` 後に conversation details を polling して memo を返すようにした。
- `POST /api/demo/import-last-call` と `pnpm demo:import-last-call` を追加し、最新電話会話の取り込みと Markdown/JSON 保存を実装した。
- `components/conversation-provider.tsx` で WebRTC 会話の状態、transcript、終話後 analysis を管理するようにした。
- `components/home-page.tsx` で Web デモと電話会話の取り込み UI を分けて表示するようにした。
- `docs/agent/README.md`、`docs/runbook.md`、`docs/demo-runs/README.md` を追加し、設定・運用・証跡の見方を残した。

## 2026-04-04 検証
- `npm run lint`: 成功
- `npm run build`: 成功
- `npm run demo:import-last-call`: `.env` 未設定時に `Missing ELEVENLABS_API_KEY` で停止することを確認。設定不足の検知としては期待どおり。
