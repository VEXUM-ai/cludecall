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

## 2026-04-04 Production 起動エラーの修正
- `npm start` でトップページを開いたとき、`Cannot find module './331.js'` が ` .next/server/webpack-runtime.js` から発生することを再現した。
- エラーは production build の server chunk 解決だけで発生し、`npm run dev` と API route の疎通には影響しなかった。
- `scripts/patch-next-runtime.ts` を追加し、`webpack-runtime.js` の numeric chunk 解決を `./chunks/*.js` に向ける post-build workaround を実装した。
- `package.json` の `build` を `next build && tsx scripts/patch-next-runtime.ts` に変更し、Windows の非 ASCII パス配下でも `next start` が通るようにした。
- その後も stale build で再発しにくいよう、`start` でも先に `tsx scripts/patch-next-runtime.ts` を実行するようにした。
- 追加検証で `vendor-chunks/*` まで `./chunks/` に寄せると API route だけ 500 になることが分かったため、patch は numeric chunk のみ `./chunks/` を使い、`vendor-chunks/*` は従来どおり `./` 配下を参照する形に修正した。
- 修正後に `npm start` を別ポートで起動し、トップ画面 `200`、`/api/eleven/conversation-token` `200`、`npm run demo:import-last-call` が `No completed phone conversation was found for the configured agent.` を返すところまで確認した。

## 2026-04-05 WebRTC fallback の追加
- ブラウザで `could not establish pc connection` が出る環境向けに、private agent 用 signed URL を返す `GET /api/eleven/signed-url` を追加した。
- `components/conversation-provider.tsx` は WebRTC 開始失敗時に PeerConnection 系エラーだけを検知し、その場合だけ WebSocket 接続へ自動フォールバックする。
- サーバー側では `lib/elevenlabs/api.ts` に `getSignedUrl()` を追加し、ElevenLabs の `convai/conversation/get-signed-url` を使うようにした。
- これでブラウザの WebRTC が不安定でも、電話デモとは別に Web デモを継続しやすくした。

## 2026-04-05 voice と latency 計測
- live agent の現設定を確認したところ、LLM は `gemini-3-flash-preview` だが、音声モデルは `eleven_flash_v2_5`、voice は男性 voice `Eric` だった。
- `eleven_v3` への切り替えを live agent へ直接試したが、ElevenLabs API は `feature_not_available / expressive_tts_not_allowed` を返し、このアカウントでは Conversational AI に v3 を適用できなかった。
- デモ設定コードは女性 voice `Bella` を使うように更新し、v3 が解放されていない間は `eleven_flash_v2_5 + Bella` を既定値にする。
- `lib/latency.ts` と `POST /api/demo/latency` を追加し、Web 会話の接続時間、初回応答時間、分析時間、電話 transcript ベースの応答間隔を `artifacts/latency/latency-samples.json` に蓄積し、`docs/latency-report.md` を自動更新するようにした。
- `components/conversation-provider.tsx` は analysis 完了後に Web latency を送信するようにし、`components/home-page.tsx` は最新の Web / 電話 latency を表示するようにした。
- その後、UI 上では `V3 会話型` が選択可能であることを確認できた。問題は「選べない」ことではなく、古いブラウザ状態や自動再適用スクリプトで TTS 設定が戻ることだった。
- `scripts/apply-agent-demo-config.ts` は TTS モデルと voice を固定値で上書きしないよう修正し、未指定時は live agent の現在値を保持、必要時のみ `.env` の `ELEVENLABS_TTS_MODEL_ID` / `ELEVENLABS_VOICE_ID` で明示上書きするようにした。

## 2026-04-05 公式 best practices を反映した日本語電話受付 prompt 設計
- ElevenLabs の公式 Prompting guide、Guardrails、Expressive mode、Voice customization、Pronunciation dictionary を確認し、日本語電話受付向けの設計原則を `docs/agent/japanese-phone-voice-design.md` に整理した。
- agent の system prompt は `# Role` `# Goals` `# Tone` `# Voice & delivery` `# Intake flow` `# Normalization` `# Safety` `# Guardrails` `# Recovery` `# Closing` の section-based 構造に再編した。
- 日本語の電話受付らしさは audio tags の多用ではなく、`明るい / はきはき / 大人の女性受付 / 不安時は少し落ち着く / 復唱だけ少しゆっくり` という自然言語指示で制御する方針にした。
- tags は `[slow]` を氏名、電話番号、日時、重要確認事項の復唱に限定し、`[laughs]` `\[giggles]` `\[whispers]` `\[sighs]` は通常の受付では使わない方針を明文化した。
- pronunciation dictionary は `Eleven v3 Conversational` を前提に alias ベースで設計し、初期サンプルとして `VEXUMデンタルクリニック` `AI受付` `LINE` `SMS` `CT` `CAD/CAM` `PMTC` `GBT` を含む PLS を `docs/agent/pronunciation-dictionary-ja-demo.pls` に追加した。
- `npm run agent:apply-demo-config` を再実行し、prompt / first message / data collection / evaluation criteria の live 再適用までは完了した。再取得された live TTS はこの時点でも `eleven_flash_v2_5` で、UI 上で v3 が見えていても published live config と一致するかは API で確認する運用に改めた。
- あわせて `scripts/apply-agent-demo-config.ts` に `ELEVENLABS_EXPRESSIVE_MODE` と `ELEVENLABS_SUGGESTED_AUDIO_TAGS` の上書き処理を追加した。将来 account 側で v3 expressive が解放されたら、`.env` だけで反映できる。
- 実検証では `/v1/models` には `eleven_v3` が見えている一方で、agent PATCH で `model_id=eleven_v3` を送ると `feature_not_available / expressive_tts_not_allowed` が返った。`eleven_flash_v2_5 + expressive_mode=true` は 200 だが、保存結果は `expressive_mode=false` に戻されることも確認した。
- ElevenLabs の公式 docs では、`Expressive mode` は `V3 Conversational` を選ぶと有効化され、追加料金も不要とされている。一方、公式 errors docs では `feature_not_available` は「現在の plan では使えない機能」と定義されている。
- そのため、現状の最も整合的な解釈は「公開 docs 上は self-serve でも使える前提だが、この workspace には Agents 向け expressive TTS の entitlement がまだ付与されていない」というもの。公開 docs だけからは、明示的に `Free` / `Starter` / `Creator` のどこで解放されるかは確認できなかった。
- `GET /v1/user/subscription` などで正確な契約 tier も確認しようとしたが、API key では 401 となり、この repo からは workspace の契約情報までは取得できなかった。

