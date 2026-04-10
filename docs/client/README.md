# えみは総合歯科 大阪梅田院デモ資料

このディレクトリは、`えみは総合歯科 大阪梅田院` 向けに刷新したデモの説明資料をまとめたものです。対象は次の3つです。

- 現在このリポで何が実装されているか
- 今回どの方針で何を実装したか
- 今後どこまで広げるか

## 資料一覧
- [AI一次受付ハイブリッド設計.md](/C:/Dev/Work/デンタル 一次受付AI/docs/AI一次受付ハイブリッド設計.md)
  - 今後の中核方針。`AI一次受付 + 構造化ドラフト + 例外だけ人確認` を前提にした review queue / confidence / 条件付き自動化の設計。
- [current-state-audit.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/current-state-audit.md)
  - 2026-04-06 時点の実装事実。Web 会話、Twilio outbound/import、ElevenLabs prompt/data collection、履歴、仮受付ドラフト、確認後アポ登録フローの棚卸し。
- [implementation-plan-emiha.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/implementation-plan-emiha.md)
  - 今回の刷新方針、受け入れ条件、型/API/UI の変更、アポツール連携の設計方針。
- [roadmap-future-scope.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/roadmap-future-scope.md)
  - 今回はやらないが、次段で着手すべき本実装スコープ。
- [emiha-public-profile.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/emiha-public-profile.md)
  - 公式サイト由来の公開情報整理。
- [appointment-knowledge-pack.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/appointment-knowledge-pack.md)
  - `【アポ関連】マニュアル.xlsx` の抽出結果と、AI に渡す情報 / 渡さない情報の整理。
- [apotool-integration-research.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/apotool-integration-research.md)
  - `2026-04-06` 時点のアポツール連携リサーチ。試験環境の確保、公式Web予約への誘導、ベンダー正式連携、RPA fallback の順で整理。
- [auto-booking-live-handoff-plan-2026-04-10.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/auto-booking-live-handoff-plan-2026-04-10.md)
  - `通常受付は終話後に自動予約、急患はその場で人へ転送、結果は Slack 通知` へ切り替えた直近計画。
- [emiha-followup-plan-2026-04-09.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/emiha-followup-plan-2026-04-09.md)
  - 通知、電話番号精度、急患運用の論点整理。現在はこのうち急患運用を live handoff 前提で更新済み。
- [slack-demo-bot-setup.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/slack-demo-bot-setup.md)
  - VEXUM workspace 内でデモ用の Slack bot を作り、`bottest` に通知を出すための manifest と導入手順。
- [../voice-benchmark/latest-research-2026-04.md](/C:/Dev/Work/デンタル 一次受付AI/docs/voice-benchmark/latest-research-2026-04.md)
  - Web 音声比較ラボの最新リサーチ。Gemini 3.1 Flash Live、Gemini TTS、ElevenAgents v3_conversational、Eleven v3 の比較前提を整理。
- [../voice-benchmark/implementation-plan.md](/C:/Dev/Work/デンタル 一次受付AI/docs/voice-benchmark/implementation-plan.md)
  - 比較 UI、adapter 境界、API、env、計測項目の実装方針。
- [../voice-benchmark/evaluation-rubric.md](/C:/Dev/Work/デンタル 一次受付AI/docs/voice-benchmark/evaluation-rubric.md)
  - 自然さ、読み、復唱精度、受付らしさ、被せ耐性の採点基準。

## 読み方
- デモ全体像を短時間で把握したいとき
  - `README.md` → `AI一次受付ハイブリッド設計.md` → `current-state-audit.md`
- クライアント向け説明や導入判断に使いたいとき
  - `emiha-public-profile.md` → `appointment-knowledge-pack.md` → `AI一次受付ハイブリッド設計.md` → `implementation-plan-emiha.md`
