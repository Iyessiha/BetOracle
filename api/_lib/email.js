// api/_lib/email.js — utilitaires communs (préfixe "_" : pas exposé comme route Vercel)
// Variables d'environnement requises (Vercel) :
//   RESEND_API_KEY, EMAIL_FROM (ex: "Betoracl Pro <bonjour@betoracl.com>"),
//   SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, EMAIL_LINK_SECRET (optionnel, sinon CRON_SECRET)

const crypto = require('crypto')

const SUPA = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
const SITE = 'https://betoracl.com'

const srk = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const linkSecret = () => process.env.EMAIL_LINK_SECRET || process.env.CRON_SECRET || ''

// ── Supabase REST (service role) ─────────────────────────────
async function sb(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: srk(),
      Authorization: `Bearer ${srk()}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: r.ok, status: r.status, data }
}

// Vérifie le JWT d'un utilisateur et renvoie son id (ou null)
async function userIdFromJwt(jwt) {
  const r = await fetch(`${SUPA}/auth/v1/user`, {
    headers: { apikey: srk(), Authorization: `Bearer ${jwt}` },
  })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u && u.id ? u.id : null
}

// ── Jeton de désinscription (HMAC, sans état) ────────────────
function unsubToken(email) {
  return crypto.createHmac('sha256', linkSecret()).update(String(email).toLowerCase()).digest('hex').slice(0, 32)
}
function unsubUrl(email) {
  return `${SITE}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`
}
function validUnsub(email, token) {
  const a = Buffer.from(unsubToken(email))
  const b = Buffer.from(String(token || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ── Envoi via Resend ─────────────────────────────────────────
async function sendEmail({ to, subject, html, text, marketing, unsubscribeUrl }) {
  const headers = {}
  if (marketing && unsubscribeUrl) {
    // RFC 8058 : désinscription en un clic (exigée par Gmail/Yahoo pour les envois en volume)
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>, <mailto:monweci@gmail.com?subject=unsubscribe>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Betoracl Pro <bonjour@betoracl.com>',
      to: [to],
      reply_to: 'betoracl@gmail.com',
      subject,
      html,
      text,
      headers,
    }),
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

module.exports = { SUPA, SITE, sb, userIdFromJwt, unsubUrl, unsubToken, validUnsub, sendEmail, esc }
