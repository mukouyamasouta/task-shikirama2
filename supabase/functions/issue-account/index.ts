// =====================================================================
// issue-account — アカウント発行（ランダムPWで確認済みユーザー作成＋メール送信）
// 呼び出し元: 幹部画面 submitAccount → sb.functions.invoke('issue-account', {...})
// 必要シークレット: RESEND_API_KEY（任意: MAIL_FROM）
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY は自動注入
// デプロイ: supabase functions deploy issue-account
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function genPw(len = 12) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = crypto.getRandomValues(new Uint32Array(len));
  let s = "";
  for (let i = 0; i < len; i++) s += c[a[i] % c.length];
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, full_name, login_url } = await req.json();
    if (!email) return json({ error: "email required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, serviceKey);

    // 呼び出し元が 管理者/幹部 か検証
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await caller.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("auth_user_id", u.user.id).single();
    if (!prof || !["admin", "executive"].includes(prof.role)) return json({ error: "forbidden: admin/executive only" }, 403);

    const password = genPw();

    // 確認済みユーザー作成（既存なら パスワードを更新）
    let userId: string | undefined;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (created.error) {
      const { data: list } = await admin.auth.admin.listUsers();
      const ex = list?.users?.find((x) => (x.email || "").toLowerCase() === String(email).toLowerCase());
      if (!ex) return json({ error: created.error.message }, 400);
      userId = ex.id;
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      userId = created.data.user.id;
    }

    // profiles と紐付け
    await admin.from("profiles").update({ auth_user_id: userId }).eq("email", email);

    // Resend でメール送信
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("MAIL_FROM") || "VEXUM <onboarding@resend.dev>";
    const appUrl = login_url || "https://vexum-deploy.vercel.app/";
    let emailed = false, emailError = "";
    if (resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [email], subject: "VEXUM アカウント発行のお知らせ",
          html: `<div style="font-family:sans-serif;line-height:1.7">
            <p>${full_name || ""} 様</p>
            <p>VEXUM タスク管理システムのアカウントが発行されました。</p>
            <p><b>ログインURL：</b><a href="${appUrl}">${appUrl}</a><br>
            <b>メールアドレス：</b>${email}<br>
            <b>パスワード：</b>${password}</p>
            <p>セキュリティのため、初回ログイン後にパスワードの変更を推奨します。</p>
          </div>`,
        }),
      });
      emailed = r.ok;
      if (!r.ok) emailError = await r.text();
    }

    // メール未送信時のみ パスワードを返す（管理者が手動連絡できるよう）
    return json({ ok: true, emailed, emailError, password: emailed ? undefined : password });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
