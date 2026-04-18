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
- [ ] 1. 親ドキュメント作成と初期 TODO 投入
- [ ] 2. live availability 用 service 境界の切り出し
- [ ] 3. single-flight queue 導入
- [ ] 4. snapshot store 導入
- [ ] 5. `live-availability` API 追加
- [ ] 6. `live-hold-confirm` API 追加
- [ ] 7. ElevenLabs server tool 配線
- [ ] 8. prompt / timeout / waiting behavior 調整
- [ ] 9. integration test / live QA
- [ ] 10. 運用メモと残課題整理

## 実装ログ
### 2026-04-19
- `in_progress`: 1. 親ドキュメント作成と初期 TODO 投入
- これ以降の実装ログ、テストログ、コミットログはこのファイルに集約する。

## テストログ
### 2026-04-19
- まだ未実施。

## コミットログ
### 2026-04-19
- 予定: 親ドキュメント作成と進捗記録ルールの初期化を checkpoint commit する。

## 未解決事項
- ElevenLabs server tool の自動作成・更新を `scripts/apply-agent-demo-config.ts` にどこまで組み込むか。
- stale snapshot の caller-facing 文言をどこまで agent prompt に寄せ、どこまで tool description に寄せるか。
- live hold confirm が 15 秒以内に終わらない場合の `pending_finalize_post_call` 通知文言。
