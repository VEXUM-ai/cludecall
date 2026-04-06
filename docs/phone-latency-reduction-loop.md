# 電話遅延短縮ループ計画

更新日: 2026-04-06

## 目的

- 実電話で感じた遅延を、感覚ではなく計測ベースで分解して短縮する。
- `ElevenLabs Agent + Twilio outbound` の現行デモを壊さずに、短期改善と中長期の構成見直しを分けて進める。
- 「調べる -> 仮説を立てる -> 改善する -> 評価する -> 次を決める」を継続できる形で残す。

## 結論

- いまの最適解は、いきなり全面移行することではない。
- まずは現行の managed telephony を維持したまま、計測不足を埋め、prompt / turn-taking / 電話発信前の直列待ちを詰める。
- そのうえで、電話の `p95` が目標に届かない場合だけ、Twilio 主導のストリーミング構成に移る。
- つまり方針は二段階にする。
  - 短期最適: 現行 Eleven 電話経路の観測強化と軽量化
  - 中長期最適: Twilio edge を制御できる自前 telephony bridge への移行判断

## 現状実装の把握

### 現在の電話経路

現在の outbound 電話は次の流れで動いている。

1. UI から `POST /api/demo/outbound-call` を呼ぶ。
2. [`app/api/demo/outbound-call/route.ts`](../app/api/demo/outbound-call/route.ts) が [`startOutboundCall()`](../lib/elevenlabs/api.ts) を呼ぶ。
3. [`startOutboundCall()`](../lib/elevenlabs/api.ts) は発信前に次を直列で実行する。
   - `listPhoneNumbers()` で ElevenLabs 側の発信可能番号を取得
   - `getTwilioAccountType()` で Twilio アカウント種別を取得
   - ElevenLabs の `convai/twilio/outbound-call` を実行
4. 通話中の音声メディアは ElevenLabs / Twilio の managed 経路に乗る。
5. 通話後は [`importLatestPhoneCall()`](../lib/elevenlabs/api.ts) が transcript / analysis を取り込み、[`docs/latency-report.md`](./latency-report.md) に集計する。

重要なのは、アプリが live の電話音声パスに入っていない点である。  
そのため、アプリ内の改善だけで削れる遅延と、telephony 構成を変えないと削れない遅延が分かれている。

### すでに入っている高速化

既存実装には、速度改善として次が入っている。

- [`scripts/apply-agent-demo-config.ts`](../scripts/apply-agent-demo-config.ts) で `turn_timeout=6`、`turn_eagerness=eager`、`max_tokens=180`、`cascade_timeout_seconds=6`、`tts.speed=1.0` を適用
- [`lib/agent-speed-config.ts`](../lib/agent-speed-config.ts) で prompt の速度寄せ設定を分離
- [`lib/elevenlabs/api.ts`](../lib/elevenlabs/api.ts) で `https.Agent({ keepAlive: true })` を使用
- 既存ドキュメントでも、prompt 圧縮と turn-taking の見直しが主要レバーとして整理済み

つまり、何もしていない状態ではなく、すでに一度軽量化された状態である。  
今後は「何がまだ未計測か」と「電話経路固有の待ち」を詰めるフェーズに入る。

### コードレベルで見えているボトルネック

サブエージェントでの実装分析と手元確認の結果、現時点で優先して疑うべき箇所は次の通り。

- [`startOutboundCall()`](../lib/elevenlabs/api.ts) が発信前に `listPhoneNumbers()` と `getTwilioAccountType()` を直列実行している
- [`resolveConversationRun()`](../lib/elevenlabs/api.ts) が `1.5秒 x 最大10回` の polling で analysis を待つ
- 最新電話取り込みで `conversationId` 未指定時、最近 20 件から電話通話を逐次探索する
- 履歴一覧が `一覧 1 回 + N 件詳細取得` の構成で、初期表示が N+1 になる
- 履歴詳細や予約確定でも既存会話に対して再度 `resolveConversationRun()` を通る
- 電話取り込みレスポンスの末尾で transcript 全行を live monitor に書いている

