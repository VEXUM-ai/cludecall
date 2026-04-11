# cludecall / 現場シート 差分確認 2026-04-11

## 確認したソース
- `C:\Dev\Work\cludecall\src\create-flow.js`
- `C:\Dev\Work\cludecall\src\create-agent.js`
- `C:\Dev\Work\cludecall\src\browser\availability.js`
- `C:\Dev\Work\cludecall\src\browser\booking.js`
- `C:\Dev\Work\デンタル 一次受付AI\【アポ関連】マニュアル.xlsx`
- `C:\Dev\Work\デンタル 一次受付AI\lib\clinic-config\emiha.ts`
- `C:\Dev\Work\デンタル 一次受付AI\lib\appointments.ts`
- `C:\Dev\Work\デンタル 一次受付AI\lib\appointment-automation.ts`
- `C:\Dev\Work\デンタル 一次受付AI\lib\elevenlabs\memo.ts`

## 補足
- Slack の `18lqsp8FtryF4oJrBRSxceGdkYtDaq5UbyMLqOADzMrs` は進捗管理シートだった。
- トーク内容と現場運用の原本は repo 内の `【アポ関連】マニュアル.xlsx` と、そこから抽出した `docs/client/appointment-knowledge-pack.md` を基準に確認した。

## 設計変更であって漏れではないもの
- 元の `cludecall` は live 会話中に `空き確認 -> 候補提示 -> 予約登録` まで実行する設計。
- 現在の統合実装は `通常受付は終話後に backend で自動予約`, `急患は live transfer` に変えている。
- これは 4/9, 4/11 時点の会議方針に沿った変更で、単純な実装漏れではない。

## すでに取り込めているもの
- 通常初診 / 急患 / インプラント / THP / 無料歯科検診 / ホワイトニング / インビザライン / その他手動確認 の service line 分岐
- LINE 問診未回答時の 15 分前来院案内
- 急患の `待ち時間が長くなる可能性` と `応急処置のみになる可能性`
- ホワイトニングは機材 1 台で重複不可
- インビザはドクター必須の前提
- THP の 90 分 / 9,500 円
- 無料歯科検診の `無料なのは審査診断まで`
- 美容系 / 紹介 / レーザー / 口臭検査 を手動確認案件へ倒す分類

## 未実装または取り込みが浅いもの

### 1. `cludecall` の post-call 項目の一部が消えている
- 元実装は `scheduled_datetime` と `appointment_completed` を保持していた。
- 現在は `bookingStatus` と `conversationOutcome` に寄せており、元の分析結果をそのまま比較できない。
- 通話品質評価や回帰確認では、元項目も保持した方がよい。

### 2. 無料歯科検診の詳細運用がまだ浅い
- 現在あるのは `無料範囲`, `30分/60分`, `手動確認` まで。
- まだ入っていない運用:
  - メール経由で日程調整が来る運用
  - `初診 + メニュー2=無料歯科検診` 以外の受付補足
  - `初診 web 問診はしない`
  - 保険証 / マイナ保険証 / 自費100% の分岐
  - 歯科健康診断書の内部処理フロー

### 3. インプラント運用は分類だけで、実務フローまでは落ちていない
- 現在は `doctor_required` と `manual_review_only` に留めている。
- まだ落ちていない運用:
  - `ステントimp -> CT/採血 -> 和田精密 -> カウンセリング` の段取り
  - 同意書未回収時の扱い
  - 鎮静あり時の個別連携
  - オペ確定後の共有手順

### 4. 紹介フローは意図的に除外しているが、患者向け返答テンプレートが弱い
- 現在は `紹介` を `other_manual_review` に倒すだけ。
- まだ足りないもの:
  - 紹介先別の最低限の患者向け案内
  - `本件は院内確認後に折り返す` 以上の定型文
  - 予約先が外部病院になるケースの要約テンプレート

### 5. 現場メモ運用が自動化されていない
- マニュアルには以下がある:
  - 電話内容はカルテに書く
  - 98 / 99 は特に必須
  - 無理して取ったアポは `○○に確認済` をメモ
  - 繋がらなかった電話は次回アポ欄に `用件 + 自分の名前`
- 現在の実装は `notesForStaff` と audit はあるが、これらの定型メモ生成や post-booking task 化は未実装。

### 6. 位置案内の分岐が会話に入っていない
- マニュアルには `当院の場所お分かりですか -> グラングリーン大阪はお分かりですか -> 不安そうなら20分前来院` がある。
- 現在は `20分前来院を促す` ルール自体は保持しているが、会話フローに明示的な確認分岐はない。

### 7. 口臭検査の注意事項は分類だけで FAQ には入っていない
- 現在 `口臭検査` は manual review keyword に入っている。
- まだ入っていない内容:
  - 2 時間前飲食 NG
  - 前日 / 当日のにおいの強い飲食 NG
  - マウスウォッシュ NG

### 8. 美容系の個別振り先は持っていない
- `糸リフト`, `リップアート`, `レーザー` は manual review に倒している。
- ただしマニュアル上の `誰に見てもらうか` は落としていない。
- 個人名依存なので patient-facing AI には不要だが、staff task としては別管理が必要。

### 9. `patient_name_kana` 前提の旧設計は廃止した
- 元の `cludecall` は live で `ひらがな` を必須取得して、Apotool へ `patient_name_kana` を渡していた。
- 現在は読み確認ループを避けるため live で再読させない設計に変えている。
- 通常初診の現在フローではこの方が正しいが、将来ほかの連携でカナ必須なら `silent field` として別保持が必要。

## 優先度つき対応案

### 優先度A
- `scheduled_datetime`, `appointment_completed` を draft / artifact に保持
- 位置案内の確認分岐を FAQ / 通常初診の closing へ追加
- 口臭検査の注意事項を KB に追加
- 無料歯科検診の `初診 web 問診なし` と `保険証 / 自費分岐` を KB / internal rule に追加

### 優先度B
- 現場メモ運用を `staff task template` として出力
- 紹介フローの患者向けテンプレート整備
- インプラントの院内段取りを `manual_followup checklist` に落とす

### 優先度C
- 個人名依存の内部運用を、AI 本体ではなく `internal checklist` 側に整理

## 結論
- 主要な電話分岐と患者向け FAQ の骨格は取り込めている。
- ただし `無料歯科検診`, `紹介`, `インプラント`, `現場メモ運用` は、まだ `高レベルに要約しただけ` の箇所が残っている。
- `漏れがない状態` を目指すなら、次は `患者向けの追加 FAQ` と `staff follow-up checklist` を分けて実装するのが正しい。

## 2026-04-11 追加実装メモ
- 対応済み:
  - `scheduled_datetime`, `appointment_completed` を memo / draft / artifact に保持
  - `無料歯科検診`, `THP`, `口臭検査`, `紹介`, `インプラント`, `位置不安`, `親知らず抜歯` の patient-facing KB を追加
  - service line ごとの `followUpChecklist` を draft に追加
  - RAG 評価ケースを 13 ケースへ拡張し、`13/13`, critical `7/7` を通過
- 未対応:
  - カルテ記載や `○○に確認済` などの staff task 自動生成
  - 紹介先別の内部 routing 詳細
  - 美容系の担当者アサイン内部ルールの構造化
