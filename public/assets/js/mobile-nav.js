/**
 * BETORACLE PRO — Mobile Navigation v2
 * Injecte bottom nav + drawer uniquement sur mobile
 * Gère l'état auth et les liens dynamiquement
 */
(function() {
  if (window.innerWidth > 640) return // Desktop → rien à faire

  const SUPA_URL  = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dWxjcXNyemt3bG5obnlsbGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDc1NzgsImV4cCI6MjA5NjkyMzU3OH0.eJvZE2tgYB42CHYyosZGp8YiMZw4YJRJbdR3d_mmvLw'

  // Pages "full-screen" : pas de bottom nav
  const FULLSCREEN_PAGES = ['login', 'signup', 'admin', 'admin-login']

  let user = null
  let userName = ''
  let userPlan = 'free'

  function getToken() {
    return localStorage.getItem('sb_access_token') || sessionStorage.getItem('bp_token') || ''
  }

  async function checkAuth() {
    const token = getToken()
    if (!token) return

    try {
      const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` }
      })
      const d = await r.json()
      if (!d.id) return

      user = d
      // Profil depuis sessionStorage d'abord (évite un appel réseau)
      userName = sessionStorage.getItem('bp_prenom') || d.email?.split('@')[0] || 'Parieur'
      userPlan = sessionStorage.getItem('bp_plan') || 'free'

      // Récupérer le vrai profil en arrière-plan
      fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${d.id}&select=full_name,plan,plan_expires_at`, {
        headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).then(profiles => {
        const p = profiles?.[0]
        if (!p) return
        userName = p.full_name?.split(' ')[0] || userName
        userPlan = p.plan_expires_at && new Date(p.plan_expires_at) > new Date() ? p.plan : 'free'
        // Mettre à jour l'UI si déjà injectée
        const nameEl = document.querySelector('.du-name')
        if (nameEl) nameEl.textContent = userName
      }).catch(() => {})
    } catch {}
  }

  window.MobileLogout = function() {
    localStorage.removeItem('sb_access_token')
    localStorage.removeItem('sb_refresh_token')
    localStorage.removeItem('sb_user_id')
    localStorage.removeItem('bp_plan')
    localStorage.removeItem('admin_token')
    sessionStorage.clear()
    window.location.href = 'index.html'
  }

  function planLabel(plan) {
    return { free:'🆓 Free', starter:'🌱 Starter', pro:'⚡ Pro', elite:'👑 Elite' }[plan] || '🆓 Free'
  }

  function planColor(plan) {
    return { starter:'color:#14b8a6', pro:'color:#F5C842', elite:'color:#8b5cf6' }[plan] || 'color:var(--muted)'
  }

  function injectDrawer(page) {
    const logged = !!user
    const el = document.createElement('div')
    el.innerHTML = `
<div id="dov" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:300;backdrop-filter:blur(4px)" onclick="closeDr()"></div>
<div id="drawer" style="position:fixed;top:0;left:0;width:88%;max-width:310px;height:100%;background:#0a0f0a;border-right:1px solid #1a2a1a;z-index:400;transform:translateX(-100%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;overflow-y:auto">

  <div style="display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top,0px) + 18px) 18px 18px;border-bottom:1px solid #1a2a1a;flex-shrink:0">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:34px;height:34px;border-radius:9px;background:rgba(34,197,94,.12);border:1.5px solid #22c55e;display:flex;align-items:center;justify-content:center;font-size:18px">🔮</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.05em;color:#e8f0e8">BET<span style="color:#F5C842">ORACLE</span></div>
    </div>
    <button onclick="closeDr()" style="width:34px;height:34px;border-radius:8px;background:#1a2a1a;border:none;color:#6a8a6a;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer">
      <i class="ti ti-x"></i>
    </button>
  </div>

  ${logged ? `
  <div style="margin:14px 16px;background:#111711;border:1px solid #243424;border-radius:13px;padding:13px 14px;display:flex;align-items:center;gap:11px">
    <div style="width:40px;height:40px;border-radius:9px;background:rgba(34,197,94,.12);border:1.5px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:17px;color:#22c55e;flex-shrink:0">${(userName[0]||'P').toUpperCase()}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" class="du-name">${userName}</div>
      <div style="font-size:11px;margin-top:2px;${planColor(userPlan)};font-weight:600">${planLabel(userPlan)}</div>
    </div>
  </div>` : `
  <div style="margin:14px 16px;background:#111711;border:1px solid #243424;border-radius:13px;padding:13px 14px;display:flex;align-items:center;gap:11px">
    <div style="width:40px;height:40px;border-radius:9px;background:rgba(106,138,106,.08);border:1px solid #243424;display:flex;align-items:center;justify-content:center;color:#6a8a6a;font-size:20px;flex-shrink:0"><i class="ti ti-user"></i></div>
    <div style="flex:1">
      <div style="font-size:13px;color:#6a8a6a">Non connecté</div>
      <div style="font-size:11px;color:#3a5a3a;margin-top:2px">Inscris-toi gratuitement</div>
    </div>
    <a href="login.html" style="font-size:12px;font-weight:700;color:#22c55e;padding:6px 12px;border:1px solid rgba(34,197,94,.3);border-radius:8px;text-decoration:none;white-space:nowrap;flex-shrink:0">Connexion</a>
  </div>`}

  <div style="padding:6px 10px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#2a422a;padding:0 8px 5px">Navigation</div>
    ${drItem('index.html','ti-home','Accueil',page==='home')}
    ${drItem('analyse.html','ti-brain','Analyser un match',page==='analyse')}
    ${drItem('index.html#plans','ti-crown','Plans &amp; tarifs',page==='plans','Dès 500F')}
    ${drItem('index.html#tools','ti-tools','Outils d\'analyse')}
    ${drItem('index.html#faq','ti-help-circle','FAQ')}
  </div>

  <div style="height:1px;background:#1a2a1a;margin:4px 18px"></div>

  ${logged ? `
  <div style="padding:6px 10px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#2a422a;padding:0 8px 5px">Mon compte</div>
    ${drItem('welcome.html','ti-gift','Parrainage',page==='welcome')}
    ${drItem('checkout.html','ti-bolt','Passer Premium')}
  </div>
  <div style="height:1px;background:#1a2a1a;margin:4px 18px"></div>` : ''}

  <div style="padding:6px 10px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#2a422a;padding:0 8px 5px">Liens</div>
    ${drItem('index.html#bookmakers','ti-building-bank','Bookmakers partenaires')}
    ${drItem('cgu.html','ti-file-description','Conditions d\'utilisation')}
  </div>

  <div style="margin-top:auto;padding:14px 16px;border-top:1px solid #1a2a1a;display:flex;flex-direction:column;gap:8px;flex-shrink:0">
    ${logged ? `
    <a href="checkout.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:10px;background:#22c55e;color:#000;font-size:14px;font-weight:800;text-decoration:none">
      <i class="ti ti-bolt"></i> ${userPlan==='free'?'Passer Premium':'Mon abonnement'}
    </a>
    <button onclick="MobileLogout()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.18);color:#f87171;font-size:13px;font-weight:700;cursor:pointer;font-family:'Barlow',sans-serif;width:100%">
      <i class="ti ti-logout"></i> Se déconnecter
    </button>` : `
    <a href="signup.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:10px;background:#22c55e;color:#000;font-size:14px;font-weight:800;text-decoration:none">
      <i class="ti ti-rocket"></i> Créer mon compte gratuit
    </a>
    <a href="login.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:10px;border:1px solid #243424;color:#6a8a6a;font-size:13px;font-weight:700;text-decoration:none">
      <i class="ti ti-login"></i> Se connecter
    </a>`}
  </div>

</div>`
    document.body.appendChild(el)
  }

  function drItem(href, icon, label, active=false, badge='') {
    return `<a href="${href}" onclick="closeDr()" style="display:flex;align-items:center;gap:11px;padding:11px 11px;border-radius:10px;text-decoration:none;color:${active?'#22c55e':'#6a8a6a'};font-size:14px;font-weight:500;${active?'background:rgba(34,197,94,.07)':''}">
      <i class="ti ${icon}" style="font-size:17px;width:20px;text-align:center;flex-shrink:0"></i>
      <span style="flex:1">${label}</span>
      ${badge?`<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:7px;background:rgba(245,200,66,.12);color:#F5C842">${badge}</span>`:''}
    </a>`
  }

  function injectBottomNav(page) {
    const logged = !!user
    const accountHref = logged ? 'welcome.html' : 'login.html'
    const accountIcon = logged ? 'ti-user-check' : 'ti-login'
    const accountLabel = logged ? userName.slice(0,8) : 'Connexion'

    const nav = document.createElement('nav')
    nav.id = 'mobile-bnav'
    nav.style.cssText = `
      display:flex;position:fixed;bottom:0;left:0;right:0;z-index:200;
      height:calc(58px + env(safe-area-inset-bottom,0px));
      padding-bottom:env(safe-area-inset-bottom,0px);
      background:rgba(6,10,6,.97);
      backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      border-top:1px solid rgba(34,197,94,.12);
      align-items:flex-start;justify-content:space-around;
    `
    nav.innerHTML = `
      ${bnItem('index.html','ti-home','Accueil',page==='home')}
      ${bnItem('analyse.html','ti-brain','Oracle',page==='analyse')}
      ${bnCta('checkout.html','ti-bolt','Plans')}
      ${bnItem(accountHref,accountIcon,accountLabel,page==='welcome'||page==='login')}
      <button onclick="openDr()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;padding-top:10px;color:#4a6a4a;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:none;border:none;cursor:pointer;font-family:'Barlow',sans-serif;-webkit-tap-highlight-color:transparent;min-width:44px">
        <i class="ti ti-menu-2" style="font-size:20px;line-height:1"></i>Menu
      </button>
    `
    document.body.appendChild(nav)
    // padding body
    document.body.style.paddingBottom = 'calc(58px + env(safe-area-inset-bottom,0px) + 4px)'
  }

  function bnItem(href, icon, label, active=false) {
    return `<a href="${href}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;padding-top:10px;color:${active?'#22c55e':'#4a6a4a'};font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;-webkit-tap-highlight-color:transparent;min-width:44px">
      <i class="ti ${icon}" style="font-size:20px;line-height:1"></i>${label}
    </a>`
  }

  function bnCta(href, icon, label) {
    return `<a href="${href}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1.2;padding-top:7px;margin:5px 4px 0;background:#22c55e;color:#000;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;border-radius:13px;-webkit-tap-highlight-color:transparent">
      <i class="ti ${icon}" style="font-size:20px;line-height:1"></i>${label}
    </a>`
  }

  window.openDr = function() {
    document.getElementById('dov').style.display = 'block'
    document.getElementById('drawer').style.transform = 'translateX(0)'
    document.body.style.overflow = 'hidden'
  }
  window.closeDr = function() {
    const dov = document.getElementById('dov')
    const dr  = document.getElementById('drawer')
    if (!dov || !dr) return
    dov.style.display = 'none'
    dr.style.transform = 'translateX(-100%)'
    document.body.style.overflow = ''
  }

  // ── INIT ──
  async function init() {
    const page = document.body.dataset.page || 'home'

    // Pages full-screen : pas de bottom nav ni drawer
    if (FULLSCREEN_PAGES.includes(page)) return

    await checkAuth()
    injectBottomNav(page)
    injectDrawer(page)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
