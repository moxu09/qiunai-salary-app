const DISCORD_ID = /^\d{17,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_TOKEN = /^[0-9a-f]{64}$/;

export async function resolveIchibanDiscordUser(db, digest, input) {
  const challengeId = String(input?.challengeId || "");
  const claimToken = String(input?.claimToken || "");
  if (!UUID.test(challengeId) || !CLAIM_TOKEN.test(claimToken)) {
    throw new Error("付款資料格式錯誤");
  }

  const { data: identity, error: identityError } = await db
    .from("qiunai_ichiban_identity_challenges")
    .select("discord_user_id,token_digest,verified_at,expires_at")
    .eq("id", challengeId)
    .maybeSingle();
  if (identityError) throw identityError;
  if (!identity || !DISCORD_ID.test(identity.discord_user_id)
    || !identity.verified_at || new Date(identity.expires_at).getTime() <= Date.now()
    || identity.token_digest !== digest(claimToken)) {
    throw new Error("Discord 登入已過期，請重新登入");
  }
  return identity.discord_user_id;
}

export async function getIchibanAsdBalance(db, digest, input) {
  const discordUserId = await resolveIchibanDiscordUser(db, digest, input);
  const { data, error } = await db
    .from("users")
    .select("coins")
    .eq("user_id", discordUserId)
    .maybeSingle();
  if (error) throw error;
  const balance = data == null ? 0 : Number(data.coins);
  if (!Number.isFinite(balance) || balance < 0) {
    throw new Error("ASD 餘額格式錯誤，請聯繫客服核對");
  }
  return { balance };
}

export async function drawIchibanWithAsd(db, digest, input) {
  const requestId = String(input?.requestId || "");
  if (!UUID.test(requestId)) throw new Error("付款資料格式錯誤");
  const discordUserId = await resolveIchibanDiscordUser(db, digest, input);

  const { data, error } = await db.rpc("qiunai_ichiban_draw_asd", {
    p_discord_user_id: discordUserId,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (!data?.draw_id || !data?.prize_id || !Number.isInteger(Number(data.ticket_no))) {
    throw new Error("抽獎結果格式錯誤，請聯繫客服核對");
  }
  return {
    id: String(data.draw_id),
    prize_id: String(data.prize_id),
    ticket_no: Number(data.ticket_no),
    is_last_one: Boolean(data.is_last_one),
    balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : null,
    already_processed: Boolean(data.already_processed),
  };
}
