# デモ証跡の見方

`docs/demo-runs/*.md` は電話または Web デモ後に生成される要約ドキュメントです。

## 含まれる内容
- 取り込み日時
- `conversation_id`
- 通話メタデータ
- 仮受付メモ
- transcript summary
- 評価結果
- 未取得項目
- 次アクション

## JSON artifact
- 生データは `artifacts/demo-runs/*.json` に保存される。
- Git 追跡対象外なので、必要な時だけ参照する。

## マスキング方針
- 電話番号は Markdown 上では末尾 4 桁だけ残す。
- 音声ファイルは保存しない。
