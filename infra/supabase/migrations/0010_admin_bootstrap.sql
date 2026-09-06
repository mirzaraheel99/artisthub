-- Promote the first admin.
--
-- There is deliberately no path from a client to an admin role: the profiles
-- policy freezes the trust columns, and user_roles is admin-write only. So the
-- first admin must be created here, over a direct database connection.
--
--   select public.promote_to_admin('you@example.com');

create or replace function public.promote_to_admin(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email);

  if target_id is null then
    raise exception 'no auth user with email %', target_email;
  end if;

  insert into public.user_roles (user_id, role_code)
  values (target_id, 'admin')
  on conflict do nothing;

  return format('%s is now an admin', target_email);
end $$;

-- Not reachable over the API by anyone, at any role.
revoke all on function public.promote_to_admin(text) from public, anon, authenticated;
