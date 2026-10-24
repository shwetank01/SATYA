-- SATYA database (Section 12). Apply with the Session pooler: psql "$POOLER_URL" -f supabase/schema.sql
-- Generated from SATYA_ARCHITECTURE.md Sections 12.1-12.4; edit the spec first, then regenerate.

create extension if not exists pgcrypto;

create table public.orgs (
  id text primary key check (id ~ '^[A-Z0-9_]{2,16}$'),
  name text not null,
  type text not null check (type in ('bank','company')),
  sign_pk text check (sign_pk ~ '^[0-9a-f]{64}$'),
  box_pk text check (box_pk ~ '^[0-9a-f]{64}$'),
  cert_sig text check (cert_sig ~ '^[0-9a-f]{128}$'),
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id text not null references public.orgs(id) on delete cascade,
  primary key (user_id, org_id)
);

create table public.promise_cards (
  org_id text primary key,                         -- 'GLOBAL' or a bank org id
  card_json text not null,
  sig text not null check (sig ~ '^[0-9a-f]{128}$'),
  signed_by text not null check (signed_by in ('bank','satya_root')),
  version int not null default 1,
  published_at timestamptz not null default now()
);

create table public.indicators (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  type text not null check (type in ('upi','tel','host','app','acct')),
  reports int not null default 0,
  first_seen timestamptz not null default now(),
  confirmed_by text references public.orgs(id),
  confirmed_at timestamptz,
  label text
);

create table public.sightings (
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  type text not null check (type in ('upi','tel','host','app','acct')),
  day_token text not null check (day_token ~ '^[0-9a-f]{64}$'),
  day date not null default current_date,
  primary key (hash, day_token)
);
create index sightings_hash_day on public.sightings (hash, day);