このうち、live 通話中の体感遅延に直結しやすいのは「発信前の同期 API 呼び出し」と「managed telephony 側の応答待ち」である。  
`resolveConversationRun()` は主に通話後の分析待ちなので、体感遅延と運用遅延を混ぜて評価しない。

### いま不足している計測

[`docs/latency-report.md`](./latency-report.md) の phone sample は 2026-04-06 時点で 1 本だけで、取れている主指標は `reply_after_user=3167ms` だけである。`connect_ms` と `first_agent_response_ms` は `n/a` のまま。

このため、現時点では次のどこが重いかを厳密には切れていない。

- 発信 API 受付から着信までの setup 遅延
- 相手が電話を取ってから AI 初回挨拶までの遅延
- 患者発話終了から AI 音声開始までの遅延
- 重要語の復唱精度を上げるために残している遅延
- 通話後 analysis の遅延
- Web 側では live monitor にしか残っていない指標があり、集計レポートとのずれがある

特に、Web 側は詳細指標を live monitor には出している一方、集計系には十分残せていない。  
電話も同様に、実通話で感じた待ちをそのまま数値化できるポイントがまだ足りない。

## 遅延を 4 つに分けて扱う

この件では「遅延」を一つの数字として扱わない。最低でも次の 4 系統に分ける。

### 1. Call setup latency

発信ボタン押下から相手電話が鳴るまで、または応答後に AI が初回挨拶を始めるまでの待ち。

主な要因:

- 発信前の追加 API 呼び出し
- Twilio / ElevenLabs 側の call setup
- 電話回線とリージョン経路
- Trial アナウンスなどの電話経路ノイズ

### 2. User -> agent reply latency

患者の発話が終わってから AI が話し始めるまでの待ち。

主な要因:

- turn-taking 設定
- prompt 長
- FAQ / 受付 / 正規化ルールが 1 ターンに混ざっていること
- LLM の推論待ち
- 音声正規化や number/date 読みの安定化処理

### 3. Critical-turn stability

氏名、電話番号、日時などの重要項目で、速さより正確さを優先していることで生じる待ち。

ここは「削るべき遅延」と「意図的に残す遅延」を分ける必要がある。

### 4. Post-call analysis latency

通話終了後に memo や analysis を取り込むまでの待ち。

これは運用上は重要だが、通話中の体感遅延とは分けて評価する。

## 最新ベストプラクティス

以下は 2026-04-06 時点で確認した公式ドキュメントの要点。

### ElevenLabs

- Conversation flow では、customer service は短めの timeout が向いており、`Eager` は速い応答向け、`Patient` は電話番号や住所などの構造化情報回収向けとされている。
- 同ページでは、assistant が「十分な語数とコンマ」を受け取った段階で話し始める改善が入り、完全な文末待ちより低遅延化している。
- Soft timeout は LLM 待ちが長いときの filler 用で、FAQ のように安定して速い bot では無効化が推奨されている。
- Prompting guide では、prompt は section-based にし、短く、重複を減らし、`# Guardrails` に重要ルールを集める方がよいとされる。
- 同 guide では、`text_normalisation_type=elevenlabs` は信頼性が高い一方で minor latency が乗ると明記されている。
- Models overview では、低遅延系として `Eleven Flash v2.5` が約 `75ms`、`Scribe v2 Realtime` が約 `150ms` と案内されている。これは application / network latency を除く。
- Simulate Conversations guide では、失敗会話を元に simulated user と評価基準を作り、simulation -> analysis -> criteria 改善 -> agent 改善 -> continuous iteration を回す流れが推奨されている。

### Twilio

- Edge Locations では、Programmable Voice / SIP 系は edge を選べる。`tokyo` と `roaming` があり、近い edge を選ぶことで経路遅延を詰められる。
- Voice Insights では call summary / call metrics / event stream を使って通話品質と接続パラメータを見られる。
- ConversationRelay best practices では、LLM の text token は完成文を待たず、到着し次第 stream する方が応答開始を早めやすいとされる。

