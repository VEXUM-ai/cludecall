# Eleven v3 応答速度改善メモ

## 結論
- `Eleven v3 Conversational` は維持したまま改善余地があります。
- いちばん効くのは TTS モデル変更ではなく、`turn-taking`、prompt 圧縮、接続前の直列待ち削減です。
- 直近の Web 会話分析では、成功会話の `user -> agent` 応答時間は中央値 `5秒`、平均 `8.1秒`、最大 `23秒` でした。
- 最大値の山は FAQ と日程変更が一度に来た複合ターンで発生しており、会話設計の影響が大きいです。

参照:
- [Conversation flow](https://elevenlabs.io/docs/conversational-ai/customization/conversation-flow)
- [Expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode)
- [Prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
- [Conversational voice design](https://elevenlabs.io/docs/eleven-agents/customization/voice/best-practices/conversational-voice-design)
- [React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)

## 公式ソースから確認した要点
1. `turn_timeout` は customer service なら `5-10s`、情報収集なら `10-15s` が目安。
2. `turn_eagerness` は customer service なら `Eager` が第一候補。
3. `interruptions` は自然な back-and-forth のため有効前提。
4. prompt は短く、重複を減らし、1ターン1質問に寄せるほど有利。
5. `V3 Conversational` は live conversation 向けで、表現は prompt 主導、audio tag は最小限が前提。
6. `tts.speed` は上げすぎず、必要でも `1.03-1.05` 程度の微調整が無難。
7. monitoring / analytics / client events を使い、待ちの発生箇所を分解して計測するのが推奨。

## この repo で見つかったボトルネック
1. `startConversation()` が `audio unlock -> getUserMedia -> token fetch -> startSession` の直列待ちになっていた。
2. WebRTC 失敗環境では毎回 WebRTC 失敗待ちのあとに WebSocket fallback を開始していた。
3. ElevenLabs API への呼び出しが keep-alive なしで毎回新規 HTTPS 接続だった。
4. prompt が長く、FAQ と受付フローの両方を初回ターンから重く持っていた。
5. 履歴 API をページ初期表示直後に読み込んでいた。
6. 音量レベル polling が細かく、UI 再描画が多かった。

## 今回入れた改善
1. `components/conversation-provider.tsx`
   - `unlockBrowserAudioPlayback()` と `getUserMedia()` を並列化
   - 開始経路から `refreshOutputDevices()` の待ちを除外
   - 前回成功した transport を `localStorage` に記録し、次回の初期 transport に再利用
   - 音量 polling を `320ms` に緩め、微小変化では state を更新しないよう変更
   - `connectMs` を `onConnect` 基準で確定
2. `lib/elevenlabs/api.ts`
   - `https.Agent({ keepAlive: true })` を導入
3. `lib/agent-demo-config.ts`
   - 歯科受付 prompt を短く再設計
   - FAQ は頻出項目に寄せて圧縮
4. `scripts/apply-agent-demo-config.ts`
   - `turn_timeout=6`
   - `turn_eagerness=eager`
   - `max_tokens=180`
   - `cascade_timeout_seconds=6`
   - `Eleven v3 Conversational + expressive_mode=true` を維持
5. `components/home-page.tsx`
   - 会話履歴の初回読み込みを idle 後へ遅延

## 注意点
- `npm run agent:apply-demo-config` で更新されるのは現状 branch 側設定です。
- API で branch 指定なしに読む live 設定は、まだ `turn_timeout=7 / turn_eagerness=normal / max_tokens=220` のままでした。
- つまり、branch 側の高速化設定を live に反映するには ElevenLabs UI で `公開` が必要です。

## すぐ試す順番
1. `npm run agent:apply-demo-config`
2. ElevenLabs UI で対象 branch を `公開`
3. Web 会話を 3 本回す
4. `docs/latency-report.md` と `docs/web-conversation-analysis.md` を見比べる
5. まだ重ければ次に `tts.speed` の微調整、FAQ のさらなる圧縮、あるいは LLM 側の見直しを検討する
