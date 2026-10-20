/* /tracking.js — injecte les pixels et balises configurés dans l'admin (onglet « Pixels & balises »).
   Chargé sur toutes les pages publiques, jamais sur /admin*. En cas d'erreur, la page n'est pas affectée. */
(function () {
  'use strict'
  var LEGACY_META = '1734737427724152' // pixel Meta déjà codé en dur dans certaines pages

  function pathMatches(pages, path) {
    pages = String(pages || '*').trim()
    if (pages === '*') return true
    var cur = path.replace(/\.html$/, '').replace(/\/+$/, '') || '/'
    return pages.split(',').some(function (p) {
      p = p.trim().replace(/\.html$/, '')
      if (!p) return false
      if (p === '*') return true
      if (p.slice(-1) === '*') return cur.indexOf(p.slice(0, -1).replace(/\/+$/, '')) === 0
      return cur === (p.replace(/\/+$/, '') || '/')
    })
  }

  function loadScript(src) {
    var s = document.createElement('script')
    s.async = true
    s.src = src
    ;(document.head || document.documentElement).appendChild(s)
  }

  function meta(id) {
    if (!/^\d{8,20}$/.test(id)) return
    if (id === LEGACY_META && window.fbq && !window.__bpFbq) return // déjà présent dans la page
    if (!window.fbq) {
      window.__bpFbq = true
      var n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) })
      if (!window._fbq) window._fbq = n
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
      loadScript('https://connect.facebook.net/en_US/fbevents.js')
    }
    window.fbq('init', id)
    window.fbq('trackSingle', id, 'PageView') // PageView uniquement pour ce pixel : pas de doublon sur les autres
  }

  function tiktok(id) {
    if (!/^[A-Z0-9]{10,30}$/.test(id)) return
    var w = window, t = 'ttq'
    var ttq = (w[t] = w[t] || [])
    if (!ttq.methods) {
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']
      ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat([].slice.call(arguments, 0))) } }
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i])
      ttq.instance = function (x) { var e = ttq._i[x] || []; for (var k = 0; k < ttq.methods.length; k++) ttq.setAndDefer(e, ttq.methods[k]); return e }
      ttq.load = function (e) {
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js'
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {}
        loadScript('https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + e + '&lib=ttq')
      }
    }
    ttq.load(id)
    ttq.page()
  }

  function gtag(id) {
    if (!/^(G-[A-Z0-9]{6,14}|AW-\d{6,14})$/.test(id)) return
    window.dataLayer = window.dataLayer || []
    if (!window.gtag) {
      window.gtag = function () { window.dataLayer.push(arguments) }
      window.gtag('js', new Date())
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id))
    }
    window.gtag('config', id)
  }

  function gtm(id) {
    if (!/^GTM-[A-Z0-9]{4,10}$/.test(id)) return
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
    loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id))
  }

  // Code libre : les <script> collés par l'admin sont recréés pour être exécutés (innerHTML ne les exécute pas).
  function custom(html, placement) {
    var host = placement === 'body_end' ? (document.body || document.documentElement) : (document.head || document.documentElement)
    var tpl = document.createElement('template')
    tpl.innerHTML = html
    Array.prototype.slice.call(tpl.content.childNodes).forEach(function (node) {
      if (node.nodeName === 'SCRIPT') {
        var s = document.createElement('script')
        Array.prototype.slice.call(node.attributes).forEach(function (a) { s.setAttribute(a.name, a.value) })
        s.text = node.textContent
        host.appendChild(s)
      } else {
        host.appendChild(document.importNode(node, true))
      }
    })
  }

  function inject(t) {
    switch (t.kind) {
      case 'meta_pixel': return meta(String(t.tag_id || ''))
      case 'tiktok_pixel': return tiktok(String(t.tag_id || ''))
      case 'ga4':
      case 'google_ads': return gtag(String(t.tag_id || ''))
      case 'gtm': return gtm(String(t.tag_id || ''))
      case 'custom': return t.custom_html ? custom(String(t.custom_html), t.placement) : undefined
    }
  }

  if (typeof window === 'undefined' || !window.location) return
  var path = window.location.pathname || '/'
  if (/^\/admin/.test(path)) return

  fetch('/api/tracking', { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (d) {
      if (!d || !d.tags) return
      d.tags.forEach(function (t) {
        try { if (pathMatches(t.pages, path)) inject(t) } catch (e) { /* un pixel défaillant n'arrête pas les autres */ }
      })
    })
    .catch(function () {})
})()
