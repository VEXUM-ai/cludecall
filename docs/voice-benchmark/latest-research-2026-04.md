# Web音声比較ラボ 最新リサーチ

更新日: 2026-04-06

## 結論
- Web 音声会話の現行本命は `ElevenAgents + eleven_v3_conversational` と `Gemini 3.1 Flash Live Preview` の比較です。
- TTS の読み比較は `Eleven v3` と `Gemini 2.5 Flash TTS Preview` を分けて評価するのが最も安全です。
- `Gemini 3.1 Flash Live Preview` は preview ですが、Google 公式 docs 上で現行の低遅延 Live 系として案内されています。
- `Gemini Live` は `client-to-server + ephemeral token + direct WebSocket` が前提です。バックエンドで音声を中継しない方が、遅延と鍵管理の両面で有利です。

## Google 公式情報

### Models
- Google の models ページでは、`Gemini 3.1 Flash Live Preview` が `low-latency, audio-to-audio` の real-time dialogue 向けとして案内されています。
- 同じ models ページに `Gemini 2.5 Flash TTS Preview` と `Gemini 2.5 Pro TTS Preview` があり、TTS は Live とは別ラインです。
- 参照:
  - [Google models](https://ai.google.dev/gemini-api/docs/models)
  - [Google Live API overview](https://ai.google.dev/gemini-api/docs/live)
  - [Google Live capabilities guide](https://ai.google.dev/gemini-api/docs/live-guide)
  - [Google TTS](https://ai.google.dev/gemini-api/docs/speech-generation)

### Live API
- `Gemini 3.1 Flash Live Preview` は `thinkingLevel=minimal` が既定で、最小遅延向けに設計されています。
- 送受信は raw PCM ベースで、入力は 16-bit PCM 16kHz、出力は 24kHz です。
- `ephemeral tokens` は Live API の client-to-server 利用向けです。短命トークンを使ってブラウザから直接接続します。
- 参照:
  - [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/ephemeral-tokens)

### Pricing
- Google の pricing ページでは、`Gemini 3.1 Flash Live Preview` の audio 価格が `input $3.00 / $0.005 per minute`、`output $12.00 / $0.018 per minute` と案内されています。
- `Gemini 2.5 Flash TTS Preview` は text-to-speech 用として別料金体系です。
- 参照:
  - [Gemini pricing](https://ai.google.dev/pricing)

## ElevenLabs 公式情報

### Expressive mode
- `Eleven v3 Conversational` は ElevenAgents の ultra-low-latency 版で、Expressive mode はこれを選ぶと既定で有効になります。
- 日本語の expressiveness は従来の Flash 系より改善されたと案内されています。
- 参照:
  - [Expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode)

### Models
- `Eleven v3` は expressive な TTS。
- `Eleven Flash v2.5` は real-time 向けの低遅延 TTS で、公式では約 `75ms` の目安が出ています。
- `Scribe v2 Realtime` は約 `150ms` の低遅延 transcription と案内されています。
- 参照:
  - [Models](https://elevenlabs.io/docs/overview/models)

### Conversation flow
- `Turn eagerness` は `Eager`, `Normal`, `Patient` の3段階で、構造化情報を集める場面では `Patient` が推奨です。
- `Soft timeout` は filler phrase を出す仕組みで、低遅延優先の比較では切った方が比較しやすいです。
- `Interruptions` は自然な会話には有効ですが、番号や日時の復唱では慎重に扱うべきです。
- 参照:
  - [Conversation flow](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)

### Prompting guide
- `system_prompt` と `elevenlabs` の2種類の text normalization があり、`elevenlabs` はより堅いが少し遅くなります。
- 数字、記号、メール、電話番号の読みは normalization と tool parameter description の両方で安定化させる必要があります。
- 参照:
  - [Prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
  - [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

### Changelog
- 2026-02-09 の changelog で `eleven_v3_conversational` が agents 用 TTS として追加されました。
- 同 changelog で `suggested_audio_tags`, `turn_model_selection`, `dynamic variable sanitization` などが追加されています。
- 参照:
  - [Changelog 2026-02-09](https://elevenlabs.io/docs/changelog/2026/2/9)

## 現時点の最適解
- 会話比較は `ElevenAgents v3_conversational` と `Gemini 3.1 Flash Live Preview` を直接比較する。
- 読み比較は `Eleven v3` と `Gemini 2.5 Flash TTS Preview` を replay で比較する。
- Gemini Live は `minimal thinking` と direct WebSocket を基準にし、精度寄り設定は別 run に分ける。
- Eleven は `text_normalisation_type=elevenlabs` と `Patient` turn eagerness を精度寄り profile として切り分ける。
