# VEXUM 全体整合性監査レポート

作成日: 2026-07-11 ／ 対象コミット: `5c7ad7e`
**本レポートは問題の記録のみであり、修正は一切行っていません。**

---

## 1. 発見した問題（重要度順）

### 問題1: チャート紐付け評価の通知が届かない（ref_id の型不一致）

- 【画面】共通API（影響: 従業員の受信ボックス）
- 【タブ・機能】評価入力（リーダー・幹部）→ 従業員への `evaluation_received` 通知
- 【該当ファイル・行番号】`web/api.js:927-931`（saveEvaluation 内の notifications insert）、`supabase/00_full_setup.sql:253`（`ref_id uuid`）
- 【症状】リーダー・幹部がチャートを選択して評価を保存すると、評価自体は保存されるが、従業員の受信ボックスに「⭐ 評価が届きました」の通知が**一切表示されない**。通知クリックでの該当チャートへのジャンプ（ntfGoto）も機能しない。
- 【原因】`notifications.ref_id` は uuid 型だが、`ref_id: o.chartId` に渡される mandala_charts の id は **text 型**（実データは `'user_<uuid>_<timestamp>'` 形式、シードは `'user_nakamura'` 等）。UUID として不正なため insert が 22P02 エラーで失敗し、catch で console.warn されるだけで通知が失われる。チャート未選択（chartId=null）の場合のみ通知が届く。
- 【重要度】**高**
- 【推奨する修正方針】`notifications.ref_id` を text 型に変更する（マイグレーション）か、insert 時に chartId が UUID 形式でない場合は `ref_id: null` にして body 等に chartId を持たせる。employee.html の ntfGoto 側も合わせて対応。

### 問題2: チャート別評価がすべて最初のチャート（self_q3）に集約表示される

- 【画面】従業員（表示）／共通API（原因）
- 【タブ・機能】評価管理タブ（チャート選択プルダウン → フィードバック表示）
- 【該当ファイル・行番号】`web/api.js:1008-1011`（loadPersonalData の FEEDBACK 振り分け）
- 【症状】従業員が複数チャートを持ち、リーダーがチャートBを選んで評価しても、評価管理タブでチャートBを選択するとフィードバックが表示されず、最初のチャート（self_q3 キー）にすべての評価が混ざって表示される。
- 【原因】振り分けロジックが `ev.chart_id === 'user_' + memberKey`／`'user_' + memberKey + '_q2'`／`'team_' + teamLetter` というシード ID パターンのみ照合しており、実運用のチャート ID（`'user_<uuid>_<timestamp>'`）はどれにも一致せず、フォールバック `target_user_id === uid ? 'self_q3'` に落ちる。CHARTS には `CHARTS[c.id]` で実 ID キーのチャートが登録される（api.js:1003）のに、FEEDBACK は同じキーで登録されない。
- 【重要度】**高**
- 【推奨する修正方針】振り分けの先頭に「`ev.chart_id` が CHARTS のいずれかの dbId と一致すればそのキーへ」の分岐を追加する。
- 【補足】自己評価の読み込み（_evalDataCache 経由の loadMySelfEval）は evalDbId で正しくチャート別に取得しており、この問題は他者評価（FEEDBACK）表示のみ。

### 問題3: 幹部の評価保存で期間が「2025 Q2」に固定

- 【画面】幹部
- 【タブ・機能】一覧・評価 → 個人評価の保存
- 【該当ファイル・行番号】`executive.html:2243`（saveEvaluation）、`2245`（saveEvalRecord）、`2248`（ローカル履歴 rec）
- 【症状】幹部が 2026 年に評価を登録しても、従業員のフィードバック・評価履歴・評価記録すべてで期間が「2025 Q2」と表示され続ける。
- 【原因】デモ実装の名残で `period:'2025 Q2'` がハードコードされている。リーダー画面は日付入力から期間を組み立てており（`leader.html:1264`）、実装が食い違っている。
- 【重要度】**高**
- 【推奨する修正方針】リーダー画面と同様に期間入力 UI から組み立てるか、評価日から四半期を自動算出する。

### 問題4: リーダー・幹部画面の日付絞り込みが部分入力（年のみ・年月）非対応

