-- 007 — Conformité emails : consentement marketing, désinscription, anti-doublon
-- À appliquer dans le SQL Editor Supabase AVANT de brancher /api/send-email.

-- 1) Consentement marketing explicite (opt-in) : une case pré-cochée n'est pas un consentement valable.
alter table public.profiles
  add column if not exists marketing_consent    boolean     not null default false,
  add column if not exists marketing_consent_at timestamptz;

-- La colonne existe déjà (migration 006, défaut TRUE = case pré-cochée, donc sans valeur de consentement).
-- Les nouveaux comptes doivent être à FALSE tant que l'utilisateur n'a pas coché la case.
alter table public.profiles alter column marketing_consent set default false;

-- DÉCISION À PRENDRE (non exécutée automatiquement) : les comptes existants ont marketing_consent = true
-- sans consentement réel. Pour être en règle, les remettre à false et arrêter les relances en attente :
--   update public.profiles set marketing_consent = false where marketing_consent_at is null;
--   update public.marketing_sequences set status = 'skipped' where status = 'pending'
--     and user_id in (select id from public.profiles where marketing_consent = false);

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
