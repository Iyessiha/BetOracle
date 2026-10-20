-- 008 — Pixels & balises gérés depuis l'admin
-- À appliquer dans le SQL Editor Supabase AVANT d'utiliser l'onglet « Pixels & balises ».
-- Accès uniquement via l'API serveur (clé service_role) : RLS activée, aucune politique.

create table if not exists public.tracking_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null check (kind in ('meta_pixel','tiktok_pixel','ga4','gtm','google_ads','custom')),
  tag_id      text,                       -- identifiant du pixel (types structurés)
  custom_html text,                       -- code collé par l'admin (type custom)
  placement   text not null default 'head' check (placement in ('head','body_end')),
  pages       text not null default '*',  -- '*' ou liste de chemins séparés par des virgules (ex: /signup,/payment-success,/blog/*)
  enabled     boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tracking_tags enable row level security;