### Google Gemini Live

- Live API は low-latency / real-time の音声会話用で、`client-to-server` 直結は backend proxy を挟まないため streaming 音声では有利とされる。
- Ephemeral tokens も「client が Gemini に直接送ることで latency が改善する」と明記されている。
- ただし、これは Web / device 直結の best practice であり、PSTN 電話にそのまま適用するには telephony bridge が必要である。

## この repo での最適解

### 短期の最適解

短期の最適解は、現行の `ElevenLabs Agent + Twilio outbound` を維持しながら、次の順で改善すること。

1. 計測不足を埋める
2. 発信前の直列待ちを削る
3. prompt / turn-taking を用途別に切る
4. 重要ターンの精度を壊さない範囲で speed を詰める

この順番がよい理由は、現行の phone sample がまだ薄く、いま全面移行しても「何が効いたか」が分からなくなるため。

### 中長期の最適解

もし電話の live latency を本気で詰めるなら、中長期の最適解は managed telephony に閉じたままではなく、Twilio 主導の streaming telephony に移ること。

候補:

- Twilio ConversationRelay + token streaming
- Twilio Media Streams + 任意の STT / LLM / TTS

この構成に移ると、次が可能になる。

- `tokyo` / `roaming` edge の利用
- STT / LLM / TTS の個別差し替え
- first token / first audio / barge-in 復帰の厳密計測
- Eleven Flash / Gemini Live / その他低遅延スタックの公平比較

逆に、現行の managed 電話経路ではこの粒度の制御は難しい。

## 直近で回す改善ループ

### Phase 0: baseline を取り直す

最低 10 本の outbound phone call を、次の 3 シナリオで取る。

- 新患予約
- 痛み相談
- FAQ + 日時確認の複合ターン

各通話で残す指標:

- 発信要求から API 受付まで
- API 受付から着信開始まで
- 応答後から AI 初回挨拶まで
- `user_end -> first_agent_audio`
- `average_reply_after_user_ms`
- 氏名 / 電話番号 / 日付の回収精度
- post-call analysis 完了まで

証跡:

- [`docs/latency-report.md`](./latency-report.md)
- [`docs/demo-runs/*.md`](./demo-runs/README.md)
- live monitor
- Twilio Voice Insights の call summary

### Phase 1: 構成を変えずに削る

#### A. 発信前の待ちを削る

[`startOutboundCall()`](../lib/elevenlabs/api.ts) では、毎回 `listPhoneNumbers()` と `getTwilioAccountType()` を呼んでいる。  
これは live 会話前の setup latency を増やしうる。

対策:

- 発信可能番号の `phone_number_id` を起動時または一定 TTL で cache する
- Twilio account type 確認を毎回の同期パスから外す
- warning 表示用 API は非同期化する
- outbound API 内で各外部呼び出し時間をログに残す

#### B. live agent 設定の live 反映を担保する

既存 docs にある通り、branch に適用した高速化設定が live に publish されていないと、体感改善は出ない。

対策:

- `npm run agent:apply-demo-config`
- ElevenLabs UI で branch を公開
- 公開後に実電話で再計測

#### C. prompt をさらに分割する

現在の prompt は既にかなり整理されているが、まだ「受付フロー」「FAQ」「booking rules」「guardrails」が同居している。

対策:

- 受付の主線に必要な facts だけを初期 prompt に残す
- 長い FAQ は follow-up 時だけ参照する形に寄せる
- 1 ターンで複数の責務を負わせない

#### D. turn-taking を用途別にする

固定で `eager` のままでは、応答は速くても重要項目で割り込みやすい。

方針:

- 通常応答: `eager`
- 氏名 / 電話番号 / 日時 / 復唱: `patient` 寄り

可能なら workflow で切り替える。  
一律設定しか使えない場合は、速度優先 run と精度優先 run を分けて比較する。

#### E. normalization のトレードオフを切り分ける

