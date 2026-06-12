-- =====================================================================
-- 16_one_account_one_role.sql — 1人=1アカウント=1ロール の正規化（冪等）
--
-- 背景: 過去パッチ(13/15)でメール変更・admin復旧を重ねた結果、
--   ・幹部とメンバーで同名アカウントが併存
--   ・auth.users と profiles の紐付けが交錯（別人の名前で表示される）
-- 状態になり得るため、デモ4アカウントを決定的に正規化し、
-- 「1人につき1アカウント・ロールは1つだけ」をDB制約として固定します。
--
-- SQL Editor に貼り付けて1回実行（再実行しても安全）。
-- =====================================================================

-- ========== 1. デモ用の正規アカウント（この4人＋本人で確定） ==========
-- ロールは profiles.role（enum単一列）なので「1アカウント=1ロール」は
-- スキーマ上保証される。ここでは「誰がどのロールか」を確定する。
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid,'山田 太郎','yamada@com',           'admin'::user_role,    '経営企画部','#0D9488'),
      ('a0000000-0000-4000-8000-000000000002'::uuid,'山本 雅人','yamamoto@com',         'executive'::user_role,'経営管理本部','#0D9488'),
      ('a0000000-0000-4000-8000-000000000003'::uuid,'田中 花子','tanaka@vexum.co.jp',   'leader'::user_role,   '営業部','#0D9488'),
      ('a0000000-0000-4000-8000-000000000004'::uuid,'中村 健太','nakamura@vexum.co.jp', 'member'::user_role,   '営業部','#06B6D4'),
      ('a0000000-0000-4000-8000-000000000017'::uuid,'向山颯太','muko577628@icloud.com', 'executive'::user_role,'経営管理本部','#0D9488')
    ) as t(cid, cname, cemail, crole, cdept, ccolor)
  loop
    -- そのメールを別プロフィールが握っていたら解放（重複アカウントは tmp 退避）
    update profiles set email = id::text || '@tmp.local'
     where lower(email) = lower(r.cemail) and id <> r.cid;
    -- 正規プロフィールを upsert（名前・メール・ロールを確定）
    insert into profiles (id, full_name, email, role, department, color)
    values (r.cid, r.cname, r.cemail, r.crole, r.cdept, r.ccolor)
    on conflict (id) do update
      set full_name = excluded.full_name,
          email     = excluded.email,
          role      = excluded.role,
          department= excluded.department;
  end loop;
end $$;

-- ========== 2. 交錯した紐付けの解消 ==========
-- 紐付いている auth ユーザーのメールがプロフィールのメールと不一致なら解除
-- （「別の人の名前でログイン表示される」原因を断つ）
update profiles p set auth_user_id = null
 where auth_user_id is not null
   and not exists (
     select 1 from auth.users u
      where u.id = p.auth_user_id and lower(u.email) = lower(p.email)
   );

-- ========== 3. 全プロフィールにログインを1つずつ用意（メール一致で再紐付け） ==========
-- 既存 auth ユーザーがあれば再利用、なければ作成（初期PW: vexum2025）。
-- 正規4アカウントはPWを vexum2025 にリセットして復旧を保証。
do $$
declare
  r record; uid uuid; is_canon boolean;
begin
  for r in select id, email, full_name from profiles where email not like '%@tmp.local' loop
    select id into uid from auth.users where lower(email)=lower(r.email) limit 1;
    is_canon := r.email in ('yamada@com','yamamoto@com','tanaka@vexum.co.jp','nakamura@vexum.co.jp');
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin,confirmation_token,recovery_token,email_change_token_new,email_change)
      values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',r.email,crypt('vexum2025',gen_salt('bf')),now(),now(),now(),'{"provider":"email","providers":["email"]}',json_build_object('full_name',r.full_name),false,'','','','');
      insert into auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),uid,uid::text,json_build_object('sub',uid::text,'email',r.email,'email_verified',true),'email',now(),now(),now());
    elsif is_canon then
      update auth.users
         set encrypted_password = crypt('vexum2025', gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where id = uid;
    end if;
    -- この auth ユーザーが他のプロフィールに付いていたら外してから本人に紐付け
    update profiles set auth_user_id = null where auth_user_id = uid and id <> r.id;
    update profiles set auth_user_id = uid  where id = r.id;
  end loop;
end $$;

-- ========== 4. 迷子のログインを削除（プロフィールのないauthユーザー） ==========
-- プロフィールに対応しないログインは「2つ目のアカウント」になり得るため削除。
-- （tmp退避した重複プロフィールの旧ログインもここで消える）
delete from auth.users u
 where not exists (
   select 1 from profiles p where lower(p.email) = lower(u.email)
 );

-- ========== 5. 制約の固定 ==========
-- 1人1アカウント: メールは大文字小文字を区別せず一意（既存uniqueの強化）
-- ※ auth_user_id は既に unique（1ログイン=1プロフィール）
-- ※ role は enum 単一列（1アカウント=1ロール）— 複数ロールは構造上持てない
create unique index if not exists uq_profiles_email_ci on profiles (lower(email));

-- ========== 6. 確認クエリ ==========
-- (a) 正規4アカウントがログイン可能か（期待値: 4）
-- (b) メール重複（期待値: 0）
-- (c) authユーザーとプロフィールの紐付け不一致（期待値: 0）
-- (d) tmp退避された重複プロフィール（期待値: 0 / 出たら中身を確認して削除）
select
  (select count(*) from profiles p join auth.users u on u.id = p.auth_user_id
    where p.email in ('yamada@com','yamamoto@com','tanaka@vexum.co.jp','nakamura@vexum.co.jp')) as canonical_logins_ready,
  (select count(*) from (select lower(email) from profiles group by 1 having count(*)>1) d)      as duplicated_emails,
  (select count(*) from profiles p join auth.users u on u.id = p.auth_user_id
    where lower(u.email) <> lower(p.email))                                                      as mismatched_links,
  (select count(*) from profiles where email like '%@tmp.local')                                 as quarantined_duplicates;
-- 期待値: 4 / 0 / 0 / 0

-- 全アカウントの最終状態を一覧（誰がどのロールか）
select full_name, email, role, (auth_user_id is not null) as login_ok
  from profiles
 order by role, full_name;
