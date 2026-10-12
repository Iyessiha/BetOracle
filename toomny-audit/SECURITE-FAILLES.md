# Toomny — failles de sécurité

**Révision auditée** : `540b45d` · **Date** : 12 octobre 2026
**Périmètre** : routes API, politiques RLS et migrations, stockage, chaîne de paiement, en-têtes, journal d'audit.

> Ce document ne contient aucun secret, aucune valeur d'environnement et aucune donnée personnelle : uniquement des références `fichier:ligne` du dépôt et des éléments d'exploitation.

---

## Ce qui tient déjà (vérifié, pas supposé)

Avant les failles, l'essentiel — parce qu'il faut savoir ce qui n'a pas besoin d'être touché :

| Contrôle | Constat |
| --- | --- |
| Cloisonnement des données | RLS activée sur les 13 tables, politiques écrites une par une. Un client ne lit que ses commandes, un prestataire que les siennes (`0001_security_rls.sql:130-185`) |
| Verrous de colonnes | `grant update (colonnes nommées)` sur `profiles` et `provider_profiles` : le rôle, le statut KYC et le numéro de versement ne sont pas modifiables par le titulaire |
| Escalade de privilèges | Impossible par métadonnées utilisateur : le trigger SQL borne le rôle (`0001:34`), et `src/lib/auth.ts:50` borne en plus |
| Journal comptable | Immuable par déclencheurs, `update`, `delete` **et** `truncate`, y compris avec la clé de service (`0001:195-212`) |
| Journal d'administration | Même régime d'immuabilité (`0007_admin_audit_log.sql:25-42`), sans politique : seule la clé de service y accède |
| Signature des webhooks | HMAC-SHA256 sur `` `${timestamp}.${rawBody}` ``, `timingSafeEqual`, fenêtre anti-rejeu 300 s (`src/lib/payments/geniuspay.ts:152-171`) |
| Isolation du client à privilèges | `createAdminClient()` marqué `server-only`, jamais importé côté navigateur |
| Injection SQL | Aucune requête construite par concaténation ; accès via requêteur Supabase ou Drizzle paramétré |
| Secrets | Aucun secret dans l'historique Git complet, `.gitignore` correct, `.env.example` sans valeur réelle |
| En-têtes | HSTS (2 ans, `preload`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` restrictive (`next.config.ts:13-26`) |
| CSP | Nonce par requête + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'` (`src/proxy.ts:12-38`) |

---

## Failles trouvées et corrigées

### F1 — Type de fichier déclaré par le client (élevée)

**Où** : `src/app/api/profile/avatar/route.ts:25`, `src/app/api/services/cover/route.ts:25`, `src/app/api/services/gallery/route.ts:25` (avant correctif).

**Le problème.** Le contrôle portait sur `file.type`, une valeur que le navigateur envoie et que le client choisit. Le contenu du fichier n'était jamais inspecté :

```ts
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
if (!ALLOWED_TYPES.has(file.type)) { return 400 }
```

**Exploitation.** Un compte authentifié dépose un fichier HTML ou un script en annonçant `image/jpeg`. Le fichier est écrit tel quel dans un bucket **public**, servi sous `*.supabase.co` — c'est-à-dire sur un domaine en `supabase.co`, réputé légitime, ce qui en fait un support d'hameçonnage crédible et difficile à signaler. Rien n'empêchait non plus de saturer le stockage (aucune limite de débit, aucune limite de nombre).

**Correctif appliqué.**
- `src/lib/image-upload.ts` : lecture des octets d'en-tête — JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`. Le contenu fait foi, pas la déclaration.
- Le type annoncé est en plus confronté au type réel (un PNG annoncé JPEG est refusé).
- `supabase/migrations/0020_…sql` : `allowed_mime_types` et `file_size_limit` posés **sur les buckets eux-mêmes** (2 Mo avatars, 3 Mo couvertures), plus vérification des métadonnées dans les politiques d'écriture. Le refus ne dépend donc plus du code applicatif.
- Limite de débit par utilisateur : 20 avatars/h, 30 couvertures/h, 60 images de galerie/h.
- 11 tests couvrent le cas (HTML déguisé en JPEG, RIFF non-WebP, dépassement de taille, fichier vide).

### F2 — Aucune limite de débit sur les envois d'images (moyenne)

**Où** : mêmes routes.

**Le problème.** Les compteurs existaient pour l'authentification mais pas pour les envois. Un compte, même légitime, pouvait remplir un bucket public sans plafond.

**Correctif.** `consumeRateLimit()` sur les trois routes (`upload:avatar:`, `upload:cover:`, `upload:gallery:`, clé par identifiant utilisateur). Réponse `429` explicite.

### F3 — Turnstile désactivé silencieusement sans clé secrète (élevée en production)

**Où** : `src/lib/request-security.ts:21-24` (avant correctif).

**Le problème.**

```ts
const secret = process.env.TURNSTILE_SECRET_KEY;
if (!secret) return true;   // laisse passer
```

Le `.env.example` le signalait, mais rien ne l'imposait. Une variable oubliée en production = inscription et connexion ouvertes au bourrage d'identifiants, sans aucune trace.

**Correctif.** Échec fermé : en production, sans clé, la vérification renvoie `false` et un message d'erreur explicite est journalisé. Le contournement reste possible mais **volontaire** : `TURNSTILE_OPTIONAL=1`.

### F4 — Compteur de tentatives en échec ouvert (moyenne)

**Où** : `src/lib/rate-limit.ts:16-19` (avant correctif).

**Le problème.** En cas d'erreur de la base, `consumeRateLimit` renvoyait `true` : « la disponibilité prime sur le compteur ». Une base indisponible — ou rendue indisponible — levait d'un coup toutes les limitations : `signup` 10/h/IP, `login` 30/15 min/IP, 3 inscriptions par adresse.

**Correctif.** Échec fermé par défaut (`failMode: "closed"`). Le mode `"open"` reste disponible, mais devient un choix explicite route par route.

### F5 — Adresse IP lue dans un en-tête falsifiable (moyenne)

**Où** : `src/lib/request-security.ts:4-8` (avant correctif).

**Le problème.**

```ts
const forwarded = request.headers.get("x-forwarded-for");
if (forwarded) return forwarded.split(",")[0].trim();
```

La **première** valeur de `x-forwarded-for` est celle fournie par le client ; le proxy ajoute les suivantes. Un attaquant changeant d'en-tête à chaque requête obtient une clé de compteur neuve à chaque fois : limitation par IP contournée, donc anti-bruteforce inopérant.

**Correctif.** Priorité aux en-têtes posés par la plateforme (`x-vercel-forwarded-for`, `x-real-ip`) ; à défaut, le **dernier** maillon de `x-forwarded-for`, celui ajouté par le proxy.

### F6 — Le montant encaissé n'était jamais confronté à la commande (élevée)

**Où** : `src/app/api/webhooks/geniuspay/route.ts:46-60` (avant correctif).

**Le problème.** Le webhook vérifiait la signature — donc l'origine du message — puis marquait la commande `funded` **sans comparer le montant reçu au montant dû**, ni la devise. Une signature valide prouve qui parle, pas ce qui a été payé.

**Exploitation.** Un encaissement partiel, ou rattaché à une référence réutilisée, finançait intégralement la commande.

**Correctif.** Comparaison stricte `event.amountMinor` ↔ `orders.amount_minor` et `event.currency` ↔ `orders.currency`. En cas d'écart : la rétention passe en `failed` avec un motif explicite, la commande n'est pas financée, et l'écart est journalisé en `console.error` avec les deux montants.

### F7 — Double financement en cas de webhooks concurrents (moyenne)

**Où** : `src/app/api/webhooks/geniuspay/route.ts:52-59` (avant correctif).

**Le problème.** La séquence « lire `status`, puis écrire `funded` » n'était pas atomique. Deux livraisons simultanées du même événement (les partenaires de paiement réessaient, et c'est normal) pouvaient toutes deux passer le test et **écrire deux fois au journal comptable** — dans une table qu'on ne peut plus corriger, seulement compenser par une écriture inverse.

