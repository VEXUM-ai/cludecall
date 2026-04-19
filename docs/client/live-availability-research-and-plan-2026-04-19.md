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
- [x] 9. integration test / live QA
- [ ] 10. 運用メモと残課題整理

## 実装ログ
### 2026-04-19
- `completed`: 1. 親ドキュメントを新規作成し、TODO・実装ログ・テストログ・コミットログの記録先をこのファイルへ固定した。
- `completed`: 2-6. live availability service を [lib/appointment-tool/live-availability.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-availability.ts>) に切り出し、single-flight queue を [lib/appointment-tool/apotool-task-queue.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/apotool-task-queue.ts>)、snapshot / lease / job store を [lib/appointment-tool/live-availability-store.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-availability-store.ts>) に追加した。live read / hold confirm API は [app/api/appointment-tool/live-availability/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/live-availability/route.ts>) と [app/api/appointment-tool/live-hold-confirm/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/live-hold-confirm/route.ts>) に追加した。
- `completed`: 7. ElevenLabs managed webhook tool 定義を [lib/elevenlabs/managed-agent-tools.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/managed-agent-tools.ts>) に追加し、[scripts/apply-agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/scripts/apply-agent-demo-config.ts>) で create/update と `tool_ids` 置換まで自動化した。managed tool 名は `live_availability_lookup`, `live_hold_confirm`。
- `completed`: 8. prompt と waiting behavior の規約を [lib/agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts>) に反映した。routine 初診のみ live tool を使い、候補は provisional、`live_hold_confirm` が `confirmed` のときだけ確定表現を許可する。
- `completed`: live webhook route に optional shared secret 認証を追加した。[lib/appointment-tool/live-tool-webhook.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/live-tool-webhook.ts>) と [.env.example](</C:/Dev/Work/デンタル 一次受付AI/.env.example>) に `APPOINTMENT_TOOL_WEBHOOK_SECRET` を追加し、公開 route をそのまま無防備に叩かれないようにした。
- `completed`: ElevenLabs managed webhook tool の `conversationId` property で `description` と `dynamic_variable` を同居させると ElevenLabs API が 422 を返すことを確認したため、[lib/elevenlabs/managed-agent-tools.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/managed-agent-tools.ts>) を修正して dynamic variable 専用 property に変更した。`tests/managed-agent-tools.test.ts` に回帰テストを追加した。
- `completed`: 実 ElevenLabs agent へ `npm run agent:apply-demo-config` を再実行し、managed webhook tool 2 本の create/update と agent への反映を確認した。反映先 agent は `agent_2301knc096q9fg5bcq3gj1gmrp4z`、tool id は `tool_6501kpgwm7hhf0cv6ah2wcj2prm7` / `tool_1701kpgwm7r3f3k87de78etay4ga`。
- `completed`: live QA 7 本を local webhook route と live monitor で実施し、`artifacts/live-monitor/events.ndjson` に証跡を残した。結果は `warm hit=resolved snapshot_fresh`, `cold miss=resolved apotool_live`, `stale snapshot=resolved snapshot_stale`, `slot lost before hold=rejected`, `session expired=resolved apotool_live after browser kill + reinit`, `two calls overlap=both resolved with queued request queueWaitMs=2101`, `pending_finalize_post_call=202 pending_finalize_post_call`。
- `completed`: wait budget を 1ms に落とした一時サーバーで `snapshot_stale` と `pending_finalize_post_call` を切り分け、その後 `APPOINTMENT_LIVE_WAIT_TIMEOUT_MS=15000` へ戻した。低タイムアウト時の server log は `artifacts/live-qa/next-live-qa-lowtimeout.out.log`、通常復帰後の log は `artifacts/live-qa/next-live-qa-restored.out.log` に残した。
- `observed`: ElevenLabs の `simulate-conversation` では、managed tool が `system__conversation_id` を要求している状態だと `Missing required dynamic variables in tools: {'system__conversation_id'}` で 400 になった。placeholder を追加しても解消せず、現時点では実通話/実 Web 会話でしか tool call end-to-end を回せない可能性が高い。失敗レスポンスは `artifacts/live-qa/simulate-live-availability-20260419.json` に保存した。
- `completed`: Apotool の cold start を緩和するため、起動直後の非同期 boot prewarm を実装した。`npm run dev` / `npm run start` は [scripts/run-next-with-apotool-prewarm.ts](</C:/Dev/Work/デンタル 一次受付AI/scripts/run-next-with-apotool-prewarm.ts>) 経由で起動し、server ready 後に [app/api/appointment-tool/prewarm/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/prewarm/route.ts>) を叩いて browser 起動と Apotool ログインを先に済ませる。初回実装で試した `instrumentation.ts` は Next dev compile で `playwright -> net` 解決エラーを起こしたため採用せず、wrapper 方式へ切り替えた。
- `completed`: [lib/appointment-tool/apotool-rpa/session-manager.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/apotool-rpa/session-manager.ts>) に session initialization promise を追加し、boot prewarm と最初の live request が競合しても browser 初期化が 1 本だけ走るようにした。health には `sessionInitializing` と `prewarmOnBootEnabled` を追加した。
- `completed`: 予約投入の患者名・日付 guard を撤去した。[lib/appointment-tool/provider.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/provider.ts>) から `test_only` 実行停止ロジックを外し、患者名や近い日付を理由に execute を止めないようにした。
- `completed`: [lib/appointment-tool/provider.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/appointment-tool/provider.ts>) の health 判定を修正し、資格情報だけで `healthy` を返さず `browserReady/contextReady/pageReady/sessionInitializing` を含めた warm 状態で返すようにした。
- `completed`: live booking の intake 順序制約を外した。[lib/agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts>) で routine intake を fixed-order 前提から変更し、日付・時刻・理由・氏名がどの順番で来ても、その時点で必要な次項目だけを埋めるようにした。`live_availability_lookup` は `service_line + preferred_date_1 + usable time` が揃った時点で呼べるようにし、`patient_name` と `phone_number` を前提条件から外した。
- `completed`: live hold confirm で spoken phone number を必須にしないようにした。[lib/elevenlabs/managed-agent-tools.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/managed-agent-tools.ts>) と [app/api/appointment-tool/live-hold-confirm/route.ts](</C:/Dev/Work/デンタル 一次受付AI/app/api/appointment-tool/live-hold-confirm/route.ts>) を更新し、`phoneNumber` を optional に変更した。未指定時は ElevenLabs conversation metadata の `phone_call.external_number` から補完する。
- `completed`: ElevenLabs analyze/import 系でも電話番号メタデータを memo に補完するようにした。[lib/elevenlabs/memo.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/memo.ts>) に `normalizePhoneNumberForMemo()` を追加し、[lib/elevenlabs/api.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts>) で `metadata.phone_call.external_number` を優先補完するようにした。これで通話中に電話番号を話さなくても post-call execute まで進められる。
- `completed`: live tool 待機中の体験を修正した。[lib/agent-demo-config.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts>) で、待機文の後に `まだいらっしゃいますか？` や filler を挟まないようにし、[lib/elevenlabs/managed-agent-tools.ts](</C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/managed-agent-tools.ts>) に `tool_call_sound=elevator3` / `tool_call_sound_behavior=always` を追加した。
- `completed`: 最新の失敗通話 `conv_3601kphgt92tfas8kak36ym394js` を再取り込みし、修正が効くことを確認した。再取り込み後は `memo.phone_number=09047064087`, `appointmentDraft.phoneNumber=09047064087`, `scheduledDatetime=2026-10-20 10:00`, `conversationOutcome=auto_booked`, `execution.state=submitted` まで進んだ。通話中 tool call の再現とは別だが、根本原因だった phone metadata 未補完は解消した。

