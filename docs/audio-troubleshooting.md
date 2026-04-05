# Web 音声トラブルシュート

## 追加した対策
- 会話開始時にブラウザの音声出力を先にアンロックする
- 出力デバイスを選べるようにする
- スピーカーテストを入れる
- `audio packets received`、`input level`、`output level` を画面上で見えるようにする

## 使い方
1. 画面の `スピーカーテスト` を押す
2. テスト音が聞こえなければ、OS 側のスピーカー設定かブラウザの出力先を確認する
3. テスト音が聞こえるなら `開始` を押して会話する
4. 会話中に `audio packets received` が増えるかを見る
5. 増えない場合は agent 側から音声が届いていない
6. 増えているのに聞こえない場合は、出力先かブラウザの音量経路を疑う

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
- Chrome / Edge 系では出力デバイス切り替えが使える
- Safari 系では出力デバイス切り替えが使えないことがある
- まずは `システム既定のスピーカー` で試し、それでもだめなら別デバイスを選ぶ
