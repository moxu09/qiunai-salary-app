export const QIUNAI_HANDOVER_CHANNEL = '1513247796944179291';
export const QIUNAI_HANDOVER_GUILD = '1513174069087047731';
const ALLOWED_GUILDS = new Set(['1206138511535898654', QIUNAI_HANDOVER_GUILD]);
const SLOT_MS = 3 * 60 * 60 * 1000;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const LINK = /https:\/\/(?:(?:ptb|canary|www)\.)?discord(?:app)?\.com\/channels\/(\d{15,22})\/(\d{15,22})(?:\/(\d{15,22}))?/gi;

export function handoverSlot(timestamp) {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return null;
  return new Date(Math.floor((value + TAIPEI_OFFSET_MS) / SLOT_MS) * SLOT_MS - TAIPEI_OFFSET_MS).toISOString();
}

export function handoverChannelLinks(content) {
  const result = [];
  const seen = new Set();
  for (const match of String(content || '').matchAll(LINK)) {
    const [, guildId, channelId, messageId] = match;
    if (!ALLOWED_GUILDS.has(guildId) || channelId === QIUNAI_HANDOVER_CHANNEL) continue;
    const key = `${guildId}:${channelId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      channelId,
      url: `https://discord.com/channels/${guildId}/${channelId}`,
      messageUrl: messageId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null,
    });
  }
  return result;
}

export function handoverMessage(raw) {
  if (!/^\d{15,22}$/.test(String(raw?.id || ''))) return null;
  const slotStart = handoverSlot(raw.timestamp);
  if (!slotStart) return null;
  const content = String(raw.content || '').slice(0, 2000);
  const attachments = (Array.isArray(raw.attachments) ? raw.attachments : [])
    .filter(file => typeof file?.url === 'string' && /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//.test(file.url))
    .slice(0, 10)
    .map(file => ({ name: String(file.filename || '附件').slice(0, 100), url: file.url }));
  if (!content.trim() && !attachments.length) return null;
  return {
    id: raw.id,
    createdAt: raw.timestamp,
    slotStart,
    author: String(raw.author?.global_name || raw.author?.username || '客服').slice(0, 80),
    content,
    sourceUrl: `https://discord.com/channels/${QIUNAI_HANDOVER_GUILD}/${QIUNAI_HANDOVER_CHANNEL}/${raw.id}`,
    links: handoverChannelLinks(content),
    attachments,
  };
}
