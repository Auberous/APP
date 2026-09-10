-- Compass — Phase 1 initial schema
--
-- Wellbeing test (CLAUDE.md §2): this migration stores only what circle-based
-- sharing needs to work. It records no engagement signals — no view counts, no
-- reaction tallies, no "last active" tracking — because nothing in the product
-- is allowed to rank or optimise for them (§3).
--
-- Access control is enforced here, in Row Level Security, not in the app layer
-- (§8). The client is treated as untrusted.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Profile rows, one per auth.users row. Kept separate from auth.users so the
-- app can read display names without touching the auth schema.
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

comment on table public.users is
  'Public profile per account. Deleting the auth user cascades to here (§4: deletion actually deletes).';

create table if not exists public.circles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.circles is
  'A small, named, mutually-visible group (§5). All sharing happens into a circle; there is no public scope.';

create type public.circle_role as enum ('admin', 'member');

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  role      public.circle_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

comment on table public.circle_members is
  'Membership edge. Mutual visibility: every member of a circle can see every other member (§5).';

create index if not exists circle_members_user_id_idx
  on public.circle_members (user_id);

-- Pending invitations addressed to an email address.
--
-- Phase 1 note: an invite is a *record*, not a delivered message. Nothing here
-- sends email — see supabase/README.md. This table deliberately stores no
-- signal about whether the address belongs to an existing account, so creating
-- an invite cannot be used to probe who has a Compass account.
create table if not exists public.circle_invites (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles (id) on delete cascade,
  email      text not null check (position('@' in email) > 1),
  invited_by uuid not null references public.users (id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- One outstanding invite per address per circle.
create unique index if not exists circle_invites_pending_unique
  on public.circle_invites (circle_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------
-- These are SECURITY DEFINER on purpose. A policy on circle_members that
-- itself queries circle_members recurses and Postgres aborts the query; running
-- the lookup inside a definer function bypasses RLS for that lookup only and
-- breaks the cycle. Each one is scoped to auth.uid() and returns a boolean, so
-- it cannot be used to read rows.

create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = p_circle_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_circle_admin(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.circle_members m
    where m.circle_id = p_circle_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

-- True when the signed-in user shares at least one circle with p_user_id.
create or replace function public.shares_circle_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.circle_members mine
    join public.circle_members theirs on theirs.circle_id = mine.circle_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- True when the signed-in user has an outstanding invite to this circle.
--
-- This exists so an invitee can read the *name* of the circle they were asked
-- to join. Without it the invitation could only say "a circle", which is not a
-- decision anyone can make honestly (§7: copy should be plain and honest).
create or replace function public.has_pending_circle_invite(p_circle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.circle_invites i
    where i.circle_id = p_circle_id
      and i.accepted_at is null
      and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_circle_member(uuid)   from public;
revoke all on function public.is_circle_admin(uuid)    from public;
revoke all on function public.shares_circle_with(uuid) from public;
revoke all on function public.has_pending_circle_invite(uuid) from public;
grant execute on function public.is_circle_member(uuid)   to authenticated;
grant execute on function public.is_circle_admin(uuid)    to authenticated;
grant execute on function public.shares_circle_with(uuid) to authenticated;
grant execute on function public.has_pending_circle_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create the profile row when an account is created, so the app never has to
-- handle a signed-in user with no profile.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- The creator of a circle becomes its first admin.
--
-- This has to be a trigger rather than a client insert: at the moment the
-- circle is created its creator is not yet a member, so an RLS policy
-- requiring admin rights would reject them from their own circle. Running it
-- here keeps the circle_members insert policy strictly admin-only.
create or replace function public.handle_new_circle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.circle_members (circle_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_circle_created on public.circles;
create trigger on_circle_created
  after insert on public.circles
  for each row execute function public.handle_new_circle();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users          enable row level security;
alter table public.circles        enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invites enable row level security;

-- users -------------------------------------------------------------------
-- You can see yourself, and anyone you actually share a circle with. Not the
-- whole user table: there is no directory to browse in Compass.
drop policy if exists users_select_self_or_circle_peer on public.users;
create policy users_select_self_or_circle_peer
  on public.users for select
  to authenticated
  using (id = auth.uid() or public.shares_circle_with(id));

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_delete_self on public.users;
create policy users_delete_self
  on public.users for delete
  to authenticated
  using (id = auth.uid());

-- circles -----------------------------------------------------------------
-- Members see their circles. A pending invitee additionally sees the circle
-- row itself, so the invitation can name it. Membership (circle_members) stays
-- strictly members-only below, so an invitee learns the name and nothing about
-- who is in it.
drop policy if exists circles_select_member on public.circles;
create policy circles_select_member
  on public.circles for select
  to authenticated
  using (
    public.is_circle_member(id)
    or public.has_pending_circle_invite(id)
  );

-- You may only create a circle attributed to yourself. The trigger above then
-- makes you its admin.
drop policy if exists circles_insert_own on public.circles;
create policy circles_insert_own
  on public.circles for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists circles_update_admin on public.circles;
create policy circles_update_admin
  on public.circles for update
  to authenticated
  using (public.is_circle_admin(id))
  with check (public.is_circle_admin(id));

drop policy if exists circles_delete_admin on public.circles;
create policy circles_delete_admin
  on public.circles for delete
  to authenticated
  using (public.is_circle_admin(id));

-- circle_members ----------------------------------------------------------
drop policy if exists circle_members_select_member on public.circle_members;
create policy circle_members_select_member
  on public.circle_members for select
  to authenticated
  using (public.is_circle_member(circle_id));

drop policy if exists circle_members_insert_admin on public.circle_members;
create policy circle_members_insert_admin
  on public.circle_members for insert
  to authenticated
  with check (public.is_circle_admin(circle_id));

drop policy if exists circle_members_update_admin on public.circle_members;
create policy circle_members_update_admin
  on public.circle_members for update
  to authenticated
  using (public.is_circle_admin(circle_id))
  with check (public.is_circle_admin(circle_id));

-- An admin can remove a member; anyone can remove themselves. Leaving a circle
-- must never be harder than joining one (§3: no dark patterns).
drop policy if exists circle_members_delete_admin_or_self on public.circle_members;
create policy circle_members_delete_admin_or_self
  on public.circle_members for delete
  to authenticated
  using (user_id = auth.uid() or public.is_circle_admin(circle_id));

-- circle_invites ----------------------------------------------------------
-- Circle admins see the invites for their circle. Invitees see invites
-- addressed to their own verified email, which is what lets them accept.
drop policy if exists circle_invites_select_admin_or_invitee on public.circle_invites;
create policy circle_invites_select_admin_or_invitee
  on public.circle_invites for select
  to authenticated
  using (
    public.is_circle_admin(circle_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists circle_invites_insert_admin on public.circle_invites;
create policy circle_invites_insert_admin
  on public.circle_invites for insert
  to authenticated
  with check (public.is_circle_admin(circle_id) and invited_by = auth.uid());

-- Admins can withdraw an invite they sent; an invitee can decline one sent to
-- them by deleting it.
drop policy if exists circle_invites_delete_admin_or_invitee on public.circle_invites;
create policy circle_invites_delete_admin_or_invitee
  on public.circle_invites for delete
  to authenticated
  using (
    public.is_circle_admin(circle_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---------------------------------------------------------------------------
-- Accepting an invite
-- ---------------------------------------------------------------------------
-- Joining a circle is the one action a non-member must be able to take, so it
-- cannot go through the member-only policies above. This function is the whole
-- of that exception: it only ever adds the *caller* to a circle that already
-- has a pending invite for the caller's own verified email address.

create or replace function public.accept_circle_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_circle uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  -- Require a verified address: an unverified one could be anyone's.
  if coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false) is not true
     and coalesce((auth.jwt() ->> 'email_verified')::boolean, false) is not true then
    raise exception 'Confirm your email address before joining a circle.';
  end if;

  select circle_id into v_circle
  from public.circle_invites
  where id = p_invite_id
    and accepted_at is null
    and lower(email) = v_email;

  if v_circle is null then
    raise exception 'That invitation is not available.';
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle, auth.uid(), 'member')
  on conflict (circle_id, user_id) do nothing;

  update public.circle_invites
  set accepted_at = now()
  where id = p_invite_id;

  return v_circle;
end;
$$;

revoke all on function public.accept_circle_invite(uuid) from public;
grant execute on function public.accept_circle_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
-- A hosted Supabase project already grants these to `authenticated` through
-- default privileges. Stating them explicitly means the migration behaves the
-- same on a local or self-hosted database. RLS above is what actually limits
-- which rows these privileges reach; `anon` is granted nothing at all.

grant select, insert, update, delete on public.users          to authenticated;
grant select, insert, update, delete on public.circles        to authenticated;
grant select, insert, update, delete on public.circle_members to authenticated;
grant select, insert, delete        on public.circle_invites  to authenticated;
