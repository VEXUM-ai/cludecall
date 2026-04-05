# Runbook

## Web デモ
1. `.env` に `ELEVENLABS_API_KEY` と `ELEVENLABS_AGENT_ID` を設定する。
2. `npm install`
3. `npm run agent:apply-demo-config`
4. `npm run dev`
5. ブラウザで開始し、会話後に memo を確認する。
6. `could not establish pc connection` が出る端末では、アプリが自動で WebSocket fallback を試す。失敗する場合はページを再読み込みしてから再度 `開始` を押す。
7. 会話終了後の analysis 成功時に、Web の接続時間と初回応答時間が `docs/latency-report.md` に自動集計される。
8. UI で Eleven v3 や voice を手動変更した場合、公開後に `npm run agent:apply-demo-config` を実行しても、その時点の live agent の TTS 設定を維持する。`.env` に `ELEVENLABS_TTS_MODEL_ID` や `ELEVENLABS_VOICE_ID` を入れた場合だけ明示的に上書きする。

## 即日電話デモ
1. `npm run agent:apply-demo-config` を実行し、歯科受付用の prompt と Data Collection を live agent に再適用する。
2. ElevenLabs の Phone Numbers で Twilio 連携を行い、Verified Caller ID を import する。
3. Verified Caller ID は `outbound-only` のため agent には割り当てられない。電話番号詳細画面に `この電話番号は着信通話をサポートしておらず、エージェントに割り当てることはできません` と表示されたら想定どおり。
4. アプリの `AI から電話をかける` から発信先番号を入力して outbound call を送る。ダッシュボードの `発信コール` を使ってもよい。
5. 通話終了後、アプリの「最新の電話会話を取り込む」か `npm run demo:import-last-call` を実行する。
6. 生成された `docs/demo-runs/*.md` を証跡として確認する。
7. transcript に時刻情報があれば、電話の応答間隔も `docs/latency-report.md` に自動集計される。
8. inbound デモが必要になったら、Twilio の購入番号か SIP trunk を別途用意する。

## 将来の inbound 移行
1. Twilio 日本 `national number` の規制申請を通す。
2. 取得した番号を ElevenLabs に import する。
3. 同じ agent に inbound を割り当てる。
4. 回収処理と Markdown 生成はそのまま再利用する。

## 失敗時の切り替え
- Twilio 日本番号の審査待ち: outbound-only デモへ切り替える。
- Verified Caller ID に agent を割り当てられない: `発信コール` ベースの outbound-only デモとして進める。
- phone conversation が拾えない: `conversationId` を指定して `npm run demo:import-last-call -- --conversationId=<id>` を使う。
- analysis が遅い: 数秒待って再試行する。
- WebRTC でマイク権限が拒否された: ブラウザ設定からマイク権限を許可する。
- WebRTC の PeerConnection が張れない: アプリは `/api/eleven/signed-url` を使う WebSocket fallback に自動で切り替える。
- `V3 会話型` を UI で選んだのに反映されない: まず UI で変更を公開し、画面をリロードして stale 表示を避ける。次に `npm run agent:apply-demo-config` を実行しても、その時点の live TTS 設定を保持できる。実際に反映されたかは live agent の再取得値で確認する。API から v3 を試す場合は `eleven_v3` ではなく `eleven_v3_conversational` を前提にし、それでも `feature_not_available` が返るなら plan / entitlement / rollout の確認が必要。詳細は `docs/agent/v3-availability-research.md` を参照。
- `next start` で `Cannot find module './331.js'` が出る: 最新コードで `npm run build` をやり直す。build の最後に runtime patch が自動で入る。
- `npm start` は毎回 runtime patch を先に実行するので、古い `.next` を持ったままでも `./331.js` に戻りにくい。
## 2026-04-05 Web 音声が聞こえない場合
1. 画面の `スピーカーテスト` を押して、ブラウザからテスト音が出るか確認する。
2. テスト音が出ない場合は OS とブラウザの出力先を確認する。
3. テスト音が出る場合は `開始` を押して会話し、`audio packets received` が増えるか確認する。
4. `audio packets received` が増えない場合は agent 側から音声が届いていない。
5. `audio packets received` が増えているのに聞こえない場合は、出力デバイスを `システム既定` 以外へ切り替えて再試行する。
6. 詳細は `docs/audio-troubleshooting.md` を参照する。
