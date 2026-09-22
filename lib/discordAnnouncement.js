import "server-only";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_DISCORD_ATTEMPTS = 5;
const MAX_FAILURE_DETAILS = 30;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanDiscordError(status, payload) {
  if (status === 403) return "對方已關閉私人訊息或封鎖機器人";
  if (status === 404) return "找不到 Discord 帳號或私人訊息頻道";
  if (status === 401) return "機器人驗證失敗";
  const message = String(payload?.message || "").trim();
  return message ? `Discord ${status}：${message.slice(0, 160)}` : `Discord API 回應 ${status}`;
}

async function discordRequest(path, { token, body }, attempt = 1) {
  let response;
  try {
    response = await fetch(`${DISCORD_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (attempt < MAX_DISCORD_ATTEMPTS) {
      await wait(400 * attempt);
      return discordRequest(path, { token, body }, attempt + 1);
    }
    throw new Error(error?.name === "TimeoutError" ? "Discord 連線逾時" : "無法連線至 Discord");
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 429 && attempt < MAX_DISCORD_ATTEMPTS) {
    const retryAfter = Math.min(Math.max(Number(payload.retry_after || 1) * 1000, 250), 15_000);
    await wait(retryAfter);
    return discordRequest(path, { token, body }, attempt + 1);
  }
  if (!response.ok) throw new Error(cleanDiscordError(response.status, payload));
  return payload;
}

function announcementMessage({ announcement, companyName, siteUrl }) {
  const fullContent = String(announcement.content || "").trim();
  const truncated = fullContent.length > 3800;
  const description = truncated
    ? `${fullContent.slice(0, 3800)}…\n\n完整內容請至員工 EIP 查看。`
    : fullContent;
  const fields = [];

  if (announcement.attachment_name) {
    fields.push({ name: "📎 公告附件", value: String(announcement.attachment_name).slice(0, 1024) });
  }
  if (announcement.requires_signature) {
    fields.push({
      name: "✍️ 需要完成簽署",
      value: announcement.signature_deadline
        ? `請詳閱文件並手寫簽署。期限：${new Date(announcement.signature_deadline).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`
        : "請至員工 EIP 詳閱文件並完成手寫簽署。",
    });
  }

  return {
    embeds: [{
      color: 0x60a5fa,
      title: `📢 ${companyName}｜${String(announcement.title || "新公告")}`.slice(0, 256),
      description,
      fields,
      footer: { text: "此訊息由 EIP 公告系統透過官方機器人發送" },
      timestamp: announcement.created_at || new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [{ type: 2, style: 5, label: announcement.requires_signature ? "前往詳閱與簽署" : "開啟員工 EIP", url: siteUrl }],
    }],
    allowed_mentions: { parse: [] },
  };
}

async function activeRecipientIds(supabaseAdmin, staffTable, audienceDiscordIds) {
  const { data, error } = await supabaseAdmin
    .from(staffTable)
    .select("discord_id,is_active")
    .not("discord_id", "is", null);
  if (error) throw error;

  const audience = new Set((audienceDiscordIds || []).map(String));
  return [...new Set((data || [])
    .filter((staff) => staff.is_active !== false)
    .map((staff) => String(staff.discord_id || "").trim())
    .filter((discordId) => /^\d{15,22}$/.test(discordId))
    .filter((discordId) => audience.size === 0 || audience.has(discordId)))];
}

export async function sendAnnouncementDirectMessages({
  supabaseAdmin,
  staffTable,
  announcement,
  companyName,
  siteUrl,
  botToken = process.env.DISCORD_BOT_TOKEN,
  concurrency = 6,
}) {
  const recipients = await activeRecipientIds(supabaseAdmin, staffTable, announcement.audience_discord_ids);
  if (!botToken) {
    return { targetCount: recipients.length, sentCount: 0, failedCount: recipients.length, failures: [], systemError: "EIP 尚未設定 Discord 機器人 Token" };
  }
  if (!recipients.length) {
    return { targetCount: 0, sentCount: 0, failedCount: 0, failures: [] };
  }

  const message = announcementMessage({ announcement, companyName, siteUrl });
  const failures = [];
  let sentCount = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < recipients.length) {
      const discordId = recipients[cursor];
      cursor += 1;
      try {
        const channel = await discordRequest("/users/@me/channels", { token: botToken, body: { recipient_id: discordId } });
        if (!channel?.id) throw new Error("無法建立私人訊息頻道");
        await discordRequest(`/channels/${channel.id}/messages`, { token: botToken, body: message });
        sentCount += 1;
      } catch (error) {
        failures.push({ discordId, reason: error?.message || "發送失敗" });
      }
    }
  }

  const workerCount = Math.min(Math.max(Number(concurrency) || 1, 1), recipients.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    targetCount: recipients.length,
    sentCount,
    failedCount: failures.length,
    failures: failures.slice(0, MAX_FAILURE_DETAILS),
    omittedFailureCount: Math.max(0, failures.length - MAX_FAILURE_DETAILS),
  };
}
