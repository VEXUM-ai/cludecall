# 通話中空き枠返答の調査・実装ログ

最終更新: 2026-04-19

## 目的と結論
- 目的は、AI 通話中に空き枠候補を高速に返し、選択後だけ再確認と仮確保相当の処理へ進める導線を実装すること。
- 採用方針は `cache-first read + single-flight queue + queued confirm`。
- `確認 -> RPA ページ確認 -> 返答` を毎回同期で直列実行する方式は本線にしない。
- fresh な候補取得や hold confirm の待機 budget は 15 秒。
- 15 秒以内に fresh な結果が取れない場合は、5 分以内の snapshot があれば暫定候補として返し、無ければ通話後確定に落とす。
- `confirmed` 以外は caller-facing で確定表現を禁止する。

## 現状整理
- 現 repo は post-call 自動投入を本線にしており、routine は `runDirectAutoAppointmentFlow()` で availability -> booking を進める。
- live agent 側は `transfer_to_number` の built-in tool はあるが、availability 用の live tool は未配線。
- Apotool RPA は singleton の `browser / context / page` を共有しており、現状は queue や priority 制御がない。
- `C:\Dev\Work\cludecall` は live 会話中に `check_apotool_availability` -> 候補提示 -> `register_apotool_booking` まで進める比較対象。

## 外部リサーチ要点
- ElevenLabs, Vapi, Retell はいずれも通話中 tool 呼び出しを前提とした設計を持ち、待機は tool call sound / soft timeout / wait-for-result で吸収する。
- Playwright / UiPath / Power Automate の一次情報は、`API 優先`, `stable selector`, `warm session`, `single-flight`, `retryable wait` を共通して推奨する。
- Cal.com は slot reservation API を持つが、Google Calendar freebusy は空き確認のみで仮押さえはできない。
- Apotool 側に authoritative reservation API が見つからない限り、本実装での `仮確保` は `内部 lease + 排他再確認 + 直後 booking` を意味する。

## 採用アーキテクチャ
- read path
  - live tool -> `POST /api/appointment-tool/live-availability`
  - fresh snapshot があれば即返答
  - 無ければ single-flight queue 経由で RPA read
  - 15 秒超過時は stale snapshot fallback
- confirm path
  - live tool -> `POST /api/appointment-tool/live-hold-confirm`
  - internal lease を切る
  - queue 経由で再確認 + booking を 1 タスクで実行
  - 15 秒超過時は `pending_finalize_post_call`
- shared infrastructure
  - singleton RPA page は queue で排他制御
  - snapshot / lease / queue job は SQLite へ保存
  - health check も同じ queue へ載せる

## TODOチェックリスト
- [x] 1. 親ドキュメント作成と初期 TODO 投入
- [x] 2. live availability 用 service 境界の切り出し
- [x] 3. single-flight queue 導入
- [x] 4. snapshot store 導入
- [x] 5. `live-availability` API 追加
- [x] 6. `live-hold-confirm` API 追加
- [x] 7. ElevenLabs server tool 配線
- [x] 8. prompt / timeout / waiting behavior 調整
- [ ] 9. integration test / live QA
- [ ] 10. 運用メモと残課題整理

## 実装ログ
### 2026-04-19
- `completed`: 1. 親ドキュメントを新規作成し、TODO・実装ログ・テストログ・コミットログの記録先をこのファイルへ固定した。
- `completed`: 2-6. live availability service を [lib/appointment-tool/live-availability.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-availability.ts>) に切り出し、single-flight queue を [lib/appointment-tool/apotool-task-queue.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/apotool-task-queue.ts>)、snapshot / lease / job store を [lib/appointment-tool/live-availability-store.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-availability-store.ts>) に追加した。live read / hold confirm API は [app/api/appointment-tool/live-availability/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/live-availability/route.ts>) と [app/api/appointment-tool/live-hold-confirm/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/live-hold-confirm/route.ts>) に追加した。
- `completed`: 7. ElevenLabs managed webhook tool 定義を [lib/elevenlabs/managed-agent-tools.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/managed-agent-tools.ts>) に追加し、[scripts/apply-agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/scripts/apply-agent-demo-config.ts>) で create/update と `tool_ids` 置換まで自動化した。managed tool 名は `live_availability_lookup`, `live_hold_confirm`。
- `completed`: 8. prompt と waiting behavior の規約を [lib/agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts>) に反映した。routine 初診のみ live tool を使い、候補は provisional、`live_hold_confirm` が `confirmed` のときだけ確定表現を許可する。
- `completed`: live webhook route に optional shared secret 認証を追加した。[lib/appointment-tool/live-tool-webhook.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-tool-webhook.ts>) と [.env.example](</C:/Dev/Work/デンタル 一次受付AI/.env.example>) に `APPOINTMENT_TOOL_WEBHOOK_SECRET` を追加し、公開 route をそのまま無防備に叩かれないようにした。
- `in_progress`: 9. integration test は通過したが、ElevenLabs agent への apply 実行と live QA 7 本はまだ未実施。

## テストログ
### 2026-04-19
- `npm test -- tests/managed-agent-tools.test.ts tests/agent-live-booking-guardrails.test.ts tests/live-availability.test.ts tests/agent-and-apotool-guardrails.test.ts tests/integration-plan.test.ts`
- 結果: 36 件 pass / 0 fail。
- 補足: `node:sqlite` の ExperimentalWarning は出るが、live availability store と queue テストを含めて全件成功した。

## コミットログ
### 2026-04-19
- `4bd1302` 親ドキュメント作成と進捗記録ルールの初期化を checkpoint commit。
- `planned` live 空き枠 lookup / hold confirm の queue 基盤、managed webhook tool、prompt 調整、関連テストを checkpoint commit。

## 未解決事項
- snapshot prewarm scheduler はまだ未実装。現状は on-demand read と stale snapshot fallback のみ。
- `scripts/apply-agent-demo-config.ts` に managed tool の create/update は入れたが、実 agent へ apply して ElevenLabs 側の tool 実体を更新する作業は別途必要。
- live QA は未実施。少なくとも `warm hit`, `cold miss`, `stale snapshot`, `slot lost before hold`, `session expired`, `two calls overlap`, `pending_finalize_post_call` の 7 本を実地で回す。
- shared secret は route 認証に使える状態にしたが、現状は header に生値を載せる前提。将来的には ElevenLabs 側の secret locator へ寄せたい。
