import { allRows } from '@/lib/hrServer';
import { SERVICE_STORES } from '@/lib/service/access';
import { deskError, manualActor } from '@/lib/service/manualServer';
import { SERVICE_GUILDS } from '@/lib/serviceManual.mjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  try {
    const { department } = await context.params;
    await manualActor(request, department);
    const [guild] = SERVICE_GUILDS[department];
    const token = process.env[SERVICE_STORES[department].token];
    if (!token) throw Error('未設定訂單頻道查詢');

    const response = await fetch(`https://discord.com/api/v10/guilds/${guild}/channels`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!response.ok) throw Error('Discord 訂單頻道暫時無法讀取');
    const channels = new Map((await response.json())
      .filter(channel => channel.type === 0 && /^\d{15,22}$/.test(channel.id))
      .map(channel => [channel.id, channel.name]));
    const channelIds = [...channels.keys()];
    const reads = [];
    for (let start = 0; start < channelIds.length; start += 75) {
      const batch = channelIds.slice(start, start + 75);
      reads.push(allRows(() => supabaseAdmin.from('play_orders')
        .select('id,channel_id,order_no,created_at')
        .eq('guild_id', guild)
        .in('channel_id', batch)
        .not('is_deleted', 'is', true)
        .or('status.is.null,status.neq.cancelled')
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id')));
    }
    const orders = (await Promise.all(reads)).flat();
    orders.sort((left, right) => (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0));
    const options = [];
    for (const order of orders) {
      const name = channels.get(order.channel_id);
      if (!name) continue;
      channels.delete(order.channel_id);
      options.push({
        label: name.slice(0, 100).replace(/[\uD800-\uDBFF]$/, ''),
        orderNo: order.order_no ? String(order.order_no) : '',
        url: `https://discord.com/channels/${guild}/${order.channel_id}`,
      });
    }
    return Response.json({ ok: true, orders: options }, {
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' },
    });
  } catch (error) {
    return deskError(error);
  }
}
