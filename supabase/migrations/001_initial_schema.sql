-- ═══════════════════════════════════════════════════════════
--  BETORACLE PRO — Migration 001
--  Base de données complète : tables, RLS, triggers, indexes
--  Editeur : MonWe Infinity LLC
-- ═══════════════════════════════════════════════════════════

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES (étend auth.users de Supabase)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text,
  phone         text,                          -- Mobile Money
  avatar_url    text,
  plan          text not null default 'free'   -- free | starter | pro | elite
                check (plan in ('free','starter','pro','elite')),
  plan_expires_at timestamptz,
  ref_code      text unique default upper(substring(md5(random()::text) for 8)),
  referred_by   uuid references public.profiles(id),
  referral_count int not null default 0,
  telegram_id   bigint,                        -- pour le bot Telegram
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index
create index idx_profiles_plan          on public.profiles(plan);
create index idx_profiles_ref_code      on public.profiles(ref_code);
create index idx_profiles_telegram_id   on public.profiles(telegram_id);

-- ─────────────────────────────────────────────────────────────
-- 2. SUBSCRIPTIONS (historique des paiements)
-- ─────────────────────────────────────────────────────────────
create table public.subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  plan            text not null check (plan in ('starter','pro','elite')),
  status          text not null default 'pending'
                  check (status in ('pending','active','expired','cancelled','refunded')),
  period          text not null check (period in ('week','month')),
  amount_fcfa     int not null,
  payment_method  text check (payment_method in ('wave','orange_money','mtn_money','moov_money','card')),
  tx_id           text,                        -- ID transaction opérateur
  tx_reference    text unique,                 -- référence interne
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_subs_user_id   on public.subscriptions(user_id);
create index idx_subs_status    on public.subscriptions(status);
create index idx_subs_tx_ref    on public.subscriptions(tx_reference);

