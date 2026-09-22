alter table public.qiunai_staff
  add column if not exists phone text,
  add column if not exists public_intro text,
  add column if not exists public_note text;

alter table public.salary_public_profiles
  add column if not exists note text;

update public.qiunai_staff staff
set public_intro = coalesce(staff.public_intro, profile.intro),
    public_note = coalesce(staff.public_note, profile.note)
from public.salary_public_profiles profile
where profile.app_key = 'qiunai'
  and profile.discord_id = staff.discord_id
  and (staff.public_intro is null or staff.public_note is null);

alter table public.salary_announcements
  add column if not exists is_poll boolean not null default false,
  add column if not exists poll_allow_multiple boolean not null default false;

create table if not exists public.salary_poll_options (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.salary_announcements(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (announcement_id, label)
);

create table if not exists public.salary_poll_votes (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.salary_announcements(id) on delete cascade,
  option_id uuid not null references public.salary_poll_options(id) on delete cascade,
  discord_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, option_id, discord_id)
);

create index if not exists salary_poll_votes_announcement_idx
  on public.salary_poll_votes (announcement_id, discord_id);

create table if not exists public.qiunai_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  location text,
  starts_at timestamptz not null,
  response_deadline timestamptz not null,
  min_completed_orders integer not null default 0 check (min_completed_orders >= 0),
  min_employment_days integer not null default 0 check (min_employment_days >= 0),
  eligibility_note text,
  participant_note text,
  is_published boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (response_deadline <= starts_at)
);

create table if not exists public.qiunai_activity_options (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.qiunai_activities(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (activity_id, label)
);

create table if not exists public.qiunai_activity_responses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.qiunai_activities(id) on delete cascade,
  discord_id text not null,
  response_status text not null check (response_status in ('attending', 'not_attending', 'distance')),
  selected_option_id uuid references public.qiunai_activity_options(id) on delete set null,
  staff_nickname text,
  staff_real_name text,
  staff_phone text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, discord_id)
);

create table if not exists public.qiunai_activity_guests (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.qiunai_activity_responses(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  guest_name text not null check (char_length(guest_name) between 1 and 100),
  guest_phone text not null check (char_length(guest_phone) between 6 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (response_id, slot)
);

create index if not exists qiunai_activities_published_idx
  on public.qiunai_activities (is_published, starts_at desc);
create index if not exists qiunai_activity_responses_activity_idx
  on public.qiunai_activity_responses (activity_id, response_status);

alter table public.salary_poll_options enable row level security;
alter table public.salary_poll_votes enable row level security;
alter table public.qiunai_activities enable row level security;
alter table public.qiunai_activity_options enable row level security;
alter table public.qiunai_activity_responses enable row level security;
alter table public.qiunai_activity_guests enable row level security;

revoke all on table public.salary_poll_options from anon, authenticated;
revoke all on table public.salary_poll_votes from anon, authenticated;
revoke all on table public.qiunai_activities from anon, authenticated;
revoke all on table public.qiunai_activity_options from anon, authenticated;
revoke all on table public.qiunai_activity_responses from anon, authenticated;
revoke all on table public.qiunai_activity_guests from anon, authenticated;

grant all on table public.salary_poll_options to service_role;
grant all on table public.salary_poll_votes to service_role;
grant all on table public.qiunai_activities to service_role;
grant all on table public.qiunai_activity_options to service_role;
grant all on table public.qiunai_activity_responses to service_role;
grant all on table public.qiunai_activity_guests to service_role;
