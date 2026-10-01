create table public.daily_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_date date not null,
  completed_task_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, progress_date)
);

alter table public.daily_progress enable row level security;

create policy "Users can read their own progress"
  on public.daily_progress for select
  using (auth.uid() = user_id);

create policy "Users can create their own progress"
  on public.daily_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.daily_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index daily_progress_user_date_idx
  on public.daily_progress (user_id, progress_date);
