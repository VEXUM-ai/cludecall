# えみは総合歯科 大阪梅田院向け実装計画

最終更新: 2026-04-06

## 1. 目的
- デモ全体を `えみは総合歯科 大阪梅田院` 前提に差し替える。
- クライアント提供シートを、そのまま prompt に貼るのではなく、公開情報と内部ルールに分解して使う。
- 会話結果を `仮受付ドラフト` として構造化し、`確認後にアポツールへ登録する` フローまで見せる。

## 2. 今回の実装方針
- 固定 prompt 中心の構成は維持するが、知識源を `lib/clinic-config/emiha.ts` に寄せる。
- 先方シートの内容は `患者向け案内` `予約制約` `エスカレーション条件` `除外情報` に整理する。
- data collection には既存項目を残しつつ、問い合わせ区分と人確認理由を追加する。
- 予約ツールは抽象化だけ先に入れ、実送信は `manual_review` を既定値にする。
- 将来方針は [AI一次受付ハイブリッド設計.md](/C:/Dev/Work/デンタル 一次受付AI/docs/AI一次受付ハイブリッド設計.md) に合わせ、`AI一次受付 + 構造化ドラフト + 例外だけ人確認` を前提にする。

## 3. 実装済み変更
- 旧仮プロフィールを `えみは総合歯科 大阪梅田院` に置換。
- `lib/agent-demo-config.ts` を再構成し、公開情報と予約ルールをもとに prompt を生成。
- `ReservationMemo` を拡張し、`service_line` `triage_level` `line_form_status` `manual_review_reason` を保持。
- `AppointmentDraft` と `AppointmentToolPayload` を追加。
- `AnalyzeConversationResponse` `ConversationHistorySummary` `ConversationHistoryDetail` に `appointmentDraft` を追加。
- `POST /api/demo/appointments/confirm` を追加。
- UI に `確認してアポ登録` と payload 表示を追加。

## 4. アポツール連携の設計
- モード
  - `manual_review`
  - `auto_after_review`
  - `direct_auto`
- 今回は `APPOINTMENT_TOOL_MODE=manual_review` を既定値にする。
- `manual_review` では、確認ボタン押下後に `needs_manual_entry` 状態へ遷移し、payload を見ながら人がアポツールへ登録する。
- 将来 API が分かれば、`confirm` 後に adapter を呼ぶ構成へ差し替える。

## 5. 受け入れ条件
- 患者向け案内が `えみは総合歯科 大阪梅田院` の公開情報に一致する。
- 予約確定とは言わず、必ず仮受付で終える。
- Web 会話と電話 import の両方で `appointmentDraft` が生成される。
- `確認してアポ登録` 実行後、submission state が更新される。
- payload に内部URLや認証情報が含まれない。
- 仮の旧医院名がコードと docs の可視領域に残らない。

## 6. 検証ポイント
- 初診、急患、THP、無料歯科検診、インプラント、ホワイトニング、インビザラインで service line が正しく分かれるか。
- 急患で `same_day_phone` が付き、インプラントやインビザで `doctor_required` が付くか。
- LINE問診未回答想定で `needs_arrival_form` が付くか。
- 通話 import 後の detail でも同じ draft が再現されるか。

## 7. 今回入れていないもの
- 実アポツール API への書き込み
- 空き枠照会
- 重複予約のリアルタイム判定
- inbound 電話の自動取り込み
- webhook での業務レコード同期

## 8. 次段で追加するもの
- `AppointmentDraft` の各項目に `confirmedByCaller` `confidence` `reviewReason` を持たせる
- `decision=auto_complete | manual_review | urgent_handoff` の導入
- transcript ビューではなく、判断用の `review queue` UI / API を追加する
- `manual_review` を既定としつつ、再診の単純ケースだけ `auto_after_review` や限定的 `direct_auto` を検討する