## テストログ
### 2026-04-19
- `npm test -- tests/managed-agent-tools.test.ts tests/agent-live-booking-guardrails.test.ts tests/live-availability.test.ts tests/agent-and-apotool-guardrails.test.ts tests/integration-plan.test.ts`
- 結果: 36 件 pass / 0 fail。
- 補足: `node:sqlite` の ExperimentalWarning は出るが、live availability store と queue テストを含めて全件成功した。
- `npm test -- tests/managed-agent-tools.test.ts tests/agent-live-booking-guardrails.test.ts`
- 結果: 36 件 pass / 0 fail。managed webhook schema の ElevenLabs 422 修正後も回帰なし。
- `npm test -- tests/apotool-prewarm.test.ts tests/live-availability.test.ts`
- 結果: 38 件 pass / 0 fail。boot prewarm の有効条件と single-schedule 保証を追加で固定化した。
- `npm test -- tests/integration-plan.test.ts tests/live-availability.test.ts tests/apotool-prewarm.test.ts`
- 結果: 31 件 pass / 0 fail。患者名・日付 guard 撤去後も integration plan / live availability / prewarm が崩れていないことを確認した。
- `node --import tsx --test tests/agent-live-booking-guardrails.test.ts tests/managed-agent-tools.test.ts tests/agent-and-apotool-guardrails.test.ts tests/live-availability.test.ts`
- 結果: 21 件 pass / 0 fail。順序非依存 intake、phone metadata 補完、hold confirm の optional phone、待機文言と tool call sound 設定の回帰を確認した。
- `npm run agent:apply-demo-config`
- 結果: 成功。反映先 agent は `agent_2301knc096q9fg5bcq3gj1gmrp4z`。managed webhook tool は 2 本で、`live_availability_lookup` / `live_hold_confirm` の両方が最新 prompt と schema で再適用された。
- `POST /api/demo/import-last-call {"conversationId":"conv_3601kphgt92tfas8kak36ym394js"}`
- 結果: `appointmentCompleted=true`, `submissionState=submitted`, `conversationOutcome=auto_booked`。最新失敗通話の再取り込みで phone metadata 補完が実データに効くことを確認した。
- `POST /api/appointment-tool/prewarm` -> `GET /api/appointment-tool/health` -> public `POST /api/appointment-tool/live-availability`
- 結果: prewarm は `200 success`。初期化直後は `sessionInitializing=true` のため一時的に `degraded` だったが、数秒後に local/public とも `status=healthy`, `browserReady=true`, `pageReady=true` を確認した。公開 webhook の `live-availability` は `status=resolved`, `source=snapshot_fresh`, `candidateCount=2`, `queueWaitMs=0`, `rpaReadMs=0` を返した。
- `npm test`
- 結果: この作業端末では Node の OOM で失敗。デモ前確認では全件一括ではなく、変更点に近い focused command を優先する。
- live QA 実施時刻:
  - 2026-04-19 03:15 JST `qa-cold-20260419-1` -> `pending_followup / timeout_pending`。初回 browser 起動込みでは 15 秒 budget を超えた。
  - 2026-04-19 03:15 JST `qa-warm-20260419-1` -> `resolved / snapshot_fresh`。
  - 2026-04-19 03:16 JST `qa-cold-20260419-2` -> `resolved / apotool_live`。
  - 2026-04-19 03:16 JST `qa-slotlost-20260419-1` -> `rejected`。
  - 2026-04-19 03:16 JST `qa-overlap-20260419-a` / `qa-overlap-20260419-b` -> 両方 `resolved / apotool_live`、後着 request は `queueWaitMs=2101`。
  - 2026-04-19 03:21 JST `qa-session-expired-20260419-1` -> Playwright browser process kill 後に `resolved / apotool_live`。`artifacts/live-qa/next-live-qa.out.log` に再初期化ログあり。
  - 2026-04-19 03:22 JST `qa-stale-20260419-1` -> `resolved / snapshot_stale`。
  - 2026-04-19 03:22 JST `qa-pending-20260419-1` -> `pending_finalize_post_call`。
