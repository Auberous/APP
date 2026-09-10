\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:'alice', 'alice@example.com', '{"display_name":"Alice"}'),
  (:'bob',   'bob@example.com',   '{"display_name":"Bob"}'),
  (:'carol', 'carol@example.com', '{"display_name":"Carol"}');

do $$ begin
  assert (select count(*) from public.users) = 3,
    'T1 FAIL: signup trigger did not create profile rows';
  assert (select display_name from public.users where id='11111111-1111-1111-1111-111111111111') = 'Alice',
    'T1 FAIL: display_name not taken from user metadata';
end $$;
\echo 'T1  ok  signup trigger creates profile rows from metadata'

-- ---- Alice creates a circle -------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@example.com","email_verified":true}';

insert into public.circles (id, name, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Family', :'alice');

do $$ begin
  assert (select count(*) from public.circle_members
          where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
            and user_id='11111111-1111-1111-1111-111111111111'
            and role='admin') = 1,
    'T2 FAIL: creator was not made admin by trigger';
end $$;
\echo 'T2  ok  circle creator is auto-enrolled as admin (bootstrap works)'

do $$ begin
  assert (select count(*) from public.circles) = 1,
    'T3 FAIL: Alice cannot see her own circle';
  assert (select count(*) from public.circle_members) = 1,
    'T3 FAIL: Alice cannot see her own membership (possible RLS recursion)';
end $$;
\echo 'T3  ok  member reads own circle + membership, no policy recursion'

-- Alice may not attribute a circle to someone else.
do $$ begin
  begin
    insert into public.circles (name, created_by)
    values ('Spoofed', '22222222-2222-2222-2222-222222222222');
    raise exception 'T4 FAIL: created a circle attributed to another user';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'T4  ok  cannot create a circle attributed to another user'

-- ---- Bob is an outsider -----------------------------------------------------
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}';

do $$ begin
  assert (select count(*) from public.circles) = 0,
    'T5 FAIL: non-member can read a circle';
  assert (select count(*) from public.circle_members) = 0,
    'T5 FAIL: non-member can read membership rows';
  assert (select count(*) from public.users) = 1,
    'T5 FAIL: user table is browsable beyond self + circle peers';
end $$;
\echo 'T5  ok  outsider sees no circles, no members, only their own profile'

