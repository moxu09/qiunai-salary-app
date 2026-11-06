begin;

-- Move only the DeepNight panel and discard the message ID bound to the old channel.
alter table public.service_panel_registry
  drop constraint service_panel_registry_check;

do $$
begin
  update public.service_panel_registry
  set channel_id = '1566890399765762208', message_id = null,
      lease_owner = null, lease_until = null, updated_at = now()
  where organization_code = 'deepnight'
    and guild_id = '1501836172199202856'
    and channel_id = '1502053562799362209'
    and (lease_until is null or lease_until < clock_timestamp());
  if not found then
    raise exception 'DeepNight panel registry is not in its expected state';
  end if;
end $$;

alter table public.service_panel_registry
  add constraint service_panel_registry_check check (
    (organization_code = 'qiunai' and guild_id = '1513174069087047731' and channel_id = '1566885603637854269')
    or (organization_code = 'deepnight' and guild_id = '1501836172199202856' and channel_id = '1566890399765762208')
  );

-- Current published wording from 幸福禮贈, message 1565763510263349302.
do $$
begin
  update public.service_templates
  set body = $copy$**## ୨୧ ┈┈┈┈┈  打賞通知  ┈┈┈┈┈ ୨୧**
˚₊‧꒰ა  深夜不關燈  ໒꒱‧₊˚

𓏲 ࣪₊♡𓂃 𓈒𓏸 𓋜 𓏸𓈒 𓂃♡₊ ࣪𓏲
♡ 感謝 {{f0}}  ♡
把【{{f2}}】送給了 {{f1}}

✦ 禮物價值 ✦
      **{{f3}}**    x   **{{f4}}組**

꒰ঌ 願你們的每一天都被溫柔偏愛 ໒꒱
♡⸝⸝ 願快樂像星星一樣，落滿整個夜晚
⊹₊˚·︵‿₊୨୧ 深夜不關燈 祝{{f5}}位天天開心 ୨୧₊‿︵·˚₊⊹$copy$,
      fields = '[
        {"key":"f0","type":"text","label":"送禮的老闆","required":true,"maxLength":120},
        {"key":"f1","type":"text","label":"收禮的陪陪","required":true,"maxLength":500},
        {"key":"f2","type":"text","label":"禮物名稱","required":true,"maxLength":100},
        {"key":"f3","type":"text","label":"禮物單價","required":true,"maxLength":12},
        {"key":"f4","type":"text","label":"禮物組數","required":true,"maxLength":5},
        {"key":"f5","type":"text","label":"祝福人數（含送禮人）","required":true,"maxLength":8}
      ]'::jsonb,
      description = '套用深夜「幸福禮贈」的店內播報文案。',
      destination_label = '💝｡幸福禮贈',
      destination_url = 'https://discord.com/channels/1501098191813214312/1507086747471974482'
  where organization_code = 'deepnight' and slug = 'gift-broadcast' and version = 1;
  if not found then
    raise exception 'DeepNight gift template changed before migration';
  end if;
end $$;

-- Store announcements in 特殊打賞, messages 1550113244008550451 and 1532697819884945508.
insert into public.service_templates
  (organization_code, slug, category, title, description, body, fields, destination_label, destination_url)
values (
  'deepnight', 'gift-broadcast-tip-1999', '播報', '特殊打賞｜明燈千里', '套用深夜「明燈千里」的全服播報文案。',
  $copy$@everyone
✨━━━━━━━━━━━━━━✨
# 🏮 全服公告 🏮
【 {{f0}} 】為【 {{f1}} 】點亮了《深夜不關燈》特殊打賞
✨「明燈千里，只為予你」✨
💎 價值 NT$1,999
一盞明燈，跨越千里；
一份真心，只為予你。
感謝這份珍貴的陪伴，願今夜星光與溫暖長存 <:0cacf602f35f4bc08a3a915c2d893387:1517939704518021220>
✨━━━━━━━━━━━━━━✨$copy$,
  '[
    {"key":"f0","type":"text","label":"送禮的老闆","required":true,"maxLength":120},
    {"key":"f1","type":"text","label":"收禮的陪陪","required":true,"maxLength":500}
  ]'::jsonb,
  '🏮｡特殊打賞', 'https://discord.com/channels/1501098191813214312/1522560659500564480'
), (
  'deepnight', 'gift-broadcast-tip-16888', '播報', '特殊打賞｜明燈三千盞', '套用深夜「明燈三千盞」的全服播報文案。',
  $copy$✨━━━━━━━━━||@everyone||━━━━━━━━━✨

# 【特殊打賞．全服播報】

【 {{f0}} 】想對【 {{f1}} 】說
{{f2}}

🏮 《明燈三千盞，為你一人光》

💎 價值 NT$16,888

相傳，唯有最真摯的心意，
才能點亮三千盞明燈。
當漫天燈火升起，照亮的不再是夜空，
而是那位值得傾盡所有的人。

🌙 願三千燈火照徹長夜，
今夜星河，只因你而璀璨。

✨━━━━━━━━━━━━━━━━━━✨$copy$,
  '[
    {"key":"f0","type":"text","label":"送禮的老闆","required":true,"maxLength":120},
    {"key":"f1","type":"text","label":"收禮的陪陪","required":true,"maxLength":500},
    {"key":"f2","type":"paragraph","label":"送禮留言","required":true,"maxLength":800}
  ]'::jsonb,
  '🏮｡特殊打賞', 'https://discord.com/channels/1501098191813214312/1522560659500564480'
);

-- The Qiunai bot supplies its own live per-gift copy and optional emoji.
do $$
begin
  update public.service_templates
  set body = E'**感謝 {{f0}} 送給 {{f1}}\n\n{{f2}}\n\n{{f4}}**',
      fields = (select jsonb_agg(field order by ordinality)
                from jsonb_array_elements(fields) with ordinality as items(field, ordinality)
                where field->>'key' <> 'f3'),
      description = '套用小奈平常自動發布的打賞禮物文案。'
  where organization_code = 'qiunai' and slug = 'gift-broadcast' and version = 1;
  if not found then
    raise exception 'Qiunai gift template changed before migration';
  end if;
end $$;

commit;
