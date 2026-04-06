# 現状実装の詳細棚卸し

最終更新: 2026-04-06

## 1. 概要
- このリポは Next.js App Router ベースの単一アプリで、Web 会話 UI、ElevenLabs 連携、Twilio outbound 起動、通話後 import、履歴表示、仮受付ドラフト表示を同居させている。
- 会話の主系データは ElevenLabs Conversations API にあり、アプリ側は analysis 結果、latency、アポツール投入用ドラフトを正規化して表示する。
- 実クライアントの設定先は `えみは総合歯科 大阪梅田院` に置き換え済みで、固定 prompt と runtime knowledge はその前提に合わせている。

## 2. Web 会話
- クライアント側の会話制御は [components/conversation-provider.tsx](/C:/Dev/Work/デンタル 一次受付AI/components/conversation-provider.tsx) が担当する。
- 接続方式は WebRTC を優先し、PeerConnection 系の失敗時は WebSocket fallback を試す。
- 発話は `onMessage` で transcript に積み、`onDebug` の tentative agent response も UI で可視化する。
- 終話後は `POST /api/eleven/analyze` を呼び、`memo`、`evaluation`、`appointmentDraft` を返す。
- 同時に `POST /api/demo/latency` で Web 会話の connect / first response / analysis の指標を保存する。

## 3. 電話デモ
- outbound の入口は [app/api/demo/outbound-call/route.ts](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/outbound-call/route.ts)。
- 実体は [lib/elevenlabs/api.ts](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts) の `startOutboundCall()` で、ElevenLabs の `convai/twilio/outbound-call` を呼ぶ。
- 発信時は ElevenLabs 側の outbound 対応番号を解決し、`ELEVENLABS_AGENT_PHONE_NUMBER` があればそれを優先する。
- 取り込みは [app/api/demo/import-last-call/route.ts](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/import-last-call/route.ts) から行い、最新の `status=done` な phone conversation を拾う。
- inbound 電話、通話完了時の自動 webhook 同期、予約ツール自動登録はまだ入っていない。

## 4. Agent 設定
- prompt / data collection / evaluation criteria は [lib/agent-demo-config.ts](/C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts) に定義する。
- live agent への反映は [scripts/apply-agent-demo-config.ts](/C:/Dev/Work/デンタル 一次受付AI/scripts/apply-agent-demo-config.ts) で行う。
- 2026-04-06 時点の固定知識は次を含む。
  - 医院名、住所、電話番号、診療時間、休診日、アクセス、駐車場、初診来院案内、急患案内
  - 初診、急患、THP、無料歯科検診、インプラント、ホワイトニング、インビザラインの要約ルール
  - 予約確定しない、医療判断しない、内部情報を出さない、という guardrail
- data collection は 16 項目。
  - 既存 12 項目に加えて `service_line` `triage_level` `line_form_status` `manual_review_reason`

## 5. 分析と正規化
- [lib/elevenlabs/memo.ts](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/memo.ts) が transcript、analysis、memo を正規化する。
- `ReservationMemo` は従来の受付項目に加え、問い合わせ区分と人確認理由を保持する。
- [lib/appointments.ts](/C:/Dev/Work/デンタル 一次受付AI/lib/appointments.ts) が `AppointmentDraft` を生成する。
- `AppointmentDraft` は次を持つ。
  - service line
  - triage
  - LINE問診ステータス
  - 希望枠
  - handoff summary
  - appointment tool payload
  - submission mode / state

## 6. 予約ツール連携の現状
- 実ツール名は一般化して `アポツール` として扱う。
- API 仕様、認証方式、必須入力項目は未確定なので、今回の実装は `manual_review` を既定値にしている。
- [app/api/demo/appointments/confirm/route.ts](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/appointments/confirm/route.ts) で `確認してアポ登録` の状態遷移だけを実装した。
- 状態は `drafted -> needs_manual_entry` が基本で、将来 `auto_after_review` / `direct_auto` に拡張できる。
- 確認後ドラフトは `output/appointment-drafts/<conversationId>.json` に保存される。

## 7. UI
- メイン画面は [components/home-page.tsx](/C:/Dev/Work/デンタル 一次受付AI/components/home-page.tsx)。
- 画面では次を同時に見られる。
  - えみは総合歯科の公開プロフィール
  - Web 会話の transcript とメモ
  - ライブ latency
  - 最近の会話履歴
  - 履歴詳細の transcript / evaluation / memo / appointmentDraft
  - Twilio outbound 起動
- `確認してアポ登録` を押すと、アポツール投入用 payload を見ながら人手登録に進める。

## 8. 永続化
- 会話そのものは ElevenLabs Conversations API から都度取得する。
- latency は `artifacts/latency/*.json` に保存する。
- demo run の Markdown / JSON は `docs/demo-runs` と `artifacts/demo-runs` に保存する。
- appointment draft の submission state は `output/appointment-drafts` に保存する。
- アプリ独自 DB は持っていない。

## 9. 既知の制約
- `アポツール` の実 API 連携は未実装。今回の完成条件は `確認後登録` まで。
- 空き枠照会、予約重複判定、本当の予約確定は行わない。
- inbound 電話、通話完了時自動 import、院内確認ワークフローのステータス管理も未実装。
- 先方シートには内部 URL や認証情報相当が含まれているため、今回の runtime knowledge には入れていない。
- 支払い方法は公開一次情報で未確認のため、prompt に含めていない。
