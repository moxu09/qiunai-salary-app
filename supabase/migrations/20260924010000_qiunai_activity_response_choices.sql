alter table public.qiunai_activities
  add column if not exists allow_not_attending boolean not null default true,
  add column if not exists allow_distance boolean not null default true;

comment on column public.qiunai_activities.allow_not_attending is 'Allow employees to respond that they will not attend';
comment on column public.qiunai_activities.allow_distance is 'Allow employees to respond that their region prevents attendance';
