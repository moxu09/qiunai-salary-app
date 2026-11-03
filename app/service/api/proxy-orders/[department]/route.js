import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SERVICE_STORES, serviceFail } from '@/lib/service/access';
import { manualActor } from '@/lib/service/manualServer';
import { parseProxyOrderRequest, publicProxyOrder } from '@/lib/service/proxyOrderRequest.mjs';

export const dynamic = 'force-dynamic';
const STORE_GUILDS = { qiunai: '1206138511535898654', deepnight: '1501098191813214312' };
const fail = (status, message) => Object.assign(Error(message), { status });
const scope = department => `${department}:service-proxy`;

async function actorFor(request, context) {
  const { department } = await context.params;
  const actor = await manualActor(request, department);
  if (!Object.hasOwn(STORE_GUILDS, department) || !Object.hasOwn(SERVICE_STORES, department))
    throw fail(404, '找不到這家店');
  return { actor, department };
}

export async function GET(request, context) {
  try {
    const { actor, department } = await actorFor(request, context);
    const { data, error } = await supabaseAdmin.from('bot_service_order_flows')
      .select('flow_id,payload,created_at').eq('organization_code', scope(department))
      .eq('payload->>actorId', actor.discordId).order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return Response.json({ ok: true, requests: (data || []).map(row => publicProxyOrder(row, STORE_GUILDS[department])) },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } catch (error) { return serviceFail(error); }
}

export async function POST(request, context) {
  try {
    const { actor, department } = await actorFor(request, context);
    const raw = await request.text();
    if (raw.length > 2000) throw fail(400, '建單資料過長');
    let input;
    try { input = parseProxyOrderRequest(JSON.parse(raw)); } catch { throw fail(400, '建單資料格式不正確'); }
    if (!input) throw fail(400, '請確認老闆 Discord ID 與訂單類型');
    if (input.customerId === actor.discordId) throw fail(400, '自己的訂單請從 Discord 下單頻道建立');
    const table = () => supabaseAdmin.from('bot_service_order_flows');
    const read = async () => {
      const { data, error } = await table().select('flow_id,payload,created_at')
        .eq('organization_code', scope(department)).eq('flow_id', input.requestId).maybeSingle();
      if (error) throw error;
      return data;
    };
    let row = await read();
    if (!row) {
      const { error } = await table().insert({
        organization_code: scope(department), flow_id: input.requestId, revision: 1,
        payload: { version: 1, status: 'queued', actorId: actor.discordId, userId: input.customerId,
          kind: input.kind, attempts: 0 },
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      if (error && error.code !== '23505') throw error;
      row = await read();
    }
    if (!row || row.payload.actorId !== actor.discordId || row.payload.userId !== input.customerId ||
        row.payload.kind !== input.kind) throw fail(409, '這個建單編號已用於其他請求');
    return Response.json({ ok: true, request: publicProxyOrder(row, STORE_GUILDS[department]) },
      { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } catch (error) { return serviceFail(error); }
}