- 【画面】リーダー／幹部
- 【タブ・機能】タスク割当・提出物・日報・ダッシュボード等の日付範囲絞り込み全般
- 【該当ファイル・行番号】`leader.html:564`（ymdValue）・`582`（inDateRange）、`executive.html:730`・`748`（同名関数の旧実装）
- 【症状】従業員画面では「2026 年だけ」「2026 年 6 月だけ」の部分指定で絞り込めるが、リーダー・幹部画面では年月日をすべて埋めないと絞り込みが効かない（無言で全件表示のまま）。
- 【原因】従業員画面の ymdValue/inDateRange のみ部分入力対応に更新され（コミット 51830b8）、リーダー・幹部にコピーされている同名関数が旧実装のまま取り残された（コピペ重複のドリフト）。
- 【重要度】**中**
- 【推奨する修正方針】従業員版の実装を leader.html・executive.html に反映する（将来的には共通 JS への切り出しを検討）。

### 問題5: notifications テーブルの RLS が実質無制限

- 【画面】SQL（全画面に影響）
- 【タブ・機能】通知の読み書き全般
- 【該当ファイル・行番号】`supabase/00_full_setup.sql:493-501`
- 【症状】画面上の不具合としては現れないが、認証済みユーザーなら誰でも（APIを直接叩けば）**他人宛ての通知を全件閲覧・既読化・削除・偽造できる**。
- 【原因】`ntf_read` が `using (true)`（全件 select 可）で作成され、より厳格な `ntf_select_own` と並存している（permissive ポリシーは OR 結合のため緩い方が勝つ）。`ntf_write` も `for all using (true) with check (true)` で insert/update/delete が無制限。40_fix_notification_rls.sql の意図（横断参照の許可）を超えて開放されている。
- 【重要度】**中**（機能影響なし・セキュリティ/プライバシーの問題）
- 【推奨する修正方針】`ntf_read` を drop し `ntf_select_own` のみに、`ntf_write` を「insert は authenticated、update は to_user_id=本人のみ、delete は本人のみ」に分割する。通知 insert がメンバー→リーダー宛てで必要な点に注意して権限を設計する。

### 問題6: 評価対象チャートIDのデモ・フォールバックが実データに混入し得る

- 【画面】従業員
- 【タブ・機能】評価管理タブ（自己評価の保存・読み込み）
- 【該当ファイル・行番号】`employee.html:1474`・`1505`・`1510`・`1561`・`1597`（`dbId || (k==='self_q3' ? 'user_nakamura' : ...)` フォールバック）
- 【症状】Supabase 接続時に self_q3 のチャートに dbId が無い稀なケース（チャート未作成のまま評価管理を操作等）で、自己評価が**シードデータの「中村健太」のチャートID（user_nakamura）に紐付いて保存**され、他人のデータを汚染し得る。
- 【原因】デモ用フォールバックが接続時のコードパスにも残っている。
- 【重要度】**中**
- 【推奨する修正方針】API.ready のときは dbId が無ければ保存を中止してエラー表示にする（デモIDへのフォールバックは未接続時のみに限定）。

### 問題7: 幹部・管理者画面は notifications テーブルを一切読まない

- 【画面】幹部／管理者
- 【タブ・機能】🔔 通知ベル
- 【該当ファイル・行番号】`executive.html:2498`・`admin.html:1062`（vxNotifSource が chart_sends 由来の情報のみ生成）
- 【症状】現状、幹部宛てに notifications を insert する経路が無いため実害はほぼ無いが、将来「幹部宛て通知」を追加しても表示されない。また teams.leader_id が幹部を指す構成にした場合、task_done/report_submitted 等の通知が幹部に届くが読む手段が無い。
- 【原因】通知ベルのデータソースが画面ごとに異なる設計（従業員=loadMyNotifications、リーダー=loadNotifications、幹部/管理者=chart_sends のみ）。
- 【重要度】**低**
- 【推奨する修正方針】幹部の vxNotifSource にも loadNotifications の結果を合流させる。

### 問題8: 通知タイプ「task_late」は表示定義のみ存在し、発生源が無い

