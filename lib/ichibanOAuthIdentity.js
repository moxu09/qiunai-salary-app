import { randomBytes, randomUUID } from "node:crypto";

// Discord access tokens are used only to resolve /users/@me. They are never
// logged, persisted, or returned to the browser.
export async function createIchibanOAuthIdentity(db, digest, accessToken, fetchDiscord = fetch) {
  if (typeof accessToken !== "string" || !/^[A-Za-z0-9._-]{20,2048}$/.test(accessToken)) {
    throw new Error("請重新登入 Discord");
  }
  const response = await fetchDiscord("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Discord 登入已失效，請重新登入");
  const user = await response.json();
  if (user.bot || !/^\d{17,20}$/.test(user.id)) throw new Error("無效的 Discord 帳號");

  const { count, error: countError } = await db.from("qiunai_ichiban_identity_challenges")
    .select("id", { count: "exact", head: true })
    .eq("discord_user_id", user.id)
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (countError) throw new Error("身分驗證服務暫時無法使用");
  if ((count || 0) >= 3) throw new Error("短時間內登入次數過多，請稍後再試");

  const challengeId = randomUUID();
  const claimToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { error } = await db.from("qiunai_ichiban_identity_challenges").insert({
    id: challengeId,
    discord_user_id: user.id,
    code_digest: digest(`oauth:${randomBytes(32).toString("hex")}`),
    token_digest: digest(`claim:${claimToken}`),
    ip_digest: digest(`oauth-user:${user.id}`),
    verified_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  if (error) throw new Error("建立領獎身分失敗，請稍後重試");
  return { ok: true, discordId: user.id, challengeId, claimToken, expiresAt };
}
