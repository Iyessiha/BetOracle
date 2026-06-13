# 🔮 Betoracle Pro

> **L'oracle des paris foot** — Plateforme d'aide à la décision pour les parieurs sérieux d'Afrique de l'Ouest et du monde entier.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Made with HTML](https://img.shields.io/badge/Made%20with-HTML%2FCSS%2FJS-orange.svg)]()
[![Owner: MonWe Infinity LLC](https://img.shields.io/badge/Owner-MonWe%20Infinity%20LLC-blue.svg)]()

---

## 🌐 Aperçu

Betoracle Pro est un produit de **MonWe Infinity LLC**. Il combine :

- 🧠 **L'Oracle IA** — moteur de prédiction entraîné sur 500 000+ matchs
- 📊 **12 outils d'analyse** — Stats 1X2, Value Bet, Kelly, H2H, alertes live
- 💰 **Gestion de bankroll** — Calcul Kelly automatique, ROI tracker
- 📱 **Bot Telegram** — Coupon du jour à 08h00, sans intervention
- 🌍 **55+ championnats** — dont MTN Ligue 1 CI, NPFL Nigeria, CAN Afrique

---

## 📁 Structure du projet

```
betoracle-pro/
├── public/                 # Pages HTML (frontend statique)
│   ├── index.html          # Landing page principale
│   ├── signup.html         # Page d'inscription (étape 1 funnel)
│   ├── welcome.html        # Bienvenue + parrainage (étape 2)
│   ├── analyse.html        # Mur d'analyse / curiosity gate (étape 3)
│   └── cgu.html            # Conditions Générales d'Utilisation
├── assets/
│   ├── js/
│   │   └── logos.js        # Gestionnaire logos clubs, ligues, drapeaux
│   ├── css/                # (futurs fichiers CSS partagés)
│   └── images/             # (futurs assets locaux)
├── docs/
│   └── FUNNEL.md           # Documentation du funnel de conversion
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Funnel de conversion

```
Landing (index.html)
       ↓
  Inscription (signup.html)          ← Plan selector dès l'inscription
       ↓
  Bienvenue + Parrainage (welcome.html) ← Lien ref copier-coller + upsell Pro
       ↓
  Analyse match (analyse.html)       ← 85% verrouillé → curiosity gate
       ↓
  Paiement → Plans (index.html#plans)
```

---

## 🖼️ Sources images & logos

| Source | Usage | Clé requise |
|--------|-------|-------------|
| `media.api-sports.io/football/teams/{id}.png` | Logos clubs | Non (gratuit hors quota) |
| `media.api-sports.io/football/leagues/{id}.png` | Logos ligues | Non |
| `flagcdn.com/{code}.svg` | Drapeaux pays | Non |
| `images.unsplash.com` | Photos stades HD | Non |
| `thesportsdb.com` | Photos joueurs/stades | Non (CC BY-SA) |

### IDs clubs principaux (api-sports.io)

| Club | ID |
|------|----|
| Real Madrid | 541 |
| PSG | 85 |
| Arsenal | 42 |
| Chelsea | 49 |
| Manchester City | 50 |
| Bayern Munich | 157 |
| Dortmund | 165 |
| Barcelona | 529 |
| Atletico Madrid | 530 |
| Inter Milan | 505 |
| Juventus | 496 |
| AC Milan | 489 |

---

## ⚙️ Installation locale

```bash
# Cloner le dépôt
git clone https://github.com/TON_USERNAME/betoracle-pro.git
cd betoracle-pro

# Lancer un serveur local (Python)
cd public && python3 -m http.server 8000

# OU avec Node.js
npx serve public

# Ouvrir dans le navigateur
# → http://localhost:8000
```

---

## 🚢 Déploiement

### Netlify (recommandé — gratuit)
```bash
npm run deploy:netlify
# OU glisser-déposer le dossier /public sur app.netlify.com/drop
```

### Vercel
```bash
npm run deploy:vercel
```

### GitHub Pages
```bash
npm run deploy:pages
```

---

## 📋 Plans tarifaires

| Plan | Semaine | Mois | Accès |
|------|---------|------|-------|
| Free | 0 FCFA | 0 FCFA | Coupon 1 sélection, bankroll basique |
| Starter | 500 FCFA | 1 500 FCFA | Coupon complet, stats 1X2 |
| Pro ⭐ | 1 000 FCFA | 3 000 FCFA | + Value Bet, Kelly, H2H, alertes |
| Elite | 2 000 FCFA | 6 000 FCFA | + L'Oracle IA, coaching |

---

## 🏢 Éditeur

**Betoracle Pro** est un produit de **MonWe Infinity LLC**

- Forme juridique : LLC, New Mexico, États-Unis
- N° dépôt SOS : 3213688
- Siège : 1209 Mountain Road PL NE, STE R — Albuquerque, NM 87110, USA
- Gérante : Yessiha Ilboudo
- Contact : monweci@gmail.com · +225 05 00 44 64 64

---

## ⚠️ Avertissement

Betoracle Pro est un **outil d'aide à la décision**, non une garantie de gains. Les paris sportifs comportent des risques financiers. Ne misez que ce que vous pouvez vous permettre de perdre. Voir [CGU](public/cgu.html) pour les détails.

---

## 📄 Licence

MIT — © 2026 MonWe Infinity LLC. Tous droits réservés.
