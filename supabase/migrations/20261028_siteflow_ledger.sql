-- ====================================================================
-- SiteFlow: Voice-First Financial Management Web App for Building Contractors
-- Database Schema for Supabase PostgreSQL
-- ====================================================================

-- 1. Profiles Table (Contractor Account & Preferences)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  business_name text,
  owner_name text,
  business_type text,
  location text,
  opening_balance numeric not null default 25000,
  language text default 'en-IN',
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 2. Projects Table (Building Projects & Client Contracts)
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,                           -- e.g. "Sharma Residence"
  client text not null,                         -- e.g. "Rakesh Sharma"
  contract_value numeric not null check (contract_value >= 0),
  start_date date not null,
  expected_completion_date date,
  status text default 'active' check (status in ('active', 'completed', 'on-hold')),
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.projects enable row level security;

create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

create index if not exists idx_projects_user_id on public.projects(user_id);

-- 3. Transactions Table (Core Financial Cashbook Ledger)
-- Note: balance_after is NOT stored statically to prevent drift; it is computed dynamically.
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete set null, -- null for daily expenses (fuel, food, tea)
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount > 0),
  date date not null default current_date,
  time text,                                                     -- e.g. "10:15 AM"
  category text not null,                                        -- "Client Payment", "Worker Payment", "Fuel", "Food & tea", "Cement", etc.
  party text,                                                    -- "Murugan Traders", "Rakesh Sharma", "Workers", etc.
  description text,
  method text not null check (method in ('cash', 'upi', 'bank', 'cheque')),
  source text default 'voice' check (source in ('voice', 'manual')),
  transcript text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc);
create index if not exists idx_transactions_project on public.transactions(project_id);
