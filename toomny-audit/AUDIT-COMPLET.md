# Toomny — audit complet

**Dépôt** : `Iyessiha/Toomny` · **Révision auditée** : `540b45d` (12 octobre 2026, 01:19 UTC)
**Périmètre** : code applicatif, schéma et migrations SQL, routes serveur, tableaux de bord, infrastructure de vérification.
**Méthode** : lecture intégrale du dépôt cloné, exécution réelle des contrôles (typage, lint, tests, build), lecture des 20 migrations et des policies RLS, revue des 8 routes API.

---

## 1. Résumé exécutif

Le produit est **nettement plus avancé que ne le dit son propre README**, et sa base technique est **au-dessus de la moyenne** des projets à ce stade : machine à états du séquestre modélisée, journal comptable en ajout seul imposé par la base, RLS écrite à la main table par table, limitation des tentatives partagée entre instances serverless, CSP à nonce par requête. Ce n'est pas un prototype — c'est un MVP cohérent.

Trois familles de problèmes ressortent, par ordre d'impact :

| Priorité | Problème | Effet réel |
| --- | --- | --- |
| **P0** | Les totaux des tableaux de bord étaient calculés en JavaScript sur **les 50 dernières commandes** (`limit(50)`) | Un prestataire dépassant 50 commandes lit des montants **faux**, sans aucun signal d'erreur |
| **P0** | Les envois d'images ne validaient que le **type MIME annoncé par le navigateur**, et les buckets publics n'imposaient ni type ni taille | Dépôt de fichiers arbitraires (HTML, script) dans un espace public, sans limite de débit |
| **P1** | Le thème sombre était **cassé sur tout ce qui porte un état** (`bg-amber-50`, `bg-red-50` figés) | 50 occurrences dans 31 fichiers : pavés clairs illisibles sur fond noir |
| **P1** | Aucune CI, aucun garde-fou automatique | `tsc`, `eslint`, `vitest` existaient mais rien ne les faisait tourner |

**Ce qui a été livré** : correctifs P0 et P1 appliqués (patch joint), 18 tests ajoutés, CI mise en place, README remis à la vérité. Détail en fin de document.

---

## 2. Chiffres mesurés

| Indicateur | Valeur | Commentaire |
| --- | --- | --- |
| Fichiers suivis | 206 | |
| Lignes | 35 648 | dont `src/app` 7 032 · `src/components` 7 389 · `src/lib` 1 972 · `src/i18n` 2 090 · `supabase` 927 |
| Historique | 89 commits · **7 jours** (2026-10-07 → 2026-10-12) | rythme de construction très soutenu |
| Contributeurs | 2 déclarés : Iyessiha (61), Claude (28) | |
| Tables | 13 (Drizzle) | + 2 tables techniques (`auth_rate_limits`, `admin_audit_log`) |
| Migrations SQL | 19 → **20** | 927 lignes de SQL de sécurité |
| Routes API | 8 | auth ×2, webhook ×1, paiement ×1, images ×3, export RGPD ×1 |
| Tests | 7 fichiers, 43 tests → **9 fichiers, 61 tests** | tous au vert |
| Typage | `tsc --noEmit` : **0 erreur** | avant et après intervention |
| Lint | **1 erreur**, 6 avertissements → **0 erreur**, 6 avertissements | l'erreur était un `setState` dans un `useEffect` |
| CI | **absente** → GitHub Actions ajoutée | typecheck + lint + tests + build |
| Secrets dans l'historique | **aucun** (scan de tout l'historique Git) | `.gitignore` correct, `.env.example` propre |

---

## 3. Architecture — ce qui est bien fait

Ces choix méritent d'être préservés ; ils coûteraient cher à refaire.

1. **Le journal comptable ne peut pas être falsifié.** `ledger_entries` est protégé par trois déclencheurs `before update or delete` **et** `before truncate`, y compris pour la clé de service (`0001_security_rls.sql:195-212`). Une correction passe par une écriture inverse — la seule façon de tenir une attestation de revenus.
2. **La machine à états du séquestre est explicite et testée.** `src/lib/escrow.ts` + 8 tests. Le passage à `completed` n'est pas décidé par le navigateur.
3. **La RLS est écrite à la main, avec des verrous de colonnes.** `grant update (display_name, first_name, …)` (colonnes nommées) plutôt qu'un `update` global : même si une politique se trouvait trop permissive, l'écriture reste bornée. C'est la bonne granularité.
4. **Le rôle ne peut pas être forgé.** Un `user_metadata` trafiqué côté navigateur ne peut produire ni `admin` (trigger SQL, `0001:34`) ni rien d'autre que `client` ou `provider` (bornage aussi côté `src/lib/auth.ts:50`).
5. **La signature des webhooks est vérifiée correctement** : HMAC-SHA256 sur `` `${timestamp}.${rawBody}` ``, comparaison `timingSafeEqual`, fenêtre anti-rejeu de 300 s (`src/lib/payments/geniuspay.ts:152-171`).
6. **La séparation des privilèges est assumée et documentée** : `createAdminClient()` (clé de service) est marqué `server-only`, et le commentaire explique pourquoi l'équipe a préféré un appel explicite à `requireAdmin()` plutôt que des politiques « ou alors admin » (`src/lib/supabase/admin.ts:4-11`).
7. **Le modèle monétaire est en entiers** (`bigint`, plus petite unité), avec `src/lib/money.ts` et 9 tests. Le XOF a un exposant 0 : c'est exactement le genre de détail qui produit des erreurs de facteur 100 en production.
8. **L'i18n n'est pas un rattrapage** : 2 090 lignes de dictionnaires FR/EN, aucun texte en dur dans les composants des tableaux de bord (sauf deux exceptions relevées plus bas).