-- ─────────────────────────────────────────────────────────────
-- 3. COUPONS (coupons du jour générés par l'Oracle)
-- ─────────────────────────────────────────────────────────────
create table public.coupons (
  id              uuid primary key default uuid_generate_v4(),
  match_date      date not null,
  selections      jsonb not null default '[]',
  -- Format selections: [{team_a, team_b, league, pick, odds, confidence}]
  total_odds      numeric(6,2) not null default 1.0,
  min_plan        text not null default 'free'
                  check (min_plan in ('free','starter','pro','elite')),
  status          text not null default 'pending'
                  check (status in ('pending','published','won','lost','void')),
  result_summary  jsonb,                       -- résumé après résultats
  wins            int default 0,
  losses          int default 0,
  telegram_msg_id bigint,                      -- ID message Telegram
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_coupons_date   on public.coupons(match_date);
create index idx_coupons_status on public.coupons(status);
create unique index idx_coupons_date_unique on public.coupons(match_date)
  where status != 'void';

-- ─────────────────────────────────────────────────────────────
-- 4. ANALYSES (résultats de l'Oracle par match)
-- ─────────────────────────────────────────────────────────────
create table public.analyses (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  team_a_id       int not null,                -- ID api-sports.io
  team_a_name     text not null,
  team_b_id       int not null,
  team_b_name     text not null,
  league_id       int,
  league_name     text,
  match_date      date,
  oracle_result   jsonb,
  -- Format: {proba_1, proba_x, proba_2, score_estimate, btts, over25,
  --          confidence, scenarios[3], value_bet, risk_level, h2h}
  confidence      numeric(5,2),
  plan_required   text not null default 'starter'
                  check (plan_required in ('free','starter','pro','elite')),
  is_locked       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index idx_analyses_user_id   on public.analyses(user_id);
create index idx_analyses_teams     on public.analyses(team_a_id, team_b_id);
create index idx_analyses_date      on public.analyses(created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 5. BANKROLL (suivi financier par utilisateur)
-- ─────────────────────────────────────────────────────────────
create table public.bankroll (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  balance_fcfa    int not null default 0,
  initial_fcfa    int not null default 0,
  roi_pct         numeric(6,2) not null default 0,
  total_bets      int not null default 0,
  wins            int not null default 0,
  losses          int not null default 0,
  void_bets       int not null default 0,
  best_streak     int not null default 0,
  current_streak  int not null default 0,
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. BETS (paris enregistrés manuellement)
-- ─────────────────────────────────────────────────────────────
create table public.bets (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  coupon_id       uuid references public.coupons(id),
  team_a          text not null,
  team_b          text not null,
  league          text,
  pick            text not null,               -- "1", "X", "2", "BTTS", "Over2.5"...
  odds            numeric(6,2) not null,
  stake_fcfa      int not null,
  status          text not null default 'pending'
                  check (status in ('pending','won','lost','void')),
  payout_fcfa     int,
  bookmaker       text,
  match_date      date,
  placed_at       timestamptz not null default now()
);

create index idx_bets_user_id   on public.bets(user_id);
create index idx_bets_status    on public.bets(status);
create index idx_bets_placed_at on public.bets(placed_at desc);

-- ─────────────────────────────────────────────────────────────
-- 7. REFERRALS (parrainage)
-- ─────────────────────────────────────────────────────────────
create table public.referrals (
  id              uuid primary key default uuid_generate_v4(),
  referrer_id     uuid not null references public.profiles(id) on delete cascade,
  referred_id     uuid not null unique references public.profiles(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending','subscribed','rewarded')),
  reward_type     text,                        -- "1_month_starter", "3_months_pro", "500000_fcfa"
  rewarded_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_referrals_referrer on public.referrals(referrer_id);
create index idx_referrals_status   on public.referrals(status);

-- ─────────────────────────────────────────────────────────────
-- 8. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
create table public.notifications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  type            text not null
                  check (type in ('coupon','alert','payment','referral','system')),
  title           text not null,
  body            text,
  data            jsonb,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_notifs_user_id  on public.notifications(user_id);
create index idx_notifs_unread   on public.notifications(user_id) where read = false;

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.coupons       enable row level security;
alter table public.analyses      enable row level security;
alter table public.bankroll      enable row level security;
alter table public.bets          enable row level security;
alter table public.referrals     enable row level security;
alter table public.notifications enable row level security;

-- PROFILES
create policy "profiles: lecture publique restreinte"
  on public.profiles for select
  using (id = auth.uid() or auth.role() = 'service_role');

create policy "profiles: mise à jour par le propriétaire"
  on public.profiles for update
  using (id = auth.uid());

-- SUBSCRIPTIONS
create policy "subscriptions: voir les siennes"
  on public.subscriptions for select
  using (user_id = auth.uid());

create policy "subscriptions: créer via service_role seulement"
  on public.subscriptions for insert
  with check (auth.role() = 'service_role');

create policy "subscriptions: modifier via service_role seulement"
  on public.subscriptions for update
  using (auth.role() = 'service_role');

-- COUPONS (lecture selon plan)
create policy "coupons: lecture publique pour free"
  on public.coupons for select
  using (
    min_plan = 'free'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.plan_expires_at > now()
        and case min_plan
              when 'starter' then p.plan in ('starter','pro','elite')
              when 'pro'     then p.plan in ('pro','elite')
              when 'elite'   then p.plan = 'elite'
              else true
            end
    )
  );

create policy "coupons: insert via service_role"
  on public.coupons for insert
  with check (auth.role() = 'service_role');

create policy "coupons: update via service_role"
  on public.coupons for update
  using (auth.role() = 'service_role');

-- ANALYSES
create policy "analyses: voir les siennes"
  on public.analyses for select
  using (user_id = auth.uid());

create policy "analyses: créer"
  on public.analyses for insert
  with check (user_id = auth.uid());

-- BANKROLL
create policy "bankroll: voir la sienne"
  on public.bankroll for select
  using (user_id = auth.uid());

create policy "bankroll: update par le propriétaire"
  on public.bankroll for update
  using (user_id = auth.uid());

-- BETS
create policy "bets: voir les siens"
  on public.bets for select
  using (user_id = auth.uid());

create policy "bets: créer"
  on public.bets for insert
  with check (user_id = auth.uid());

create policy "bets: modifier les siens"
  on public.bets for update
  using (user_id = auth.uid());

-- REFERRALS
create policy "referrals: voir les siens"
  on public.referrals for select
  using (referrer_id = auth.uid() or referred_id = auth.uid());

-- NOTIFICATIONS
create policy "notifications: voir les siennes"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: marquer comme lue"
  on public.notifications for update
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════

-- Auto-créer profile + bankroll après inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  ref text;
begin
  -- Code de parrainage unique
  ref := upper(substring(md5(new.id::text || random()::text) for 8));
  while exists (select 1 from public.profiles where ref_code = ref) loop
    ref := upper(substring(md5(random()::text) for 8));
  end loop;

  insert into public.profiles (id, email, full_name, ref_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    ref
  );

  insert into public.bankroll (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mettre à jour updated_at automatiquement
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_bankroll_updated_at
  before update on public.bankroll
  for each row execute function public.set_updated_at();

-- Recalculer ROI après chaque mise à jour de bet
create or replace function public.recalculate_bankroll()
returns trigger language plpgsql security definer as $$
declare
  v_user_id uuid;
  v_total   int;
  v_wins    int;
  v_losses  int;
  v_pnl     int;
  v_initial int;
begin
  v_user_id := coalesce(new.user_id, old.user_id);

  select
    count(*),
    count(*) filter (where status = 'won'),
    count(*) filter (where status = 'lost'),
    coalesce(sum(case when status = 'won' then payout_fcfa - stake_fcfa
                      when status = 'lost' then -stake_fcfa
                      else 0 end), 0)
  into v_total, v_wins, v_losses, v_pnl
  from public.bets
  where user_id = v_user_id;

  select initial_fcfa into v_initial
  from public.bankroll where user_id = v_user_id;

  update public.bankroll set
    total_bets = v_total,
    wins       = v_wins,
    losses     = v_losses,
    roi_pct    = case when v_initial > 0
                      then round((v_pnl::numeric / v_initial) * 100, 2)
                      else 0 end
  where user_id = v_user_id;

  return new;
end;
$$;

create trigger trg_bet_update_bankroll
  after insert or update on public.bets
  for each row execute function public.recalculate_bankroll();

-- Mettre à jour referral_count quand un filleul souscrit
create or replace function public.handle_referral_subscribed()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'subscribed' and old.status = 'pending' then
    update public.profiles
    set referral_count = referral_count + 1
    where id = new.referrer_id;
  end if;
  return new;
end;
$$;

create trigger trg_referral_count
  after update on public.referrals
  for each row execute function public.handle_referral_subscribed();

-- ═══════════════════════════════════════════════════════════
-- VUES UTILES
-- ═══════════════════════════════════════════════════════════

-- Vue : profil complet avec statut abonnement
create or replace view public.user_dashboard as
select
  p.id,
  p.email,
  p.full_name,
  p.plan,
  p.plan_expires_at,
  p.plan_expires_at > now() as is_plan_active,
  p.ref_code,
  p.referral_count,
  p.telegram_id,
  b.balance_fcfa,
  b.roi_pct,
  b.total_bets,
  b.wins,
  b.losses,
  case when b.total_bets > 0
       then round((b.wins::numeric / b.total_bets) * 100, 1)
       else 0 end as win_rate_pct
from public.profiles p
left join public.bankroll b on b.user_id = p.id;

-- Vue : coupon du jour avec statut utilisateur
create or replace view public.today_coupon as
select
  c.*,
  c.match_date = current_date as is_today
from public.coupons c
where c.match_date = current_date
  and c.status = 'published'
order by c.published_at desc
limit 1;

-- ═══════════════════════════════════════════════════════════
-- FONCTIONS HELPER (appelables via RPC)
-- ═══════════════════════════════════════════════════════════

-- Calculer la mise Kelly
create or replace function public.kelly_stake(
  p_bankroll int,
  p_odds     numeric,
  p_proba    numeric  -- en décimal ex: 0.55
)
returns jsonb language plpgsql as $$
declare
  v_kelly     numeric;
  v_stake_raw numeric;
  v_stake_4th numeric;
begin
  -- Kelly = p - (1-p)/(b-1) où b = odds décimales
  v_kelly := greatest(0, p_proba - (1 - p_proba) / (p_odds - 1));
  -- Fraction ¼ Kelly (plus conservateur)
  v_stake_raw := p_bankroll * v_kelly * 0.25;
  -- Arrondir à la centaine inférieure
  v_stake_4th := floor(v_stake_raw / 100) * 100;

  return jsonb_build_object(
    'kelly_pct',    round(v_kelly * 100, 2),
    'stake_fcfa',   v_stake_4th,
    'fraction',     '1/4 Kelly',
    'max_stake',    p_bankroll * 0.05  -- jamais plus de 5% bankroll
  );
end;
$$;

-- Vérifier si un utilisateur a accès à un plan
create or replace function public.user_has_plan(
  p_user_id uuid,
  p_min_plan text
)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and plan_expires_at > now()
      and case p_min_plan
            when 'free'    then true
            when 'starter' then plan in ('starter','pro','elite')
            when 'pro'     then plan in ('pro','elite')
            when 'elite'   then plan = 'elite'
            else false
          end
  );
$$;

-- ═══════════════════════════════════════════════════════════
-- DONNÉES INITIALES
-- ═══════════════════════════════════════════════════════════

-- Plans et tarifs (table de référence)
create table public.plans (
  id          text primary key,
  name        text not null,
  price_week  int not null,
  price_month int not null,
  features    jsonb not null default '[]'
);

insert into public.plans values
('free',    'Free',    0,    0,     '["1 sélection/jour","Bankroll basique","Historique 5 paris"]'),
('starter', 'Starter', 500,  1500,  '["Coupon 4 matchs","Stats 1X2","ROI Tracker","Historique illimité"]'),
('pro',     'Pro',     1000, 3000,  '["Tout Starter","Value Bet","Kelly","H2H","Alertes live","Comparateur cotes"]'),
('elite',   'Elite',   2000, 6000,  '["Tout Pro","Oracle IA complet","Coaching","Support prioritaire","Stats joueurs"]');
