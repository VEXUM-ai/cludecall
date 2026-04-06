# 日本語電話受付 Voice / Prompt 設計メモ

## 目的
- ElevenLabs の公式 best practices を踏まえて、歯科一次受付AI の日本語電話応対を自然にする
- `Eleven v3 Conversational` を前提に、音声タグの使い方と発音辞書の運用方針を決める
- 後から見返しても、なぜその設計にしたか分かる状態を残す

## 公式ベースの設計原則

### Prompt 設計
- Prompt は markdown 見出しでセクション分けする
- 指示は短く、行動ベースで書く
- 重要ルールは `# Guardrails` に集約し、必要なら 1〜2 回繰り返す
- エージェントは専門特化させる。今回の役割は「歯科の一次受付」に限定する
- Evaluation Criteria と Data Collection を付けて、会話品質を継続改善する

この方針は ElevenLabs の Prompting guide に基づく。

### V3 音声設計
- `Eleven v3 Conversational` は system prompt で音声の感情・トーンを自然言語で誘導できる
- Expressive tags は使えるが、毎回明示する必要はない
- タグ効果はおおむね次の 4〜5 語にだけ効く
- 言語ごとにニュアンス差があるので、対象言語で実地テストする
- turn eagerness は用途に合わせて調整する

### Voice customization
- voice は対象言語・地域に合うものを優先する
- speed はまず `1.0` から始める
- 自然な会話の速度帯はおおむね `0.9-1.1`
- pronunciation dictionary は日常語ではなく、その業務に固有で重要な語だけに絞る

### Pronunciation dictionary
- pronunciation dictionary は Voice タブから設定する
- 日本語や `Eleven v3 Conversational` では、phoneme より alias ベースを前提に考える
- phoneme tags は `eleven_flash_v2` で英語にしか効かない
- 非英語では alias tags を使う
- 辞書は case-sensitive を意識し、重要語だけに絞って管理する

## このデモでの推奨設計

### 1. 声の方向性
- 目標は「日本の歯科受付の女性電話応対」
- ベースは `明るい / クリア / 安心感 / 事務的すぎない`
- 日本の電話応対は対面より少し高め・明るめになりやすいが、やりすぎると芝居っぽくなる
- そのため、`高い声` を直接狙うより、`前に出る明るさ + 子音の明瞭さ + 文を短く切る` を優先する

これは日本語の電話応対慣習を踏まえた実務上の推論であり、ElevenLabs の明示仕様ではない。

### 1-1. 医院プロフィールを喋らせる
- デモでは、医院名、診療時間、休診日、アクセス、駐車場、初診案内、急患案内を固定知識として持たせる
- 典型的な質問に対しては、長く説明せず、事実だけを短く答える
- 例:
  - 「医院名は `えみは総合歯科 大阪梅田院` です」
  - 「休診日は年末年始のみです」
  - 「急患はお電話でご相談いただけますが、応急処置中心になる場合があります」
  - 「初診は予約時間の10分前来院をご案内しています」
  - 「JR大阪駅直結で、グラングリーン大阪の大型駐車場をご利用いただけます」
- 不明な料金、保険の個別判断、空き枠の断定はその場で言わず、スタッフ確認へ回す

### 2. Prompt で制御する範囲
- 普段の声は「明るく、はきはき、丁寧」
- 痛み・不安・緊急性の訴えでは「少し落ち着いて安心感のある調子」
- 氏名、電話番号、日時、医院名、固有名詞の復唱では「少しゆっくり、短い塊で」
- 価格、保険、空き枠など未確定情報は、声を強めず事務的に明確化する

### 3. Audio tags の設計

#### 基本方針
- デフォルトは tags なし
- 主制御は system prompt の自然言語で行う
- tags は局所的に聞き取りやすさを上げたい箇所だけで使う

#### ElevenLabs UI の「推奨オーディオタグ」欄
- この欄は必須ではない
- 歯科の一次受付では、ここに大量の感情タグを入れない方が安定する
- まずは `表現モード: ON` のみ有効にし、推奨オーディオタグは空で始める
- どうしても UI で候補を持たせるなら、`真剣` と `心配そう` を少数で試す程度に留める
- `興奮した` `くすくす笑う` `笑う` `ささやく` `怒っている` `咳をする` のようなタグは通常の受付には入れない
- これは公式 docs の「v3 は自然言語 prompt が主制御で、tags は局所制御」という方針に基づく実装判断である

### 3-1. 定番質問への応答トーン
- 営業時間、休診日、住所、支払い、駐車場は事務的に短く答える
- 当日予約や空き状況は、断定せず `スタッフ確認後` を添える
- 予約変更やキャンセルは `前日18時までにご連絡ください` のように簡潔に案内する
- これらのFAQでは感情タグを使わず、平静で聞き取りやすいトーンを維持する

#### 本番で常用してよいタグ
- `[slow]`
  - 氏名、電話番号、日時、確認文の復唱

