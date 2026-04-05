# 電話デモ優先・音声モデル評価計画

更新日: 2026-04-05

## この計画の目的
- まず `ElevenAgents + Eleven v3 Conversational` の現行構成で、歯科一次受付の電話デモを最後まで成立させる。
- その後に、`v3 を Agents で使った場合` と `API 経由で使った場合` の差を検証する。
- さらに後続スコープとして、Gemini 音声系モデルの比較検証を計画に組み込む。

## 先に結論
- 直近の優先順位は `音声モデル比較` ではなく `電話デモ成功` である。
- 現在の本番デモ経路は `ElevenAgents / eleven_v3_conversational / expressive_mode=true` を固定する。
- `汎用 API の eleven_v3` と `Agents の eleven_v3_conversational` は同一ではないため、音質・間・遅延・会話の自然さは一致しない前提で扱う。
- Gemini 音声系の比較は有効だが、電話デモ成立前に横展開すると比較軸が増えすぎるため、次フェーズへ送る。

## 確認した資料

### ローカル資料
- [音声モデルリサーチ.md](C:/Dev/Work/デンタル%20一次受付AI/音声モデルリサーチ.md)
- [音声 API差.md](C:/Dev/Work/デンタル%20一次受付AI/音声%20API差.md)
- [demo-plan.md](C:/Dev/Work/デンタル%20一次受付AI/docs/demo-plan.md)
- [runbook.md](C:/Dev/Work/デンタル%20一次受付AI/docs/runbook.md)

