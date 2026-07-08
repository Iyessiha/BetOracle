/**
 * BETORACL PRO — UI Engine
 * Gestion des logos, images, drapeaux, bookmakers
 * Toutes les images sont issues de CDNs publics GRATUITS
 */

// ══════════════════════════════════════════════════
// CLUBS — api-sports.io CDN (gratuit, sans quota)
// ══════════════════════════════════════════════════
const CLUBS = {
  'Real Madrid':     { id: 541,  flag: 'es', color: '#FEBE10' },
  'PSG':             { id: 85,   flag: 'fr', color: '#003087' },
  'Man City':        { id: 50,   flag: 'gb', color: '#6CABDD' },
  'Manchester City': { id: 50,   flag: 'gb', color: '#6CABDD' },
  'Arsenal':         { id: 42,   flag: 'gb', color: '#EF0107' },
  'Chelsea':         { id: 49,   flag: 'gb', color: '#034694' },
  'Liverpool':       { id: 40,   flag: 'gb', color: '#C8102E' },
  'Man United':      { id: 33,   flag: 'gb', color: '#DA291C' },
  'Tottenham':       { id: 47,   flag: 'gb', color: '#132257' },
  'Barcelona':       { id: 529,  flag: 'es', color: '#A50044' },
  'Barça':           { id: 529,  flag: 'es', color: '#A50044' },
  'Atletico Madrid': { id: 530,  flag: 'es', color: '#CB3524' },
  'Atlético':        { id: 530,  flag: 'es', color: '#CB3524' },
  'Sevilla':         { id: 536,  flag: 'es', color: '#D4210E' },
  'Inter Milan':     { id: 505,  flag: 'it', color: '#010E80' },
  'Inter':           { id: 505,  flag: 'it', color: '#010E80' },
  'Juventus':        { id: 496,  flag: 'it', color: '#000000' },
  'AC Milan':        { id: 489,  flag: 'it', color: '#FB090B' },
  'Napoli':          { id: 492,  flag: 'it', color: '#12A0C3' },
  'Roma':            { id: 497,  flag: 'it', color: '#8E1C31' },
  'Bayern Munich':   { id: 157,  flag: 'de', color: '#DC052D' },
  'Bayern':          { id: 157,  flag: 'de', color: '#DC052D' },
  'Dortmund':        { id: 165,  flag: 'de', color: '#FDE100' },
  'Leipzig':         { id: 173,  flag: 'de', color: '#1B264F' },
  'Lyon':            { id: 80,   flag: 'fr', color: '#1B255B' },
  'Marseille':       { id: 81,   flag: 'fr', color: '#009FC7' },
  'Monaco':          { id: 91,   flag: 'fr', color: '#D4021D' },
  'Lens':            { id: 116,  flag: 'fr', color: '#FFCD00' },
  'Lille':           { id: 79,   flag: 'fr', color: '#EF0024' },
  'Porto':           { id: 212,  flag: 'pt', color: '#005B99' },
  'Benfica':         { id: 211,  flag: 'pt', color: '#D4021D' },
  'Ajax':            { id: 194,  flag: 'nl', color: '#D2122E' },
  'PSV':             { id: 197,  flag: 'nl', color: '#C03028' },
};

