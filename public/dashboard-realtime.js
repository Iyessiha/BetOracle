/**
 * BETORACLE PRO — Notifications Realtime Dashboard
 * Supabase Realtime sur : coupons · credit_transactions · analyses
 *
 * INTÉGRATION :
 *   <script src="dashboard-realtime.js"></script>
 *   <script>
 *     BetoNotif.init(supabaseClient, currentUserId)
 *   </script>
 *
 * Ajouter dans le <head> :
 *   <link rel="stylesheet" href="dashboard-realtime.css"> (ou copier les styles ci-dessous)
 */

;(function () {
  'use strict'

  // ─── STYLES ───────────────────────────────────────────────────────────────
  const STYLES = `
    #beto-notif-container {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 340px;
    }
    .beto-toast {
      background: #1c271c;
      border: 1px solid #344834;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      pointer-events: all;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      animation: beto-slide-in .35s cubic-bezier(.22,1,.36,1);
      position: relative;
      overflow: hidden;
    }
    .beto-toast::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
    }
    .beto-toast.success::before { background: #22c55e }
    .beto-toast.warning::before { background: #F5C842 }
    .beto-toast.error::before   { background: #ef4444 }
    .beto-toast.info::before    { background: #3b82f6 }
    .beto-toast.credit::before  { background: linear-gradient(90deg,#22c55e,#F5C842) }

    .beto-toast-icon {
      font-size: 20px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .beto-toast-body { flex: 1; min-width: 0 }
    .beto-toast-title {
      font-weight: 700;
      font-size: 13px;
      color: #e8f0e8;
      margin-bottom: 2px;
    }
    .beto-toast-msg {
      font-size: 12px;
      color: #7a9a7a;
      line-height: 1.5;
    }
    .beto-toast-close {
      background: none;
      border: none;
      color: #4a6a4a;
      cursor: pointer;
      font-size: 16px;
      padding: 0;
      flex-shrink: 0;
      line-height: 1;
    }
    .beto-toast-close:hover { color: #7a9a7a }
    .beto-toast-progress {
      position: absolute;
      bottom: 0; left: 0;
      height: 2px;
      background: rgba(255,255,255,.12);
      animation: beto-progress linear forwards;
    }
    .beto-toast.success .beto-toast-progress { background: rgba(34,197,94,.3) }
    .beto-toast.warning .beto-toast-progress { background: rgba(245,200,66,.3) }

    @keyframes beto-slide-in {
      from { transform: translateX(110%); opacity: 0 }
      to   { transform: translateX(0);   opacity: 1 }
    }
    @keyframes beto-slide-out {
      from { transform: translateX(0);   opacity: 1 }
      to   { transform: translateX(110%); opacity: 0 }
    }
    @keyframes beto-progress {
      from { width: 100% }
      to   { width: 0% }
    }

    /* Badge non-lus dans la nav */
    #beto-notif-badge {
      display: none;
      position: absolute;
      top: -4px; right: -4px;
      background: #ef4444;
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      width: 16px; height: 16px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
    }
    #beto-notif-badge.visible { display: flex }

    /* Cloche */
    .beto-bell-wrap {
      position: relative;
      cursor: pointer;
    }
  `

  // ─── DOM SETUP ────────────────────────────────────────────────────────────
  function injectStyles () {
    if (document.getElementById('beto-notif-styles')) return
    const style = document.createElement('style')
    style.id    = 'beto-notif-styles'
    style.textContent = STYLES
    document.head.appendChild(style)
  }

  function getContainer () {
    let c = document.getElementById('beto-notif-container')
    if (!c) {
      c = document.createElement('div')
      c.id = 'beto-notif-container'
      document.body.appendChild(c)
    }
    return c
  }

  // ─── TOAST ────────────────────────────────────────────────────────────────
  const ICONS = {
    success: '✅',
    warning: '⚠️',
    error:   '❌',
    info:    'ℹ️',
    credit:  '💎',
    coupon:  '🎯',
    result:  '🏆',
    oracle:  '🔮',
  }

  let unreadCount = 0

  function showToast (title, msg, type = 'info', duration = 6000) {
    injectStyles()
    const container = getContainer()
    const toast = document.createElement('div')
    toast.className = `beto-toast ${type}`

    toast.innerHTML = `
      <div class="beto-toast-icon">${ICONS[type] || ICONS.info}</div>
      <div class="beto-toast-body">
        <div class="beto-toast-title">${title}</div>
        ${msg ? `<div class="beto-toast-msg">${msg}</div>` : ''}
      </div>
      <button class="beto-toast-close" onclick="this.closest('.beto-toast')._dismiss()">×</button>
      <div class="beto-toast-progress" style="animation-duration:${duration}ms"></div>
    `

    const dismiss = () => {
      toast.style.animation = 'beto-slide-out .3s cubic-bezier(.22,1,.36,1) forwards'
      setTimeout(() => toast.remove(), 300)
    }
    toast._dismiss = dismiss

    container.appendChild(toast)
    const timer = setTimeout(dismiss, duration)
    toast.addEventListener('mouseenter', () => clearTimeout(timer))

    // Badge non-lus
    unreadCount++
    updateBadge()

    // Clic sur le toast pour naviguer si href fourni
    if (toast.dataset.href) {
      toast.style.cursor = 'pointer'
      toast.addEventListener('click', () => { window.location.href = toast.dataset.href })
    }
  }

  function updateBadge () {
    const badge = document.getElementById('beto-notif-badge')
    if (!badge) return
    if (unreadCount > 0) {
      badge.classList.add('visible')
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount
    } else {
      badge.classList.remove('visible')
    }
  }

  // ─── CANAL REALTIME ───────────────────────────────────────────────────────
  let channel = null

  function init (supabase, userId) {
    if (!supabase || !userId) {
      console.warn('[BetoNotif] init requiert supabaseClient + userId')
      return
    }

    injectStyles()

    // Nettoyage si déjà abonné
    if (channel) { channel.unsubscribe(); channel = null }

    channel = supabase.channel(`dashboard-notif-${userId}`)

    // ── 1. Nouveau coupon publié ──────────────────────────────────────────
    channel.on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'coupons',
      filter: `status=eq.published`
    }, (payload) => {
      const c = payload.new
      const tierMap = { safe: '🛡️ Coupon Sûr', balanced: '⚡ Coupon Équilibré', bold: '🔥 Coupon Audacieux' }
      const label   = tierMap[c.tier] || 'Coupon'
      const odds    = c.total_odds ? ` · ×${Number(c.total_odds).toFixed(2)}` : ''
      showToast(
        `${label} disponible !`,
        `Confiance ${c.confidence}%${odds} — <a href="/coupons" style="color:#22c55e">Voir →</a>`,
        'coupon',
        8000
      )
    })

    // ── 2. Résultat d'un coupon mis à jour ────────────────────────────────
    channel.on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'coupons',
    }, (payload) => {
      const prev = payload.old
      const curr = payload.new
      // Seulement si le résultat change et devient définitif
      if (prev.result === curr.result) return
      if (curr.result === 'pending') return

      const resultMap = {
        win:     { type: 'success', icon: '🎉', title: 'Coupon gagné !',    msg: `${curr.wins_count}/${curr.total_picks} picks réussis` },
        loss:    { type: 'error',   icon: '😞', title: 'Coupon perdu',      msg: 'Meilleure chance demain !' },
        partial: { type: 'warning', icon: '⚡', title: 'Coupon partiel',    msg: `${curr.wins_count}/${curr.total_picks} picks réussis` },
      }
      const r = resultMap[curr.result]
      if (r) showToast(r.title, r.msg, r.type, 9000)
    })

    // ── 3. Mouvement de crédits (cet utilisateur) ─────────────────────────
    channel.on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'credit_transactions',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      const tx = payload.new
      const amount = tx.amount

      // Ignorer les déductions Oracle (trop fréquent, trop verbeux)
      if (tx.type === 'usage') return

      if (amount > 0) {
        showToast(
          `+${amount} crédit${amount > 1 ? 's' : ''} ajouté${amount > 1 ? 's' : ''}`,
          tx.description || 'Rechargement effectué',
          'credit',
          7000
        )
      }
      // Alerte solde bas (balance_after ≤ 2)
      if (tx.balance_after <= 2 && tx.balance_after >= 0) {
        showToast(
          'Solde faible',
          `Il vous reste ${tx.balance_after} crédit${tx.balance_after > 1 ? 's' : ''} Oracle — <a href="/credits" style="color:#F5C842">Recharger →</a>`,
          'warning',
          10000
        )
      }
    })

    // ── 4. Analyse Oracle terminée (confirmation silencieuse) ──────────────
    channel.on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'analyses',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      const a = payload.new
      // Notification discrète uniquement si l'analyse a été lancée depuis un autre onglet
      if (document.hasFocus()) return
      const teamA = a.team_a_name || '?'
      const teamB = a.team_b_name || '?'
      showToast(
        'Analyse Oracle terminée',
        `${teamA} vs ${teamB} — <a href="/oracle" style="color:#22c55e">Voir →</a>`,
        'oracle',
        6000
      )
    })

    channel.subscribe((status) => {
      console.log(`[BetoNotif] Realtime ${status}`)
      if (status === 'SUBSCRIBED') {
        console.log('[BetoNotif] ✅ Notifications actives')
      }
    })
  }

  function stop () {
    if (channel) { channel.unsubscribe(); channel = null }
  }

  function clearUnread () {
    unreadCount = 0
    updateBadge()
  }

  // ─── API PUBLIQUE ─────────────────────────────────────────────────────────
  window.BetoNotif = { init, stop, showToast, clearUnread }

})()