**Correctif.** Mise à jour conditionnelle suivie d'une relecture :

```ts
const { data: funded } = await db.from("orders")
  .update({ status: "funded" })
  .eq("id", order.id).eq("status", "pending_payment")
  .select("id");
if (funded?.length) await recordFunding(db, order);
```

Une seule transaction gagne ; l'autre n'écrit rien au journal. L'index unique `escrow_partner_ref_idx` sur `(partner, partner_hold_ref)` empêche par ailleurs tout doublon de rétention.

### F8 — Message d'erreur du fournisseur d'authentification renvoyé au client (faible)

**Où** : `src/app/api/auth/login/route.ts:75` (avant correctif).

**Le problème.** `return NextResponse.json({ error: error.message })` renvoyait le message brut de Supabase Auth. Au-delà de l'énumération de comptes, ces messages exposent parfois la configuration interne du projet.

**Correctif.** Message journalisé côté serveur (`console.error("[auth:login]", …)`), réponse générique localisée au client : « Requête invalide. »

### F9 — Vue `provider_directory` sans barrière de sécurité (faible)

**Où** : `supabase/migrations/0001_security_rls.sql:61-65`, réécrite en `0009`.

**Le problème.** La vue est en `SECURITY DEFINER` (comportement par défaut) : elle lit `profiles` avec les droits de son propriétaire, en contournant la RLS. C'est ici **voulu** — c'est la projection publique contrôlée, limitée à `id`, `display_name`, `country_code`, `verification_status` — mais l'absence de `security_barrier` laissait la porte ouverte à un plan d'exécution qui évalue un opérateur de filtre « leakproof » avant le filtre de rôle.

