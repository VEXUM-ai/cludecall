# えみは総合歯科 大阪梅田院デモ資料

このディレクトリは、`えみは総合歯科 大阪梅田院` 向けに刷新したデモの説明資料をまとめたものです。対象は次の3つです。

- 現在このリポで何が実装されているか
- 今回どの方針で何を実装したか
- 今後どこまで広げるか

## 資料一覧
- [AI一次受付ハイブリッド設計.md](/C:/Dev/Work/デンタル 一次受付AI/docs/AI一次受付ハイブリッド設計.md)
  - 今後の中核方針。`AI一次受付 + 構造化ドラフト + 例外だけ人確認` を前提にした review queue / confidence / 条件付き自動化の設計。
- [current-state-audit.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/current-state-audit.md)
  - 2026-04-06 時点の実装事実。Web 会話、Twilio outbound/import、ElevenLabs prompt/data collection、履歴、仮受付ドラフト、確認後アポ登録フローの棚卸し。
- [implementation-plan-emiha.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/implementation-plan-emiha.md)
  - 今回の刷新方針、受け入れ条件、型/API/UI の変更、アポツール連携の設計方針。
- [roadmap-future-scope.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/roadmap-future-scope.md)
  - 今回はやらないが、次段で着手すべき本実装スコープ。
- [emiha-public-profile.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/emiha-public-profile.md)
  - 公式サイト由来の公開情報整理。
- [appointment-knowledge-pack.md](/C:/Dev/Work/デンタル 一次受付AI/docs/client/appointment-knowledge-pack.md)
  - `【アポ関連】マニュアル.xlsx` の抽出結果と、AI に渡す情報 / 渡さない情報の整理。

## 読み方
- デモ全体像を短時間で把握したいとき
  - `README.md` → `AI一次受付ハイブリッド設計.md` → `current-state-audit.md`
- クライアント向け説明や導入判断に使いたいとき
  - `emiha-public-profile.md` → `appointment-knowledge-pack.md` → `AI一次受付ハイブリッド設計.md` → `implementation-plan-emiha.md`
- 将来の自動化や予約ツール連携の検討に進みたいとき
  - `AI一次受付ハイブリッド設計.md` → `implementation-plan-emiha.md` → `roadmap-future-scope.md`

## 現時点の結論
- デモは `えみは総合歯科 大阪梅田院` の公開情報と、先方シートから抽出した内部予約ルールを使う。
- 患者向け会話は最後まで `仮受付` とし、空き枠確定や予約確定は言わない。
- `アポツール` 連携は今回 `確認後登録` を本線にし、投入 payload をアプリ上で確認できるようにした。
- 次段の方向性は `AI一次受付 + 構造化ドラフト + review queue + 条件付き自動化` のハイブリッド運用で固定する。
- 完全自動登録、空き枠照会、inbound 電話の自動連携は、このハイブリッド設計の上に順次載せる。
