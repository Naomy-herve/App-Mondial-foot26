-- FOOT26 v2.0 - schéma Supabase/PostgreSQL
-- À exécuter dans Supabase > SQL Editor sur une base neuve.
-- Ne mettez JAMAIS la service role key dans le navigateur.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Utilisateur',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  license_number text unique,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  coach_id uuid references coaches(id) on delete set null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  position text,
  team_id uuid not null references teams(id) on delete cascade,
  jersey_number integer check (jersey_number between 0 and 99),
  birth_date date,
  created_at timestamptz not null default now()
);

create table if not exists referees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  license_number text unique,
  created_at timestamptz not null default now()
);

create table if not exists stadiums (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  capacity integer check (capacity >= 0 and capacity <= 200000),
  address text,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  home_team_id uuid not null references teams(id) on delete restrict,
  away_team_id uuid not null references teams(id) on delete restrict,
  stadium_id uuid references stadiums(id) on delete set null,
  referee_id uuid references referees(id) on delete set null,
  match_date timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  home_score integer not null default 0 check (home_score between 0 and 99),
  away_score integer not null default 0 check (away_score between 0 and 99),
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  team_id uuid not null references teams(id) on delete cascade,
  minute integer not null check (minute between 0 and 130),
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  team_id uuid not null references teams(id) on delete cascade,
  card_type text not null check (card_type in ('yellow','red')),
  minute integer not null check (minute between 0 and 130),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Création automatique du profil après inscription Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'Utilisateur'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Vérifie qu'un événement appartient bien au match et que le joueur appartient à son équipe.
create or replace function public.validate_match_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  home_id uuid;
  away_id uuid;
  player_team uuid;
begin
  select home_team_id, away_team_id into home_id, away_id from public.matches where id = new.match_id;
  if home_id is null then raise exception 'Match introuvable'; end if;
  if new.team_id <> home_id and new.team_id <> away_id then raise exception 'L’équipe ne participe pas à ce match'; end if;
  if new.player_id is not null then
    select team_id into player_team from public.players where id = new.player_id;
    if player_team is null or player_team <> new.team_id then raise exception 'Le joueur n’appartient pas à cette équipe'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_goal on public.goals;
create trigger validate_goal before insert or update on public.goals for each row execute function public.validate_match_event();
drop trigger if exists validate_card on public.cards;
create trigger validate_card before insert or update on public.cards for each row execute function public.validate_match_event();

-- Empêche d'enregistrer plus de buts détaillés que le score officiel déjà saisi.
create or replace function public.validate_goal_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m public.matches;
  c integer;
begin
  select * into m from public.matches where id = new.match_id;
  select count(*) into c from public.goals where match_id = new.match_id and team_id = new.team_id;
  if m.status = 'finished' then
    if new.team_id = m.home_team_id and c >= m.home_score then raise exception 'Nombre de buts détaillés supérieur au score domicile'; end if;
    if new.team_id = m.away_team_id and c >= m.away_score then raise exception 'Nombre de buts détaillés supérieur au score extérieur'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_goal_count on public.goals;
create trigger validate_goal_count before insert on public.goals for each row execute function public.validate_goal_count();

-- Statistiques dérivées : impossible d’avoir un classement de buteurs désynchronisé.
drop table if exists public.player_statistics cascade;
drop view if exists public.player_statistics;
create or replace view public.player_statistics as
select
  p.id as player_id,
  p.first_name || ' ' || p.last_name as player_name,
  p.team_id,
  t.name as team_name,
  coalesce(g.goals,0)::bigint as goals,
  0::bigint as assists,
  coalesce(y.yellow_cards,0)::bigint as yellow_cards,
  coalesce(r.red_cards,0)::bigint as red_cards,
  coalesce(app.appearances,0)::bigint as appearances,
  0::bigint as minutes_played
from players p
join teams t on t.id = p.team_id
left join (select player_id, count(*) goals from goals where player_id is not null group by player_id) g on g.player_id=p.id
left join (select player_id, count(*) yellow_cards from cards where player_id is not null and card_type='yellow' group by player_id) y on y.player_id=p.id
left join (select player_id, count(*) red_cards from cards where player_id is not null and card_type='red' group by player_id) r on r.player_id=p.id
left join (select player_id, count(distinct match_id) appearances from (select player_id,match_id from goals where player_id is not null union select player_id,match_id from cards where player_id is not null) e group by player_id) app on app.player_id=p.id;

create or replace view public.standings
with (security_invoker = true)
as
with tm as (
  select t.id team_id, t.name,
    count(m.id) filter (where m.status='finished') played,
    count(m.id) filter (where m.status='finished' and ((m.home_team_id=t.id and m.home_score>m.away_score) or (m.away_team_id=t.id and m.away_score>m.home_score))) wins,
    count(m.id) filter (where m.status='finished' and m.home_score=m.away_score and (m.home_team_id=t.id or m.away_team_id=t.id)) draws,
    count(m.id) filter (where m.status='finished' and ((m.home_team_id=t.id and m.home_score<m.away_score) or (m.away_team_id=t.id and m.away_score<m.home_score))) losses,
    coalesce(sum(case when m.status='finished' and m.home_team_id=t.id then m.home_score when m.status='finished' and m.away_team_id=t.id then m.away_score else 0 end),0) goals_for,
    coalesce(sum(case when m.status='finished' and m.home_team_id=t.id then m.away_score when m.status='finished' and m.away_team_id=t.id then m.home_score else 0 end),0) goals_against
  from teams t left join matches m on m.home_team_id=t.id or m.away_team_id=t.id
  group by t.id,t.name
)
select team_id,name,played,wins,draws,losses,goals_for,goals_against,goals_for-goals_against goal_difference,wins*3+draws points from tm;

-- Données de démonstration idempotentes.
insert into coaches(first_name,last_name,license_number) values
('Rakoto','Andry','DEMO-COACH-01'),('Andria','Hery','DEMO-COACH-02'),('Rabe','Mamy','DEMO-COACH-03'),('Hery','Faly','DEMO-COACH-04')
on conflict(license_number) do nothing;

insert into teams(name,city,coach_id) values
('FC Antananarivo','Antananarivo',(select id from coaches where first_name='Rakoto' and last_name='Andry' limit 1)),
('AS Boeny','Mahajanga',(select id from coaches where first_name='Andria' and last_name='Hery' limit 1)),
('CNaPS Sport','Itasy',(select id from coaches where first_name='Rabe' and last_name='Mamy' limit 1)),
('Elgeco Plus','Antananarivo',(select id from coaches where first_name='Hery' and last_name='Faly' limit 1))
on conflict(name) do nothing;

insert into stadiums(name,city,capacity) values
('Stade Municipal','Antananarivo',15000),('Stade de Mahamasina','Antananarivo',22000)
on conflict(name) do nothing;

-- RLS : lecture publique pour les données sportives, profil/notifications limités à l'utilisateur.
alter table profiles enable row level security;
alter table coaches enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table referees enable row level security;
alter table stadiums enable row level security;
alter table matches enable row level security;
alter table goals enable row level security;
alter table cards enable row level security;
alter table notifications enable row level security;

do $$
begin
  execute 'drop policy if exists "public read coaches" on public.coaches';
  execute 'create policy "public read coaches" on public.coaches for select using (true)';
  execute 'drop policy if exists "public read teams" on public.teams';
  execute 'create policy "public read teams" on public.teams for select using (true)';
  execute 'drop policy if exists "public read players" on public.players';
  execute 'create policy "public read players" on public.players for select using (true)';
  execute 'drop policy if exists "public read referees" on public.referees';
  execute 'create policy "public read referees" on public.referees for select using (true)';
  execute 'drop policy if exists "public read stadiums" on public.stadiums';
  execute 'create policy "public read stadiums" on public.stadiums for select using (true)';
  execute 'drop policy if exists "public read matches" on public.matches';
  execute 'create policy "public read matches" on public.matches for select using (true)';
  execute 'drop policy if exists "public read goals" on public.goals';
  execute 'create policy "public read goals" on public.goals for select using (true)';
  execute 'drop policy if exists "public read cards" on public.cards';
  execute 'create policy "public read cards" on public.cards for select using (true)';
  execute 'drop policy if exists "profile own" on public.profiles';
  execute 'create policy "profile own" on public.profiles for select using (auth.uid()=id)';
  execute 'drop policy if exists "notifications own" on public.notifications';
  execute 'create policy "notifications own" on public.notifications for select using (user_id=auth.uid() or user_id is null)';
end $$;

-- Les écritures sont faites exclusivement par le backend avec service role.
-- Aucun grant service_role n’est exposé au navigateur.
