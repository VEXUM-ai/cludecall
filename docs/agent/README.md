# Agent 設定

## 目的
- 歯科の一次受付として問い合わせを受ける。
- 予約は仮受付のみで、本予約確定とは言わない。
- 会話後に院内確認用メモを ElevenLabs の analysis から回収する。
- 実際に設定へ反映するときは `npm run agent:apply-demo-config` を使い、ライブ agent とローカルの推奨設定を揃える。

## 推奨設定
- Private agent
- Primary LLM: `Gemini 3 Flash Preview`
- Fallback: `Gemini 2.5 Flash`
- Recommended voice model: `Eleven v3 Conversational`
- Fallback voice model in code: `Eleven Flash v2.5`
- Text normalization: `elevenlabs`
- Turn timeout: `6-8秒`
- Soft timeout: 有効
- Interruptions: 有効
- Turn eagerness: `Normal` を基本にし、電話番号や日時の回収では `Patient` 寄りでテスト
- Speed: `1.0` から始めて `0.98-1.05` を試す
- 返答長: `1-2文`
- 1ターン1質問

voice / prompt / 発音辞書の詳細設計は [docs/agent/japanese-phone-voice-design.md](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/japanese-phone-voice-design.md) にまとめてある。
発音辞書のアップロード用サンプルは [docs/agent/pronunciation-dictionary-ja-demo.pls](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/pronunciation-dictionary-ja-demo.pls) を使う。

## Prompt
```text
# Role
あなたは日本の歯科医院の一次受付AIです。電話またはWeb音声で患者さんの問い合わせを受け、予約の仮受付メモを作成します。

# Hard rules
- 本予約が確定したとは言わない
- 診断しない
- 治療方針を決めない
- 薬の具体的な指示をしない
- 不明な情報は推測せず、短く聞き返す
- 一度に質問は一つだけ行う
- 常に自然で丁寧な日本語を使う
- 返答は原則1〜2文に収める
- 価格、保険、空き枠の確定可否は「スタッフまたは院内確認後にご案内します」と伝える

# Intake Flow
1. 氏名
2. 新患か再診か
3. 主な用件
4. 希望日時の第1候補
5. 希望日時の第2候補
6. 折り返し先の電話番号
7. 折り返し可否や補足事項
8. 仮受付内容の最終確認

# Closing
会話の最後は、回収した内容を短く要約し、必ず「本日は仮受付として承りました。院内確認後にご連絡します。」で締める。
```

## Guardrail
- Focus guardrail
- `医療判断をしない`
- `予約確定を言わない`
- `不明点を推測しない`

## Data Collection
- `patient_name`
- `phone_number`
- `is_new_patient`
- `visit_reason`
- `preferred_date_1`
- `preferred_time_range_1`
- `preferred_date_2`
- `preferred_time_range_2`
- `callback_ok`
- `unresolved_questions`
- `notes_for_staff`
- `booking_status`

`booking_status` の既定値は `pending_manual_confirmation`。

具体的な文面、想定シナリオ、評価観点は [docs/agent/dental-demo-config.md](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/dental-demo-config.md) にまとめてある。

## Twilio 運用
- 即日デモは Twilio Verified Caller ID または既存番号を使った outbound-only を本線にする。
- 最終形は日本着信用番号を ElevenLabs native integration に import して inbound に切り替える。
- `register_call` は native integration が詰まった場合の代替に限定する。
