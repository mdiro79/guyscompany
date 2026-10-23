-- Run once in the Supabase SQL editor AFTER applying drizzle/*.sql (npm run db:migrate).
-- The app writes through the server (Drizzle, service connection). The browser only reads
-- Realtime change events, so authenticated users get SELECT on non-secret tables.

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
alter table calendar_events enable row level security;
alter table notifications enable row level security;
alter table offices enable row level security;
alter table office_visits enable row level security;
alter table office_swap_requests enable row level security;
alter table private_chat_invites enable row level security;

create policy "read" on profiles for select to authenticated using (true);
create policy "read" on projects for select to authenticated using (true);
create policy "read" on tasks for select to authenticated using (true);
create policy "read" on project_roles for select to authenticated using (true);
create policy "read" on files for select to authenticated using (true);
create policy "read" on messages for select to authenticated using (
  channel = 'team'
  or exists (select 1 from offices o where 'office:' || o.slot = channel and o.owner_id = auth.uid())
  or exists (select 1 from private_chat_invites i where 'office:' || i.slot = channel and i.invitee_id = auth.uid() and i.status = 'accepted')
);
create policy "read" on reactions for select to authenticated using (true);
create policy "read" on polls for select to authenticated using (true);
-- Scores stay hidden: each member only sees their own vote rows.
create policy "read own" on poll_votes for select to authenticated using (user_id = auth.uid());
create policy "read own" on focus_items for select to authenticated using (user_id = auth.uid());
create policy "read" on calendar_events for select to authenticated using (true);
create policy "read own" on notifications for select to authenticated using (user_id = auth.uid());
create policy "read" on offices for select to authenticated using (true);
create policy "read own" on office_visits for select to authenticated using (
  exists (select 1 from offices o where o.slot = office_visits.slot and o.owner_id = auth.uid())
);
create policy "read own" on office_swap_requests for select to authenticated using (from_user_id = auth.uid() or to_user_id = auth.uid());
create policy "read own" on private_chat_invites for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- Realtime change events for live refresh.
alter publication supabase_realtime add table tasks, messages, reactions, notifications, polls, poll_votes, profiles,
  offices, files, focus_items, calendar_events, projects, project_roles, office_swap_requests, private_chat_invites;

-- Four fixed office slots (wall colour belongs to the slot).
insert into offices (slot, wall_color) values (1, 'orange'), (2, 'teal'), (3, 'teal'), (4, 'orange') on conflict do nothing;

-- Private storage bucket for files (20 MB limit).
insert into storage.buckets (id, name, public, file_size_limit) values ('files', 'files', false, 20971520) on conflict do nothing;
