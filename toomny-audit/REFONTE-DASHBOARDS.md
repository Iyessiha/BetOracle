# Toomny — refonte des tableaux de bord

**Ce que fait ce patch** : réparer les chiffres, remettre l'action au premier plan, et rendre les écrans lisibles en thème sombre comme sur un téléphone.

---

## 1. Le problème de fond : les chiffres étaient faux

Les tableaux de bord chargeaient les **50 dernières commandes** puis additionnaient en JavaScript (`src/lib/dashboard.ts`, avant correctif). Au-delà de 50, « Encaissé » ne comptait plus que les plus récentes, et la carte « Commandes » mêlait commandes clientes et commandes prestataire sur un compte `both`. Aucun avertissement à l'écran.

### La correction : les agrégats descendent en base

`supabase/migrations/0020_dashboard_stats_and_storage_hardening.sql` ajoute deux fonctions :

```sql
create or replace function public.provider_dashboard_stats()
returns jsonb language sql stable security invoker ...
```

Quatre choix méritent d'être explicités, parce qu'ils sont le cœur de la correction :

1. **`security invoker`** — la RLS s'applique à l'appelant. Un prestataire ne peut donc agréger que ses propres lignes, par construction, pas par vigilance.
2. **Aucun paramètre.** Les fonctions travaillent sur `auth.uid()`. Sans identifiant en entrée, il n'y a pas d'identifiant à falsifier — la question de l'IDOR disparaît au lieu d'être traitée.
3. **Les montants sortent en `text`**, convertis en `bigint` côté TypeScript. Un `sum()` sur un `bigint` repasse en `numeric` ; le passer par JSON en nombre exposerait à une perte de précision silencieuse au-delà de 2⁵³.
4. **Une seule requête par écran** (`jsonb_build_object`), au lieu d'une dizaine de compteurs séparés.

Réponse complète du prestataire : encaissé, en séquestre, en litige, commandes (total / terminées / actives / à livrer), prestations (total / publiées / brouillons / en pause), messages non lus, demandes de contact en attente.

**Dégradation douce** : si la migration n'est pas encore appliquée, la fonction RPC échoue, l'erreur est journalisée et l'écran affiche des zéros. Jamais de page blanche, jamais de plantage.

---

## 2. Les écrans

### Tableau de bord prestataire (`/dashboard`)

**Avant** : bandeau KYC, quatre cartes de chiffres, trois cartes de raccourcis, aperçu des prestations, tableau des commandes. Le prestataire devait déduire lui-même ce qu'il avait à faire.

**Après**, dans l'ordre de lecture :

1. **Ce qui bloque** — KYC rejeté (danger), manquant (avertissement), en cours d'examen (information). Une seule bannière à la fois.
2. **À faire maintenant** — commandes à livrer, messages non lus, demandes de contact. Chaque carte est un lien, et **n'apparaît que si le compteur est non nul**. S'il n'y a rien : « Rien ne vous attend », pas une grille de zéros.
3. **Revenus** — encaissé / en séquestre / en litige, avec la mention « Montants nets de la commission Toomny (10 %) ». Un prestataire doit pouvoir lire son revenu réel sans calculer.
4. **Activité** — commandes, taux de complétion (avec la fraction `12 / 15` en appui), prestations (avec `3 · 1 · 0` = publiées · brouillons · en pause).
5. **Prestations** puis **commandes récentes**.

