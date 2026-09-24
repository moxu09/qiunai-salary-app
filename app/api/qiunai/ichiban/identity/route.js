import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ORIGIN = "https://qiunai.gaming.wearestilllhere.com";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function digest(value) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("身分驗證服務尚未設定");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function OPTIONS(request) {
  if (request.headers.get("origin") !== ORIGIN) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}

async function sendCode(discordId, code) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord 私訊服務尚未設定");
  const auth = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST", headers: auth, body: JSON.stringify({ recipient_id: discordId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!dm.ok) throw new Error("無法私訊此 Discord 帳號；請確認 ID 並開啟伺服器成員私訊");
  const channel = await dm.json();
  const sent = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ content: `🔐 秋奈一番賞身分驗證碼：**${code}**\n10 分鐘內有效。若不是你本人操作，請忽略此訊息；不要把驗證碼告訴任何人。` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!sent.ok) throw new Error("私訊發送失敗；請開啟伺服器成員私訊後重試");
}

export async function POST(request) {
  if (request.headers.get("origin") !== ORIGIN) return response({ ok: false, message: "來源不符" }, 403);
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "start") {
      const discordId = String(body.discordId || "").trim();
      if (!/^[0-9]{15,25}$/.test(discordId)) return response({ ok: false, message: "請輸入正確的 Discord ID" }, 400);
      const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const ipDigest = digest(`ip:${ip}`);
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const [{ count: userCount, error: userError }, { count: ipCount, error: ipError }] = await Promise.all([
        supabaseAdmin.from("qiunai_ichiban_identity_challenges").select("id", { count: "exact", head: true }).eq("discord_user_id", discordId).gte("created_at", since),
        supabaseAdmin.from("qiunai_ichiban_identity_challenges").select("id", { count: "exact", head: true }).eq("ip_digest", ipDigest).gte("created_at", since),
      ]);
      if (userError || ipError) throw userError || ipError;
      if ((userCount || 0) >= 3 || (ipCount || 0) >= 6) return response({ ok: false, message: "短時間內驗證次數過多，請稍後再試" }, 429);
      const challengeId = randomUUID();
      const code = String(randomInt(100000, 1000000));
      const { error } = await supabaseAdmin.from("qiunai_ichiban_identity_challenges").insert({
        id: challengeId, discord_user_id: discordId,
        code_digest: digest(`${challengeId}:${code}`), ip_digest: ipDigest,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw error;
      try { await sendCode(discordId, code); }
      catch (dmError) {
        await supabaseAdmin.from("qiunai_ichiban_identity_challenges").update({ expires_at: new Date().toISOString() }).eq("id", challengeId);
        throw dmError;
      }
      return response({ ok: true, challengeId, expiresInSeconds: 600 });
    }
    if (body.action === "verify") {
      const challengeId = String(body.challengeId || "");
      const code = String(body.code || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^[0-9]{6}$/.test(code)) return response({ ok: false, message: "驗證資料格式錯誤" }, 400);
      const claimToken = randomBytes(32).toString("hex");
      const { data, error } = await supabaseAdmin.rpc("qiunai_ichiban_verify_identity", {
        p_challenge_id: challengeId,
        p_code_digest: digest(`${challengeId}:${code}`),
        p_token_digest: digest(`claim:${claimToken}`),
      });
      if (error) throw error;
      if (!data) return response({ ok: false, message: "驗證碼錯誤、過期，或嘗試次數已用完" }, 400);
      return response({ ok: true, claimToken });
    }
    return response({ ok: false, message: "驗證操作錯誤" }, 400);
  } catch (error) {
    console.error("[一番賞身分驗證]", error?.message || error);
    return response({ ok: false, message: error?.message || "驗證服務暫時無法使用" }, 503);
  }
}
