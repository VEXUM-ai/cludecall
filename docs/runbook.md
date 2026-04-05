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
4. `.env` の `DEMO_OUTBOUND_TARGET_NUMBER` か画面入力欄には、実際に受ける着信先番号を入れる。`TWILIO_CALLER_ID` や `ELEVENLABS_AGENT_PHONE_NUMBER` と同じ番号は使わない。
5. アプリの `AI から電話をかける` から発信先番号を入力して outbound call を送る。ダッシュボードの `発信コール` を使ってもよい。
6. 通話終了後、アプリの「最新の電話会話を取り込む」か `npm run demo:import-last-call` を実行する。
7. 生成された `docs/demo-runs/*.md` を証跡として確認する。
8. transcript に時刻情報があれば、電話の応答間隔も `docs/latency-report.md` に自動集計される。
9. inbound デモが必要になったら、Twilio の購入番号か SIP trunk を別途用意する。
10. Verified Caller ID に自分の携帯番号を使っている場合、自分の携帯そのものを着信先には使わない。自分で受けるには別の caller ID か Twilio 購入番号が必要。

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
- `AI から電話をかける` で英語メッセージだけ流れて切れる: 発信元番号と着信先番号が同じ可能性が高い。`DEMO_OUTBOUND_TARGET_NUMBER` か画面入力欄に、発信元とは別の番号を入れる。
## 2026-04-05 Web 音声が聞こえない場合
1. `開始` を押して会話し、`現在のアクションログ` に接続完了や fallback が出るか確認する。
2. `audio packets received` が増えない場合は agent 側から音声が届いていない。
3. `audio packets received` が増えて `ライブ transcript` に agent 発話も出るのに聞こえない場合は、OS とブラウザの出力先を確認する。
4. 詳細は `docs/audio-troubleshooting.md` を参照する。

## 2026-04-05 電話会話の取り込みで 409 が出る場合
1. 最新の outbound call が未成立だと、ElevenLabs 側で `status=initiated` のまま残ることがある。
2. その会話に対して `analysis/run` を呼ぶと `409` が返る。
3. 現在の実装は `status=done` の電話会話だけを取り込み対象にしている。
4. それでも取り込めない場合は、完了済みの電話通話がまだ無いか、直近の成功会話が Web 会話である可能性が高い。

## 2026-04-05 transcript と履歴の見方
1. 左側の `ライブ transcript` は現在進行中の Web 会話を逐次表示する。
2. 左側の `現在のアクションログ` では、接続開始、fallback、解析開始、解析完了、エラーの順を確認できる。
3. 右側の `最近の会話履歴` では、Web と電話の過去会話を一覧で選べる。
4. 会話を選ぶと、要約、評価結果、受付メモ、latency、transcript が右側に表示される。
5. 過去 Web 会話の分析結果は `docs/web-conversation-analysis.md` を参照する。

## 2026-04-05 履歴 transcript の見方
1. 画面右側の `最近の会話履歴` から会話を選ぶ。
2. 選択した会話の `要約`、`メタデータ`、`受付メモ`、`レイテンシ`、`evaluation`、`transcript` が下に表示される。
3. `最新の電話会話を取り込む` を押すと、完了済みの電話会話を選択中の会話として表示できる。
4. Web 会話の transcript も同じ詳細ビューに出るため、電話と Web を同じ比較軸で確認できる。
## Eleven v3 速度改善の反映手順
1. `npm run agent:apply-demo-config`
2. ElevenLabs UI で対象 branch を `公開`
3. 公開後に Web 会話を開始し、応答の体感差を確認する
4. 直近の結果は `docs/latency-report.md` と `docs/web-conversation-analysis.md` で見る

## 今回の速度設定
- `tts.model_id = eleven_v3_conversational`
- `expressive_mode = true`
- `turn_timeout = 6`
- `turn_eagerness = eager`
- `max_tokens = 180`
- `cascade_timeout_seconds = 6`

## 注意
- `npm run agent:apply-demo-config` で反映されるのは branch 側設定で、公開前の live API には反映されない場合がある。
- live 反映後に速さがまだ不足する場合は、FAQ のさらなる圧縮か `tts.speed` の微調整を検討する。