番号・日時の読みを安定化する処理は、速さより正確さが重要な領域である。

方針:

- 重要語の安定化のために必要な遅延は残す
- FAQ のような軽いターンでは余計な正規化を増やさない
- `elevenlabs` normalizer を使うなら、その minor latency を「残す遅延」として明示する

### Phase 2: 評価して gate を切る

次の gate を置く。

- `p50 user->agent` が 1.8 秒以下
- `p95 user->agent` が 2.5 秒以下
- 氏名 / 電話番号 / 日付の回収精度が現状以下に落ちない

満たした場合:

- managed telephony のまま改善継続

満たさない場合:

- Twilio 主導 streaming telephony の PoC に進む

### Phase 3: 構成比較 PoC

比較対象は 3 つに分ける。

- 現行: ElevenLabs Agent phone
- 低遅延候補: Twilio bridge + Eleven Flash 系
- 代替候補: Twilio bridge + Gemini Live

比較軸:

- setup latency
- first audio latency
- first reply after user
- interruption recovery
- 数字 / 日付 / 固有名詞の読み
- 実電話での聞き取りやすさ

ここでは Web 比較ラボと同じ rubric を使うが、電話回線劣化込みの結果は別表で持つ。

## 直近の実装タスク

優先順位順に並べる。

1. 電話 path に `connect_ms` と `first_agent_response_ms` を入れるための計測点を追加する
2. Twilio Voice Insights の call summary を手動でも良いので run ごとに紐付ける
3. [`startOutboundCall()`](../lib/elevenlabs/api.ts) の前段 API 呼び出しを cache 化する
4. live agent 設定が publish 済みかを確認する手順を runbook 化する
5. prompt の軽量版 profile を作る
6. 重要項目回収ターンだけ `patient` を試す比較 run を追加する
7. gate 未達時のみ Twilio ConversationRelay / Media Streams の PoC に進む
8. `resolveConversationRun()` の polling 回数と総待ち時間を計測し、通話中遅延とは別の KPI に切り出す
9. 最新電話取り込みの「最近 20 件走査」を conversationId 指定優先に寄せる

### 実施済みメモ

2026-04-06 時点で、次は実装済み。

- outbound call の `resolvePhoneNumberMs`、`twilioAccountLookupMs`、`outboundRequestMs`、`totalMs` を API / live monitor / UI に表示
- `resolveConversationRun()` の `analysisRequestMs`、polling 回数、polling 待ち合計、detail fetch 合計、`totalMs` を記録
- phone import 時の `latency.analysisMs` に analysis 解決時間を入れる
- 発信番号解決を 5 分 cache 化し、Twilio account type lookup も 5 分 cache 化
- Twilio account type lookup を outbound request と並列化し、同期クリティカルパスから外す

未着手なのは Twilio Voice Insights 紐付け、live 通話自体の `connect_ms` / `first_agent_response_ms` の採取、履歴取り込み側の探索短縮である。

## やらないこと

- phone の体感遅延と post-call analysis 遅延を同じ表で語らない
- Web 音声比較ラボの結果を、そのまま PSTN 電話の結果として扱わない
- 1 本だけの phone sample を根拠にモデル総替えしない
- 氏名 / 電話番号 / 日付の安定化を、速さのためだけに先に削らない

## 参照

### repo 内

- [`docs/latency-report.md`](./latency-report.md)
- [`docs/runbook.md`](./runbook.md)
- [`docs/v3-speed-optimization-research.md`](./v3-speed-optimization-research.md)
- [`docs/voice-benchmark/latest-research-2026-04.md`](./voice-benchmark/latest-research-2026-04.md)
- [`docs/voice-benchmark/implementation-plan.md`](./voice-benchmark/implementation-plan.md)
- [`lib/elevenlabs/api.ts`](../lib/elevenlabs/api.ts)
- [`scripts/apply-agent-demo-config.ts`](../scripts/apply-agent-demo-config.ts)

### 公式 docs

