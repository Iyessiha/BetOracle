-- ═══════════════════════════════════════════════════════════════
--  BETORACL PRO — Migration 006
--  Coupe du Monde 2026 : Accès gratuit + Sécurité anti-abus
--  MonWe Infinity LLC
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. MODE COUPE DU MONDE — configuration globale
-- ─────────────────────────────────────────────────────────────
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Paramètres de la promo CdM 2026
insert into public.app_config (key, value, description) values
(
  'worldcup_2026',
  '{
    "enabled": true,
    "free_plan_level": "pro",
    "start_date": "2026-06-11",
    "end_date": "2026-07-19",
    "message_fr": "🏆 Coupe du Monde 2026 — Accès Pro GRATUIT jusqu''au 19 juillet !",
    "features_unlocked": ["coupon_complet","stats_1x2","value_bet","kelly","h2h","alertes","comparateur"],
    "daily_analyses_limit": 10,
    "require_email_verification": true,
    "block_disposable_emails": true
  }',
  'Configuration promotion Coupe du Monde 2026'
),
(
  'security',
  '{
    "max_signups_per_ip_per_hour": 3,
    "max_login_attempts": 5,
    "lockout_duration_minutes": 30,
    "require_email_verification": true,
    "min_password_length": 8,
    "block_disposable_emails": true,
    "block_plus_emails": false,
    "session_duration_hours": 168
  }',
  'Paramètres de sécurité'
),
(
  'marketing',
  '{
    "welcome_email": true,
    "daily_coupon_push": true,
    "re_engagement_after_days": 3,
    "upsell_after_analyses": 5,
    "referral_bonus_enabled": true,
    "telegram_channel": "@betoracl_pro"
  }',
  'Configuration marketing et rétention'
)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ─────────────────────────────────────────────────────────────
-- 2. SÉCURITÉ — tables anti-abus
-- ─────────────────────────────────────────────────────────────

