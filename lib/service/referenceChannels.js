import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { discordChannel, SERVICE_GUILDS } from '@/lib/serviceManual.mjs';

export async function loadReferenceChannels(department) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('service_manual_entries')
    .select('kind,title,content').eq('organization_code', department).eq('is_active', true)
    .in('kind', ['resource', 'flow', 'campaign'])
    .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`);
  if (error) throw error;

  const channels = new Map();
  function add(label, url) {
    if (!label || typeof url !== 'string') return;
    // Never derive a channel link from a bare name or an ID in course text.
    try {
      const channel = discordChannel(url, department);
      if (!channel.url) return;
      const name = label.startsWith('#') ? label : '#' + label;
      const group = channel.guildId === SERVICE_GUILDS[department][0] ? '主伺服器' : '員工群';
      channels.set(name + ':' + channel.channelId, { label: name, url: channel.url, group, channelId: channel.channelId });
    } catch { /* Resource links outside this store are not picker options. */ }
  }
  for (const { kind, title, content } of data || []) {
    if (kind === 'resource') add(title, content?.url);
    for (const stage of content?.stages || []) {
      for (const step of stage.steps || []) {
        for (const link of step.links || []) add(link.label, link.url);
      }
      for (const extra of stage.extras || []) {
        for (const link of extra.links || []) add(link.label, link.url);
        for (const step of extra.steps || []) {
          for (const link of step.links || []) add(link.label, link.url);
        }
      }
    }
  }
  return [...channels.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'));
}

export function channelAliases(channels) {
  return channels.flatMap(({ label, url, group, channelId }) => {
    const aliases = [label, `<#${channelId}>`];
    if (!label.endsWith('）')) aliases.push(`${label}（${group}）`, `${label}(${group})`);
    const plain = label.slice(1);
    if (plain.length >= 4 && !plain.includes('（')) aliases.push(plain);
    return aliases.map(alias => ({ label: alias, url }));
  });
}

export async function loadCourseReferences(department, course) {
  const body = course.chapters?.length ? course.chapters.map(chapter => chapter.body).join('\n') : course.body;
  if (!body) return [];
  const channels = await loadReferenceChannels(department);
  return channelAliases(channels).filter(({ label }) => body.includes(label));
}