**Correctif.** `security_barrier = on` sur la vue, avec la justification écrite en commentaire de migration. Le choix de rester en `definer` est documenté : passer en `invoker` viderait l'annuaire pour un visiteur anonyme, faute de politique de lecture publique sur `profiles`.

**Résiduel assumé** : la vue expose le `display_name` de **tous** les comptes `provider`/`both`, y compris suspendus ou supprimés. Acceptable aujourd'hui (c'est l'annuaire), à revoir le jour où un état de suspension existera.

### F10 — Droits de `inquiries` implicites (faible)

**Où** : `supabase/migrations/0015_inquiries.sql`.

**Le problème.** `0003_reconcile_grants_policies.sql:16` révoque tous les droits sur les tables existantes. `inquiries` a été créée **après**, avec ses politiques mais sans `grant` : l'accès dépendait donc des privilèges par défaut du projet Supabase, réglage invisible depuis le dépôt. Une réinitialisation du projet pouvait produire des écrans vides — ou, dans l'autre sens, des droits plus larges que voulus.

**Correctif (migration 0020).** Droits explicites : `select, insert` et `update (read_at)` pour `authenticated`. Le marquage « lu » ne peut donc porter que sur cette colonne.

---

## Recommandations résiduelles

Ce qui reste, classé par ce que ça coûte si on ne le fait pas.

| # | Recommandation | Risque si ignorée |
| --- | --- | --- |
| R1 | **Limiter les demandes de contact.** `sendInquiry` et `sendDirectInquiry` valident l'authentification, le rôle du destinataire et la longueur du message, mais n'ont aucun compteur : un compte peut inonder un prestataire | Harcèlement, pollution de boîte de réception, pas de trace |
| R2 | **Protection CSRF explicite.** Les routes POST s'appuient aujourd'hui sur `SameSite=Lax` des cookies Supabase. Suffisant, mais implicite : à revérifier le jour où un cookie applicatif est ajouté | Rejeu depuis un site tiers |
| R3 | **Journal de sécurité.** Tentatives échouées, envois rejetés, webhooks rejetés : journalisés en `console`. Les logs Vercel expirent | Aucune enquête possible après incident |
| R4 | **Dependabot + `npm audit`.** 458 paquets, aucune veille sur les CVE | Vulnérabilité connue non corrigée |
| R5 | **Sauvegardes testées.** Activer le PITR Supabase et **restaurer pour de vrai** une fois | Perte de données définitive |
| R6 | **Double validation des décisions financières.** Un `role='admin'` peut seul rembourser ou trancher un litige ; le rôle se change à la main en base | Erreur humaine ou compte compromis = argent perdu |
| R7 | **File d'attente pour les webhooks.** Le traitement est synchrone : si la base échoue pendant un webhook, l'événement est perdu côté Toomny (le partenaire réessaiera, mais sans garantie contractuelle) | Commande payée jamais financée |
| R8 | **Buckets publics.** Les images de couverture et avatars sont lisibles par URL. Voulu — mais si des visuels privés arrivent (documents, pièces jointes de litige), prévoir des URL signées | Fuite d'images |
| R9 | **Limitation de débit en périphérie.** La limitation est applicative et par IP : un attaquant distribué la contourne. Vercel WAF ou Cloudflare devant l'application | Attaque distribuée |
| R10 | **Politique de mot de passe.** 8 caractères minimum, pas de vérification contre les fuites connues (Have I Been Pwned) | Comptes faibles |

---

## Ordre d'exploitation d'un attaquant, avant correctifs

Pour mesurer ce qui a été fermé, l'enchaînement le plus court qui menait à un dommage :

1. Créer un compte (aucun CAPTCHA si la variable manquait — F3).
2. Envoyer 10 000 fichiers en annonçant `image/jpeg`, dont des pages HTML (F1, F2) → hameçonnage servi depuis un domaine `supabase.co`.
3. Contourner les compteurs en changeant `X-Forwarded-For` pour mener un bourrage d'identifiants (F5) — ou attendre une panne de base pour les annuler tous (F4).
4. Chaque étape est aujourd'hui fermée, et la 2 comme la 3 laissent une trace en réponse `429` ou `400`.

---

## Vérification

```bash
cd Toomny
npm ci
npm run typecheck   # 0 erreur
npm run lint        # 0 erreur
npm test            # 61 tests — dont 11 sur la validation des images
```

Les tests ajoutés ne se contentent pas de vérifier que le code tourne : ils vérifient les refus. `src/lib/image-upload.test.ts` envoie du HTML déguisé en JPEG et attend un rejet ; `src/lib/order-status.test.ts` vérifie qu'aucun statut de commande ne peut être ajouté sans être classé, et qu'aucune couleur figée ne peut revenir casser le thème sombre.