Corrections annexes sur cet écran : le prix des prestations passe par `formatMoney()` (au lieu d'un `toLocaleString` suivi de `" FCFA"` codé en dur) ; `/dashboard/versements` et `/dashboard/compte` entrent enfin dans le menu.

### Tableau de bord client (`/dashboard`)

Mêmes principes. Les actions sont **payer**, **valider une livraison** et **lire les messages**. Les quatre chiffres : dépensé, en séquestre, en cours, terminées — désormais cohérents entre eux (auparavant « En cours » comptait les commandes non payées, que « Dépensé » excluait : deux définitions du même mot dans le même écran).

### Administration (`/admin`)

**Avant** : une grille de 5 cartes sur 4 colonnes (la cinquième tombait seule), puis une seconde grille de 6 cartes de poids identique, la tendance, les pays, les derniers inscrits, les dernières commandes, le journal.

**Après** :

1. **À traiter** — en tête, avec `admin_attention_queue()` : vérifications en attente, revues manuelles, litiges ouverts, prestations à modérer, commandes bloquées (> 72 h sans livraison), versements à libérer (> 72 h après livraison). Sous les cartes, **la date du plus ancien dossier en attente** : c'est l'indicateur qui dit si l'équipe suit.
2. **Indicateurs** — volume, commission, commandes, comptes, prestations, taux de complétion. Grille de 6, propre en 3 colonnes sur bureau.
3. **Tendance 30 jours** et **répartition par pays**.
4. **Derniers inscrits** / **dernières commandes**, avec lien « tout voir » vers les écrans dédiés.
5. **Journal d'administration**.

La file d'attente est calculée par `admin_attention_queue()`, réservée à la clé de service : `revoke execute … from public, anon, authenticated` puis `grant … to service_role`.

---

## 3. Ce qui a été construit pour ça

| Fichier | Rôle |
| --- | --- |
| `src/lib/order-status.ts` **(nouveau)** | Source unique des regroupements de statuts (`IN_ESCROW`, `PROVIDER_TODO`, `CLIENT_TODO`, `DISPUTED`, `CLOSED`) et des couleurs d'état via jetons `--tone-*` |
| `src/lib/dashboard-stats.ts` **(nouveau)** | Appel typé des fonctions SQL, conversion `text` → `bigint`, dégradation douce |
| `src/lib/dashboard.ts` | Ne calcule plus de totaux : ne renvoie que les commandes récentes, et réexporte `statusTone` pour les six écrans qui l'importent |
| `src/components/dashboard/shell.tsx` | `StatCard` (lien, ton, précision), `SectionCard`, `Alert`, `StatusBadge`, `TableWrap`, `EmptyState`, navigation en sections, largeur paramétrable |
| `src/app/globals.css` | Jetons `--tone-*` clair/sombre + correctif de thème sombre pour les palettes figées |
| `supabase/migrations/0020_…sql` | Agrégats, file d'attente d'administration, contraintes des buckets, droits `inquiries` |

### Le thème sombre, réparé globalement

`statusTone()` renvoyait `bg-amber-50 text-amber-700` : des classes claires figées, insensibles à `prefers-color-scheme`, alors que le dépôt possède un système de jetons complet. Sur un écran sombre, chaque statut produisait un pavé éblouissant.

Deux corrections, à deux niveaux :

- **Le fond du problème** : `statusTone`, `serviceTone` et `verificationTone` passent désormais par `var(--tone-ok-bg)`, `var(--tone-warn-fg)`… définis en clair et en sombre.
- **Le reste du dépôt** : 50 occurrences de palettes figées subsistaient dans 31 fichiers. Plutôt que de réécrire chaque écran, `globals.css` réajuste ces utilitaires hors `@layer` (qui l'emporte sur les utilitaires générés par Tailwind) sous `prefers-color-scheme: dark`. Les écrans non encore refondus héritent de la correction immédiatement.

### Accessibilité et mobile

`scope="col"` sur les en-têtes, `aria-current="page"` sur le lien courant, `aria-label` sur les barres de progression, `role="status"` sur les bandeaux d'action, cibles tactiles de 44 px minimum, `TableWrap` en `overflow-x-auto` (au lieu de `overflow-hidden` qui rognait le contenu), navigation horizontale collante sur mobile.

---

## 4. Tests ajoutés (18)

`src/lib/order-status.test.ts` — 8 tests. Le plus utile : **tout statut de l'énumération doit être classé explicitement**. Ajouter un statut à `orderStatusEnum` sans le classer fait échouer la suite, au lieu de produire un tableau de bord silencieusement faux. Un second test vérifie qu'aucune couleur figée ne peut revenir dans les pastilles de statut.

`src/lib/image-upload.test.ts` — 11 tests (voir `SECURITE-FAILLES.md`, faille F1).

---

## 5. Appliquer le patch

```bash
cd Toomny
git checkout -b refonte/dashboards-et-securite
git apply /chemin/vers/toomny-refonte-dashboards-et-securite.patch

npm ci
npm run typecheck   # 0 erreur
npm run lint        # 0 erreur
npm test            # 61 tests
```

Puis, **dans l'éditeur SQL Supabase, projet de test d'abord** :

```
supabase/migrations/0020_dashboard_stats_and_storage_hardening.sql
```

### Ordre d'application impératif

La migration est idempotente (`create or replace`, `drop policy if exists`, `create index if not exists`) mais elle doit passer **avant** la mise en production de la refonte : les nouveaux écrans lisent `provider_dashboard_stats()`, `client_dashboard_stats()` et `admin_attention_queue()`.

Si elle n'est pas encore appliquée, l'application reste debout : les compteurs affichent zéro et l'erreur part dans les logs. C'est volontaire — mais un tableau de bord à zéros doit alerter, pas rassurer.

### Après application, à vérifier en recette

1. Un prestataire avec **plus de 50 commandes** : « Encaissé » doit correspondre au total réel, pas aux 50 dernières.
2. Un compte `both` (client et prestataire) : les deux tableaux doivent afficher des chiffres différents et cohérents.
3. Un écran en **thème sombre** : les pastilles de statut restent lisibles.
4. Une bannière KYC : elle disparaît quand le dossier passe en `verified`.
5. Tentative d'envoi d'un fichier HTML renommé en `.jpg` : réponse `400`, message « Format non reconnu ».
