# Slack デモ bot セットアップ

最終更新: 2026-04-10

## 目的
- `デンタル 一次受付AI` の通知を、VEXUM workspace 内の専用 bot 名義で出す
- デモ中は `bottest` に流し、運用時に本番チャンネルへ切り替えられるようにする

## 現在の状況
- コード側の Slack 通知は実装済み
- いまの推奨は `Bot User OAuth Token` を使う方法
- `SLACK_BOT_TOKEN` と `SLACK_CHANNEL_ID` が入れば、アプリ本体の自動通知が動く
- 疎通確認としては、既存の MCP bot 名義で `bottest` への投稿確認済み

## 推奨する作り方
Slack workspace 内に専用の Slack App を 1 つ作る。

- App 名:
  `Dental Intake Demo`
- bot 表示名:
  `受付AIデモ`
- 通知先チャンネル:
  まずは `bottest`

この app の `Bot User OAuth Token` をアプリ側の `SLACK_BOT_TOKEN` に入れ、送信先 channel id を `SLACK_CHANNEL_ID` に設定する。

## manifest
repo に manifest テンプレートを追加済み。

- [demo-bot-manifest.json](/C:/Dev/Work/デンタル%20一次受付AI/config/slack/demo-bot-manifest.json)

## 作成手順
1. Slack の app 管理画面で `Create New App` を開く
2. `From an app manifest` を選ぶ
3. workspace は VEXUM を選ぶ
4. repo の manifest を貼り付けて app を作る
5. `Install to Workspace` を実行する
6. `OAuth & Permissions` で bot scope に `chat:write` を入れる
7. `Install to Workspace` または `Reinstall to Workspace` を実行する
8. `Bot User OAuth Token` をコピーする
9. `bottest` の channel id を使う
10. `.env` に `SLACK_BOT_TOKEN`、`SLACK_CHANNEL_ID`、`SLACK_CHANNEL_LABEL=bottest` を入れる

`bottest` が private channel の場合は、app を install しただけでは投稿できない。`bottest` 内で bot を招待する必要がある。

- 例:
  `/invite @受付AIデモ`
  または Slack の UI から app を channel に追加する

`Incoming Webhooks` は fallback として残してよいが、現時点の本線は token 方式。

## 必要な env
- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `SLACK_CHANNEL_LABEL=bottest`

## この app でできること
- 予約自動投入成功の通知
- 予約自動投入失敗の通知
- 候補なしで人確認が必要な受付の通知
- 急患や人対応希望で live handoff に切り替えた通知

## 補足
- v1 の現在値では token 通知を本線にしている
- ボタン付き確認、再実行、Slack 上からの操作までやるなら bot token と interactivity を追加する
- `SLACK_WEBHOOK_URL` は fallback として残している
- `channel_not_found` が返る場合は、token が壊れているより先に `bot が対象 channel に入っているか` を確認する
