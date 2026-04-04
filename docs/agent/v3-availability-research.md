# ElevenAgents V3 利用可否メモ

## 先に結論
- ElevenAgents / Conversational AI で公開されている v3 conversational の model id は `eleven_v3_conversational`
- 一般 TTS 側の `eleven_v3` とは別物
- `feature_not_available` は公式 error docs 上「現在のプランでは使えない機能」を意味する
- ただし、`eleven_v3_conversational` / Expressive Mode がどの plan で解放されるかの公開マトリクスは確認できていない
- したがって、今の最も安全な理解は「正しい model id を使っても拒否されるなら、plan か workspace entitlement か staged rollout のどれかで止まっている」

## 公式に確認できた事実

### 1. Agents 側の正式な v3 model id
- Agents docs / changelog では、Conversational AI 向けに追加されたのは `eleven_v3_conversational`
- `eleven_v3` は general TTS 側の別モデル

### 2. Expressive Mode の前提
- Agents docs では `V3 Conversational` を選ぶと Expressive Mode が有効になる
- 表現制御は system prompt 主体で、audio tags は補助的に使う設計

### 3. エラーの意味
- `type=authorization_error`: 必要権限がない
- `code=feature_not_available`: 現在の plan ではその機能が使えない
- `status` は legacy field で、現在は `code` を優先して読む

### 4. 公開情報で未確認な点
- `eleven_v3_conversational` / Expressive Mode が Free / Starter / Creator / Pro / Business / Enterprise のどこで使えるか
- plan 制限なのか workspace entitlement 制限なのか staged rollout なのか
- UI に見えていても API で拒否されるケースの正式説明

## このリポジトリでの実務判断
- API から v3 を試す場合、`eleven_v3` ではなく `eleven_v3_conversational` を前提に考える
- それでも `feature_not_available` が返る場合、ユーザーの UI 操作だけでは解決しない前提で動く
- 現時点のデモ本線は `eleven_flash_v2_5 + Bella + prompt設計`
- 将来 account 側で解放されたら `.env` の `ELEVENLABS_TTS_MODEL_ID` / `ELEVENLABS_EXPRESSIVE_MODE` で切り替える

## サポートへ確認すべきこと
1. この workspace / account / API key で `eleven_v3_conversational` が ElevenAgents API から有効か
2. UI では `V3 Conversational` が見えるのに、agent PATCH では `feature_not_available` になる理由
3. `feature_not_available` が plan 制限なのか workspace entitlement なのか rollout なのか
4. `eleven_flash_v2_5 + expressive_mode=true` が保存時に `false` へ戻るのが仕様か
5. request_id を渡したとき、どの gate で拒否されたか

## 参考
- [Expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode)
- [Errors](https://elevenlabs.io/docs/eleven-api/resources/errors)
- [Pricing](https://elevenlabs.io/pricing)
- [Changelog 2026-02-09](https://elevenlabs.io/docs/changelog/2026/2/9)
- [Text to Speech convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Choosing the right model](https://elevenlabs.io/docs/eleven-api/choosing-the-right-model)