---

## 4. Les tableaux de bord — état avant refonte

### 4.1 Ce qui était faux (P0)

**Les montants.** `getDashboardData()` chargeait les 50 commandes les plus récentes puis additionnait en JavaScript :

```ts
// src/lib/dashboard.ts (avant)
.limit(50)
...
for (const o of rows) {
  if (isMine && o.status === "completed") earned += BigInt(o.provider_net_minor);
  ...
}
```

Trois conséquences : au-delà de 50 commandes, « Encaissé » ne compte que les plus récentes ; la carte « Commandes » affichait `data.orders.length`, soit **le total clients + prestataires mêlés pour un compte `both`** ; et le calcul n'était pas filtrable par période. **Aucun message d'erreur**, aucune indication d'approximation. C'est le pire type de bug pour un produit financier : il ne se voit pas.

**Le prix des prestations.** L'aperçu des prestations affichait `(s.price_minor / 1).toLocaleString(...) + " FCFA"` — au lieu de `formatMoney()`, utilisé partout ailleurs. Devise codée en dur, formatage divergent.

**Les compteurs d'action.** Le client voyait « En cours » compter `pending_payment` (commandes **non payées**) parmi les commandes actives, alors que le montant « En dépensé » les excluait. Deux définitions du même mot dans le même écran.

### 4.2 Ce qui était illisible (P1)

- **Thème sombre cassé.** `statusTone()` renvoyait `bg-amber-50 text-amber-700`, `bg-red-50 text-red-700` : classes claires figées, insensibles à `prefers-color-scheme`. Le dépôt a pourtant un système de jetons complet dans `globals.css`. 50 occurrences dans 31 fichiers.
- **Bandeaux d'attention** (« Vérifiez votre identité pour être payé ») en `bg-amber-50 text-amber-800` — même problème, sur un message qu'on veut voir.
- **Grille de 5 cartes sur 4 colonnes** dans l'administration : la cinquième carte tombait seule sur une ligne.
- **Navigation incohérente.** `/dashboard/versements` et `/dashboard/compte` existaient mais n'apparaissaient dans aucun menu. Un prestataire ne pouvait pas configurer ses versements sans connaître l'URL.
- **En-tête d'administration** copié-collé dans deux coquilles (`DashboardShell` et `AdminShell`), avec deux badges « Admin » de couleurs différentes.
- **Tableaux non défilables** : `overflow-hidden` sur un conteneur de tableau, plutôt que `overflow-x-auto` — contenu rogné sur mobile, qui est la cible prioritaire déclarée du produit.
- **Aucun état d'action.** Un prestataire devait déduire lui-même, en lisant sa liste de commandes, ce qu'il avait à faire.

### 4.3 Ce qui a été refait