-- Rate limiting par IP
create table if not exists public.rate_limits (
  id          uuid primary key default gen_random_uuid(),
  ip_address  inet not null,
  action      text not null,  -- 'signup', 'login', 'analyse', 'payment'
  count       int not null default 1,
  window_start timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_rate_limits_ip_action on public.rate_limits(ip_address, action);
create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

-- Domaines email bloqués (jetables)
create table if not exists public.blocked_email_domains (
  domain      text primary key,
  reason      text not null default 'disposable',
  added_at    timestamptz not null default now()
);

-- Insérer les 50 domaines jetables les plus courants
insert into public.blocked_email_domains (domain, reason) values
('mailinator.com','disposable'),('guerrillamail.com','disposable'),
('tempmail.com','disposable'),('throwaway.email','disposable'),
('sharklasers.com','disposable'),('guerrillamailblock.com','disposable'),
('grr.la','disposable'),('guerrillamail.info','disposable'),
('spam4.me','disposable'),('yopmail.com','disposable'),
('yopmail.fr','disposable'),('cool.fr.nf','disposable'),
('jetable.fr.nf','disposable'),('nospam.ze.tc','disposable'),
('nomail.xl.cx','disposable'),('mega.zik.dj','disposable'),
('speed.1s.fr','disposable'),('courriel.fr.nf','disposable'),
('moncourrier.fr.nf','disposable'),('mailnull.com','disposable'),
('spamgourmet.com','disposable'),('trashmail.at','disposable'),
('trashmail.me','disposable'),('trashmail.net','disposable'),
('dispostable.com','disposable'),('mailnesia.com','disposable'),
('mailnull.com','disposable'),('trashmailer.com','disposable'),
('getairmail.com','disposable'),('fakeinbox.com','disposable'),
('mailexpire.com','disposable'),('tempr.email','disposable'),
('discard.email','disposable'),('mailsac.com','disposable'),
('burnermail.io','disposable'),('inboxkitten.com','disposable'),
('tempinbox.com','disposable'),('throwam.com','disposable'),
('getnada.com','disposable'),('mailtemp.net','disposable'),
('spamhereplease.com','disposable'),('binkmail.com','disposable'),
('bob.email','disposable'),('mailinater.com','disposable'),
('spamdecoy.net','disposable'),('spamgourmet.net','disposable'),
('trashmail.org','disposable'),('yepmail.net','disposable'),
('maildrop.cc','disposable'),('filzmail.com','disposable')
on conflict (domain) do nothing;

-- Sessions actives (tracking)
create table if not exists public.user_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ip_address  inet,
  user_agent  text,
  device_type text,  -- 'mobile', 'tablet', 'desktop'
  country     text,
  last_seen   timestamptz not null default now(),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sessions_user on public.user_sessions(user_id);
create index if not exists idx_sessions_active on public.user_sessions(is_active, last_seen);

-- ─────────────────────────────────────────────────────────────
-- 3. MARKETING — tables rétention
-- ─────────────────────────────────────────────────────────────

-- Emails marketing
create table if not exists public.email_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  email       text not null,
  template    text not null,  -- 'welcome','daily_coupon','re_engagement','upsell','worldcup'
  subject     text not null,
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  scheduled_for timestamptz not null default now(),
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_email_queue_status on public.email_queue(status, scheduled_for);
create index if not exists idx_email_queue_user on public.email_queue(user_id);

-- Événements utilisateur (pour le marketing automation)
create table if not exists public.user_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event       text not null,  -- 'signup','login','analyse','coupon_view','payment_start','payment_success','referral_sent'
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_user_events_user on public.user_events(user_id, event);
create index if not exists idx_user_events_time on public.user_events(created_at desc);

-- Streak de connexion (gamification)
create table if not exists public.user_streaks (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_login_date date,
  total_logins   int not null default 0,
  updated_at    timestamptz not null default now()
);

-- Push notifications (web push)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device_type text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- 4. MISE À JOUR PROFILES — champs sécurité et marketing
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists email_verified    boolean not null default false,
  add column if not exists email_score       int not null default 100,  -- 0-100, <50 = suspect
  add column if not exists signup_ip         inet,
  add column if not exists country           text,
  add column if not exists device_type       text,
  add column if not exists login_count       int not null default 0,
  add column if not exists last_login_at     timestamptz,
  add column if not exists streak_days       int not null default 0,
  add column if not exists is_banned         boolean not null default false,
  add column if not exists ban_reason        text,
  add column if not exists worldcup_access   boolean not null default true,
  add column if not exists analyses_today    int not null default 0,
  add column if not exists analyses_date     date,
  add column if not exists push_enabled      boolean not null default false,
  add column if not exists marketing_consent boolean not null default true;

-- ─────────────────────────────────────────────────────────────
-- 5. FONCTIONS — mode CdM et sécurité
-- ─────────────────────────────────────────────────────────────

-- Vérifier si l'email est valide (pas jetable)
create or replace function public.is_email_valid(p_email text)
returns boolean language plpgsql as $$
declare
  v_domain text;
begin
  -- Extraire le domaine
  v_domain := lower(split_part(p_email, '@', 2));
  
  -- Vérifier format basique
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  
  -- Vérifier domaine bloqué
  if exists (select 1 from public.blocked_email_domains where domain = v_domain) then
    return false;
  end if;
  
  -- Vérifier longueur minimale du domaine
  if length(v_domain) < 4 then
    return false;
  end if;
  
  return true;
end;
$$;

-- Obtenir le niveau de plan effectif (CdM = pro pour tous)
create or replace function public.get_effective_plan(p_user_id uuid)
returns text language plpgsql security definer as $$
declare
  v_profile public.profiles%rowtype;
  v_config  jsonb;
  v_now     timestamptz := now();
  v_cdm     jsonb;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then return 'free'; end if;
  if v_profile.is_banned then return 'banned'; end if;
  
  -- Vérifier mode CdM
  select value into v_cdm from public.app_config where key = 'worldcup_2026';
  if v_cdm is not null 
     and (v_cdm->>'enabled')::boolean = true
     and v_now::date >= (v_cdm->>'start_date')::date
     and v_now::date <= (v_cdm->>'end_date')::date
     and v_profile.worldcup_access = true
     and v_profile.email_verified = true then
    return v_cdm->>'free_plan_level';  -- 'pro'
  end if;
  
  -- Plan normal
  if v_profile.plan_expires_at is null or v_profile.plan_expires_at <= v_now then
    return 'free';
  end if;
  return v_profile.plan;
end;
$$;

-- Enregistrer un événement utilisateur
create or replace function public.track_event(
  p_user_id uuid,
  p_event   text,
  p_meta    jsonb default '{}'
) returns void language plpgsql security definer as $$
begin
  insert into public.user_events (user_id, event, metadata)
  values (p_user_id, p_event, p_meta);
  
  -- Mettre à jour streak si login
  if p_event = 'login' then
    update public.profiles 
    set login_count = login_count + 1,
        last_login_at = now()
    where id = p_user_id;
    
    -- Gérer streak
    insert into public.user_streaks (user_id, current_streak, last_login_date, total_logins)
    values (p_user_id, 1, current_date, 1)
    on conflict (user_id) do update set
      current_streak = case 
        when user_streaks.last_login_date = current_date - 1 then user_streaks.current_streak + 1
        when user_streaks.last_login_date = current_date then user_streaks.current_streak
        else 1
      end,
      longest_streak = greatest(user_streaks.longest_streak, 
        case 
          when user_streaks.last_login_date = current_date - 1 then user_streaks.current_streak + 1
          else 1
        end),
      last_login_date = current_date,
      total_logins = user_streaks.total_logins + 1,
      updated_at = now();
    
    update public.profiles 
    set streak_days = (select current_streak from public.user_streaks where user_id = p_user_id)
    where id = p_user_id;
  end if;
  
  -- Reset compteur analyses si nouveau jour
  if p_event = 'analyse' then
    update public.profiles
    set analyses_today = case when analyses_date = current_date then analyses_today + 1 else 1 end,
        analyses_date = current_date
    where id = p_user_id;
  end if;
end;
$$;

-- Planifier l'email de bienvenue
create or replace function public.schedule_welcome_email()
returns trigger language plpgsql security definer as $$
begin
  insert into public.email_queue (user_id, email, template, subject, payload, scheduled_for)
  values (
    new.id,
    new.email,
    'welcome',
    '🔮 Bienvenue sur Betoracl Pro — Ton accès Coupe du Monde est prêt !',
    jsonb_build_object(
      'first_name', split_part(coalesce(new.full_name, new.email), ' ', 1),
      'ref_code', new.ref_code,
      'plan', 'pro',
      'worldcup', true
    ),
    now() + interval '2 minutes'
  );
  return new;
end;
$$;

create trigger if not exists trg_welcome_email
  after insert on public.profiles
  for each row execute function public.schedule_welcome_email();

-- ─────────────────────────────────────────────────────────────
-- 6. ACTIVATION CdM — tous les users existants en Pro
-- ─────────────────────────────────────────────────────────────
update public.profiles
set worldcup_access = true,
    email_verified = true  -- les users existants sont vérifiés
where is_banned = false;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS — nouvelles tables
-- ─────────────────────────────────────────────────────────────
alter table public.app_config          enable row level security;
alter table public.rate_limits         enable row level security;
alter table public.blocked_email_domains enable row level security;
alter table public.user_sessions       enable row level security;
alter table public.email_queue         enable row level security;
alter table public.user_events         enable row level security;
alter table public.user_streaks        enable row level security;
alter table public.push_subscriptions  enable row level security;

-- App config : lecture publique
create policy "app_config: read" on public.app_config for select using (true);
create policy "app_config: service_role" on public.app_config for all using (auth.role() = 'service_role');

-- Blocked domains : lecture publique
create policy "blocked_domains: read" on public.blocked_email_domains for select using (true);

-- Sessions : user voit les siennes
create policy "sessions: own" on public.user_sessions for all using (user_id = auth.uid());
create policy "sessions: service" on public.user_sessions for all using (auth.role() = 'service_role');

-- Events : user voit les siens
create policy "events: own" on public.user_events for select using (user_id = auth.uid());
create policy "events: insert" on public.user_events for insert with check (user_id = auth.uid());
create policy "events: service" on public.user_events for all using (auth.role() = 'service_role');

-- Streaks : user voit le sien
create policy "streaks: own" on public.user_streaks for select using (user_id = auth.uid());
create policy "streaks: service" on public.user_streaks for all using (auth.role() = 'service_role');

-- Push : user gère les siennes
create policy "push: own" on public.push_subscriptions for all using (user_id = auth.uid());

-- Email queue : service only
create policy "email_queue: service" on public.email_queue for all using (auth.role() = 'service_role');

-- Rate limits : service only
create policy "rate_limits: service" on public.rate_limits for all using (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- 8. VUE — dashboard utilisateur enrichi
-- ─────────────────────────────────────────────────────────────
create or replace view public.user_dashboard as
select
  p.id,
  p.email,
  p.full_name,
  p.plan,
  public.get_effective_plan(p.id) as effective_plan,
  p.plan_expires_at,
  p.plan_expires_at > now() as is_plan_active,
  p.worldcup_access,
  p.email_verified,
  p.ref_code,
  p.referral_count,
  p.telegram_id,
  p.login_count,
  p.last_login_at,
  p.streak_days,
  p.analyses_today,
  p.analyses_date,
  p.push_enabled,
  p.country,
  b.balance_fcfa,
  b.roi_pct,
  b.total_bets,
  b.wins,
  b.losses,
  case when b.total_bets > 0 then round((b.wins::numeric / b.total_bets) * 100, 1) else 0 end as win_rate_pct,
  coalesce(s.current_streak, 0) as current_streak,
  coalesce(s.longest_streak, 0) as longest_streak
from public.profiles p
left join public.bankroll b on b.user_id = p.id
left join public.user_streaks s on s.user_id = p.id;

-- ─────────────────────────────────────────────────────────────
-- 9. CLEANUP — nettoyage auto rate limits (>1h)
-- ─────────────────────────────────────────────────────────────
create or replace function public.cleanup_rate_limits()
returns void language sql security definer as $$
  delete from public.rate_limits where window_start < now() - interval '2 hours';
  delete from public.user_sessions where last_seen < now() - interval '30 days';
$$;