- 【画面】リーダー
- 【タブ・機能】🔔 通知・受信ボックス
- 【該当ファイル・行番号】`leader.html:1739`・`1949`（meta 定義に task_late あり）／ api.js に insert 箇所なし
- 【症状】なし（遅延通知は誰にも届かない＝機能未実装のまま表示定義だけがある）。
- 【原因】遅延タスク通知が未実装。
- 【重要度】**低**
- 【推奨する修正方針】遅延検知バッチ/ログイン時チェックを実装するか、meta から削除して意図を明確化。

### 問題9: 期間ラベルの書式が画面ごとに不統一

- 【画面】従業員／リーダー／幹部
- 【タブ・機能】評価の期間表示
- 【該当ファイル・行番号】`employee.html:1238`（'2025年 Q2'）、`leader.html:1264`（'開始〜終了' の日付範囲文字列）、`executive.html:2243`（'2025 Q2' 固定）
- 【症状】評価履歴・評価記録で同じ評価の期間が「2025年 Q2」「2026-01-01〜2026-03-31」「2025 Q2」など揃わず、期間での突合・絞り込みができない。
- 【原因】period が自由文字列で、画面ごとに生成規則が異なる。
- 【重要度】**低**（問題3の修正と併せて検討）
- 【推奨する修正方針】period の正規形（例: 'YYYY Qn'）を決めて全画面で統一する。

### 問題10: 管理者画面のアクセス検証方式が他画面と不統一

- 【画面】管理者
- 【タブ・機能】ブート時のロール検証
- 【該当ファイル・行番号】`admin.html:1294-1296`（currentProfile().role 比較）。他 3 画面は `checkRoleAccess()`（employee.html:4087、leader.html:1977、executive.html:2527）
- 【症状】通常は問題ないが、checkRoleAccess が持つ「DB で毎回ロール再確認（権限剥奪の即時反映）」「全ロール喪失時の signOut」の挙動が admin だけ欠ける。
- 【原因】実装時期の違いによる方式の不統一。
- 【重要度】**低**
- 【推奨する修正方針】admin.html も checkRoleAccess('admin') に揃える。

### 問題11: リーダー通知の task_assigned 誤配の可能性（to_team_id 経由の横断表示）

- 【画面】リーダー
- 【タブ・機能】🔔 通知
- 【該当ファイル・行番号】`web/api.js:685-695`（loadNotifications の or 条件 `to_team_id.in.(...)`）、`web/api.js:437-438`（task_assigned は to_user_id=担当者・to_team_id=チーム で insert）
- 【症状】リーダーの🔔に、自分宛てではない通知（例: メンバー個人宛ての task_assigned）がチームID一致だけで表示される。幹部が誰かにタスクを割り当てると、担当者本人と同時にリーダーの通知にも同じものが出る（仕様として意図的なら問題なし）。
- 【原因】to_team_id が「チーム全体宛て」ではなく「文脈情報」として使われているのに、リーダー取得側は to_team_id 一致をすべて拾う。
- 【重要度】**低**（意図的な「チームの動きを見る」機能の可能性あり。要仕様確認）
- 【推奨する修正方針】仕様確認のうえ、純粋な本人宛てとチーム文脈通知を type で区別するか、現仕様を明文化。

---

## 2. 削除候補の死にコード一覧

**いずれも削除は未実施**（動的呼び出し `${prefix}FilterChart` のようなパターンの存在を確認済みのため、静的解析で参照ゼロでも慎重を期して残置）。各関数はファイル内・web/ui.js・web/api.js のどこからも名前が参照されていないことを確認済み。

| ファイル | 行 | 関数/キー | 備考 |
|---|---|---|---|
| employee.html | 710 | `filterTasks()` | 静的HTML版タスク絞り込みの残骸。実描画は renderTaskTable に移行済み（admin.html の同名関数は使用中） |
| employee.html | 746 | `asgComment()` | 割り当てコメント記入の旧UI残骸 |
| employee.html | 797 | `asgComplete()` | 割り当て完了ボタンの旧UI残骸 |
| employee.html | 2659 | `cmFilter()` | チャート管理の旧絞り込み |
| employee.html | 2706 | `openCmAddTask()` | 旧タスク追加導線 |
| employee.html | 2954 | `_epShortMD()` | 日付短縮表示ヘルパー（未使用） |
| employee.html | 3446 | `gotoAssignFromDashTask()` | ダッシュボード→割り当て遷移の旧実装 |
| executive.html | 778 | `memRowHTML()` | アカウント一覧の旧行テンプレート |
| executive.html | 993 | `resetMemberPw()` | パスワード再発行の旧実装（現在は別導線） |
| executive.html | 2140 | `saveCmt()` | 評価コメント保存の旧実装 |
| leader.html | 2124 | localStorage キー `vexum_linked_leader_id` | 書き込みのみで全ファイル中どこも読まない |
| employee.html | — | `localStorage.removeItem('vexum_chart_...')` | 旧キーの掃除コード。もはやどこも `vexum_chart_*` を書かない（無害） |

