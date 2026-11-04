-- FlowMint Cashflow Simplification: Unified Net Cash
-- Removes the legacy opening_cash column from profiles table.
-- Net Cash is determined strictly by: opening_balance + sum(credits) - sum(debits).

begin;

alter table public.profiles drop constraint if exists profiles_opening_cash_range;
alter table public.profiles drop column if exists opening_cash;

commit;