### 公式資料
- ElevenLabs Expressive mode: [Expressive mode](https://elevenlabs.io/docs/agents-platform/customization/voice/expressive-mode)
- ElevenLabs general TTS v3: [What is Eleven v3?](https://help.elevenlabs.io/hc/en-us/articles/35869054119057-What-is-Eleven-v3)
- ElevenLabs models overview: [Models](https://elevenlabs.io/docs/overview/models)
- ElevenLabs changelog: [Changelog](https://elevenlabs.io/docs/changelog)
- Google Gemini models: [Gemini models](https://ai.google.dev/gemini-api/docs/models/gemini)
- Google Gemini Live guide: [Live API capabilities guide](https://ai.google.dev/gemini-api/docs/live-guide)
- Google Gemini deprecations: [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- Google Gemini pricing: [Gemini Developer API pricing](https://ai.google.dev/pricing)

## 現時点の判断

### 1. いまのデモ経路では Eleven v3 を維持する
- デモ要件として `Eleven v3` は固定条件とする。
- ここで指すのは general TTS の `eleven_v3` ではなく、Agents 側の `eleven_v3_conversational` である。
- Agents 側では Expressive mode と turn-taking が一体で効くため、単純な TTS API 比較で置き換えない。

### 2. API 経由の v3 と体感が違うのは自然
- `eleven_v3` は general TTS 用の表現重視モデルで、公式にも realtime / conversational use case には不向きとされている。
- `eleven_v3_conversational` は Agents 用の ultra-low-latency 版で、Scribe v2 Realtime を使った turn-taking と一緒に効く。
- したがって、同じ「v3」という名前でも、会話の入り方、相づち、割り込み復帰、FAQ 応答の自然さは一致しない前提で評価すべき。

### 3. いまはモデル比較より電話実証が先
- まだ `完了済み phone conversation を十分な本数で回した` 状態ではない。
- この段階で他モデル比較へ入ると、Twilio、prompt、FAQ、ネットワーク、ブラウザ、turn-taking の要因が混ざる。
- よって、先に `現行構成で電話が成立するか` を確認し、そのログを基準線にする。

## フェーズ構成

## フェーズA: 直近の電話デモ成立

### 目的
- `AI から電話をかける`
- `予約会話を最後まで行う`
- `終話後に会話を取り込む`
- `Markdown 証跡を残す`

### 対象構成
- Voice stack: `ElevenAgents + eleven_v3_conversational + expressive_mode=true`
- LLM: 現行の ElevenAgents 設定
- Channel: outbound-only phone demo
- Phone path: Twilio Verified Caller ID 経由の outbound

### テスト前チェック
1. live agent が `eleven_v3_conversational` になっている
2. `expressive_mode=true` になっている
3. FAQ と医院プロフィールが prompt に入っている
4. 電話番号が `AI から電話をかける` で正しい
5. `npm run build` 済みで `http://localhost:3000` が最新 UI を返している

### 電話テストの必須シナリオ
1. 新患のクリーニング予約
2. 再診で痛み相談が入り、診断を求められる
3. 休診日、診療時間、医院名を聞かれる
4. 日付と電話番号の復唱が必要なケース

### 電話テストで見る指標
- 架電成功
- 通話完了
- transcript が保存される
- `patient_name` などの Data Collection が取れる
- FAQ の回答が破綻しない
- 復唱時に日付と番号を崩さない
- 会話後に `docs/demo-runs/*.md` が生成される

### 受け入れ条件
- 1 本以上の completed phone conversation が残る
- transcript summary と memo が取得できる
- 休診日や診療時間の質問に短く答えられる
- `予約確定` や `診断` を言わない

## フェーズB: Eleven v3 の Agents と API の差分検証

### 目的
- `eleven_v3_conversational` と `eleven_v3` の差を、感覚ではなく記録で比べる
- どこが違和感の原因かを `声質` と `会話制御` に分けて切り分ける

### 比較対象
- A: ElevenAgents `eleven_v3_conversational`
- B: TTS API `eleven_v3`
- C: 必要なら基準線として `eleven_flash_v2_5`

### 比較軸
- 最初の一声までの速さ
- ユーザー発話後の返答開始までの速さ
- 割り込み復帰
- 復唱の安定性
- FAQ 回答時の自然さ
- 日本語の日付、電話番号、医院名の読み
- 「人っぽい電話受付感」

### 取得するデータ
- `connect_ms`
- `first_agent_response_ms`
- `first_reply_after_user_ms`
- `average_reply_after_user_ms`
- `analysis_ms`
- measured turns
- transcript
- FAQ ターンの抜粋
- 日付 / 数字 / 固有名詞の読み崩れメモ

### 検証上の注意
- API TTS と Agents は同じ prompt パスではない
- API 側は turn-taking を別で持たないため、単純比較ではなく「音声品質比較」として扱う
- 受付らしさの違いが `声` 由来か `間` 由来かを分けて記録する

## フェーズC: Gemini 音声系モデルの将来評価

### このフェーズを後ろに送る理由
- まず電話デモの完成が先
- Gemini 比較を先に入れると、評価系と実装系の両方が増えて現在のデモの軸がぶれる
- 基準線となる `Eleven v3 phone demo` の成功ログが無いと比較しにくい

### 将来の比較対象
- `gemini-2.5-flash-native-audio-preview-12-2025`
- `gemini-2.5-flash-preview-tts`

### 採用理由
- Google 公式では、現行 Live API の後継として `gemini-2.5-flash-native-audio-preview-12-2025` が案内されている
- 同時に、低遅延寄り TTS として `gemini-2.5-flash-preview-tts` がある
- つまり `native audio の会話品質` と `TTS 単体品質` の両方を比較できる

### 将来フェーズでやること
1. Web だけで Gemini Live の会話 PoC を作る
2. Eleven と同じ評価シナリオを流す
3. `初動速度` `復唱精度` `FAQ 安定性` `割り込み復帰` を比較する
4. 費用、実装難易度、電話接続のしやすさまで含めて判断する

### 将来フェーズの判断軸
- Eleven v3 より自然か
- Eleven v3 より速いか
- 番号、日時、固有名詞の読みが安定するか
- 電話導線に落とし込みやすいか
- 運用コストに耐えるか

## いまの実行順
1. 現行構成で phone demo を 1 本成功させる
2. そのログを `docs/demo-runs` と `docs/latency-report.md` に残す
3. その結果を基準線として、Agents v3 と API v3 の差分計画を開始する
4. 最後に Gemini 音声系の PoC を別トラックで始める

## 今すぐやる作業
- live agent の最終設定確認
- outbound phone demo を 1 本完了
- import と Markdown 生成
- 電話ログの確認
- 休診日、診療時間、医院名の応答内容を確認

## 期待アウトプット
- `docs/demo-runs/*.md` に phone demo の証跡
- `docs/latency-report.md` に phone の遅延データ
- `docs/web-conversation-analysis.md` と比較できる基準線
- その後にモデル比較へ進むための、再現可能な電話ログ

## 参考メモ
- [音声モデルリサーチ.md](C:/Dev/Work/デンタル%20一次受付AI/音声モデルリサーチ.md) では低遅延の観点から Flash v2.5 系が強いと整理されている
- ただし本計画では、デモ制約として `Eleven v3` を固定する
- [音声 API差.md](C:/Dev/Work/デンタル%20一次受付AI/音声%20API差.md) の指摘どおり、重要情報確認ターンだけ精度重視で見る設計は有効
- そのため、評価は `全ターン平均` だけでなく `重要ターン品質` も別に記録する