- 将来の自動化や予約ツール連携の検討に進みたいとき
  - `AI一次受付ハイブリッド設計.md` → `implementation-plan-emiha.md` → `apotool-integration-research.md` → `auto-booking-live-handoff-plan-2026-04-10.md` → `roadmap-future-scope.md`
- Web 音声比較ラボを進めたいとき
  - `docs/voice-benchmark/latest-research-2026-04.md` → `docs/voice-benchmark/implementation-plan.md` → `docs/voice-benchmark/evaluation-rubric.md`

## 現在の実装状態
今の本線は次の流れです。

1. 電話または Web で受付する
2. 終話後に AI が `appointmentDraft` を作る
3. 通常受付なら、候補枠確認と Apotool 投入を自動で進める
4. 成功、失敗、要確認を Slack に通知する
5. 急患や人対応希望は、その場で人へ電話を転送する

つまり、以前の `人が内容を見てから予約投入` が主経路ではありません。現在は `通常受付は自動投入、急患は live handoff、結果確認は Slack` へ寄せています。ホーム画面上の review 操作は、主経路ではなく再実行や手動補正のために残しています。

## 加藤さんに見せられる内容
- 通常受付の通話から自動で受付内容が整理されること
- 通常受付は終話後にそのまま候補枠確認と Apotool 投入まで進められること
- 投入後の状態を画面上で追えること
- 急患や人対応希望は、電話を切らずに人へつなぐ前提で組んでいること
- 読み方調整と、同じ質問の繰り返し対策が入っていること

## 実装済みだが外部設定待ちのもの
- Slack 通知
  - コードは実装済み。`SLACK_BOT_TOKEN` と `SLACK_CHANNEL_ID` が入れば `予約成功 / 失敗 / 要確認 / 急患 handoff` を通知できる
- 急患 live handoff
  - Agent 設定と apply script は対応済み。`URGENT_TRANSFER_PHONE_NUMBER` が入れば ElevenLabs に転送 tool を付けられる
- post-call webhook
  - `/api/eleven/post-call-webhook` は実装済み。ElevenLabs 側の webhook 設定が必要

## 加藤さん側でお願いしたい設定
- Slack workspace 側で bot token を発行してもらう
  - 通知先チャンネルを1つ決めて、`SLACK_BOT_TOKEN` と channel id とチャンネル名を共有してもらう
- 急患転送先の電話番号を1つ決めてもらう
  - 受付または院内の固定番号を `URGENT_TRANSFER_PHONE_NUMBER` に設定する
- ElevenLabs の post-call webhook をこのアプリへ向ける
  - URL は `/api/eleven/post-call-webhook`
- 本番で live handoff を安定運用する場合は、着信を受けられる Twilio 番号を ElevenLabs agent に割り当てる
  - Verified Caller ID 前提のデモ構成のままでは本番運用に向かない

## いまの制約
- 自動投入の対象は `general_initial` の通常受付が中心
- 急患は自動予約せず、その場で人に接続する前提
- Slack と転送先番号が未設定だと、その箇所は実装済みでも動かない
- 電話番号認識精度の改善は今回の本線ではない
- `APPOINTMENT_EXECUTION_POLICY=test_only` が既定なので、実運用前はテスト条件を外す判断が必要

## 現時点の結論
- デモは `えみは総合歯科 大阪梅田院` の公開情報と、先方シートから抽出した内部予約ルールを使う。
- 通常受付は終話後に自動で候補枠確認と `アポツール` 投入まで進める方針に切り替えた。
- 投入結果や要確認は Slack 通知で把握する設計に変わった。
- 急患や人対応希望は、折り返しではなくその場で人へ電話をつなぐ前提で進めている。
- review UI は残しているが、主経路ではなく再実行と手動補正のための補助機能になっている。
- 本番稼働には Slack webhook、急患転送先番号、ElevenLabs webhook 設定が必要。
- 本番稼働には Slack bot token と channel id、急患転送先番号、ElevenLabs webhook 設定が必要。