/*
 ═══════════════════════════════════════════════════════════════
 GUIDE D'INTÉGRATION DANS LE DASHBOARD
 ═══════════════════════════════════════════════════════════════

 1. INCLURE LE SCRIPT (avant </body>)
    <script src="/js/dashboard-realtime.js"></script>

 2. INITIALISER APRÈS L'AUTH
    // Une fois que tu as l'utilisateur connecté :
    BetoNotif.init(supabase, session.user.id)

 3. AJOUTER LA CLOCHE DANS LA NAV (optionnel)
    <div class="beto-bell-wrap" onclick="BetoNotif.clearUnread()">
      <i class="ti ti-bell"></i>
      <span id="beto-notif-badge"></span>
    </div>

 4. USAGE MANUEL (alertes custom)
    BetoNotif.showToast('Titre', 'Message', 'success')
    BetoNotif.showToast('Alerte', 'Texte', 'warning', 8000)

 5. TYPES DISPONIBLES
    success · error · warning · info · credit · coupon · result · oracle

 6. ARRÊTER LES NOTIFICATIONS (ex: déconnexion)
    BetoNotif.stop()

 ═══════════════════════════════════════════════════════════════
 ÉVÉNEMENTS ÉCOUTÉS
 ═══════════════════════════════════════════════════════════════

 coupons INSERT (status=published)    → nouveau coupon disponible
 coupons UPDATE (result change)       → résultat win/loss/partial
 credit_transactions INSERT (userId)  → recharge · alerte solde bas
 analyses INSERT (userId)             → analyse Oracle terminée (autre onglet)

 ═══════════════════════════════════════════════════════════════
*/
