/**
 * BETORACLE PRO — Gestionnaire de logos et images
 * Sources : api-sports.io (logos clubs/ligues) + flagcdn.com (drapeaux) + thesportsdb.com (photos)
 * Tous les appels logos api-sports.io sont GRATUITS et hors quota
 */

const LOGOS = {
  /* ── CLUBS (api-sports.io CDN) ── */
  clubs: {
    // Champions League
    'Real Madrid':      { id: 541,  flag: 'es' },
    'PSG':              { id: 85,   flag: 'fr' },
    'Manchester City':  { id: 50,   flag: 'gb-eng' },
    'Bayern Munich':    { id: 157,  flag: 'de' },
    'Arsenal':          { id: 42,   flag: 'gb-eng' },
    'Chelsea':          { id: 49,   flag: 'gb-eng' },
    'Liverpool':        { id: 40,   flag: 'gb-eng' },
    'Barcelona':        { id: 529,  flag: 'es' },
    'Atletico Madrid':  { id: 530,  flag: 'es' },
    'Inter Milan':      { id: 505,  flag: 'it' },
    'Juventus':         { id: 496,  flag: 'it' },
    'AC Milan':         { id: 489,  flag: 'it' },
    'Dortmund':         { id: 165,  flag: 'de' },
    'Lyon':             { id: 80,   flag: 'fr' },
    'Marseille':        { id: 81,   flag: 'fr' },
    // Afrique
    'ASEC Mimosas':     { id: null, flag: 'ci', fallback: 'ASEC' },
    'Africa Sports':    { id: null, flag: 'ci', fallback: 'AS' },
  },

  /* ── LIGUES (api-sports.io CDN) ── */
  leagues: {
    'Champions League': 2,
    'Premier League':   39,
    'Ligue 1':         61,
    'La Liga':         140,
    'Bundesliga':      78,
    'Serie A':         135,
    'Europa League':   3,
    'Ligue 1 CI':      null,   // pas dans api-sports → on fallback sur drapeau CI
  },

  /* ── DRAPEAUX (flagcdn.com SVG) ── */
  flagUrl: (code) => `https://flagcdn.com/${code}.svg`,

  /* ── URL logo club ── */
  clubLogo: (id) => id ? `https://media.api-sports.io/football/teams/${id}.png` : null,

  /* ── URL logo ligue ── */
  leagueLogo: (id) => id ? `https://media.api-sports.io/football/leagues/${id}.png` : null,
};

/**
 * Crée un élément <img> avec fallback initiales si l'image ne charge pas
 * @param {string} src  - URL de l'image
 * @param {string} alt  - Texte alternatif
 * @param {string} fallback - Texte de fallback (initiales)
 * @param {string} cls  - Classes CSS
 */
function makeLogoImg(src, alt, fallback, cls = 'team-logo') {
  if (!src) return makeInitials(fallback || alt, cls);
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = cls;
  img.onerror = function() {
    const el = makeInitials(fallback || alt, cls);
    this.replaceWith(el);
  };
  return img;
}

/**
 * Fallback initiales pour les clubs sans logo
 */
function makeInitials(name, cls = 'team-logo') {
  const span = document.createElement('span');
  span.className = cls + ' logo-initials';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  span.textContent = initials;
  return span;
}

/**
 * Crée un <img> drapeau via flagcdn.com
 */
function makeFlagImg(countryCode, alt, cls = 'country-flag') {
  const img = document.createElement('img');
  img.src = `https://flagcdn.com/24x18/${countryCode}.png`;
  img.alt = alt;
  img.className = cls;
  img.width = 24;
  img.height = 18;
  img.onerror = () => img.remove();
  return img;
}

/**
 * Injecte les logos dans un élément de match
 * Usage : injectMatchLogos(el, 'Real Madrid', 'PSG')
 */
function injectMatchLogos(container, teamA, teamB) {
  const dataA = LOGOS.clubs[teamA];
  const dataB = LOGOS.clubs[teamB];

  const imgA = makeLogoImg(
    dataA ? LOGOS.clubLogo(dataA.id) : null,
    teamA, teamA
  );
  const imgB = makeLogoImg(
    dataB ? LOGOS.clubLogo(dataB.id) : null,
    teamB, teamB
  );

  const slotA = container.querySelector('[data-logo-a]');
  const slotB = container.querySelector('[data-logo-b]');
  if (slotA) { slotA.innerHTML = ''; slotA.appendChild(imgA); }
  if (slotB) { slotB.innerHTML = ''; slotB.appendChild(imgB); }

  // Drapeaux
  if (dataA?.flag) {
    container.querySelectorAll('[data-flag-a]').forEach(el => {
      el.innerHTML = '';
      el.appendChild(makeFlagImg(dataA.flag, teamA));
    });
  }
  if (dataB?.flag) {
    container.querySelectorAll('[data-flag-b]').forEach(el => {
      el.innerHTML = '';
      el.appendChild(makeFlagImg(dataB.flag, teamB));
    });
  }
}

/**
 * Photo stade via Unsplash source (libre, pas de clé requise pour embed)
 * IDs stades Unsplash pré-sélectionnés : stadium sport football
 */
const STADIUM_PHOTOS = [
  'photo-1489944440615-453fc2b6a9a9', // stade nuit lumières
  'photo-1508098682722-e99c43a406b2', // pelouse verte
  'photo-1459865264687-595d652de67e', // stade vide
  'photo-1574629810360-7efbbe195018', // gradins
];

function getStadiumBg(index = 0) {
  return `https://images.unsplash.com/${STADIUM_PHOTOS[index % STADIUM_PHOTOS.length]}?auto=format&fit=crop&w=1920&q=80`;
}

/* Exporte */
window.BetOracle = { LOGOS, makeLogoImg, makeFlagImg, makeInitials, injectMatchLogos, getStadiumBg };
