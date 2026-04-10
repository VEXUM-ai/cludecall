# 通常自動予約・急患 live 転送・Slack 通知 実装計画

最終更新: 2026-04-10

## 目的
- 通常受付は、通話後にシステムが Apotool へ自動投入し、その結果を Slack に通知して確認する。
- 急患や人対応希望は、AI がその場で固定番号へ電話転送する。
- 画面上の `review -> 候補確認 -> 投入` は主経路ではなく、再実行や手動補正の補助導線に下げる。

## 実装方針
- `APPOINTMENT_TOOL_MODE=direct_auto` を本線とし、分析完了後に自動で空き確認と予約投入を実行する。
- `general_initial` の routine のみ自動予約対象にする。
- `emergency_initial` や `same_day_phone` は Apotool 自動投入を行わず、ElevenLabs の `transfer_to_number` で live 転送する前提に切り替える。
- 通話後の状態は `自動予約済み / 要確認 / 急患引き継ぎ対象 / 失敗` を主表示にする。
- Slack は先方 workspace に Slack app を入れてもらい、incoming webhook で投稿する。

## 変更対象
- 通話後自動処理の orchestration 追加
- Slack 通知モジュール追加
- ElevenLabs agent prompt と transfer tool 設定の更新
- 既存 UI の主導線見直し
- post-call webhook 入口の追加

## 外部設定
- `SLACK_WEBHOOK_URL`
- `SLACK_CHANNEL_LABEL`
- `URGENT_TRANSFER_PHONE_NUMBER`
- `URGENT_TRANSFER_MODE`
- `APPOINTMENT_TOOL_MODE=direct_auto`

## 補足
- live 転送自体は ElevenLabs の built-in transfer tool に寄せる。
- real-time monitoring は enterprise-only のため、転送の主実装には依存しない。
- 現行の outbound-only デモ番号では本番の live 転送要件を満たしにくいため、実運用では inbound 対応番号への移行が必要。
