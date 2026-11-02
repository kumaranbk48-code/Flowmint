-- FlowMint hardening migration. Apply AFTER 20261028_siteflow_ledger.sql.
-- Fixes: wage type, soft delete + audit trail, composite project ownership, project delete protection,
--        decimal-safe amounts, separate opening cash, defensive constraints, tighter RLS.

begin;

-- ---------------------------------------------------------------- profiles
alter table public.profiles alter column opening_balance set default 1000;   -- matches the application default
alter table public.profiles add column if not exists opening_cash numeric;    -- NULL = legacy rows (treated as = opening_balance)

alter table public.profiles drop constraint if exists profiles_opening_balance_range;
alter table public.profiles add constraint profiles_opening_balance_range
  check (opening_balance between -100000000 and 1000000000);
alter table public.profiles drop constraint if exists profiles_opening_cash_range;
alter table public.profiles add constraint profiles_opening_cash_range
  check (opening_cash is null or opening_cash between -100000000 and 1000000000);

-- ---------------------------------------------------------------- projects
alter table public.projects alter column contract_value type numeric(14,2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_id_user_unique') then
    alter table public.projects add constraint projects_id_user_unique unique (id, user_id);
  end if;
end
$$;

-- ---------------------------------------------------------------- transactions
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('income', 'expense', 'wage'));

alter table public.transactions alter column amount type numeric(14,2);
alter table public.transactions drop constraint if exists transactions_amount_max;
alter table public.transactions add constraint transactions_amount_max check (amount <= 1000000000);

alter table public.transactions drop constraint if exists transactions_date_range;
alter table public.transactions add constraint transactions_date_range
  check (date between date '2000-01-01' and date '2100-12-31');

alter table public.transactions drop constraint if exists transactions_text_lengths;
alter table public.transactions add constraint transactions_text_lengths check (
  char_length(category) <= 60 and char_length(party) <= 100 and char_length(description) <= 255
  and char_length("time") <= 20 and char_length(transcript) <= 1000
);

alter table public.transactions add column if not exists updated_at timestamptz not null default now();
alter table public.transactions add column if not exists deleted_at timestamptz;   -- soft delete: rows are never hard-deleted by the app

-- A project can only be used by its owner (user_id must match), and a project that has transactions can never be deleted
-- (previously ON DELETE SET NULL silently moved all of its money into "no project").
alter table public.transactions drop constraint if exists transactions_project_id_fkey;
alter table public.transactions drop constraint if exists transactions_project_owner_fkey;
alter table public.transactions add constraint transactions_project_owner_fkey
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete restrict;

create index if not exists idx_transactions_user_active_date
  on public.transactions (user_id, date desc, created_at desc) where deleted_at is null;

create or replace function public.flowmint_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;
drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at before update on public.transactions
  for each row execute function public.flowmint_touch_updated_at();

-- ---------------------------------------------------------------- audit trail (append-only)
create table if not exists public.ledger_audit (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row    jsonb,
  new_row    jsonb
);
alter table public.ledger_audit enable row level security;   -- no policies: only the service role can read or write
revoke all on public.ledger_audit from anon, authenticated;

create or replace function public.flowmint_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.ledger_audit (user_id, table_name, row_id, action, old_row, new_row)
  values (
    coalesce(j ->> 'user_id', j ->> 'id')::uuid,
    tg_table_name,
    j ->> 'id',
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end
$$;

drop trigger if exists transactions_audit on public.transactions;
create trigger transactions_audit after insert or update or delete on public.transactions
  for each row execute function public.flowmint_audit();

-- Opening balance / opening cash changes are audited too (they re-state every report).
drop trigger if exists profiles_opening_audit on public.profiles;
create trigger profiles_opening_audit after update on public.profiles
  for each row
  when (old.opening_balance is distinct from new.opening_balance or old.opening_cash is distinct from new.opening_cash)
  execute function public.flowmint_audit();

-- ---------------------------------------------------------------- RLS tightening
-- (The API uses the service role, so these are defence in depth for any direct anon-key access.)
drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;   -- deletes are soft deletes via UPDATE

drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions" on public.transactions
  for select using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

commit;
