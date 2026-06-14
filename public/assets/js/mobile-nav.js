/**
 * BETORACLE PRO — Mobile Navigation
 * Drawer menu + bottom nav + auth state
 */
(function() {

const SUPA_URL  = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dWxjcXNyemt3bG5obnlsbGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDc1NzgsImV4cCI6MjA5NjkyMzU3OH0.eJvZE2tgYB42CHYyosZGp8YiMZw4YJRJbdR3d_mmvLw'

// ── État auth actuel ──
let user = null
let userPlan = 'free'
let userName = ''

// ── Lire le token ──
function getToken() {
  return localStorage.getItem('sb_access_token') || sessionStorage.getItem('bp_token') || ''
}

// ── Vérifier l'auth ──
async function checkAuth() {
  const token = getToken()
  if (!token) return null

  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` }
    })
    if (!r.ok) return null
    const d = await r.json()
    if (!d.id) return null

    // Récupérer profil
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/profiles?id=eq.${d.id}&select=full_name,plan,plan_expires_at`,
      { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` } }
    )
    const profiles = await pr.json()
    const profile = profiles?.[0]

    user = d
    userName = profile?.full_name?.split(' ')[0] || d.email?.split('@')[0] || 'Parieur'
    userPlan = profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()
      ? profile.plan : 'free'

    // Stocker en session
    sessionStorage.setItem('bp_prenom', userName)
    sessionStorage.setItem('bp_plan', userPlan)

    return user
  } catch { return null }
}

// ── Se déconnecter ──
function logout() {
  localStorage.removeItem('sb_access_token')
  localStorage.removeItem('sb_refresh_token')
  localStorage.removeItem('sb_user_id')
  localStorage.removeItem('bp_plan')
  localStorage.removeItem('admin_token')
  sessionStorage.clear()
  window.location.href = 'index.html'
}

// ── Plan badge HTML ──
function planBadgeHtml(plan) {
  const map = {
    free:    ['badge-free',    '🆓 Free'],
    starter: ['badge-starter', '🌱 Starter'],
    pro:     ['badge-pro',     '⚡ Pro'],
    elite:   ['badge-elite',   '👑 Elite'],
  }
  const [cls, label] = map[plan] || map.free
  const colorClass = { starter:'teal', pro:'gold', elite:'purple' }[plan] || ''
  return `<span class="du-plan-badge ${colorClass}">${label}</span>`
}

// ── Injecter le drawer ──
function injectDrawer(activePage) {
  const isLoggedIn = !!user
  const pages = document.querySelectorAll('.drawer-page-' + activePage)

  const drawerHtml = `
<div class="drawer-overlay" id="drawer-overlay" onclick="closeDrawer()"></div>
<div class="mobile-drawer" id="mobile-drawer">

  <div class="drawer-head">
    <div class="drawer-logo">
      <div class="drawer-logo-badge">🔮</div>
      <div class="drawer-logo-name">BET<span>ORACLE</span></div>
    </div>
    <button class="drawer-close" onclick="closeDrawer()">
      <i class="ti ti-x"></i>
    </button>
  </div>

  ${isLoggedIn ? `
  <div class="drawer-user">
    <div class="du-av">${(userName[0] || 'U').toUpperCase()}</div>
    <div class="du-info">
      <div class="du-name">${userName}</div>
      <div class="du-plan">${planBadgeHtml(userPlan)}</div>
    </div>
  </div>
  ` : `
  <div class="drawer-user" style="gap:10px">
    <div class="du-av" style="background:rgba(106,138,106,.1);border-color:var(--b2);color:var(--muted)">
      <i class="ti ti-user" style="font-size:18px"></i>
    </div>
    <div class="du-info">
      <div class="du-name" style="color:var(--muted)">Non connecté</div>
      <div class="du-plan" style="font-size:11px;color:var(--muted)">Inscris-toi gratuitement</div>
    </div>
    <a href="login.html" class="du-login-btn">Connexion</a>
  </div>
  `}

  <div class="drawer-section">
    <div class="drawer-section-label">Navigation</div>
    <a href="index.html" class="drawer-item ${activePage==='home'?'active':''}">
      <i class="ti ti-home"></i> Accueil
    </a>
    <a href="analyse.html" class="drawer-item ${activePage==='analyse'?'active':''}">
      <i class="ti ti-brain"></i> Analyser un match
    </a>
    <a href="index.html#plans" class="drawer-item ${activePage==='plans'?'active':''}">
      <i class="ti ti-crown"></i> Plans &amp; tarifs
      <span class="di-badge">Dès 500F</span>
    </a>
    <a href="index.html#tools" class="drawer-item">
      <i class="ti ti-tools"></i> Outils d'analyse
    </a>
    <a href="index.html#faq" class="drawer-item">
      <i class="ti ti-help-circle"></i> FAQ
    </a>
  </div>

  <div class="drawer-divider"></div>

  ${isLoggedIn ? `
  <div class="drawer-section">
    <div class="drawer-section-label">Mon compte</div>
    <a href="welcome.html" class="drawer-item ${activePage==='welcome'?'active':''}">
      <i class="ti ti-gift"></i> Parrainage
    </a>
    <a href="checkout.html" class="drawer-item">
      <i class="ti ti-bolt"></i> Passer Premium
    </a>
  </div>
  <div class="drawer-divider"></div>
  ` : ''}

  <div class="drawer-section">
    <div class="drawer-section-label">Liens rapides</div>
    <a href="index.html#bookmakers" class="drawer-item">
      <i class="ti ti-building-bank"></i> Bookmakers partenaires
    </a>
    <a href="cgu.html" class="drawer-item">
      <i class="ti ti-file-description"></i> Conditions d'utilisation
    </a>
  </div>

  <div class="drawer-foot">
    ${isLoggedIn ? `
    <a href="checkout.html" class="df-signup">
      <i class="ti ti-bolt"></i> ${userPlan === 'free' ? 'Passer Premium' : 'Gérer mon abonnement'}
    </a>
    <button class="df-logout" onclick="if(window.MobileNav)MobileNav.logout()">
      <i class="ti ti-logout"></i> Se déconnecter
    </button>
    ` : `
    <a href="signup.html" class="df-signup">
      <i class="ti ti-rocket"></i> Créer mon compte gratuit
    </a>
    <a href="login.html" class="df-login">
      <i class="ti ti-login"></i> Se connecter
    </a>
    `}
  </div>

</div>`

  const container = document.createElement('div')
  container.innerHTML = drawerHtml
  document.body.appendChild(container)
}

// ── Injecter la bottom nav ──
function injectBottomNav(activePage) {
  const navHtml = `
<nav class="mobile-nav" id="mobile-bottom-nav">
  <a href="index.html" class="mn-item ${activePage==='home'?'active':''}">
    <i class="ti ti-home"></i>Accueil
  </a>
  <a href="analyse.html" class="mn-item ${activePage==='analyse'?'active':''}">
    <i class="ti ti-brain"></i>Oracle
  </a>
  <a href="checkout.html" class="mn-item mn-cta">
    <i class="ti ti-bolt"></i>Plans
  </a>
  <a href="${user ? 'welcome.html' : 'login.html'}" class="mn-item ${activePage==='welcome'||activePage==='login'?'active':''}">
    <i class="ti ti-${user ? 'gift' : 'user'}"></i>${user ? 'Compte' : 'Connexion'}
  </a>
  <button class="mn-item mn-menu" onclick="openDrawer()" style="background:none;border:none;font-family:inherit">
    <i class="ti ti-menu-2"></i>Menu
  </button>
</nav>`

  const container = document.createElement('div')
  container.innerHTML = navHtml
  document.body.appendChild(container)
}

// ── Injecter la topbar mobile (pages intérieures) ──
function injectTopbar(activePage, title) {
  const isLoggedIn = !!user
  const topbarHtml = `
<div class="mobile-topbar">
  <a href="index.html" class="mt-logo">
    <div class="mt-logo-badge">🔮</div>
    <div class="mt-logo-name">BET<span>ORACLE</span></div>
  </a>
  <div class="mt-actions">
    ${isLoggedIn
      ? `<a href="welcome.html" class="mt-btn mt-btn-login">${userName}</a>`
      : `<a href="login.html" class="mt-btn mt-btn-login"><i class="ti ti-login"></i> Connexion</a>
         <a href="signup.html" class="mt-btn mt-btn-signup">S'inscrire</a>`
    }
    <button class="mt-menu-btn" onclick="openDrawer()">
      <i class="ti ti-menu-2"></i>
    </button>
  </div>
</div>`

  // Insérer en premier dans body
  const container = document.createElement('div')
  container.innerHTML = topbarHtml
  document.body.insertBefore(container.firstElementChild, document.body.firstChild)
}

// ── Ouvrir/fermer drawer ──
window.openDrawer = function() {
  document.getElementById('drawer-overlay')?.classList.add('open')
  document.getElementById('mobile-drawer')?.classList.add('open')
  document.body.style.overflow = 'hidden'
}
window.closeDrawer = function() {
  document.getElementById('drawer-overlay')?.classList.remove('open')
  document.getElementById('mobile-drawer')?.classList.remove('open')
  document.body.style.overflow = ''
}

// ── INIT ──
async function init() {
  if (window.innerWidth > 640) return // Rien à faire sur desktop

  // Lire la page active depuis un attribut data ou l'URL
  const activePage = document.body.dataset.page ||
    (location.pathname.includes('analyse') ? 'analyse' :
     location.pathname.includes('welcome') ? 'welcome' :
     location.pathname.includes('login')   ? 'login'   :
     location.pathname.includes('signup')  ? 'signup'  :
     location.pathname.includes('checkout')? 'checkout':
     'home')

  // Vérifier l'auth
  await checkAuth()

  // Retirer les anciennes bottom navs (injectées statiquement)
  document.querySelectorAll('.mobile-nav').forEach(n => n.remove())

  // Injecter topbar sur pages intérieures
  const innerPages = ['analyse', 'welcome', 'login', 'signup', 'checkout']
  if (innerPages.includes(activePage)) {
    injectTopbar(activePage)
  }

  // Toujours injecter bottom nav + drawer
  injectBottomNav(activePage)
  injectDrawer(activePage)
}

// Exporter pour logout depuis le drawer
window.MobileNav = { logout, getToken, user: () => user }

// Lancer
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

})()