## 3. 重複コード一覧（コピペ・ドリフト状況）

3画面以上で本体が完全一致している純粋関数（統合候補だが今回は未変更）:

| 関数 | 所在 | 状態 |
|---|---|---|
| `ymdHtml()` | employee:607 / leader:547 / executive:713 | 3画面一致 |
| `vexumLogout()` | employee / leader / executive / admin | 4画面一致 |
| `saveProfile()` `closeProfileEdit()` `_profileEditErr()` `_profileToast()` | employee / leader / executive | 3画面一致（プロフィール編集一式） |
| `swTab()` | leader / executive / admin | 3画面一致（employee は独自版） |
| `closeMandala()` | employee / leader / executive | 3画面一致 |
| `ymdClear()` | employee / leader / executive | 3画面一致 |

**既にドリフトしている（要注意）重複**:

| 関数 | ドリフト内容 |
|---|---|
| `ymdValue()` | employee のみ部分入力対応（→問題4） |
| `inDateRange()` | employee のみ部分終端の期末展開対応（→問題4） |
| `ibBuildGrid()` | employee:2875 / leader:1772 は現在一致だが、受信ボックス改修時に片側だけ変わるリスク大 |
| `downloadCSV()` | executive:2112 / admin:743 一致、employee:1460 は別実装 |
| `val()` `statusChip()` `priChip()` | leader / executive 一致の小物ヘルパー |

推奨: 変更頻度の高いもの（日付系・プロフィール編集・受信ボックス）から web/ui.js への共通化を検討（今回は構造変更禁止のため未実施）。

## 4. フェーズ1で実施した整理（挙動変更なし）

| コミット | 内容 | 挙動不変の根拠 |
|---|---|---|
| `ed51cd8` | 全画面の`<script>`ブロック冒頭・空白区間にセクション見出しコメントを追加（8箇所） | git diff がコメント行のみであることを機械確認。構文チェック24ブロック・既存vmテスト82件全通過 |
| `5c7ad7e` | api.js の存在しない `02_seed_core.sql` 参照コメントを実在する `REBUILD.sql` に訂正 | コメントのみの変更 |

## 5. 重要度順サマリ

| # | 重要度 | 画面 | 概要 | 該当箇所 |
|---|---|---|---|---|
| 1 | 高 | 共通API | チャート紐付け評価の通知が ref_id 型不一致で常に失敗・不達 | api.js:927 |
| 2 | 高 | 従業員/API | チャート別評価が全部 self_q3 に集約表示される | api.js:1008 |
| 3 | 高 | 幹部 | 評価の期間が '2025 Q2' ハードコード | executive.html:2243 |
| 4 | 中 | リーダー/幹部 | 日付絞り込みが部分入力非対応（employee とドリフト） | leader.html:564 他 |
| 5 | 中 | SQL | notifications の RLS が実質無制限（読み書き） | 00_full_setup.sql:493 |
| 6 | 中 | 従業員 | 自己評価がデモID 'user_nakamura' に保存され得る | employee.html:1597 他 |
| 7 | 低 | 幹部/管理者 | notifications テーブルを読まない通知ベル | executive.html:2498 |
| 8 | 低 | リーダー | task_late 通知は表示定義のみで発生源なし | leader.html:1739 |
| 9 | 低 | 全画面 | 評価期間ラベルの書式不統一 | 複数 |
| 10 | 低 | 管理者 | アクセス検証方式が他画面と不統一 | admin.html:1294 |
| 11 | 低 | リーダー | to_team_id 経由でメンバー宛て通知も表示（要仕様確認） | api.js:691 |
