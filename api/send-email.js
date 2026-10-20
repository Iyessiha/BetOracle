// api/send-email.js — envoi des emails "welcome" et "payment_activated"
//
// POST /api/send-email   body: { "type": "welcome" | "payment_activated", "marketing_consent"?: boolean }
// Auth, au choix :
//   • JWT de l'utilisateur (Authorization: Bearer <access_token>)  → l'email part vers SON compte uniquement
//   • Bearer CRON_SECRET + { user_id }                             → appel serveur (ex: webhook Supabase)
// Idempotent : un même email n'est jamais envoyé deux fois (table email_log, cf. migration 007).

const crypto = require('crypto')
const { sb, userIdFromJwt, unsubUrl, sendEmail } = require('./_lib/email')
const T = require('./_lib/templates')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST uniquement' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const type = body.type
  if (type !== 'welcome' && type !== 'payment_activated') return res.status(400).json({ error: 'type invalide' })

  // ── Authentification ──
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const cron = process.env.CRON_SECRET || ''
  let userId = null
  if (cron && token && safeEq(token, cron)) userId = body.user_id
  else if (token) userId = await userIdFromJwt(token)
  if (!userId || !UUID.test(userId)) return res.status(401).json({ error: 'non autorisé' })

  // ── Profil ──
  const p = await sb(`profiles?id=eq.${userId}&select=*`)
  const profile = p.ok && Array.isArray(p.data) ? p.data[0] : null
  if (!profile || !profile.email) return res.status(404).json({ error: 'profil introuvable' })

  // ── Clé d'idempotence + conditions d'envoi ──
  let key, plan = profile.plan, expiresAt = profile.plan_expires_at
  if (type === 'welcome') {
    key = `welcome:${userId}`
  } else {
    const active = ['starter', 'pro', 'elite'].includes(profile.plan) && profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date()
    if (!active) return res.status(409).json({ error: 'aucun plan actif pour ce compte' })
    const s = await sb(`subscriptions?user_id=eq.${userId}&status=eq.active&select=id&order=starts_at.desc&limit=1`)
    const subId = s.ok && Array.isArray(s.data) && s.data[0] ? s.data[0].id : null
    if (!subId) return res.status(409).json({ error: 'abonnement actif introuvable' })
    key = `payment_activated:${subId}`
  }

  // ── Consentement marketing (enregistré côté serveur, une seule fois, à l'inscription) ──
  if (type === 'welcome' && body.marketing_consent === true && !profile.marketing_consent) {
    await sb(`profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ marketing_consent: true, marketing_consent_at: new Date().toISOString() }),
    })
    profile.marketing_consent = true
  }

  // ── Réserve la clé AVANT l'envoi (anti-doublon) ──
  const claim = await sb('email_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ key, user_id: userId, type }),
  })
  if (claim.status === 409) return res.status(200).json({ ok: true, skipped: 'déjà envoyé' })
  if (!claim.ok) return res.status(500).json({ error: 'email_log indisponible — migration 007 appliquée ?', detail: claim.data })

  // ── Contenu ──
  const firstName = String(profile.full_name || profile.email.split('@')[0]).split(' ')[0]
  let mail
  if (type === 'welcome') {
    const sup = await sb(`email_suppressions?email=eq.${encodeURIComponent(profile.email.toLowerCase())}&select=email`)
    const suppressed = sup.ok && Array.isArray(sup.data) && sup.data.length > 0
    const withMarketing = profile.marketing_consent === true && !suppressed
    const u = unsubUrl(profile.email)
    mail = { ...T.welcome({ firstName, email: profile.email, refCode: profile.ref_code, withMarketing, unsubscribeUrl: u }), marketing: withMarketing, unsubscribeUrl: u }
  } else {
    mail = { ...T.paymentActivated({ firstName, email: profile.email, plan, expiresAt }), marketing: false }
  }

  // ── Envoi ──
  const sent = await sendEmail({ to: profile.email, ...mail })
  if (!sent.ok) {
    await sb(`email_log?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' }) // permet un nouvel essai
    return res.status(502).json({ error: 'échec envoi', detail: sent.data })
  }
  return res.status(200).json({ ok: true, type, id: sent.data && sent.data.id })
}
