# Japanese Name Pronunciation Research

Last updated: 2026-04-07

## Question

Phone AI で患者が名乗った氏名が漢字として transcript され、その漢字を TTS が別の読みで発話してしまう問題をどう解くべきか。

## Short answer

- 主要ベンダに「日本語の氏名だけをひらがな固定で transcript する」公開設定は見当たらない。
- 実務では `transcript` と `speak-back` を分離する。
- 氏名は `漢字/生テキスト` と `読み仮名` を別フィールドで持ち、AI が復唱するのは `読み仮名` のみとする。
- 読みが未確認なら、氏名を無理に復唱しない。

## Cross-vendor pattern

### 1. STT transcript の表記固定ではなく認識補助を使う

- Google Cloud Speech-to-Text は `PhraseSet` `CustomClass` `ABNF grammar` などの model adaptation で固有名詞認識を補助する。
- Azure AI Speech は `phrase list` や custom speech で認識率を上げる。
- Amazon Transcribe は custom vocabulary で固有名詞を寄せる。
- Deepgram は `keywords` で固有名詞をブーストする。
- ElevenLabs realtime STT も公開仕様上は `hiragana only` のような表記体系固定は見当たらない。

結論:

- STT でできるのは「候補を寄せる」までで、自由入力の日本語氏名をかな固定にする機能ではない。

## 2. TTS 側で読みを制御する

- Google Cloud Text-to-Speech は SSML の `<phoneme>` や custom pronunciation dictionary を使える。
- Azure AI Speech は custom lexicon / pronunciation file を使える。
- Amazon Polly は lexicon と `<phoneme>` を使える。
- Twilio `<Say>` も SSML ベースで発音調整ができる。
- ElevenLabs は pronunciation dictionary を使えるが、固定語向けであり毎回変わる患者氏名の主解にはならない。

結論:

- TTS は「この文字列をどう読むか」は制御できるが、「ASR が自由入力の名前をどう表記するか」を解決するものではない。

## 3. 会話設計で事故を防ぐ

実務で共通しているのは次の設計:

- 名前は `patient_name` と `patient_name_yomi` を分ける。
- AI が復唱するのは `patient_name_yomi` だけにする。
- 名前取得ターンで「お名前の読み方をひらがなで確認させてください」と聞く。
- 読み未確認の漢字氏名は復唱しない。
- 固定語だけ pronunciation dictionary / custom vocabulary に入れる。
- 必要なら氏名ではなく `受付番号` `電話番号下4桁` `生年月日` で確認する。

## Healthcare / operations pattern

- 日本語氏名の読みは一意に決まらない。研究例では同一表記に複数の読みが存在する。
- 公的実務も「漢字とは別に振り仮名を保持する」方向に寄っている。
- 医療現場ではプライバシー配慮のため、氏名呼び出し自体を避けて受付番号などに置き換える運用もある。

結論:

- 「漢字だけが正本」という前提をやめる方が現実的。
- 氏名を呼ぶ必要が低い箇所では、そもそも名前を読まない設計も有効。

## Vendor snapshots

### ElevenLabs

- 公開 docs 上、realtime / agent 側に `hiragana only transcript` 設定は確認できない。
- prompting guide と pronunciation dictionary はあるが、主に会話設計と固定語の読み制御向け。

Sources:

- [Speech-to-Text overview](https://elevenlabs.io/docs/capabilities/speech-to-text/)
- [Realtime speech-to-text API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)
- [Prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
- [Pronunciation dictionaries](https://elevenlabs.io/docs/eleven-agents/customization/voice/pronunciation-dictionary)

### Google Cloud

- STT: adaptation で proper noun 認識を補助。
- TTS: SSML と pronunciation dictionary で読みを制御。

Sources:

- [Speech-to-Text model adaptation](https://docs.cloud.google.com/speech-to-text/docs/v1/adaptation)
- [Text-to-Speech SSML](https://docs.cloud.google.com/text-to-speech/docs/ssml)

### Azure AI Speech

- STT: phrase list / custom speech で認識改善。
- TTS: custom lexicon / pronunciation file で読み制御。

Sources:

- [Improve recognition accuracy with phrase list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/improve-accuracy-phrase-list)
- [Train and test a Custom Speech model](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-custom-speech-test-and-train)
- [Voice Live customization](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/voice-live-how-to-customize)

### AWS

- STT: Transcribe / Lex / Connect の custom vocabulary 系で固有名詞認識を補助。
- TTS: Polly lexicon で読み制御。

Sources:

- [Amazon Transcribe custom vocabulary](https://docs.aws.amazon.com/transcribe/latest/dg/custom-vocabulary.html)
- [Amazon Lex V2 custom vocabulary](https://docs.aws.amazon.com/lexv2/latest/dg/vocab.html)
- [Amazon Connect custom vocabulary](https://docs.aws.amazon.com/connect/latest/adminguide/add-custom-vocabulary.html)
- [Amazon Polly lexicons](https://docs.aws.amazon.com/polly/latest/dg/managing-lexicons.html)

### Twilio / Dialogflow / OpenAI Realtime

- Twilio は STT と TTS を別コンポーネントとして扱う前提で、`<Gather>` の `hints` や `<Say>` の SSML を使い分ける。
- Dialogflow CX は parameter / form / confirmation state を分けられるため、名前取得と読み確認を別 state にしやすい。
- OpenAI Realtime も transcript をそのまま speak-back の正本にするより、重要情報は prompt / tool / field に分離する設計が合う。

Sources:

- [Twilio `<Gather>`](https://www.twilio.com/docs/voice/twiml/gather?save_locale=en)
- [Twilio `<Say>`](https://www.twilio.com/docs/voice/twiml/say)
- [Dialogflow CX speech adaptation](https://cloud.google.com/dialogflow/cx/docs/concept/speech-adaptation)
- [Dialogflow CX parameters](https://docs.cloud.google.com/dialogflow/cx/docs/concept/parameter)
- [OpenAI Realtime transcription guide](https://platform.openai.com/docs/guides/realtime-transcription)
- [OpenAI voice agents guide](https://platform.openai.com/docs/guides/voice-agents)

## Implication for this repo

Current risk:

- The repo currently keeps only `patient_name`.
- If the agent later reuses that field for speech, kanji normalization can produce a wrong readout.

Recommended direction:

1. Add `patient_name_yomi`.
2. Keep `patient_name` as display / record text, not speech truth.
3. Add a prompt rule: unread kana-unconfirmed names must not be read back.
4. Add a recovery line for missing yomi.
5. Use pronunciation dictionary only for clinic names, staff names, and fixed jargon.

Suggested recovery line:

```text
お名前ありがとうございます。読み方を確認したいので、ひらがなでゆっくりお願いできますか。
```

Suggested guardrail:

```text
読みが未確認の漢字氏名は復唱しない。氏名を復唱する場合は patient_name_yomi のみを使う。
```

## Sources on name ambiguity and operations

- [東京理科大学: 名前の漢字の多様な読みを推定する AI 技術](https://www.tus.ac.jp/today/archive/20210705_2485.html)
- [KAKEN: 人名用漢字の字音・字訓等の網羅的研究](https://kaken.nii.ac.jp/grant/KAKENHI-PROJECT-22K00576/)
- [政府広報オンライン: 戸籍にフリガナが記載されます](https://www.gov-online.go.jp/article/202505/entry-7609.html)
- [個人情報保護委員会 FAQ: 病院での氏名呼び出し](https://www.ppc.go.jp/all_faq_index/faq3-qb3-10/)
