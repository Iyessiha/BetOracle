#!/bin/bash
# ══════════════════════════════════════════════════════
#  Betoracle Pro — Script de déploiement GitHub
#  Usage : bash deploy.sh [TON_USERNAME_GITHUB]
#  Exemple : bash deploy.sh yessiha-ilboudo
# ══════════════════════════════════════════════════════

set -e

# ── COULEURS ──
GREEN='\033[0;32m'
GOLD='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${GOLD}${BOLD}🔮 BETORACLE PRO — Déploiement GitHub${NC}"
echo -e "${GOLD}══════════════════════════════════════${NC}"
echo ""

# ── VÉRIFICATION ARGUMENTS ──
GITHUB_USER="${1:-}"
REPO_NAME="betoracle-pro"

if [ -z "$GITHUB_USER" ]; then
  echo -e "${RED}❌ Usage : bash deploy.sh TON_USERNAME_GITHUB${NC}"
  echo -e "   Exemple : ${GOLD}bash deploy.sh yessiha-ilboudo${NC}"
  exit 1
fi

REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo -e "👤 Utilisateur GitHub : ${BOLD}${GITHUB_USER}${NC}"
echo -e "📦 Dépôt              : ${BOLD}${REPO_URL}${NC}"
echo ""

# ── VÉRIFICATION GIT ──
if ! command -v git &> /dev/null; then
  echo -e "${RED}❌ Git n'est pas installé.${NC}"
  echo "   Installe-le sur : https://git-scm.com/"
  exit 1
fi

echo -e "${GREEN}✓ Git disponible${NC}"

# ── INIT GIT ──
if [ ! -d ".git" ]; then
  echo -e "\n📁 Initialisation du dépôt Git..."
  git init
  git branch -M main
  echo -e "${GREEN}✓ Dépôt initialisé${NC}"
else
  echo -e "${GREEN}✓ Dépôt Git existant détecté${NC}"
fi

# ── CONFIGURATION GIT ──
echo -e "\n⚙️  Configuration Git..."
git config user.name "MonWe Infinity LLC" 2>/dev/null || true
git config user.email "monweci@gmail.com" 2>/dev/null || true

# ── REMOTE ──
if git remote get-url origin &>/dev/null; then
  echo -e "${GREEN}✓ Remote 'origin' déjà configuré${NC}"
else
  git remote add origin "$REPO_URL"
  echo -e "${GREEN}✓ Remote ajouté : ${REPO_URL}${NC}"
fi

# ── ADD & COMMIT ──
echo -e "\n📝 Préparation des fichiers..."
git add -A

# Vérifier s'il y a des changements
if git diff --cached --quiet; then
  echo -e "${GOLD}⚠️  Aucun changement à committer${NC}"
else
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M")
  git commit -m "feat: Betoracle Pro v1.0 — ${TIMESTAMP}

- Landing page + funnel 3 étapes (signup, welcome, analyse)
- Mécanisme curiosity gate (85% verrouillé)
- Programme de parrainage avec lien auto-généré
- CGU MonWe Infinity LLC
- Gestionnaire logos clubs (api-sports.io + flagcdn)
- Photos stades Unsplash
- Responsive mobile
- Plans : Free / Starter 500F / Pro 1000F / Elite 2000F"
  echo -e "${GREEN}✓ Commit créé${NC}"
fi

# ── PUSH ──
echo -e "\n🚀 Push vers GitHub..."
echo -e "${GOLD}   → Il te sera demandé tes identifiants GitHub${NC}"
echo -e "${GOLD}   → Utilise un Personal Access Token comme mot de passe${NC}"
echo -e "${GOLD}   → Créer un token : https://github.com/settings/tokens/new${NC}"
echo ""

git push -u origin main

echo ""
echo -e "${GREEN}${BOLD}✅ DÉPLOIEMENT RÉUSSI !${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "🌐 Ton dépôt : ${BOLD}${REPO_URL}${NC}"
echo ""
echo -e "${GOLD}${BOLD}🎯 PROCHAINES ÉTAPES :${NC}"
echo ""
echo -e "  1️⃣  ${BOLD}GitHub Pages (gratuit)${NC}"
echo -e "     → Settings → Pages → Source: main/public"
echo -e "     → URL : https://${GITHUB_USER}.github.io/${REPO_NAME}/"
echo ""
echo -e "  2️⃣  ${BOLD}Netlify (recommandé - plus rapide)${NC}"
echo -e "     → https://app.netlify.com/drop"
echo -e "     → Glisse-dépose le dossier /public"
echo -e "     → URL gratuite : https://betoracle-pro.netlify.app"
echo ""
echo -e "  3️⃣  ${BOLD}Domaine personnalisé${NC}"
echo -e "     → betoracle.pro / betoracle.app / betoracle.ci"
echo ""
echo -e "${GREEN}🔮 Betoracle Pro est en ligne !${NC}"
echo ""
