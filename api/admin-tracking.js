// api/admin-tracking.js — CRUD des pixels/balises (réservé aux admins)
//   GET     → liste
//   POST    → crée (sans id) ou met à jour (avec id)
//   DELETE  ?id=<uuid> → supprime
const { sb, adminFromRequest } = require('./_lib/admin')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_RULES = {
  meta_pixel:   /^\d{8,20}$/,
  tiktok_pixel: /^[A-Z0-9]{10,30}$/,
  ga4:          /^G-[A-Z0-9]{6,14}$/,
  gtm:          /^GTM-[A-Z0-9]{4,10}$/,
  google_ads:   /^AW-\d{6,14}$/,
}
const PAGES_RULE = /^[A-Za-z0-9_\-\/\.\*,]{1,300}$/
const MAX_CUSTOM = 20000

function clean(body) {
  const kind = String(body.kind || '')
  const name = String(body.name || '').trim().slice(0, 80)
  if (!name) return { error: 'Nom requis' }
  if (kind !== 'custom' && !ID_RULES[kind]) return { error: 'Type invalide' }
  const placement = body.placement === 'body_end' ? 'body_end' : 'head'
  const pages = String(body.pages || '*').replace(/\s+/g, '')
  if (!PAGES_RULE.test(pages)) return { error: 'Pages invalides (utilise * ou /chemin1,/chemin2)' }
  const row = { name, kind, placement, pages, enabled: body.enabled !== false, tag_id: null, custom_html: null }
  if (kind === 'custom') {
    const html = String(body.custom_html || '').trim()
    if (!html) return { error: 'Code de la balise requis' }
    if (html.length > MAX_CUSTOM) return { error: `Code trop long (max ${MAX_CUSTOM} caractères)` }
    row.custom_html = html
  } else {
    const id = String(body.tag_id || '').trim()
    if (!ID_RULES[kind].test(id)) return { error: "Identifiant invalide pour ce type de pixel" }
    row.tag_id = id
  }
  return { row }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const admin = await adminFromRequest(req)
  if (!admin) return res.status(401).json({ error: 'non autorisé' })

  if (req.method === 'GET') {
    const r = await sb('tracking_tags?select=*&order=created_at.asc')
    if (!r.ok) return res.status(500).json({ error: 'lecture impossible — migration 008 appliquée ?', detail: r.data })
    return res.status(200).json({ tags: r.data })
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { row, error } = clean(body)
    if (error) return res.status(400).json({ error })
    if (body.id) {
      if (!UUID.test(String(body.id))) return res.status(400).json({ error: 'id invalide' })
      const r = await sb(`tracking_tags?id=eq.${body.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
      })
      if (!r.ok) return res.status(500).json({ error: 'mise à jour impossible', detail: r.data })
      return res.status(200).json({ tag: Array.isArray(r.data) ? r.data[0] : r.data })
    }
    const r = await sb('tracking_tags', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...row, created_by: admin }),
    })
    if (!r.ok) return res.status(500).json({ error: 'création impossible — migration 008 appliquée ?', detail: r.data })
    return res.status(200).json({ tag: Array.isArray(r.data) ? r.data[0] : r.data })
  }

  if (req.method === 'DELETE') {
    const id = String((req.query && req.query.id) || '')
    if (!UUID.test(id)) return res.status(400).json({ error: 'id invalide' })
    const r = await sb(`tracking_tags?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    if (!r.ok) return res.status(500).json({ error: 'suppression impossible', detail: r.data })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'méthode non autorisée' })
}
