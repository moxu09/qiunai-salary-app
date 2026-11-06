export const PROXY_KINDS = Object.freeze({
  order: '一般訂單',
  tip: '打賞',
  crown: '冠名',
  'custom-tip': '客製打賞',
  'custom-crown': '自定冠名',
});

export function parseProxyOrderRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['requestId', 'customerId', 'kind'].includes(key))) return null;
  const { requestId, customerId, kind } = value;
  if (typeof requestId !== 'string' || !/^PROXY-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) ||
      typeof customerId !== 'string' || !/^\d{17,20}$/.test(customerId) ||
      typeof kind !== 'string' || !Object.hasOwn(PROXY_KINDS, kind)) return null;
  return { requestId, customerId, kind };
}

export function publicProxyOrder(row, guildId) {
  const payload = row?.payload || {};
  const channelId = /^\d{17,20}$/.test(String(payload.channelId || '')) ? payload.channelId : null;
  return {
    requestId: row.flow_id,
    customerId: payload.userId,
    kind: payload.kind,
    status: payload.status,
    createdAt: row.created_at,
    channelUrl: payload.status === 'opened' && channelId
      ? `https://discord.com/channels/${guildId}/${channelId}` : null,
  };
}
