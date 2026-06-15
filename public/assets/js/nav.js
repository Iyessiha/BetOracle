/**
 * BETORACLE PRO — nav.js
 * Gestion navigation desktop + mobile sur toutes les pages
 * Ne redirige jamais — observe seulement et adapte l'UI
 */
;(function() {
  const SUPA_URL  = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dWxjcXNyemt3bG5obnlsbGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDc1NzgsImV4cCI6MjA5NjkyMzU3OH0.eJvZE2tgYB42CHYyosZGp8YiMZw4YJRJbdR3d_mmvLw'

  const page = document.body.dataset.page || 'home'

  // Pages qui gèrent leur propre nav / auth — on ne fait rien
  const SKIP = ['login','signup','admin','admin-login','dashboard']
  if (SKIP.includes(page)) return

  function getToken() {
    return localStorage.getItem('sb_access_token') || sessionStorage.getItem('bp_token') || ''
  }
  function getCachedUser() {
    return {
      name: sessionStorage.getItem('bp_prenom') || localStorage.getItem('bp_prenom') || '',
      plan: sessionStorage.getItem('bp_plan')   || localStorage.getItem('bp_plan')   || 'free'
    }
  }

  // ── Adapter la nav desktop ──
  function updateDesktopNav(isLogged, name) {
    const loginBtn = document.getElementById('nav-login-btn')
    if (!loginBtn) return
    if (isLogged && name) {
      loginBtn.href = 'dashboard.html'
      loginBtn.innerHTML = `<i class="ti ti-user-check"></i> ${name.slice(0,10)}`
      loginBtn.style.color = '#22c55e'
      loginBtn.style.borderColor = 'rgba(34,197,94,.4)'
    } else {
      loginBtn.href = 'login.html'
      loginBtn.innerHTML = `<i class="ti ti-login"></i> Se connecter`
    }
  }

  // ── Drawer mobile ──
  function buildDrawer(isLogged, name, plan) {
    if (document.getElementById('global-drawer')) return // déjà injecté

    const PLAN_LABELS = {
      free:'🆓 Free', starter:'🌱 Starter', pro:'⚡ Pro', elite:'👑 Elite'
    }
    const PLAN_COLORS = {
      free:'#5a7a5a', starter:'#2dd4bf', pro:'#F5C842', elite:'#a78bfa'
    }
    const planLabel = PLAN_LABELS[plan] || PLAN_LABELS.free
    const planColor = PLAN_COLORS[plan] || PLAN_COLORS.free
    const init = (name || 'P')[0].toUpperCase()

    const activeClass = (p) => page === p ? 'style="color:#22c55e;background:rgba(34,197,94,.07)"' : ''

    const el = document.createElement('div')
    el.id = 'global-drawer'
    el.innerHTML = `
<div id="g-dov" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:300;backdrop-filter:blur(4px)" onclick="window.__closeDr()"></div>
<div id="g-drawer" style="position:fixed;top:0;left:0;width:min(88%,310px);height:100%;background:#080d08;border-right:1px solid #1c2a1c;z-index:400;transform:translateX(-100%);transition:transform .28s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;overflow-y:auto">

  <div style="display:flex;align-items:center;justify-content:space-between;padding:max(18px,calc(env(safe-area-inset-top,0px)+18px)) 18px 16px;border-bottom:1px solid #1c2a1c;flex-shrink:0">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:9px;background:rgba(34,197,94,.12);border:1.5px solid #22c55e;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 12px rgba(34,197,94,.12)">🔮</div>
      <div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.06em;color:#e4ede4">BET<span style="color:#F5C842">ORACLE</span></div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#5a7a5a">Paris sportifs intelligents</div>
      </div>
    </div>
    <button onclick="window.__closeDr()" style="width:34px;height:34px;border-radius:8px;background:#0f1510;border:none;color:#5a7a5a;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer"><i class="ti ti-x"></i></button>
  </div>

  ${isLogged ? `
  <div style="margin:14px 12px;background:#0f1510;border:1px solid #243424;border-radius:13px;padding:13px 14px;display:flex;align-items:center;gap:11px">
    <div style="width:40px;height:40px;border-radius:10px;background:rgba(34,197,94,.12);border:1.5px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:18px;color:#22c55e;flex-shrink:0">${init}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e4ede4">${name}</div>
      <div style="font-size:11px;font-weight:700;color:${planColor};margin-top:2px">${planLabel} · 🏆 CdM</div>
    </div>
    <a href="dashboard.html" style="font-size:11px;font-weight:700;color:#22c55e;padding:6px 11px;border:1px solid rgba(34,197,94,.3);border-radius:8px;text-decoration:none;flex-shrink:0">Mon espace</a>
  </div>` : `
  <div style="margin:14px 12px;background:#0f1510;border:1px solid #243424;border-radius:13px;padding:13px 14px;display:flex;align-items:center;gap:11px">
    <div style="width:40px;height:40px;border-radius:10px;background:rgba(90,122,90,.08);border:1px solid #243424;display:flex;align-items:center;justify-content:center;color:#5a7a5a;font-size:20px;flex-shrink:0"><i class="ti ti-user"></i></div>
    <div style="flex:1">
      <div style="font-size:13px;color:#5a7a5a">Non connecté</div>
      <div style="font-size:11px;color:#3a5a3a;margin-top:2px">Accès Pro CdM gratuit 🏆</div>
    </div>
    <a href="login.html" style="font-size:12px;font-weight:700;color:#22c55e;padding:6px 12px;border:1px solid rgba(34,197,94,.3);border-radius:8px;text-decoration:none;white-space:nowrap;flex-shrink:0">Connexion</a>
  </div>`}

  <div style="margin:4px 12px 6px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3a5a3a;padding:0 8px 5px">Navigation</div>
    ${drLink('index.html','ti-home','Accueil','home')}
    ${drLink('analyse.html','ti-brain','Analyser un match','analyse')}
    ${drLink('analyse.html#coupon','ti-ticket','Coupon du jour')}
    <a href="index.html#plans" onclick="window.__closeDr()" style="display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;text-decoration:none;color:#9ab89a;font-size:14px;font-weight:600;margin-bottom:2px">
      <i class="ti ti-crown" style="font-size:17px;width:20px;text-align:center"></i>
      <span style="flex:1">Plans & tarifs</span>
      <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:7px;background:rgba(245,200,66,.1);color:#F5C842">Dès 500F</span>
    </a>
    ${isLogged ? drLink('welcome.html','ti-gift','Parrainage','welcome') : ''}
    <div style="height:1px;background:#1c2a1c;margin:6px 0"></div>
    ${drLink('index.html#tools','ti-tools','Outils d\'analyse')}
    ${drLink('index.html#bookmakers','ti-building-bank','Bookmakers partenaires')}
    ${drLink('cgu.html','ti-file-description','Conditions d\'utilisation')}
  </div>

  <div style="margin-top:auto;padding:14px;border-top:1px solid #1c2a1c;display:flex;flex-direction:column;gap:8px;flex-shrink:0">
    ${isLogged ? `
    <a href="checkout.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:10px;background:#22c55e;color:#000;font-size:14px;font-weight:800;text-decoration:none"><i class="ti ti-bolt"></i> Passer Premium après le CdM</a>
    <button onclick="window.__navLogout()" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:10px;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.18);color:#f87171;font-size:13px;font-weight:700;cursor:pointer;font-family:'Barlow',sans-serif;width:100%"><i class="ti ti-logout"></i> Se déconnecter</button>
    ` : `
    <a href="signup.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:10px;background:#22c55e;color:#000;font-size:14px;font-weight:800;text-decoration:none"><i class="ti ti-rocket"></i> Accès Pro gratuit CdM 🏆</a>
    <a href="login.html" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:10px;border:1px solid #243424;color:#9ab89a;font-size:13px;font-weight:700;text-decoration:none"><i class="ti ti-login"></i> Se connecter</a>
    `}
  </div>
</div>`
    document.body.appendChild(el)

    window.__closeDr  = () => {
      document.getElementById('g-dov').style.display = 'none'
      document.getElementById('g-drawer').style.transform = 'translateX(-100%)'
      document.body.style.overflow = ''
    }
    window.__navLogout = () => {
      ['sb_access_token','sb_refresh_token','sb_user_id','bp_plan'].forEach(k=>localStorage.removeItem(k))
      sessionStorage.clear()
      window.location.replace('index.html')
    }
  }

  function drLink(href, icon, label, p) {
    const active = page === p
    return `<a href="${href}" onclick="window.__closeDr?window.__closeDr():null" style="display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:10px;text-decoration:none;color:${active?'#22c55e':'#9ab89a'};font-size:14px;font-weight:600;margin-bottom:2px;${active?'background:rgba(34,197,94,.07)':''}">
      <i class="ti ${icon}" style="font-size:17px;width:20px;text-align:center;flex-shrink:0"></i>
      <span>${label}</span>
    </a>`
  }

  // ── Bottom nav mobile ──
  function buildBottomNav(isLogged, name) {
    if (document.getElementById('global-bnav')) return
    const accountHref  = isLogged ? 'dashboard.html' : 'login.html'
    const accountIcon  = isLogged ? 'ti-user-check'  : 'ti-login'
    const accountLabel = isLogged ? (name.slice(0,8)||'Compte') : 'Connexion'

    const nav = document.createElement('nav')
    nav.id = 'global-bnav'
    nav.style.cssText = `display:flex;position:fixed;bottom:0;left:0;right:0;z-index:200;height:calc(58px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:rgba(5,8,6,.97);backdrop-filter:blur(24px);border-top:1px solid rgba(34,197,94,.1);align-items:flex-start;justify-content:space-around`
    nav.innerHTML = `
      ${bnItem('index.html','ti-home','Accueil',page==='home')}
      ${bnItem('analyse.html','ti-brain','Oracle',page==='analyse')}
      ${bnCta('checkout.html','ti-bolt','Plans')}
      ${bnItem(accountHref,accountIcon,accountLabel,page==='welcome'||isLogged&&page==='home')}
      <button onclick="window.__openDr()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;padding-top:9px;color:#3a5a3a;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:none;border:none;cursor:pointer;font-family:'Barlow',sans-serif;-webkit-tap-highlight-color:transparent">
        <i class="ti ti-menu-2" style="font-size:20px;line-height:1"></i>Menu
      </button>
    `
    document.body.appendChild(nav)
    document.body.style.paddingBottom = 'calc(58px + env(safe-area-inset-bottom,0px) + 4px)'
  }

  function bnItem(href, icon, label, active) {
    return `<a href="${href}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1;padding-top:9px;color:${active?'#22c55e':'#3a5a3a'};font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;-webkit-tap-highlight-color:transparent;min-width:44px">
      <i class="ti ${icon}" style="font-size:20px;line-height:1"></i>${label}
    </a>`
  }
  function bnCta(href, icon, label) {
    return `<a href="${href}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:1.2;padding-top:7px;margin:5px 3px 0;background:#22c55e;color:#000;font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;border-radius:13px;-webkit-tap-highlight-color:transparent">
      <i class="ti ${icon}" style="font-size:20px;line-height:1;color:#000"></i>${label}
    </a>`
  }

  // ── INIT ──
  async function init() {
    const cached = getCachedUser()
    const token  = getToken()
    const isLoggedFast = !!token && !!cached.name

    // Mettre à jour immédiatement avec le cache
    updateDesktopNav(isLoggedFast, cached.name)

    // Mobile : construire les composants
    if (window.innerWidth <= 768) {
      window.__openDr = () => {
        const dov = document.getElementById('g-dov')
        const dr  = document.getElementById('g-drawer')
        if (dov && dr) {
          dov.style.display = 'block'
          dr.style.transform = 'translateX(0)'
          document.body.style.overflow = 'hidden'
        }
      }
      buildBottomNav(isLoggedFast, cached.name)
      buildDrawer(isLoggedFast, cached.name, cached.plan)
    }

    // Vérification légère en arrière-plan (pas bloquante)
    if (token) {
      try {
        const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
          headers:{'apikey':SUPA_ANON,'Authorization':`Bearer ${token}`},
          signal: AbortSignal.timeout(4000)
        })
        if (r.ok) {
          const u = await r.json()
          if (u.id) {
            const name = cached.name || u.email?.split('@')[0] || 'Parieur'
            updateDesktopNav(true, name)
          }
        }
      } catch {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
