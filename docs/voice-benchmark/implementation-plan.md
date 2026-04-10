# Web音声比較ラボ 実装計画

## 目的
- 既存の歯科一次受付デモを壊さずに、Web 音声比較ラボを追加する。
- `ElevenAgents` と `Gemini 3.1 Flash Live` を同一 UI で切り替え、速度と自然さを比較できるようにする。
- TTS の読み比較は別トラックに分け、会話スタック比較と混ぜない。

## 範囲
- 対象は Web のみ。
- 電話/Twilio はこのフェーズから外す。
- 既存の `えみは総合歯科 大阪梅田院` デモはそのまま残す。

## アーキテクチャ
### 会話系
- `RealtimeVoiceAdapter` を追加し、provider 依存部分を吸収する。
- 実装候補は `ElevenAgentsWebAdapter` と `GeminiLiveAdapter` の 2 つ。
- 既存 `ConversationProvider` は Eleven 固定から adapter 経由に置き換える。

### TTS replay 系
- `TtsReplayAdapter` を追加し、固定スクリプトの音声生成だけを担当させる。
- 実装候補は `ElevenTtsReplayAdapter` と `GeminiTtsReplayAdapter`。
- replay は合成音声の再生と評価を分離し、会話ロジックを入れない。

## API
- `POST /api/voice/gemini/ephemeral-token`
- `GET /api/voice/scripts`
- `POST /api/voice/replay/run`
- `POST /api/voice/benchmark/save`

### Gemini ephemeral token
- `uses=1`
- `newSessionExpireTime=1分`
- `expireTime=30分`
- `liveConnectConstraints.model=gemini-3.1-flash-live-preview`
- `responseModalities=['AUDIO']`

## UI
- `Voice Lab` セクションを追加する。
- モードは `Conversation` と `TTS Replay` に分ける。
- `Conversation` では provider selector, start/stop, transcript, 音声イベント数, first reply 指標, barge-in 復帰時間, 主観評価フォームを表示する。
- `TTS Replay` では provider ごとの固定スクリプト再生、再文字起こし、主観評価を並べる。

## 比較対象
- `eleven_agents_v3_conversational`
- `gemini_3_1_flash_live_preview`
- `eleven_tts_v3`
- `gemini_2_5_flash_tts_preview`

## 固定シナリオ
- `新患予約`
- `痛み相談`
- `FAQ`
- `番号と日時の復唱`
- `被せ発話と割り込み復帰`

## 計測値
- `connect_open_ms`
- `first_audio_chunk_ms`
- `first_audio_play_ms`
- `first_reply_after_user_ms`
- `barge_in_recovery_ms`
- `turn_count`
- `provider_transcript`
- `expected_text`
- `wer_like_diff`
- `human_scores`

## env
- `GEMINI_API_KEY`
- `VOICE_BENCHMARK_ENABLED`
- `VOICE_BENCHMARK_DEFAULT_PROVIDER`
- `VOICE_BENCHMARK_SAVE_ARTIFACTS`

## 実装順
1. 型と保存用データ構造を追加する。
2. Gemini ephemeral token API を追加する。
3. provider-agnostic の会話 adapter を導入する。
4. TTS replay の adapter と保存 API を追加する。
5. Voice Lab UI を追加する。
6. docs と README の導線を更新する。

## テスト
- Eleven と Gemini Live で同一会話シナリオを比較する。
- Eleven v3 と Gemini TTS で固定文を replay する。
- 主観評価と時間計測を同じ run に紐づける。
- README から新 docs に到達できることを確認する。
