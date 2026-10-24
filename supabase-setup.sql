-- Applied automatically on every Vercel build by scripts/db-setup.mjs (after the drizzle/*.sql migrations).
-- Safe to run repeatedly. Can also be pasted into the Supabase SQL editor.
-- The app writes through the server (Drizzle, service connection). The browser only reads
-- Realtime change events, so team members get SELECT on non-secret tables.
-- Also turn OFF "Allow new users to sign up" in Authentication settings: accounts are created by the admin.

-- A signed-in user counts as a member only if the admin created their profile.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid()) $$;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table project_roles enable row level security;
alter table files enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table polls enable row level security;
alter table poll_votes enable row level security;
alter table focus_items enable row level security;
alter table todos enable row level security;
alter table todo_stats enable row level security;
alter table rooms enable row level security;
alter table issues enable row level security;
alter table issue_comments enable row level security;
alter table project_ideas enable row level security;
alter table idea_votes enable row level security;
alter table milestones enable row level security;
alter table calendar_events enable row level security;
alter table notifications enable row level security;
alter table offices enable row level security;
alter table office_visits enable row level security;
alter table office_swap_requests enable row level security;
alter table private_chat_invites enable row level security;

create policy "read" on profiles for select to authenticated using (public.is_member());
create policy "read" on projects for select to authenticated using (public.is_member());
create policy "read" on tasks for select to authenticated using (public.is_member());
create policy "read" on project_roles for select to authenticated using (public.is_member());
create policy "read" on files for select to authenticated using (public.is_member());
create policy "read" on messages for select to authenticated using (
  (channel = 'team' and public.is_member())
  or exists (select 1 from offices o where 'office:' || o.slot = channel and o.owner_id = auth.uid())
  or exists (select 1 from private_chat_invites i where 'office:' || i.slot = channel and i.invitee_id = auth.uid() and i.status = 'accepted')
);
create policy "read" on reactions for select to authenticated using (public.is_member());
create policy "read" on polls for select to authenticated using (public.is_member());
-- Scores stay hidden: each member only sees their own vote rows.
create policy "read own" on poll_votes for select to authenticated using (user_id = auth.uid());
create policy "read own" on focus_items for select to authenticated using (user_id = auth.uid());
-- Personal to-dos are private to their owner.
create policy "read own" on todos for select to authenticated using (user_id = auth.uid());
create policy "read own" on todo_stats for select to authenticated using (user_id = auth.uid());
create policy "read" on rooms for select to authenticated using (public.is_member());
-- Project command center: open to the whole team.
create policy "read" on issues for select to authenticated using (public.is_member());
create policy "read" on issue_comments for select to authenticated using (public.is_member());
create policy "read" on project_ideas for select to authenticated using (public.is_member());
create policy "read" on idea_votes for select to authenticated using (public.is_member());
create policy "read" on milestones for select to authenticated using (public.is_member());
create policy "read" on calendar_events for select to authenticated using (public.is_member());
create policy "read own" on notifications for select to authenticated using (user_id = auth.uid());
create policy "read" on offices for select to authenticated using (public.is_member());
create policy "read own" on office_visits for select to authenticated using (
  exists (select 1 from offices o where o.slot = office_visits.slot and o.owner_id = auth.uid())
);
create policy "read own" on office_swap_requests for select to authenticated using (from_user_id = auth.uid() or to_user_id = auth.uid());
create policy "read own" on private_chat_invites for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- Realtime change events for live refresh.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['tasks','messages','reactions','notifications','polls','poll_votes','profiles','offices','files',
    'focus_items','todos','todo_stats','rooms','issues','issue_comments','project_ideas','idea_votes','milestones','calendar_events','projects','project_roles','office_swap_requests','private_chat_invites'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Four fixed office slots (wall colour belongs to the slot).
insert into offices (slot, wall_color) values (1, 'orange'), (2, 'teal'), (3, 'teal'), (4, 'orange') on conflict do nothing;

-- The conference room's light and glass (changed from its wall panel).
insert into rooms (id) values ('conference') on conflict do nothing;

-- Private storage bucket for files (20 MB limit).
insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 20971520) on conflict do nothing;
