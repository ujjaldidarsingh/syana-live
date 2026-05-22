create extension if not exists pgcrypto;

create table if not exists public.live_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create type public.live_prompt_type as enum (
  'word_cloud',
  'multiple_choice',
  'rating',
  'open_text',
  'reflection_map',
  'spectrum',
  'ranking'
);

create table if not exists public.live_prompts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  type public.live_prompt_type not null,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  is_active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_prompt_per_session
on public.live_prompts(session_id)
where is_active;

create table if not exists public.live_prompt_options (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.live_prompts(id) on delete cascade,
  label text not null,
  sort_order int not null default 1
);

create table if not exists public.live_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  prompt_id uuid not null references public.live_prompts(id) on delete cascade,
  respondent_id uuid not null references auth.users(id) on delete cascade,
  value_text text not null default '',
  value_json jsonb not null default '{}'::jsonb,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(prompt_id, respondent_id)
);

create or replace function public.is_live_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.live_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.set_active_live_prompt(target_session_id uuid, target_prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_live_admin() then
    raise exception 'not authorized';
  end if;

  update public.live_prompts
  set is_active = false, status = 'closed'
  where session_id = target_session_id;

  update public.live_prompts
  set is_active = true, status = 'open'
  where id = target_prompt_id
    and session_id = target_session_id;
end;
$$;

create or replace function public.touch_live_response_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_live_response_updated_at on public.live_responses;
create trigger touch_live_response_updated_at
before update on public.live_responses
for each row execute function public.touch_live_response_updated_at();

alter table public.live_admins enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_prompts enable row level security;
alter table public.live_prompt_options enable row level security;
alter table public.live_responses enable row level security;

drop policy if exists "admins can manage admins" on public.live_admins;
create policy "admins can manage admins"
on public.live_admins
for all
to authenticated
using (public.is_live_admin())
with check (public.is_live_admin());

drop policy if exists "participants can read sessions" on public.live_sessions;
create policy "participants can read sessions"
on public.live_sessions
for select
to authenticated
using (is_archived is false);

drop policy if exists "admins can manage sessions" on public.live_sessions;
create policy "admins can manage sessions"
on public.live_sessions
for all
to authenticated
using (public.is_live_admin())
with check (public.is_live_admin());

drop policy if exists "participants can read prompts" on public.live_prompts;
create policy "participants can read prompts"
on public.live_prompts
for select
to authenticated
using (true);

drop policy if exists "admins can manage prompts" on public.live_prompts;
create policy "admins can manage prompts"
on public.live_prompts
for all
to authenticated
using (public.is_live_admin())
with check (public.is_live_admin());

drop policy if exists "participants can read prompt options" on public.live_prompt_options;
create policy "participants can read prompt options"
on public.live_prompt_options
for select
to authenticated
using (true);

drop policy if exists "admins can manage prompt options" on public.live_prompt_options;
create policy "admins can manage prompt options"
on public.live_prompt_options
for all
to authenticated
using (public.is_live_admin())
with check (public.is_live_admin());

drop policy if exists "participants can insert own responses" on public.live_responses;
create policy "participants can insert own responses"
on public.live_responses
for insert
to authenticated
with check (respondent_id = auth.uid());

drop policy if exists "participants can update own responses" on public.live_responses;
create policy "participants can update own responses"
on public.live_responses
for update
to authenticated
using (respondent_id = auth.uid())
with check (respondent_id = auth.uid());

drop policy if exists "participants can read displayable responses" on public.live_responses;
create policy "participants can read displayable responses"
on public.live_responses
for select
to authenticated
using (
  respondent_id = auth.uid()
  or public.is_live_admin()
  or is_approved is true
  or exists (
    select 1
    from public.live_prompts p
    where p.id = prompt_id
      and p.type in ('word_cloud', 'multiple_choice', 'rating')
  )
);

drop policy if exists "admins can delete responses" on public.live_responses;
create policy "admins can delete responses"
on public.live_responses
for delete
to authenticated
using (public.is_live_admin());

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'live_sessions',
    'live_prompts',
    'live_prompt_options',
    'live_responses'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end $$;

-- After creating a permanent facilitator user in Supabase Auth, run:
-- insert into public.live_admins (user_id)
-- values ('00000000-0000-0000-0000-000000000000');
