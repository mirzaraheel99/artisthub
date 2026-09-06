-- Audit trail and the abuse review queue.

-- Append only. Every admin write, role grant, ban, void and manual point
-- adjustment lands here. Grants are withheld in 0009 so not even an admin can
-- rewrite history through the API.
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Suspected abuse goes to a human, never to an automatic ban. Shared venue
-- Wi-Fi and household devices generate false positives constantly, and banning
-- a real customer costs more than the fraud would have.
create table if not exists public.abuse_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  flag_type   text not null,
  severity    text not null default 'medium' check (severity in ('low','medium','high')),
  detail      jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open','dismissed','actioned')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists abuse_flags_open_idx on public.abuse_flags (created_at desc) where status = 'open';

-- ---------------------------------------------------------------------------
-- Generic audit trigger. Attach to any table whose changes must be reviewable.
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.write_audit();

drop trigger if exists audit_reward_catalog on public.reward_catalog;
create trigger audit_reward_catalog after insert or update or delete on public.reward_catalog
  for each row execute function public.write_audit();

drop trigger if exists audit_point_rules on public.point_rules;
create trigger audit_point_rules after insert or update or delete on public.point_rules
  for each row execute function public.write_audit();

drop trigger if exists audit_venue_staff on public.venue_staff;
create trigger audit_venue_staff after insert or update or delete on public.venue_staff
  for each row execute function public.write_audit();
