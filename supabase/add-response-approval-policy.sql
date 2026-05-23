drop policy if exists "admins can update responses" on public.live_responses;

create policy "admins can update responses"
on public.live_responses
for update
to authenticated
using (public.is_live_admin())
with check (public.is_live_admin());