const LEAGUES = {
  'Champions League': { id: 2,   emoji: '🏆' },
  'Premier League':   { id: 39,  emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'Ligue 1':          { id: 61,  emoji: '🇫🇷' },
  'La Liga':          { id: 140, emoji: '🇪🇸' },
  'Bundesliga':       { id: 78,  emoji: '🇩🇪' },
  'Serie A':          { id: 135, emoji: '🇮🇹' },
  'Europa League':    { id: 3,   emoji: '🌍' },
  'Ligue 1 CI':       { id: null, emoji: '🇨🇮' },
  'NPFL Nigeria':     { id: null, emoji: '🇳🇬' },
};

// URL logo club (api-sports.io CDN — gratuit sans clé)
function clubLogo(idOrName) {
  const id = typeof idOrName === 'number' ? idOrName : CLUBS[idOrName]?.id;
  return id ? `https://media.api-sports.io/football/teams/${id}.png` : null;
}

// URL logo ligue
function leagueLogo(idOrName) {
  const id = typeof idOrName === 'number' ? idOrName : LEAGUES[idOrName]?.id;
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}

// URL drapeau (flagcdn.com — gratuit)
function flagUrl(code, size = '32x24') {
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}

// ══════════════════════════════════════════════════
// CRÉER UNE IMAGE AVEC FALLBACK AUTOMATIQUE
// ══════════════════════════════════════════════════
function makeImg(src, alt, cls = '', fallbackEl = null) {
  if (!src) return fallbackEl || makeInitials(alt, cls);
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = cls;
  img.loading = 'lazy';
  img.onerror = function() {
    const fb = fallbackEl || makeInitials(alt, cls);
    this.replaceWith(fb);
  };
  return img;
}

// Fallback initiales colorées
function makeInitials(name, cls = '') {
  const span = document.createElement('span');
  span.className = cls + ' logo-init';
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  span.textContent = initials;
  // Couleur de fond basée sur les données club
  const club = CLUBS[name];
  if (club?.color) {
    span.style.background = club.color + '22';
    span.style.color = club.color;
    span.style.border = `1px solid ${club.color}44`;
  }
  return span;
}

// Logo club complet (img + fallback initiales)
function clubLogoImg(name, cls = 'team-logo') {
  const data = CLUBS[name];
  const src = data ? clubLogo(data.id) : null;
  return makeImg(src, name, cls, makeInitials(name, cls));
}

// Logo ligue complet
function leagueLogoImg(name, cls = 'league-logo') {
  const data = LEAGUES[name];
  const src = data ? leagueLogo(data.id) : null;
  return makeImg(src, name, cls, makeInitials(name, cls));
}

// Drapeau img
function flagImg(code, alt = '', cls = 'flag-img') {
  const img = document.createElement('img');
  img.src = flagUrl(code);
  img.alt = alt;
  img.className = cls;
  img.width = 24;
  img.height = 18;
  img.onerror = () => img.remove();
  return img;
}

// ══════════════════════════════════════════════════
// PHOTO DE STADE (Unsplash — gratuit)
// ══════════════════════════════════════════════════
const STADIUM_IDS = [
  'photo-1489944440615-453fc2b6a9a9', // Bernabeu night
  'photo-1508098682722-e99c43a406b2', // pitch green
  'photo-1543326727-cf6c39e8f84c', // stadium inside
  'photo-1574629810360-7efbbe195018', // tribunes
  'photo-1459865264687-595d652de67e', // empty stadium
];

function stadiumUrl(idx = 0, w = 1920, q = 75) {
  const id = STADIUM_IDS[idx % STADIUM_IDS.length];
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=${q}`;
}

// ══════════════════════════════════════════════════
// LOGOS BOOKMAKERS (SVG inline — zéro dépendance)
// ══════════════════════════════════════════════════
const BK_LOGOS = {
  '1XBET': `<svg viewBox="0 0 80 24" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="18" font-family="Arial Black,sans-serif" font-size="16" font-weight="900" fill="#FF6B00">1X</text>
    <text x="38" y="18" font-family="Arial Black,sans-serif" font-size="16" font-weight="900" fill="#ffffff">BET</text>
  </svg>`,
  'BETWINNER': `<svg viewBox="0 0 110 24" xmlns="http://www.w3.org/2000/svg">
    <rect width="110" height="24" rx="4" fill="#1a1a2e"/>
    <text x="6" y="17" font-family="Arial Black,sans-serif" font-size="12" font-weight="900" fill="#FFD700">BET</text>
    <text x="42" y="17" font-family="Arial Black,sans-serif" font-size="12" font-weight="900" fill="#fff">WINNER</text>
  </svg>`,
  'MEGAPARI': `<svg viewBox="0 0 100 24" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="18" font-family="Arial Black,sans-serif" font-size="14" font-weight="900" fill="#E53935">MEGA</text>
    <text x="54" y="18" font-family="Arial Black,sans-serif" font-size="14" font-weight="900" fill="#fff">PARI</text>
  </svg>`,
  '1WIN': `<svg viewBox="0 0 70 24" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="18" font-family="Arial Black,sans-serif" font-size="16" font-weight="900" fill="#4FC3F7">1</text>
    <text x="20" y="18" font-family="Arial Black,sans-serif" font-size="16" font-weight="900" fill="#fff">WIN</text>
  </svg>`,
  '888STARZ': `<svg viewBox="0 0 90 24" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="18" font-family="Arial Black,sans-serif" font-size="13" font-weight="900" fill="#FFD700">888</text>
    <text x="42" y="18" font-family="Arial Black,sans-serif" font-size="13" font-weight="900" fill="#fff">STARZ</text>
  </svg>`,
};

// ══════════════════════════════════════════════════
// INITIALISATION — injecte tout au chargement
// ══════════════════════════════════════════════════
function init() {
  injectHeroBg();
  injectLockCard();
  injectMatchStrip();
  injectLeaguePills();
  injectBookmakers();
  injectNavLogo();
}

// Fond stade hero
function injectHeroBg() {
  const stadium = document.querySelector('.hero-stadium');
  if (!stadium) return;
  const bg = stadiumUrl(0, 1920, 70);
  stadium.style.backgroundImage = [
    'radial-gradient(ellipse 80% 60% at 50% 100%,rgba(26,92,42,.5) 0%,transparent 70%)',
    'radial-gradient(ellipse 60% 40% at 50% 60%,rgba(34,197,94,.07) 0%,transparent 60%)',
    'linear-gradient(180deg,rgba(6,10,6,.3) 0%,rgba(6,10,6,.65) 55%,#060a06 100%)',
    `url(${bg})`
  ].join(',');
  stadium.style.backgroundSize = 'cover';
  stadium.style.backgroundPosition = 'center 35%';
}

// Logos dans la lock card (Real Madrid vs PSG)
function injectLockCard() {
  const la = document.getElementById('lock-logo-a');
  const lb = document.getElementById('lock-logo-b');
  if (la) { la.innerHTML = ''; la.appendChild(clubLogoImg('Real Madrid', 'lc-logo')); }
  if (lb) { lb.innerHTML = ''; lb.appendChild(clubLogoImg('PSG', 'lc-logo')); }

  // Fond stade sur la lock card header
  const lcHeader = document.querySelector('.lc-header');
  if (lcHeader) {
    lcHeader.style.backgroundImage = [
      'linear-gradient(135deg,rgba(26,92,42,.9) 0%,rgba(34,197,94,.25) 100%)',
      `url(${stadiumUrl(2, 800, 60)})`
    ].join(',');
    lcHeader.style.backgroundSize = 'cover';
    lcHeader.style.backgroundPosition = 'center';
  }
}

// Logos dans le strip de matchs du hero
function injectMatchStrip() {
  const matchData = [
    { a: 'PSG',           b: 'Marseille',      league: 'Ligue 1',        time: '20:45', ia: '82%' },
    { a: 'Dortmund',      b: 'Bayern',          league: 'Bundesliga',     time: '19:45', ia: '78%' },
    { a: 'Arsenal',       b: 'Chelsea',         league: 'Premier League', time: '20:30', ia: '65%' },
    { a: 'Real Madrid',   b: 'PSG',             league: 'UCL',            time: '21:00', ia: '71%' },
    { a: 'Inter',         b: 'Juventus',        league: 'Serie A',        time: '20:45', ia: '60%' },
    { a: 'Barça',         b: 'Atletico Madrid', league: 'La Liga',        time: '21:00', ia: '67%' },
    { a: 'Man City',      b: 'Liverpool',       league: 'Premier League', time: '16:30', ia: '73%' },
  ];

  const pills = document.querySelectorAll('.match-pill');
  pills.forEach((pill, i) => {
    const d = matchData[i % matchData.length];
    if (!d) return;

    const logoRow = document.createElement('div');
    logoRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px';

    const imgA = clubLogoImg(d.a, 'mp-logo');
    const imgB = clubLogoImg(d.b, 'mp-logo');
    const leagueImg = leagueLogoImg(d.league, 'mp-league-logo');

    logoRow.appendChild(imgA);
    logoRow.appendChild(imgB);
    logoRow.appendChild(leagueImg);

    const teamsDiv = pill.querySelector('.mp-teams');
    if (teamsDiv) {
      // Mettre à jour le texte
      teamsDiv.textContent = `${d.a} vs ${d.b}`;
      teamsDiv.before(logoRow);
    }

    // Mettre à jour le temps
    const timeDiv = pill.querySelector('.mp-time');
    if (timeDiv) timeDiv.textContent = `${d.time} · ${d.league}`;

    // Mettre à jour le badge IA
    const iaDiv = pill.querySelector('.mp-ia');
    if (iaDiv) iaDiv.textContent = d.ia + ' IA';
  });
}

// Logos dans les pills de ligues
function injectLeaguePills() {
  const pills = document.querySelectorAll('.league-pill');
  const leagueData = [
    { name: 'Champions League', id: 2  },
    { name: 'Premier League',   id: 39 },
    { name: 'Ligue 1',          id: 61 },
    { name: 'La Liga',          id: 140 },
    { name: 'Bundesliga',       id: 78 },
    { name: 'Serie A',          id: 135 },
    { name: 'Europa League',    id: 3  },
    { name: 'Ligue 1 CI',       id: null },
    { name: 'NPFL Nigeria',     id: null },
    { name: 'CAN Afrique',      id: null },
    { name: 'NBA',              id: null },
    { name: 'Liga Portugal',    id: null },
  ];

  pills.forEach((pill, i) => {
    const d = leagueData[i];
    if (!d || !d.id) return;
    const flagSpan = pill.querySelector('span:first-child');
    if (!flagSpan) return;
    const logo = makeImg(leagueLogo(d.id), d.name, 'league-pill-logo');
    flagSpan.replaceWith(logo);
  });
}

// Vrais logos bookmakers (SVG + fond coloré)
function injectBookmakers() {
  const bkCards = document.querySelectorAll('.bk-c');
  const bkData = [
    { name: '1XBET',     bg: '#FF6B00', key: '1XBET' },
    { name: 'BETWINNER', bg: '#1a3a6e', key: 'BETWINNER' },
    { name: 'MEGAPARI',  bg: '#1a0000', key: 'MEGAPARI' },
    { name: '1Win',      bg: '#0d1b2a', key: '1WIN' },
    { name: '888starz',  bg: '#1a1200', key: '888STARZ' },
  ];

  bkCards.forEach((card, i) => {
    const d = bkData[i];
    if (!d) return;

    // Ajouter une bande de couleur en haut + SVG logo
    card.style.borderTop = `3px solid ${d.bg}`;

    const nameEl = card.querySelector('.bk-name');
    if (!nameEl) return;

    // Remplacer le texte par un conteneur avec couleur
    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = `height:28px;display:flex;align-items:center;justify-content:center;margin-bottom:2px`;
    svgWrap.innerHTML = BK_LOGOS[d.key] || '';
    const svgEl = svgWrap.querySelector('svg');
    if (svgEl) { svgEl.style.height = '24px'; svgEl.style.width = 'auto'; }
    nameEl.replaceWith(svgWrap);

    // Ajouter un badge bonus stylisé
    const bonusEl = card.querySelector('.bk-bonus');
    if (bonusEl) {
      bonusEl.style.cssText = `font-size:12px;font-weight:700;color:${d.bg};padding:3px 10px;background:${d.bg}18;border-radius:20px;border:1px solid ${d.bg}44`;
    }
  });
}

// Améliorer le logo nav avec une vraie orbe
function injectNavLogo() {
  const badges = document.querySelectorAll('.logo-badge');
  badges.forEach(badge => {
    if (badge.textContent.trim() === 'B') {
      badge.textContent = '';
      badge.style.cssText += ';font-size:20px;overflow:visible;';
      badge.textContent = '🔮';
    }
  });
}

// CSS additionnel injecté dynamiquement
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .team-logo, .lc-logo {
      width: 40px; height: 40px; border-radius: 50%;
      object-fit: contain; background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1); padding: 4px;
      flex-shrink: 0;
    }
    .mp-logo {
      width: 22px; height: 22px; border-radius: 50%;
      object-fit: contain; background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.1); padding: 2px;
      flex-shrink: 0;
    }
    .mp-league-logo {
      width: 16px; height: 16px; object-fit: contain;
      margin-left: 2px; opacity: 0.7; flex-shrink: 0;
    }
    .league-pill-logo {
      width: 24px; height: 24px; object-fit: contain;
      flex-shrink: 0;
    }
    .logo-init {
      width: 40px; height: 40px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Bebas Neue', sans-serif; font-size: 15px;
      letter-spacing: .04em; background: rgba(34,197,94,.08);
      border: 1px solid rgba(34,197,94,.2); color: var(--gb, #22c55e);
      flex-shrink: 0;
    }
    .lc-logo.logo-init { width: 40px; height: 40px; font-size: 15px; }
    .mp-logo.logo-init { width: 22px; height: 22px; font-size: 9px; }
    .flag-img { border-radius: 2px; vertical-align: middle; }
    .league-pill-logo.logo-init {
      width: 24px; height: 24px; font-size: 9px;
      background: rgba(255,255,255,.06); color: rgba(255,255,255,.4);
      border-color: rgba(255,255,255,.1);
    }
  `;
  document.head.appendChild(style);
}

// Lancer tout au chargement
document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  init();
});

// Exporter pour usage externe
window.BetOraclUI = {
  CLUBS, LEAGUES, clubLogo, leagueLogo, flagUrl,
  clubLogoImg, leagueLogoImg, flagImg, makeImg, makeInitials,
  stadiumUrl, BK_LOGOS, init
};