- live monitor 抜粋:
  - `qa-warm-20260419-1`: `source=snapshot_fresh`, `queueWaitMs=0`, `rpaReadMs=0`
  - `qa-cold-20260419-2`: `source=apotool_live`, `queueWaitMs=1`, `rpaReadMs=2177`
  - `qa-overlap-20260419-a`: `queueWaitMs=2101`
  - `qa-pending-20260419-1`: `status=pending_finalize_post_call`
- boot prewarm 実機確認:
  - 2026-04-19 03:44 JST `npm run dev` で wrapper 起動後、`artifacts/live-qa/next-live-qa-wrapper-prewarm.out.log` に `Scheduling Apotool boot prewarm` -> `Initializing Apotool browser session` -> `Apotool boot prewarm finished successfully` が出ることを確認。
  - その後の `GET /api/appointment-tool/health` で `browserReady=true`, `pageReady=true`, `prewarmOnBootEnabled=true`, `sessionInitializing=false` を確認。

## 明日のデモ前確認事項
- 起動は必ず `npm run dev` または `npm run start` を使う。`next dev` / `next start` の直叩きでは boot prewarm が走らない。
- デモ直前に `GET /api/appointment-tool/health` を確認し、`status=healthy` かつ `browserReady=true`, `pageReady=true`, `sessionInitializing=false` を満たしていることを確認する。
- `status=degraded` または `browserReady=false` の場合は cold start のまま live availability に入らない。wrapper 起動し直しで prewarm 完了まで持っていく。
- ElevenLabs realtime monitor は現状 `monitoring_enabled=false`。通話中 monitor に依存せず、後段確認は post-call fallback と `artifacts/live-monitor/events.ndjson` を見る。
- デモ本番の前に短い self-call smoke を 1 本だけ実施し、Twilio / ElevenLabs / Apotool の疎通を確認する。
- 2026-04-19 に患者名・予約日 guard は撤去済み。コード側では実投入を止めないため、投入する予約の患者情報と日時はデモ運用で明示的に管理する。
- live availability の初回 read は cold start だと 15 秒 budget に近づく。最初の患者質問の前に warm 状態を確認してから始める。