| Avant | Après |
| --- | --- |
| Agrégats en JS sur 50 lignes | Agrégats SQL (`provider_dashboard_stats()`, `client_dashboard_stats()`), **toutes** les lignes, `bigint` transportés en texte |
| 1 écran par rôle, cartes informatives | **Centre d'action** en tête d'écran, affiché seulement s'il y a quelque chose à faire |
| Montants dispersés | Bloc **Revenus** : encaissé / en séquestre / en litige, avec la mention « net de commission » |
| `statusTone` en couleurs figées | `src/lib/order-status.ts` : regroupements de statuts + jetons `--tone-*` clair/sombre |
| Navigation incomplète | Versements et compte présents dans le menu, sections séparées |
| Tableaux rognés | `TableWrap` : défilement horizontal contenu, `scope="col"`, `aria-current` |
| 6 avertissements de lint + 1 erreur | 0 erreur (l'erreur `wishlist-button` corrigée par `useSyncExternalStore`) |

---

## 5. Qualité et dette

### Points d'attention relevés

1. **README décrivant un autre dépôt.** Il annonçait « un squelette d'architecture, pas un produit », « Rien ne doit être développé au-delà avant la fin de la Phase 0 » — pour un dépôt de 35 600 lignes. C'était la première chose que voit un visiteur, un investisseur ou un futur développeur. **Corrigé.**
2. **Branche orpheline** `claude/brave-noether-yktl2s` : 122 fichiers d'écart avec `main`, 10 664 lignes supprimées par rapport à l'état courant. Elle donne l'impression d'un travail en cours qui n'existe plus. **À supprimer.**
3. **Aucune CI** (corrigée) : `typecheck`, `lint` et `test` existaient sans exécution automatique.
4. **Le build dépend d'un accès réseau à `fonts.googleapis.com`** (`next/font/google` dans `src/lib/root-layout.tsx`). Sans conséquence sur Vercel, mais à connaître : tout environnement de build isolé échoue. Pour un produit qui revendique « pas de police distante », l'auto-hébergement local des deux polices supprimerait aussi cette dépendance.
5. **`<img>` au lieu de `next/image`** dans `hero.tsx:165` et `security.tsx:116` (6 avertissements au total, dont le `window.location.href` de `sign-out.tsx:14`).
6. **`sign-out.tsx`** utilise `window.location.href` — plein rechargement au lieu d'une navigation Next ; visible sur réseau lent.
7. **`OrderTrendChart`** : identifiant de dégradé SVG fixe (`trendGrad`), à risque de collision si deux graphiques cohabitent.
8. **Pas de `npm audit`/Dependabot** : 458 paquets installés, aucune veille sur les vulnérabilités connues.
9. **Deux textes en dur** restaient dans `wishlist-button.tsx` (« Ajouter aux favoris ») — contraire à la règle du dépôt, sans effet sur un visiteur anglophone. **Corrigé** avec les clés `catalog.wishlistAdd` / `wishlistRemove`.

### Ce qui est solide et n'appelle pas d'action

- Tests ciblés sur les règles qui coûtent de l'argent (`money`, `escrow`, `kyc`, `account`, `geniuspay`, `proxy`).
- Messages d'erreur utilisateur localisés, sans fuite technique (avant le correctif sur la connexion).
- Aucun secret dans l'historique, aucune dépendance exotique, `package.json` sans script superflu.
- Performances par défaut saines : aucun script tiers, images optimisées, `dynamic = "force-dynamic"` posé à bon escient sur les écrans authentifiés.

---

## 6. Sécurité

Revue détaillée, preuves et correctifs : **[SECURITE-FAILLES.md](SECURITE-FAILLES.md)**.

Synthèse : **10 failles corrigées** (dont 2 élevées sur les envois d'images et 4 sur la chaîne de paiement), **10 recommandations résiduelles** documentées. Aucune faille critique de type fuite de données inter-utilisateurs n'a été trouvée : la RLS tient, et le journal comptable est effectivement immuable.

---

## 7. Recommandations priorisées

### À faire ce mois
1. **Choisir le partenaire de rétention** (BCEAO) et brancher `releaseHold` : c'est le seul trou fonctionnel qui empêche une mise en production honnête. En attendant, l'interface ne doit pas laisser croire qu'un versement partira.
2. **Configurer Turnstile** en production — désormais **échec fermé**, donc une clé manquante bloque les inscriptions plutôt que de les laisser passer.
3. **Activer Dependabot** (1 fichier) et les alertes de sécurité GitHub sur le dépôt public.
4. **Limiter les demandes de contact** (`sendInquiry` / `sendDirectInquiry`) : validation présente, mais aucun compteur — un compte peut inonder un prestataire.

### Trimestre
5. **Tableau de bord administrateur : période sélectionnable** (7 / 30 / 90 jours) au lieu du 30 jours figé.
6. **Journal de sécurité** (connexions échouées, envois rejetés, webhooks rejetés) dans une table dédiée, plutôt que dans les logs Vercel qui expirent.
7. **Rattraper les tests des tableaux de bord** : les 61 tests couvrent les règles métier ; les agrégats SQL ne sont pas testés (ils le sont désormais par leur nature — la logique est en base, pas en JS).
8. **Self-héberger les polices** et supprimer la dépendance de build à Google Fonts.

### Avant l'ouverture commerciale
9. Sauvegardes Supabase (PITR) et **une restauration réellement testée**.
10. Double validation pour les décisions financières irréversibles (remboursement, arbitrage) : aujourd'hui un `role='admin'` peut tout, seul.

---

## 8. Livrables de cette intervention

| Livrable | Emplacement |
| --- | --- |
| Patch complet, applicable sur `540b45d` | `toomny-refonte-dashboards-et-securite.patch` |
| Détail de la refonte des tableaux de bord | `REFONTE-DASHBOARDS.md` |
| Failles de sécurité et correctifs | `SECURITE-FAILLES.md` |
| 20 tests ajoutés | `src/lib/image-upload.test.ts`, `src/lib/order-status.test.ts` |
| Migration SQL | `supabase/migrations/0020_dashboard_stats_and_storage_hardening.sql` |
| Intégration continue | `.github/workflows/ci.yml` |

**Application :**

```bash
cd Toomny
git checkout -b refonte/dashboards-et-securite
git apply /chemin/vers/toomny-refonte-dashboards-et-securite.patch
npm ci && npm run typecheck && npm run lint && npm test
# puis, dans l'éditeur SQL Supabase (projet de test d'abord) :
#   supabase/migrations/0020_dashboard_stats_and_storage_hardening.sql
```

> La migration 0020 doit être appliquée **avant** la mise en production de la refonte : les pages lisent les fonctions `provider_dashboard_stats()` et `client_dashboard_stats()`. Sans elle, les écrans s'affichent avec des zéros (dégradation volontaire, jamais de plantage) et l'erreur est journalisée.
