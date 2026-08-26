-- ═══════════════════════════════════════════════════════════════
--  BETORACL PRO — Migration 007
--  Sécurité RBAC Administrateur & Renforcement des Politiques RLS
--  Editeur : MonWe Infinity LLC
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. CHAMP IS_ADMIN & RÔLE DANS PROFILES
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists role text not null default 'user' check (role in ('user', 'support', 'admin', 'superadmin'));

create index if not exists idx_profiles_is_admin on public.profiles(is_admin);
create index if not exists idx_profiles_role on public.profiles(role);

-- ─────────────────────────────────────────────────────────────
-- 2. FONCTIONS DE VÉRIFICATION ADMIN (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

-- Vérifie si un user_id spécifique est administrateur
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id
      and (
        is_admin = true
        or role in ('admin', 'superadmin')
        or lower(email) in ('yessiha@monweinfinity.com', 'monweci@gmail.com')
      )
  );
$$;

-- Helper pour vérifier le user courant
create or replace function public.current_user_is_admin()
returns boolean language sql security definer stable as $$
  select public.is_admin(auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. ATTRIBUTION DES DROITS ADMIN AUX COMPTES OFFICIELS
-- ─────────────────────────────────────────────────────────────
update public.profiles
set is_admin = true,
    role = 'admin'
where lower(email) in ('yessiha@monweinfinity.com', 'monweci@gmail.com');

-- ─────────────────────────────────────────────────────────────
-- 4. POLITIQUES RLS ADMIN POUR TOUTES LES TABLES
-- ─────────────────────────────────────────────────────────────

-- PROFILES : Les admins peuvent lire et modifier tous les profils
drop policy if exists "profiles: admin access" on public.profiles;
create policy "profiles: admin access"
  on public.profiles for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- SUBSCRIPTIONS : Les admins peuvent consulter et gérer tous les abonnements
drop policy if exists "subscriptions: admin access" on public.subscriptions;
create policy "subscriptions: admin access"
  on public.subscriptions for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- COUPONS : Les admins ont accès complet (création, édition, suppression)
drop policy if exists "coupons: admin access" on public.coupons;
create policy "coupons: admin access"
  on public.coupons for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- ANALYSES : Les admins peuvent consulter toutes les analyses pour le suivi
drop policy if exists "analyses: admin access" on public.analyses;
create policy "analyses: admin access"
  on public.analyses for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');

-- BANKROLL : Les admins peuvent consulter les métriques de bankroll globales
drop policy if exists "bankroll: admin access" on public.bankroll;
create policy "bankroll: admin access"
  on public.bankroll for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');

-- BETS : Les admins peuvent consulter tous les paris
drop policy if exists "bets: admin access" on public.bets;
create policy "bets: admin access"
  on public.bets for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');

-- REFERRALS : Les admins peuvent consulter et administrer les parrainages
drop policy if exists "referrals: admin access" on public.referrals;
create policy "referrals: admin access"
  on public.referrals for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- NOTIFICATIONS : Les admins peuvent envoyer et consulter les notifications globales
drop policy if exists "notifications: admin access" on public.notifications;
create policy "notifications: admin access"
  on public.notifications for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- APP CONFIG : Les admins peuvent modifier la configuration de l'application
drop policy if exists "app_config: admin manage" on public.app_config;
create policy "app_config: admin manage"
  on public.app_config for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

-- RATE LIMITS & SESSIONS : Lecture admin
drop policy if exists "rate_limits: admin access" on public.rate_limits;
create policy "rate_limits: admin access"
  on public.rate_limits for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');

drop policy if exists "user_sessions: admin access" on public.user_sessions;
create policy "user_sessions: admin access"
  on public.user_sessions for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');

drop policy if exists "email_queue: admin access" on public.email_queue;
create policy "email_queue: admin access"
  on public.email_queue for all
  using (public.current_user_is_admin() or auth.role() = 'service_role')
  with check (public.current_user_is_admin() or auth.role() = 'service_role');

drop policy if exists "user_events: admin access" on public.user_events;
create policy "user_events: admin access"
  on public.user_events for select
  using (public.current_user_is_admin() or auth.role() = 'service_role');