## コミットログ
### 2026-04-19
- `4bd1302` 親ドキュメント作成と進捗記録ルールの初期化を checkpoint commit。
- `b6971bb` 通話中空き枠返答の live API、queue、managed webhook tool、prompt 調整、関連テストを checkpoint commit。
- `f63c2ab` ElevenLabs tool schema 422 修正、実 agent apply、live QA 7 本、simulate-conversation ブロッカー記録を checkpoint commit。
- `6b0824d` Apotool boot prewarm の wrapper 導入、session init 排他、health 表示追加を checkpoint commit。
- `2758538` 予約投入の患者名・日付 guard を撤去し、health の warm 状態判定と明日のデモ前確認事項を整理した。
- `67bc797` 順序非依存 intake、conversation metadata からの phone number 補完、tool call sound 追加、最新失敗通話の再取り込み確認を checkpoint commit。

## 未解決事項
- snapshot prewarm scheduler はまだ未実装。現状は on-demand read と stale snapshot fallback のみ。
- shared secret は route 認証に使える状態にしたが、現状は header に生値を載せる前提。将来的には ElevenLabs 側の secret locator へ寄せたい。
- ElevenLabs `simulate-conversation` は managed tool の `system__conversation_id` を満たせず 400 になった。実 agent への apply 自体は成功しているが、tool call end-to-end の無人再現は現時点で実通話または実 Web 会話に寄せる必要がある。
- `npm run dev` / `npm run start` では boot prewarm が入ったが、プロセスマネージャや別の起動経路から直接 `next dev` / `next start` を叩くと prewarm は走らない。その場合は wrapper と同等の起動導線へ揃える必要がある。
- 最新修正で post-call 側の phone metadata 補完は解消したが、通話中 live tool の end-to-end 発火は実通話で再確認が必要。`events.ndjson` に `live appointment availability requested/completed` が出るかを本番前にもう一度確認する。
- prewarm 完了前は public health が `degraded`、public lookup も `pending_followup` になり得る。wrapper 起動後または manual prewarm 後に `sessionInitializing=false` まで待ってからデモを開始する必要がある。
