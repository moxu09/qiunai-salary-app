export function safeReferenceHref(value) {
  if (typeof value !== 'string' || /[\s\\\x00-\x1f\x7f]/.test(value)) return null;
  if (/^#[a-z][a-z0-9-]*$/i.test(value)) return value;
  try {
    const url = new URL(value, 'https://eip.wearestilllhere.com');
    if (value.startsWith('/') && !value.startsWith('//')) {
      return /^\/(service|collaboration\/knowledge)(\/|$)/.test(url.pathname)
        ? url.pathname + url.search + url.hash : null;
    }
    return value.startsWith('https://') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const ordinalDigits = '零一二三四五六七八九';
export function referenceNumber(value) {
  const normalized = value.normalize('NFKC').replaceAll('兩', '二');
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (normalized.length === 1 && ordinalDigits.includes(normalized)) return ordinalDigits.indexOf(normalized);
  const match = normalized.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
  return match ? (match[1] ? ordinalDigits.indexOf(match[1]) : 1) * 10 + (match[2] ? ordinalDigits.indexOf(match[2]) : 0) : 0;
}

// Conflicting names stay plain text. A contextual group takes precedence over
// the store index, so a step's own link can disambiguate a channel in that step.
export function referenceMap(...groups) {
  const result = new Map();
  for (const links of groups) {
    const local = new Map();
    for (const { label, url } of links || []) {
      const href = safeReferenceHref(url);
      if (!label || !href) continue;
      if (!local.has(label)) local.set(label, href);
      else if (local.get(label) !== href) local.set(label, null);
    }
    for (const [label, href] of local) result.set(label, href);
  }
  return result;
}

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ordinal = '第[ \t]*[0-9０-９一二三四五六七八九十兩]+[ \t]*[章節节段課课步]';
const explicit = '\\[[^\\[\\]\\n]+\\]\\([^\\s()]+\\)';
const urlPattern = 'https://[^\\s<>"「」『』【】。，、；！？）]+';
export function inlineReferenceTokens(value, references = new Map(), resolveNumber) {
  const source = String(value || '');
  const labels = [...references.keys()].sort((a, b) => b.length - a.length).map(escapePattern);
  const pattern = new RegExp([explicit, urlPattern, ordinal, ...labels].join('|'), 'gu');
  const tokens = [];
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > offset) tokens.push({ text: source.slice(offset, match.index) });
    let text = match[0], href = null;
    const authored = text.match(/^\[([^\[\]\n]+)\]\(([^\s()]+)\)$/);
    if (authored) {
      href = safeReferenceHref(authored[2]);
      if (href) text = authored[1];
    } else if (text.startsWith('https://')) {
      text = text.replace(/[),.;!?]+$/, '');
      href = safeReferenceHref(text);
    } else if (references.has(text)) {
      href = references.get(text);
    } else {
      const number = text.match(/^第\s*(.*?)\s*([章節节段課课步])$/);
      if (number && resolveNumber) href = safeReferenceHref(resolveNumber(referenceNumber(number[1]), number[2]));
    }
    tokens.push(href ? { text, href } : { text });
    if (text !== match[0] && !authored) tokens.push({ text: match[0].slice(text.length) });
    offset = match.index + match[0].length;
  }
  if (offset < source.length) tokens.push({ text: source.slice(offset) });
  return tokens;
}
