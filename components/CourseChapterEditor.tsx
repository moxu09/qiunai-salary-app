'use client';

import { useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { safeReferenceHref } from '@/lib/inlineReferences.mjs';

export type CourseChannel = { label: string; url: string; group: string };

export default function CourseChapterEditor({ body, onChange, channels }: {
  body: string;
  onChange: (body: string) => void;
  channels: CourseChannel[];
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [editingLink, setEditingLink] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [channelChoice, setChannelChoice] = useState('');
  const [error, setError] = useState('');

  function openLinkEditor() {
    const input = textarea.current;
    if (!input) return;
    selection.current = { start: input.selectionStart, end: input.selectionEnd };
    setLabel(body.slice(input.selectionStart, input.selectionEnd).trim());
    setUrl('');
    setChannelChoice('');
    setError('');
    setEditingLink(true);
  }

  function insertLink() {
    const href = safeReferenceHref(url.trim());
    const text = label.trim();
    if (!href || !text || /[\[\]\n]/.test(text)) {
      setError('請填寫單行顯示文字，並選擇頻道或填入有效的 HTTPS 網址。');
      return;
    }
    const { start, end } = selection.current;
    const link = `[${text}](${href.replaceAll('(', '%28').replaceAll(')', '%29')})`;
    const next = body.slice(0, start) + link + body.slice(end);
    if (next.length > 20000) {
      setError('章節內容超過 20,000 字，請先縮短內文。');
      return;
    }
    onChange(next);
    setEditingLink(false);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + link.length, start + link.length);
    });
  }

  return <>
    <label>章節內容<textarea ref={textarea} required rows={7} maxLength={20000} value={body} onChange={event=>onChange(event.target.value)} /></label>
    <div className="course-editor-actions">
      <button type="button" aria-expanded={editingLink} onClick={openLinkEditor}><Link2 size={16}/> 插入連結</button>
      <small>可先反白要加連結的文字，再選頻道或貼上網址。</small>
    </div>
    {editingLink ? <div className="course-link-editor">
      <label>顯示文字<input value={label} maxLength={120} onChange={event=>setLabel(event.target.value)} /></label>
      {channels.length ? <label>選擇本店 Discord 頻道<select value={channelChoice}
        onChange={event=>{
          setChannelChoice(event.target.value);
          if (!event.target.value) return;
          const [href, name] = JSON.parse(event.target.value);
          setUrl(href);
          if (!label.trim()) setLabel(name);
        }}>
        <option value="">選擇頻道</option>
        {channels.map(channel=><option key={JSON.stringify([channel.url,channel.label])} value={JSON.stringify([channel.url,channel.label])}>{channel.label} · {channel.group}</option>)}
      </select></label> : null}
      <label>連結網址<input inputMode="url" value={url} placeholder="https://…" onChange={event=>{setUrl(event.target.value);setChannelChoice('');}} /></label>
      {error ? <p role="alert" className="eip-collab-alert">{error}</p> : null}
      <div className="course-editor-actions">
        <button type="button" onClick={insertLink}>插入到內文</button>
        <button type="button" onClick={()=>setEditingLink(false)}>取消</button>
      </div>
    </div> : null}
  </>;
}
