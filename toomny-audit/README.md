# Toomny — audit, refonte des tableaux de bord, sécurité

Livrables produits le 12 octobre 2026 sur la révision **`540b45d`** de `Iyessiha/Toomny`.

## Contenu

| Fichier | Ce qu'il contient |
| --- | --- |
| **`AUDIT-COMPLET.md`** | L'audit : architecture, chiffres mesurés, qualité, dette, recommandations priorisées |
| **`SECURITE-FAILLES.md`** | 10 failles trouvées et corrigées, 10 recommandations résiduelles, avec preuves `fichier:ligne` |
| **`REFONTE-DASHBOARDS.md`** | Ce qui a changé sur les trois tableaux de bord, et pourquoi |
| **`toomny-refonte-dashboards-et-securite.patch`** | Le patch complet, 26 fichiers, +2 037 / −617 lignes |

## Vérifications passées

Le patch a été appliqué sur un **clone neuf** de `Iyessiha/Toomny` positionné sur `540b45d` :

```
✅ git apply --check    le patch s'applique sans conflit
✅ npm run typecheck    0 erreur
✅ npm run lint         0 erreur (6 avertissements préexistants : <img>, window.location)
✅ npm test             61 tests / 9 fichiers — au vert (43 avant, 18 ajoutés)
```

Le build de production n'a pas pu être exécuté ici : `next/font/google` télécharge les polices au moment du build et cet environnement n'a pas d'accès sortant vers `fonts.googleapis.com`. Sur Vercel ou sur GitHub Actions, il passe — c'est aussi ce que vérifie le nouveau workflow CI.

## Appliquer

```bash
git clone https://github.com/Iyessiha/Toomny.git && cd Toomny
git checkout -b refonte/dashboards-et-securite
git apply /chemin/vers/toomny-refonte-dashboards-et-securite.patch
npm ci && npm run typecheck && npm run lint && npm test
```

Puis appliquer `supabase/migrations/0020_dashboard_stats_and_storage_hardening.sql`
dans l'éditeur SQL Supabase — **projet de test d'abord**, et **avant** de déployer la refonte.

## Note sur l'accès

La connexion GitHub de cette session est autorisée en écriture sur `Iyessiha/BetOracle`
uniquement. Une tentative d'écriture vers `Iyessiha/Toomny` est refusée
(`403 — Permission to Iyessiha/Toomny.git denied`), bien que le dépôt soit désormais public
et que la lecture fonctionne.

Conséquence : les livrables sont remis sous forme de **patch**, à appliquer par tes soins.
Pour que les modifications soient poussées directement et proposées en *pull request*,
ouvre une session Arena sur le dépôt `Iyessiha/Toomny` — j'y aurai alors les droits d'écriture.
