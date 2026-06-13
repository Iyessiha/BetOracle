# Funnel de conversion — Betoracle Pro

## Vue d'ensemble

```
Landing Page (index.html)
        │
        ▼ CTA "Commencer gratuit"
Inscription (signup.html)        [ÉTAPE 1]
        │
        ▼ Soumission formulaire
Bienvenue + Parrainage (welcome.html)  [ÉTAPE 2]
        │
        ▼ "Lancer ma première analyse"
Analyse Match (analyse.html)     [ÉTAPE 3]
        │
        ▼ Mur verrouillé (85%)
Plans & Paiement (index.html#plans)
```

---

## Étape 1 — Inscription (signup.html)

### Objectif
Capturer l'email + numéro Mobile Money + plan choisi.

### Leviers de conversion
- **Split-screen** : pitch hero à gauche (témoignage + stats), formulaire à droite
- **Plan selector** intégré au formulaire : l'utilisateur choisit Free ou Pro *avant* de créer son compte → ancrage psychologique
- **Champ parrainage** : capture du code référent si venu par un lien de parrainage
- **Social proof** : 3 200+ parieurs, 4,8/5 étoiles visible dès l'atterrissage
- **Reassurance** : sans engagement, données sécurisées, plan gratuit à vie

### Données collectées
- Prénom, Nom
- E-mail (identifiant principal)
- Téléphone (Mobile Money pour paiement)
- Mot de passe
- Code parrainage (optionnel)
- Plan initial choisi (Free / Pro)

### Stockage session
```js
sessionStorage.setItem('bp_prenom', prenom)
sessionStorage.setItem('bp_plan', 'free' | 'pro')
```

---

## Étape 2 — Bienvenue + Parrainage (welcome.html)

### Objectif
1. Féliciter → créer un moment émotionnel positif
2. Activer le programme de parrainage immédiatement
3. Upsell plan Pro avant la première analyse

### Leviers de conversion
- **Personnalisation** : "SALUT [PRENOM], BIENVENUE SUR BETORACLE PRO" (prénom depuis sessionStorage)
- **Programme parrainage** avec lien copier-coller généré automatiquement
  - 10 filleuls → 1 mois Starter offert
  - 50 filleuls → 3 mois Pro offerts
  - 200 filleuls → 500 000 FCFA cash
- **Partage 1-clic** WhatsApp et Telegram
- **Upsell Pro** : carte "Débloque encore plus avec Pro" → "Passer à Pro" / "Rester en Free"
- **Next steps** : checklist visuelle des prochaines actions

### Code de parrainage
Généré côté client à la création de compte :
```js
// Format : ORCl-XXXXXX (6 chars alphanumériques)
sessionStorage.setItem('bp_refcode', code)
```
⚠️ À remplacer par une génération côté serveur en production.

---

## Étape 3 — Mur d'analyse (analyse.html)

### Objectif
Déclencher la conversion par la curiosité (curiosity gap).

### Mécanique
1. L'utilisateur arrive, voit le **loader** "L'Oracle analyse…" (2s, 5 étapes animées)
2. Résultat : **15% de l'analyse visible** (forme récente, 3 stats basiques)
3. **85% floutés** derrière l'orbe dorée avec liste de ce qui est caché
4. Confiance Oracle affichée : 87%
5. Deux plans mini (Starter / Pro) + CTA "Débloquer l'analyse complète"

### Éléments visibles (gratuits)
- Forme récente 5 matchs (V/N/D) des deux équipes
- Probabilités 1X2 basiques (%)
- BTTS et Over 2.5

### Éléments verrouillés (payants)
- Probabilités exactes avec intervalles de confiance
- Score IA estimé
- 3 scénarios complets (A gagne, nul, B gagne)
- Détection de matchs pièges
- Niveau de risque
- Value bet détecté + cote recommandée

### Navigation
- Barre de navigation sticky avec **plan actif** affiché et bouton "Débloquer" toujours visible
- Strip de matchs rapides pour changer de match
- Barre de recherche réutilisable

---

## Métriques à suivre

| Étape | Métrique clé | Objectif |
|-------|-------------|---------|
| Landing → Signup | Taux de clic CTA | > 8% |
| Signup → Welcome | Taux de complétion formulaire | > 60% |
| Welcome → Analyse | Clic "Lancer ma première analyse" | > 80% |
| Analyse → Paiement | Clic "Débloquer" | > 25% |
| Paiement → Conversion | Taux de paiement complété | > 40% |

---

## Notes techniques

- **sessionStorage** : données utilisateur (prénom, plan, code ref) persistent pendant la session
- **Pas de backend** actuellement : toutes les pages sont statiques HTML/CSS/JS
- **Logos clubs** : via `api-sports.io` CDN (hors quota, gratuit)
- **Fallback logos** : initiales du club si image non disponible
- **Responsive** : breakpoint à 860px (mobile-first sur le formulaire)
