-- Promote the first admin.
--
-- There is deliberately no way to become an admin from the client: the profiles
-- update policy freezes the role column, and only an existing admin can change
-- someone else's. So the very first admin has to be made here, with a direct
-- database connection.
--
-- Usage (from the server, not the app):
--   select public.promote_to_admin('you@example.com');

create or replace function public.promote_to_admin(target_email text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  result    public.profiles;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email);

  if target_id is null then
    raise exception 'no auth user with email %', target_email;
  end if;

  update public.profiles set role = 'admin' where id = target_id returning * into result;

  if result is null then
    raise exception 'auth user % has no profile row', target_email;
  end if;

  return result;
end $$;

-- Not callable over the API — an anon or authenticated client must never reach it.
revoke all on function public.promote_to_admin(text) from public, anon, authenticated;
