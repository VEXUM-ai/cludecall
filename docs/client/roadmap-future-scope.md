# 将来スコープ

前提方針は [AI一次受付ハイブリッド設計.md](/C:/Dev/Work/デンタル 一次受付AI/docs/AI一次受付ハイブリッド設計.md) に置く。以後の拡張は `AI一次受付 + 構造化ドラフト + 例外だけ人確認` を崩さない。

## 1. アポツール本連携
- 実 API がある場合
  - 認証方式、必須項目、レスポンス shape を確認する
  - `AppointmentToolAdapter` を実装して `auto_after_review` を有効にする
- API がない場合
  - UI automation か RPA の可否を判断する
  - 障害時の再送、監査ログ、二重登録防止が必要

## 2. 空き枠照会
- 現在は「仮受付のみ」で終えるが、将来的には次を検討する
  - 問い合わせ区分ごとの必要枠数
  - 担当ドクター必須条件
  - 機材重複不可条件
  - 同時刻重ね取り禁止条件
- これは LLM に覚えさせるより、構造化ルール + ツール呼び出しで扱う方が安全。

## 3. inbound 電話
- 日本番号の準備
- ElevenLabs 側の inbound 設定
- 通話完了時の conversationId 取得と自動 import
- 会話レコードと業務レコードのひも付け

## 4. 業務状態の永続化
- 現在は ElevenLabs conversation が主系で、submission state はローカル JSON に置いている。
- 将来的には独自 DB を持ち、次の状態を管理する。
  - drafted
  - ready_for_review
  - approved
  - submitted
  - urgent_handoff
  - callback_completed
  - submission_failed

## 5. review queue
- transcript 全文ではなく、短時間で判断できる review queue を用意する
- 最低限必要な表示項目
  - 患者名
  - 電話番号
  - 初診/再診
  - 主訴
  - 希望日時
  - confidence
  - review reason
  - 緊急フラグ
  - AI要約
- 最低限必要な操作
  - 承認
  - 項目修正
  - 折り返し対応へ変更
  - 緊急対応へ変更
  - 予約システム送信

## 6. confidence と判定
- 各ドラフト項目に `confirmedByCaller` `confidence` `reviewReason` `evidenceTurnIds` を持たせる
- confidence が低い項目は自動送信しない
- `decision=auto_complete | manual_review | urgent_handoff` のルールエンジンを追加する

## 7. 品質保証
- 医院固有トークの遵守率評価
- 禁止情報の漏えい検知
- 失敗時の runbook
- 本番前のシナリオ回帰テスト

## 8. 将来の設計方針
- 公開情報は KB / clinic config
- 予約制約は構造化ルール
- 空き枠や予約登録はツール
- 会話生成はあくまで受付案内と情報収集に限定
- transcript は証跡であり、予約システムへの一次入力ソースにしない
