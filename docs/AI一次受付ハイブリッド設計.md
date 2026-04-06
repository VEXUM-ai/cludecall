# AI一次受付ハイブリッド設計

更新日: 2026-04-06

## 目的
- 現場の電話対応負荷を減らす
- 文字起こしや聞き間違いによる誤登録を防ぐ
- AIだけで無理に完結させず、例外だけ人が見る運用にする

## 結論
最適な方向性は、`条件付き自動処理 + 例外だけ人確認` のハイブリッド運用である。

このプロダクトでは、AIの役割を `予約確定` ではなく `一次受付と構造化ドラフト作成` に置く。
その上で、低リスク案件だけを自動完了し、曖昧・複雑・高リスク案件は review queue に送る。

## この設計を採る理由
- `全文文字起こしをそのまま登録` する方式は誤登録リスクが高い
- `全件を人確認` にすると現場負荷が下がらない
- `項目単位の確認 + ルール分岐` にすると、AIで拾える案件だけを安全に前進できる
- 歯科受付では、新患、痛み、当日希望、費用や保険の質問など、例外処理が多い

## 基本方針
- AIは transcript 全文を予約システムへ送らない
- 予約登録に使うのは、確認済みの構造化フィールドだけにする
- 氏名、電話番号、日時は会話中に必ず復唱確認する
- `confidence` が低い項目は自動確定しない
- transcript は証跡であり、一次入力ソースではない
- スタッフは transcript を読み直すのではなく、整理済みドラフトだけを見る

## 推奨アーキテクチャ
1. AIが一次受付を行う
2. 氏名、電話番号、希望日時、初診/再診、主訴を1項目ずつ収集する
3. AIが重要項目を復唱し、患者の明示確認を取る
4. 会話終了後、analysis 結果から `AppointmentDraft` を作る
5. ルールエンジンで `自動完了` `人確認` `緊急エスカレーション` に振り分ける
6. 人確認が必要な案件だけ review queue に載せる
7. 承認済み案件のみ予約システム連携へ進める

## 最適な運用分岐

### 自動完了してよいもの
- FAQのみ
- 再診の単純な問い合わせ
- 明確な希望日時と本人情報が揃っている低リスク案件
- 変更やキャンセルで、必要情報が明確に揃っているもの

### 原則として人確認に回すもの
- 新患
- 痛み、腫れ、違和感など症状を伴う相談
- 当日希望
- 自由診療相談
- 保険や費用の説明を含む相談
- 名前、電話番号、日時のいずれかが曖昧
- AIが複数回聞き返した案件

### 即時エスカレーションすべきもの
- 強い痛み
- 出血
- 外傷
- 薬の相談
- 明確に人対応を希望した場合

## 推奨データモデル
現状の `ReservationMemo` だけでは、確認状態や review 理由を保持できない。
次段階では `AppointmentDraft` を中心に扱う。

```ts
type DraftConfidence = "high" | "medium" | "low";

type DraftField<T> = {
  raw: string | null;
  normalized: T | null;
  confirmedByCaller: boolean;
  confidence: DraftConfidence;
  reviewReason: string | null;
  evidenceTurnIds: string[];
};

type AppointmentDecision =
  | "auto_complete"
  | "manual_review"
  | "urgent_handoff";

type AppointmentDraft = {
  conversationId: string;
  intent: "faq_only" | "new_booking" | "reschedule" | "cancel" | "urgent_callback";
  patientName: DraftField<string>;
  phoneNumber: DraftField<string>;
  visitType: DraftField<"new" | "returning">;
  visitReason: DraftField<string>;
  preferredSlot1: DraftField<{ date: string; timeRange: string }>;
  preferredSlot2: DraftField<{ date: string; timeRange: string }>;
  callbackOk: DraftField<boolean>;
  unresolvedQuestions: string[];
  escalationReasons: string[];
  decision: AppointmentDecision;
  submissionState:
    | "drafted"
    | "ready_for_review"
    | "approved"
    | "submitted"
    | "submission_failed";
};
```

## review queue の要件
review queue は transcript ビューではなく、`人が短時間で判断できる画面` にする。

表示すべき項目:
- 患者名
- 電話番号
- 初診/再診
- 主訴
- 希望日時
- confidence
- 要確認理由
- 緊急フラグ
- AI 要約

必要な操作:
- 承認
- 項目修正
- 折り返し対応へ変更
- 緊急対応へ変更
- 予約システム送信

## 状態遷移
- `drafted`
  AIが会話からドラフトを生成した状態
- `ready_for_review`
  人確認が必要と判定された状態
- `approved`
  スタッフが内容を確認した状態
- `submitted`
  予約システムへの登録または仮確保が完了した状態
- `submission_failed`
  外部連携に失敗した状態

## このリポジトリでの適用方針
現状の実装は `仮受付メモを取得して表示するデモ` としては正しい。
今後は `自動予約化` より先に、次の順で進める。

1. `ReservationMemo` を `AppointmentDraft` へ拡張する
2. 各項目に `confirmedByCaller` `confidence` `reviewReason` を持たせる
3. `AnalyzeConversationResponse` に draft と decision を追加する
4. `manual review queue` 用の API と UI を追加する
5. 予約システム連携は `manual_review` を既定値として adapter 化する
6. 十分な運用データが貯まってから、限定ケースのみ `direct_auto` を許可する

## 予約システム連携の原則
- 初期段階の既定値は `manual_review`
- `auto_after_review` はスタッフ承認後の半自動連携として実装する
- `direct_auto` は再診の単純ケースなど、条件を厳しく限定したものだけ許可する

## 避けるべき設計
- transcript 全文をそのまま予約登録する
- 確認されていない氏名、電話番号、日時を確定情報として扱う
- AIが `予約確定しました` と発話する
- review queue を作らず、履歴画面だけで運用しようとする
- 低信頼案件も高信頼案件も同じ扱いにする

## 実装判断の基準
新しい機能を追加するときは、以下を満たすことを条件にする。

- 誤認識しても即誤登録にならないか
- スタッフが transcript を読み直さず判断できるか
- 低リスク案件だけを自動化できるか
- 例外案件を確実に人へ渡せるか
- 緊急案件を通常キューに混ぜないか

## 要約
最も現場負担が減り、かつエラーを吸収しやすい設計は、`AI一次受付 + 構造化ドラフト + 例外だけ人確認` である。

このリポジトリでは、まず `仮受付メモ` を `確認状態付きドラフト` へ進化させ、その上で `review queue` と `予約連携 adapter` を追加するのが最短で安全な進め方である。
