# Web 音声トラブルシュート

## 追加した対策
- 会話開始時にブラウザの音声出力を先にアンロックする
- `audio packets received`、`input level`、`output level` を画面上で見えるようにする
- `ライブ transcript` と `現在のアクションログ` から、音声が届いているかを会話文脈つきで見られるようにする

## 使い方
1. `開始` を押して会話する
2. `現在のアクションログ` に接続完了や fallback の履歴が出るか確認する
3. `audio packets received` が増えるかを見る
4. `ライブ transcript` に agent 発話が出るかを見る
5. `audio packets received` が増えない場合は agent 側から音声が届いていない
6. `audio packets received` が増えて transcript も出るのに聞こえない場合は、OS 側の出力先かブラウザの音量経路を疑う

## 見方
- `browser audio unlocked`
  - `yes` ならブラウザ側の再生ロック解除は通っている
- `transport`
  - `webrtc` か `websocket`
  - WebRTC が張れない環境では自動で `websocket` に落ちる
- `input level`
  - マイク入力の大きさ
- `output level`
  - SDK が見ている再生音量
- `audio packets received`
  - agent 音声データの受信数

## 補足
- 画面上の音声出力チェック UI は廃止した
- いまは transcript、アクションログ、音量メトリクスの3つで切り分ける
- ブラウザ自体の出力先変更は OS / ブラウザ設定側で行う
