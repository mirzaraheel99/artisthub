-- Referral code generation + automatic profile creation on signup.
-- Codes are generated server-side so a client can never choose its own.

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  -- Crockford-style alphabet: no 0/O/1/I/L, so codes survive being read aloud
  -- in a lounge or typed from a screenshot.
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  attempt   int := 0;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.profiles where referral_code = candidate);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not generate a unique referral code after % attempts', attempt;
    end if;
  end loop;

  return candidate;
end $$;

-- Fires on auth.users insert. Reads name/contact/referral code out of the
-- signup metadata the app sends, so a referral is attached atomically at signup
-- rather than in a second client call that could be skipped or replayed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer_id  uuid;
  claimed_code text;
begin
  claimed_code := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');

  if claimed_code is not null then
    select id into referrer_id
    from public.profiles
    where referral_code = upper(claimed_code)
      and is_banned = false;
  end if;

  insert into public.profiles (id, name, contact, referral_code, referred_by)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    coalesce(new.email, new.phone),
    public.generate_referral_code(),
    referrer_id
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guard against the obvious self-referral. Cross-account rings are a Phase 2
-- concern and get handled by the referral confirmation rules, not here.
alter table public.profiles drop constraint if exists profiles_no_self_referral;
alter table public.profiles add constraint profiles_no_self_referral
  check (referred_by is null or referred_by <> id);
