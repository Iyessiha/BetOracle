-- 007 — Conformité emails : consentement marketing, désinscription, anti-doublon
-- À appliquer dans le SQL Editor Supabase AVANT de brancher /api/send-email.

-- 1) Consentement marketing explicite (opt-in). Par défaut FALSE : les comptes existants
--    avaient une case pré-cochée, ce qui ne constitue pas un consentement valable.
alter table public.profiles
  add column if not exists marketing_consent    boolean     not null default false,
  add column if not exists marketing_consent_at timestamptz;

-- 2) Liste de désinscription (emails promotionnels uniquement)
create table if not exists public.email_suppressions (
  email      text primary key,
  source     text,
  created_at timestamptz not null default now()
);

-- 3) Journal d'envoi (clé unique = un email transactionnel n'est envoyé qu'une fois)
create table if not exists public.email_log (
  key     text primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  type    text not null,
  sent_at timestamptz not null default now()
);
create index if not exists idx_email_log_user on public.email_log(user_id);

-- 4) RLS activée sans politique = accessible uniquement avec la clé service_role (serveur)
alter table public.email_suppressions enable row level security;
alter table public.email_log          enable row level security;
