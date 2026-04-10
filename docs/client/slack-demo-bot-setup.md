# Slack デモ bot セットアップ

最終更新: 2026-04-10

## 目的
- `デンタル 一次受付AI` の通知を、VEXUM workspace 内の専用 bot 名義で出す
- デモ中は `bottest` に流し、運用時に本番チャンネルへ切り替えられるようにする

## 現在の状況
- コード側の Slack 通知は実装済み
- いまは `SLACK_WEBHOOK_URL` が未設定なので、アプリ本体の自動通知はまだ動かない
- 疎通確認としては、既存の MCP bot 名義で `bottest` への投稿確認済み

## 推奨する作り方
Slack workspace 内に専用の Slack App を 1 つ作る。

- App 名:
  `Dental Intake Demo`
- bot 表示名:
  `受付AIデモ`
- 通知先チャンネル:
  まずは `bottest`

この app から incoming webhook を発行して、アプリ側の `SLACK_WEBHOOK_URL` に入れる。

## manifest
repo に manifest テンプレートを追加済み。

- [demo-bot-manifest.json](/C:/Dev/Work/デンタル%20一次受付AI/config/slack/demo-bot-manifest.json)

## 作成手順
1. Slack の app 管理画面で `Create New App` を開く
2. `From an app manifest` を選ぶ
3. workspace は VEXUM を選ぶ
4. repo の manifest を貼り付けて app を作る
5. `Install to Workspace` を実行する
6. `Incoming Webhooks` を有効化する
7. `bottest` を選んで webhook URL を 1 本発行する
8. 発行した URL を `SLACK_WEBHOOK_URL` に入れる
9. `SLACK_CHANNEL_LABEL=bottest` を設定する

## 必要な env
- `SLACK_WEBHOOK_URL`
- `SLACK_CHANNEL_LABEL=bottest`

## この app でできること
- 予約自動投入成功の通知
- 予約自動投入失敗の通知
- 候補なしで人確認が必要な受付の通知
- 急患や人対応希望で live handoff に切り替えた通知

## 補足
- v1 では webhook 通知だけで十分
- ボタン付き確認、再実行、Slack 上からの操作までやるなら bot token と interactivity を追加する
- 今回の manifest はまず `通知を出すだけ` の最小構成