#### 条件付きで試すタグ
- ElevenLabs の docs では tags は非網羅的で、類似の感情・話法タグも試せる
- ただし production では voice ごとに再現性差があるため、安定確認前の常用は避ける
- もし試すなら、`[warmly]` `\[gently]` `\[concerned]` のような穏やかな方向から始める

#### 通常の歯科受付では避けるタグ
- `[laughs]`
- `[giggles]`
- `[whispers]`
- `[sighs]`
- `[angry]`

これらは電話受付の信用感を崩しやすい。

### 4. Turn eagerness と speed
- デフォルトの turn eagerness は `Normal`
- 電話番号、氏名、日時の回収時は `Patient` 寄りが望ましい
- speed はまず `1.0`
- `はきはき感` を speed だけで作らず、まず voice と prompt で作る
- それでも少し遅いなら `1.02-1.05` を試す
- 複雑な説明や復唱で速すぎると電話では聞き漏れが増える

## 発音辞書の設計

### まず入れるべきカテゴリ
- 医院名
- 医師名、スタッフ名
- 最寄り駅、地名、ビル名
- 略語・英字語
  - `AI`
  - `LINE`
  - `SMS`
  - `CT`
  - `CAD/CAM`
  - `PMTC`
  - `GBT`
- 医院固有の商品名、治療メニュー名、機材名

### 後回しでよいもの
- 一般的な日本語の歯科用語
- 日付、曜日、時刻
- 電話番号そのもの

日付や電話番号は pronunciation dictionary より、text normalization と prompt の復唱ルールで対応する方が良い。

### 5-1. よく聞かれそうな固有名詞
- 医院名、住所、最寄り駅、ビル名は辞書に入れてよい
- 読み間違えやすい語は、会話で何度も出るものから優先する
- 例:
  - `えみは総合歯科 大阪梅田院`
  - `グラングリーン大阪`
  - `JR大阪駅直結`
  - `大阪府大阪市北区大深町`

### 運用ルール
- mispronounce した語だけ追加する
- 日常語は入れない
- 一度に大量追加しない
- voice / model の組み合わせごとに確認する
- 辞書は `clinic`, `staff`, `acronym` のように分割してもよい

## 日本語向け alias 辞書のサンプル

`Eleven v3 Conversational` を前提に、まずは alias ベースで運用する。

アップロード用のサンプルは [docs/agent/pronunciation-dictionary-ja-demo.pls](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/pronunciation-dictionary-ja-demo.pls) に置いてある。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lexicon version="1.0"
  xmlns="http://www.w3.org/2005/01/pronunciation-lexicon"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.w3.org/2005/01/pronunciation-lexicon http://www.w3.org/TR/2007/CR-pronunciation-lexicon-20071212/pls.xsd"
  xml:lang="ja-JP">
  <lexeme>
    <grapheme>えみは総合歯科</grapheme>
    <alias>えみはそうごうしか</alias>
  </lexeme>
  <lexeme>
    <grapheme>AI受付</grapheme>
    <alias>エーアイ受付</alias>
  </lexeme>
  <lexeme>
    <grapheme>LINE</grapheme>
    <alias>ライン</alias>
  </lexeme>
  <lexeme>
    <grapheme>SMS</grapheme>
    <alias>エスエムエス</alias>
  </lexeme>
  <lexeme>
    <grapheme>CT</grapheme>
    <alias>シーティー</alias>
  </lexeme>
  <lexeme>
    <grapheme>CAD/CAM</grapheme>
    <alias>キャドキャム</alias>
  </lexeme>
  <lexeme>
    <grapheme>PMTC</grapheme>
    <alias>ピーエムティーシー</alias>
  </lexeme>
</lexicon>
```

## 推奨プロンプト設計の要点
- `# Role`
- `# Goals`
- `# Tone`
- `# Voice & delivery`
- `# Intake flow`
- `# Normalization`
- `# Safety`
- `# Guardrails`
- `# Recovery`
- `# Closing`

この構造は ElevenLabs の prompting guide の推奨に合わせている。

## このデモでの実装判断
- prompt は section-based に再整理する
- `# Guardrails` に最重要ルールを集める
- 通常会話では tags を多用しない
- `[slow]` だけを復唱用途の主要タグにする
- pronunciation dictionary は alias 中心
- 初期辞書は `医院名 / AI受付 / LINE / SMS / CT / CAD/CAM / PMTC / GBT` を入れたサンプルを置く
- TTS model は live agent の現在値を保持する。UI で `V3 会話型` を publish したら、その値を壊さない

## 公式ソース
- [Prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
- [Guardrails](https://elevenlabs.io/docs/eleven-agents/best-practices/guardrails)
- [Expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode)
- [Voice customization](https://elevenlabs.io/docs/eleven-agents/customization/voice)
- [Conversational voice design](https://elevenlabs.io/docs/eleven-agents/customization/voice/best-practices/conversational-voice-design)
- [Pronunciation dictionaries](https://elevenlabs.io/docs/eleven-agents/customization/voice/pronunciation-dictionary)
- [Prompting Eleven v3](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