- ElevenLabs Conversation flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- ElevenLabs Prompting guide: https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide
- ElevenLabs Models overview: https://elevenlabs.io/docs/overview/models
- ElevenLabs Simulate Conversations: https://elevenlabs.io/docs/eleven-agents/guides/simulate-conversations
- Twilio Edge Locations: https://www.twilio.com/docs/global-infrastructure/edge-locations
- Twilio Voice Insights: https://www.twilio.com/docs/voice/voice-insights
- Twilio ConversationRelay best practices: https://www.twilio.com/docs/voice/conversationrelay/best-practices
- Gemini Live API overview: https://ai.google.dev/gemini-api/docs/live
- Gemini Live API capabilities guide: https://ai.google.dev/gemini-api/docs/live-guide
- Gemini ephemeral tokens: https://ai.google.dev/gemini-api/docs/ephemeral-tokens

## 2026-04-07 update

- Latest phone samples still show meaningful headroom in mid-call latency: `avg_reply_after_user_ms = 4905`, with recent runs at `3167 / 5063 / 5500 / 5889ms` and one `firstAgentReplyAfterUserMs = 12000`.
- Current outbound setup is already relatively small: recent `totalMs` is roughly `530-818ms`, and the remaining local miss on `resolveAgentPhoneNumber()` is about `0.2s`.
- The live agent was still heavier before this update: `turn_timeout = 8`, `turn_eagerness = normal`, `max_tokens = 180`, `tts.speed = 0.95`, `tts.model_id = eleven_v3_conversational`, `monitoring_enabled = false`, and the applied prompt length was about `9749` characters.

### What still looks reducible without architecture change

- Shorten the agent prompt and keep the fast overlay concise. ElevenLabs recommends concise prompts, and Google recommends shorter prompts plus tighter output limits for lower TTFT/TTLT.
- Reduce output length first. In this repo, `max_tokens` is a direct and low-risk lever compared with reintroducing `eager`.
- Keep conversational pacing normal, but avoid artificially slow speech. `tts.speed = 0.95` makes the call feel slower even when backend latency is unchanged.
- Keep `turn_eagerness = normal` globally, and reserve more patient turn-taking only for structured collection turns such as names, phone numbers, and appointment slots.
- Separate live call latency from post-call analysis latency. The current `analysisMs` is often `9-19s`, but that is not the same KPI as user-perceived response time.

### What likely needs architecture change

- Twilio edge/media-path tuning becomes much more meaningful only after moving to Twilio-controlled streaming telephony such as ConversationRelay or Media Streams.
- If we want direct control over `connect_ms`, `first_audio_ms`, barge-in, and regional media placement, the next step is a Twilio streaming bridge rather than more patching around managed ElevenLabs outbound telephony.

### Implemented this round

- Reduced the repo default `max_tokens` from `180` to `120`.
- Rewrote the speed overlay prompt into a much shorter rule set focused on one-question turns, no rapid-fire after hesitations, and no repeated confirmations.
- Kept repo default TTS speed at `1.0` and preserved `turn_eagerness = normal`.
- Made phone import stop waiting on transcript mirroring before responding.
- Added optional Twilio region-aware REST base URL support through `TWILIO_API_EDGE` + `TWILIO_API_REGION`.
- Re-applied the agent config, and the live agent now reflects `turn_timeout = 7`, `turn_eagerness = normal`, `max_tokens = 120`, `tts.speed = 1.0`, and `monitoring_enabled = false`.

### Recommended next experiments

1. Apply the updated branch config and publish it, then run 3-5 real phone calls with the same script.
2. Compare `max_tokens = 120` against the previous branch with the same call script and record `firstAgentReplyAfterUserMs`, `averageAgentReplyAfterUserMs`, and subjective pacing.
3. If the call still feels slightly slow after prompt/output slimming, test `eleven_flash_v2_5` against `eleven_v3_conversational` as a latency-first branch.
4. Only after the above, decide whether Twilio ConversationRelay / Media Streams PoC is justified.