## 2026-04-05 v3 利用可否の外部調査メモ
- 外部調査結果を受けて、重要論点を `docs/agent/v3-availability-research.md` に整理した。
- 特に重要なのは、Agents 側の正式な conversational v3 model id が `eleven_v3_conversational` であり、general TTS の `eleven_v3` と別である点。
- ただし plan / entitlement / rollout のどれが拒否要因かは、公開 docs だけでは最終確定できないため、サポート問い合わせ前提の論点整理も併記した。
- ElevenLabs 公式窓口 `team@elevenlabs.io` へ、`feature_not_available / expressive_tts_not_allowed`、`agent_2301knc096q9fg5bcq3gj1gmrp4z`、`request_id=6e9fa91dbd6d59768a35907d9a500ace` を添えて問い合わせを送信した。

## 2026-04-05 有料化後の v3 再検証
- 有料化後に再度 live agent へ PATCH を試したところ、`model_id=eleven_v3_conversational`、`expressive_mode=true` が 200 で通った。
- 保存後に live agent を再取得しても、`ttsModel=eleven_v3_conversational`、`expressiveMode=true` を保持していることを確認した。
- `npm run agent:apply-demo-config` を再実行しても同じ設定を維持できたため、現時点ではデモ本番でも `Eleven v3 Conversational + Bella` を使える状態になった。
- ここからの注意点は、Agents 側では `eleven_v3` ではなく `eleven_v3_conversational` を使うこと。

## 2026-04-05 アプリからの outbound call 起動
- `POST /api/demo/outbound-call` を追加し、ElevenLabs の `convai/twilio/outbound-call` をアプリから直接呼べるようにした。
- `lib/elevenlabs/api.ts` に電話番号一覧取得と outbound-capable な `phone_number_id` 解決処理を追加し、`ELEVENLABS_AGENT_PHONE_NUMBER` に一致する imported number を優先して使う。
- `components/home-page.tsx` には `AI から電話をかける` セクションを追加し、番号入力からテスト架電、続けて `最新の電話会話を取り込む` まで一画面で完結できるようにした。
## 2026-04-05 Web 音声が聞こえない件の対処
- `components/conversation-provider.tsx` にブラウザ音声アンロック処理を追加した。
- `@elevenlabs/react` の `volume` と `outputDeviceId` を明示的に制御するようにした。
- `onAudio` で agent 音声受信数を数え、`getInputVolume()` と `getOutputVolume()` を定期取得して UI に出すようにした。
- `components/home-page.tsx` に `音声出力チェック` セクションを追加し、出力デバイス切替、スピーカーテスト、診断メトリクスを確認できるようにした。
- Web 側で声が聞こえないときの確認手順は `docs/audio-troubleshooting.md` にまとめた。

## 2026-04-05 電話会話取り込みの 409 修正
- ログを確認すると、最新の電話会話として `status=initiated` の未成立 outbound call を拾っていた。
- `npm run demo:import-last-call` はその会話に対して `analysis/run` を呼んでいたため、ElevenLabs から `409` が返っていた。
- `lib/elevenlabs/api.ts` の `findMostRecentPhoneConversationId()` を修正し、`status=done` の電話会話だけを取り込み対象にした。
- これにより、未成立の発信履歴が残っていても、完了済みの電話会話だけを安全に回収できるようにした。

## 2026-04-05 医院プロフィールと定番FAQの追加
- デモ用の医院プロフィールを `VEXUMデンタルクリニック渋谷` に固定し、診療時間、休診日、支払い方法、駐車場、アクセス、当日受付、キャンセル変更の案内をドキュメントへ追記した。
- `docs/agent/dental-demo-config.md` には FAQ を短く答える方針を追加し、予約確定や保険判断はスタッフ確認へ回す運用を明示した。
- `docs/agent/japanese-phone-voice-design.md` には、電話でよく聞かれる定番質問は事務的に短く答えること、感情タグを使わず平静なトーンで案内することを追記した。
- `docs/agent/pronunciation-dictionary-ja-demo.pls` には医院名、駅名、ビル名、住所表現、前日18時など読み間違えやすい語を追加した。
