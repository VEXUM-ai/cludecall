# 実装メモ

## 2026-04-04 初期スキャフォールド
- 空リポジトリから Next.js 15 + TypeScript の土台を手動で作成。
- 依存関係は `@elevenlabs/react`、`next`、`react`、`zod`、`tsx` を採用。
- `.env.example` に ElevenLabs / Twilio / デモ用タイムゾーンの変数を定義。
- ここから先は小さめの単位でコミットし、必要な運用メモはこのファイルに追記する。

## 2026-04-04 コア実装
- `GET /api/eleven/conversation-token` を追加し、サーバー側の API key で WebRTC token を返すようにした。
- `POST /api/eleven/analyze` を追加し、`analysis/run` 後に conversation details を polling して memo を返すようにした。
- `POST /api/demo/import-last-call` と `npm run demo:import-last-call` を追加し、最新電話会話の取り込みと Markdown/JSON 保存を実装した。
- `components/conversation-provider.tsx` で WebRTC 会話の状態、transcript、終話後 analysis を管理するようにした。
- `components/home-page.tsx` で Web デモと電話会話の取り込み UI を分けて表示するようにした。
- `docs/agent/README.md`、`docs/runbook.md`、`docs/demo-runs/README.md` を追加し、設定・運用・証跡の見方を残した。

## 2026-04-04 検証
- `npm run lint`: 成功
- `npm run build`: 成功
- `npm run demo:import-last-call`: `.env` 未設定時に `Missing ELEVENLABS_API_KEY` で停止することを確認。設定不足の検知としては期待どおり。

## 2026-04-04 ドキュメント整理
- `docs/demo-plan.md` を追加し、即日デモ経路と最終的な inbound 電話デモ経路をひとつの計画書に統合した。
- `README.md` から全体計画へ辿れるように更新した。

## 2026-04-04 ランタイム確認
- `.env` なしの状態で `npm run dev` を起動し、トップ画面が `http://localhost:3000` で表示されることを確認した。
- `GET /api/eleven/conversation-token`、`POST /api/eleven/analyze`、`POST /api/demo/import-last-call` はすべて `Missing ELEVENLABS_API_KEY` を返し、設定不足が明示されることを確認した。
- Playwright CLI で UI を操作し、`最新の電話会話を取り込む` 実行時に同じエラーが画面表示されることを確認した。
- WebRTC の `開始` はマイク権限未許可のため `Permission denied` を表示し、アプリが固まらないことを確認した。
- ブラウザコンソールの 404 ノイズを減らすため `app/icon.svg` を追加した。

## 2026-04-04 電話デモの前進
- ElevenLabs API から作成済み agent を取得し、`ELEVENLABS_AGENT_ID=agent_2301knc096q9fg5bcq3gj1gmrp4z` を `.env` に反映した。
- Twilio の Verified Caller ID を ElevenLabs に import し、電話番号 `+81 80 8347 3640` が利用可能になったことを確認した。
- ただし Verified Caller ID は `outbound-only` で、電話番号詳細画面でも agent 割り当て不可と表示された。即日デモの電話経路は `発信コール` ベースに固定する。
- runbook を更新し、当日デモは `agent 割り当て済み電話番号` ではなく `ダッシュボードからの outbound call` として進める方針を明文化した。

## 2026-04-04 ElevenLabs 接続の修正
- Next.js の route handler から ElevenLabs へ送る `fetch` が `fetch failed` で落ちたため、サーバー側通信を `node:https` ベースの実装に切り替えた。
- 同じ API key で Node 単体の `fetch` と `https.request` は成功していたため、回避策として Next の patched fetch に依存しないようにした。
- 修正後に `GET /api/eleven/conversation-token` が成功し、WebRTC 用 token を返すことを確認した。
- `POST /api/demo/import-last-call` は実電話会話がまだ無いため、`No completed phone conversation was found for the configured agent.` を返すことを確認した。
- ビルド後に `.next` を lint 対象へ拾ってしまう問題が出たため、`eslint.config.mjs` に build artifact の ignore を追加した。
- `npm run lint` と `npm run build` を再実行し、どちらも成功した。

## 2026-04-04 Agent 設定の実データ投入
- ElevenLabs API から live agent の現在設定を取得したところ、当初は英語の汎用アシスタント設定になっており、歯科受付用の prompt、Data Collection、Guardrail が未整備だった。
- `lib/agent-demo-config.ts` を追加し、歯科一次受付デモ向けの first message、system prompt、Data Collection 12項目、評価基準をコードとして固定した。
- `scripts/apply-agent-demo-config.ts` を追加し、`.env` の `ELEVENLABS_API_KEY` と `ELEVENLABS_AGENT_ID` を使って live agent に設定を再適用できるようにした。
- `scripts/load-dotenv.ts` を追加し、CLI から実行する `agent:apply-demo-config` と `demo:import-last-call` の両方で `.env` を読み込むようにした。
- 日本語 agent を PATCH したとき `Invalid conversation config: Non-english Agents must use turbo or flash v2_5.` で失敗したため、`conversation_config.tts.model_id` を `eleven_flash_v2_5` に固定するよう修正した。
- ElevenLabs 側の `platform_settings.data_collection` は配列ではなく `identifier -> { type, description }` のオブジェクトで送る必要があること、`evaluation.criteria` は `id` と `conversation_goal_prompt` の形で受け付けることを確認した。
- API 経由の再取得で、`language=ja`、`llm=gemini-3-flash-preview`、`tts=eleven_flash_v2_5`、`data_collection=12項目`、`summary_language=ja` になっていることを確認した。
- 反映した prompt と想定シナリオは `docs/agent/dental-demo-config.md` にまとめた。