-- Bob tries to add himself to Alice's circle.
do $$ begin
  begin
    insert into public.circle_members (circle_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','member');
    raise exception 'T6 FAIL: outsider joined a circle unilaterally';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'T6  ok  outsider cannot self-join a circle'

-- Bob tries to invite himself (not an admin).
do $$ begin
  begin
    insert into public.circle_invites (circle_id, email, invited_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001','bob@example.com','22222222-2222-2222-2222-222222222222');
    raise exception 'T7 FAIL: non-admin created an invite';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'T7  ok  non-admin cannot create invites'

-- ---- Alice invites Bob ------------------------------------------------------
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@example.com","email_verified":true}';
insert into public.circle_invites (id, circle_id, email, invited_by)
values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Bob@Example.com', :'alice');
\echo 'T8  ok  admin creates an invite'

-- Carol must not see an invite addressed to Bob.
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"carol@example.com","email_verified":true}';
do $$ begin
  assert (select count(*) from public.circle_invites) = 0,
    'T9 FAIL: unrelated user can read invites addressed to someone else';
  begin
    perform public.accept_circle_invite('cccccccc-0000-0000-0000-000000000001');
    raise exception 'T9 FAIL: accepted an invite addressed to another email';
  exception when others then
    if position('not available' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
\echo 'T9  ok  invite is invisible and unacceptable to the wrong recipient'

-- Bob can see the circle's NAME from his pending invite, but nothing about
-- who is in it.
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}';
do $$ begin
  assert (select count(*) from public.circle_invites) = 1,
    'T9b FAIL: invitee cannot see their own invite';
  assert (select name from public.circles where id='aaaaaaaa-0000-0000-0000-000000000001') = 'Family',
    'T9b FAIL: invitee cannot read the name of the circle they were invited to';
  assert (select count(*) from public.circle_members) = 0,
    'T9b FAIL: pending invitee can see circle membership before joining';
  assert (select count(*) from public.users) = 1,
    'T9b FAIL: pending invitee can see member profiles before joining';
end $$;
\echo 'T9b ok  pending invitee reads circle name only, not its membership'

-- Bob with an UNVERIFIED email cannot accept.
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com"}';
do $$ begin
  begin
    perform public.accept_circle_invite('cccccccc-0000-0000-0000-000000000001');
    raise exception 'T10 FAIL: unverified email accepted an invite';
  exception when others then
    if position('Confirm your email' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
\echo 'T10 ok  unverified email cannot accept an invite'

-- Bob, verified, accepts. Case-insensitive match against 'Bob@Example.com'.
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}';
do $$ declare v uuid; begin
  v := public.accept_circle_invite('cccccccc-0000-0000-0000-000000000001');
  assert v = 'aaaaaaaa-0000-0000-0000-000000000001', 'T11 FAIL: wrong circle returned';
  assert (select count(*) from public.circles) = 1, 'T11 FAIL: Bob cannot see the circle he joined';
  assert (select count(*) from public.circle_members) = 2, 'T11 FAIL: Bob cannot see co-members';
  assert (select role from public.circle_members
          where circle_id = v and user_id = '22222222-2222-2222-2222-222222222222') = 'member',
    'T11 FAIL: invitee did not join as plain member';
  assert (select count(*) from public.users) = 2, 'T11 FAIL: Bob cannot see his circle peer Alice';
end $$;
\echo 'T11 ok  verified invitee joins (case-insensitive), gains scoped visibility'

-- A used invite cannot be replayed.
do $$ begin
  begin
    perform public.accept_circle_invite('cccccccc-0000-0000-0000-000000000001');
    raise exception 'T12 FAIL: invite was reusable after acceptance';
  exception when others then
    if position('not available' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
\echo 'T12 ok  invite cannot be replayed once accepted'

-- Bob is a member, not an admin.
do $$ begin
  begin
    insert into public.circle_members (circle_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','member');
    raise exception 'T13 FAIL: plain member added another member';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.circle_members set role = 'admin'
    where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
      and user_id='22222222-2222-2222-2222-222222222222';
    assert not found, 'T13 FAIL: plain member promoted themselves to admin';
  exception when insufficient_privilege then null;
  end;
  assert (select role from public.circle_members
          where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
            and user_id='22222222-2222-2222-2222-222222222222') = 'member',
    'T13 FAIL: member role was escalated';
  begin
    update public.circles set name = 'Renamed by member'
    where id='aaaaaaaa-0000-0000-0000-000000000001';
  exception when insufficient_privilege then null;
  end;
  assert (select name from public.circles where id='aaaaaaaa-0000-0000-0000-000000000001') = 'Family',
    'T13 FAIL: plain member renamed the circle';
end $$;
\echo 'T13 ok  plain member cannot add members, self-promote, or rename circle'

-- Bob can leave (§3: leaving must not be harder than joining).
do $$ begin
  delete from public.circle_members
  where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
    and user_id='22222222-2222-2222-2222-222222222222';
  assert (select count(*) from public.circles) = 0, 'T14 FAIL: still sees circle after leaving';
  assert (select count(*) from public.users) = 1, 'T14 FAIL: still sees ex-peer profile after leaving';
  assert (select count(*) from public.circles) = 0,
    'T14 FAIL: a consumed invite still grants circle visibility after leaving';
end $$;
\echo 'T14 ok  member can leave, and visibility is revoked immediately'

-- Bob cannot evict Alice.
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@example.com","email_verified":true}';
insert into public.circle_invites (id, circle_id, email, invited_by)
values ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','bob@example.com', :'alice');
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com","email_verified":true}';
select public.accept_circle_invite('cccccccc-0000-0000-0000-000000000002') \gset ignored_
do $$ begin
  delete from public.circle_members
  where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
    and user_id='11111111-1111-1111-1111-111111111111';
  assert (select count(*) from public.circle_members
          where circle_id='aaaaaaaa-0000-0000-0000-000000000001'
            and user_id='11111111-1111-1111-1111-111111111111') = 1,
    'T15 FAIL: plain member evicted the circle admin';
end $$;
\echo 'T15 ok  plain member cannot remove another member'

-- Profile edits are self-only.
do $$ begin
  update public.users set display_name = 'Hacked' where id='11111111-1111-1111-1111-111111111111';
  assert (select display_name from public.users where id='11111111-1111-1111-1111-111111111111') = 'Alice',
    'T16 FAIL: user edited another user''s profile';
  update public.users set display_name = 'Bobby' where id='22222222-2222-2222-2222-222222222222';
  assert (select display_name from public.users where id='22222222-2222-2222-2222-222222222222') = 'Bobby',
    'T16 FAIL: user could not edit their own profile';
end $$;
\echo 'T16 ok  profile edits are limited to self'

-- Anonymous access is fully closed.
reset role; set role anon;
set request.jwt.claims = '';
do $$ begin
  begin
    assert (select count(*) from public.circles) = 0, 'T17 FAIL: anon read circles';
    assert (select count(*) from public.users) = 0, 'T17 FAIL: anon read users';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'T17 ok  anonymous role reads nothing'

reset role;
\echo ''
\echo 'ALL RLS TESTS PASSED'
