create table if not exists public.live_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  respondent_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  contact text not null default '',
  overall_rating integer check (overall_rating between 1 and 5),
  sangat_rating integer check (sangat_rating between 1 and 5),
  gurmat_rating integer check (gurmat_rating between 1 and 5),
  workshop_rating integer check (workshop_rating between 1 and 5),
  recommend text not null default '',
  returning text not null default '',
  favorite_text text not null default '',
  improve_text text not null default '',
  workshop_text text not null default '',
  additional_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, respondent_id)
);

drop trigger if exists touch_live_feedback_updated_at on public.live_feedback;
create trigger touch_live_feedback_updated_at
before update on public.live_feedback
for each row execute function public.touch_live_response_updated_at();

alter table public.live_feedback enable row level security;

drop policy if exists "participants can insert own feedback" on public.live_feedback;
create policy "participants can insert own feedback"
on public.live_feedback
for insert
to authenticated
with check (respondent_id = auth.uid());

drop policy if exists "participants can update own feedback" on public.live_feedback;
create policy "participants can update own feedback"
on public.live_feedback
for update
to authenticated
using (respondent_id = auth.uid())
with check (respondent_id = auth.uid());

drop policy if exists "participants can read own feedback" on public.live_feedback;
create policy "participants can read own feedback"
on public.live_feedback
for select
to authenticated
using (respondent_id = auth.uid() or public.is_live_admin());

drop policy if exists "admins can delete feedback" on public.live_feedback;
create policy "admins can delete feedback"
on public.live_feedback
for delete
to authenticated
using (public.is_live_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_feedback'
  ) then
    alter publication supabase_realtime add table public.live_feedback;
  end if;
end $$;