create table public.reports (
  id uuid primary key,
  bank_id text not null references public.orgs(id),
  channel text not null check (channel in ('sms','call','whatsapp','email','screen','video','voice','app')),
  rules text[] not null,
  severity text not null check (severity in ('critical','high','medium','none')),
  indicator_hashes text[] not null default '{}',
  hour text not null check (hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  sealed_hash text not null check (sealed_hash ~ '^[0-9a-f]{64}$'),
  receipt_sig text not null,
  ticket_hash text not null check (ticket_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'delivered' check (status in ('delivered','opened','blocked','dismissed')),
  seeded boolean not null default false,
  received_at timestamptz not null,
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index reports_bank_time on public.reports (bank_id, received_at desc);
create index reports_hashes on public.reports using gin (indicator_hashes);

create table public.report_blobs (
  report_id uuid primary key references public.reports(id) on delete cascade,
  bank_id text not null,
  sealed text not null
);

create table public.pay_rules (
  org_id text primary key references public.orgs(id) on delete cascade,
  threshold_inr bigint not null default 100000,
  allowed_channels text[] not null default '{email,in_person}',
  updated_at timestamptz not null default now()
);

create table public.pay_vendors (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  vendor_name text not null,
  acct_hash text not null check (acct_hash ~ '^[0-9a-f]{64}$'),
  acct_hint text                                    -- last 4 digits only
);

create table public.pay_approvers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  name text not null,
  role text not null,
  callback_phone text not null,
  max_amount_inr bigint not null
);

create table public.pay_checks (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  requester text,
  channel text not null,
  amount_inr bigint,
  flags jsonb not null default '[]',
  voice_score real,
  decision text not null check (decision in ('hold','clear','released','blocked')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  verify_result text check (verify_result in ('confirmed','denied')),
  decided_by uuid,
  decided_at timestamptz
);

create or replace function public.my_orgs() returns setof text
language sql stable security definer set search_path = public as $$
  select org_id from public.members where user_id = auth.uid()
$$;

alter table public.orgs          enable row level security;
alter table public.members       enable row level security;
alter table public.promise_cards enable row level security;
alter table public.indicators    enable row level security;
alter table public.sightings     enable row level security;
alter table public.reports       enable row level security;
alter table public.report_blobs  enable row level security;
alter table public.pay_rules     enable row level security;
alter table public.pay_vendors   enable row level security;
alter table public.pay_approvers enable row level security;
alter table public.pay_checks    enable row level security;

create policy members_self   on public.members      for select to authenticated using (user_id = auth.uid());
create policy orgs_member    on public.orgs         for select to authenticated using (id in (select public.my_orgs()));
create policy reports_member on public.reports      for select to authenticated using (bank_id in (select public.my_orgs()));
create policy blobs_member   on public.report_blobs for select to authenticated using (bank_id in (select public.my_orgs()));

create policy pay_rules_member     on public.pay_rules     for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_vendors_member   on public.pay_vendors   for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_approvers_member on public.pay_approvers for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_checks_member    on public.pay_checks    for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
-- promise_cards, indicators, sightings: no policies = service role only (gateway).

create or replace function public.ingest_report(
  p_id uuid, p_bank text, p_channel text, p_rules text[], p_severity text,
  p_hashes text[], p_types text[], p_hour text, p_sealed text, p_sealed_hash text,
  p_receipt text, p_ticket_hash text, p_received_at timestamptz, p_seeded boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if coalesce(array_length(p_hashes,1),0) <> coalesce(array_length(p_types,1),0) then
    raise exception 'hashes/types length mismatch';
  end if;
  insert into reports (id, bank_id, channel, rules, severity, indicator_hashes, hour, sealed_hash,
                       receipt_sig, ticket_hash, received_at, seeded)
  values (p_id, p_bank, p_channel, p_rules, p_severity, p_hashes, p_hour, p_sealed_hash,
          p_receipt, p_ticket_hash, p_received_at, p_seeded);
  insert into report_blobs (report_id, bank_id, sealed) values (p_id, p_bank, p_sealed);
  for i in 1 .. coalesce(array_length(p_hashes,1),0) loop
    insert into indicators (hash, type, reports) values (p_hashes[i], p_types[i], 1)
    on conflict (hash) do update set reports = indicators.reports + 1;
  end loop;
end $$;

create or replace function public.herd_sight(p_hash text, p_type text, p_token text)
returns void language sql security definer set search_path = public as $$
  insert into sightings (hash, type, day_token) values (p_hash, p_type, p_token)
  on conflict do nothing;
$$;

create or replace function public.herd_lookup(p_prefix text)
returns table (hash text, type text, seen_7d bigint, reports int, confirmed_by text, label text)
language sql stable security definer set search_path = public as $$
  with s as (
    select sg.hash, min(sg.type) as type, count(*) as seen_7d
    from sightings sg
    where p_prefix ~ '^[0-9a-f]{5}$' and sg.hash like p_prefix || '%' and sg.day >= current_date - 7
    group by sg.hash),
  i as (
    select ind.* from indicators ind
    where p_prefix ~ '^[0-9a-f]{5}$' and ind.hash like p_prefix || '%')
  select coalesce(i.hash, s.hash), coalesce(i.type, s.type), coalesce(s.seen_7d, 0),
         coalesce(i.reports, 0), i.confirmed_by, i.label
  from i full outer join s on i.hash = s.hash;
$$;

create or replace function public.kill_indicators(p_bank text, p_hashes text[], p_types text[], p_labels text[])
returns int language plpgsql security definer set search_path = public as $$
declare i int; n int;
begin
  for i in 1 .. coalesce(array_length(p_hashes,1),0) loop
    insert into indicators (hash, type, reports, confirmed_by, confirmed_at, label)
    values (p_hashes[i], p_types[i], 0, p_bank, now(), p_labels[i])
    on conflict (hash) do update
      set confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, label = excluded.label;
  end loop;
  update reports set status = 'blocked', closed_at = now(), updated_at = now()
   where bank_id = p_bank and indicator_hashes && p_hashes and status <> 'blocked';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.ingest_report(uuid,text,text,text[],text,text[],text[],text,text,text,text,text,timestamptz,boolean) from public, anon, authenticated;
revoke execute on function public.herd_sight(text,text,text) from public, anon, authenticated;
revoke execute on function public.herd_lookup(text) from public, anon, authenticated;
revoke execute on function public.kill_indicators(text,text[],text[],text[]) from public, anon, authenticated;

alter publication supabase_realtime add table public.reports;
