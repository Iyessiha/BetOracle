// api/_lib/admin.js — accès Supabase (service role) + vérification admin côté serveur
// Env Vercel : SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS (optionnel, séparés par des virgules)

const SUPA = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
const srk = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: srk(), Authorization: `Bearer ${srk()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: r.ok, status: r.status, data }
}

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || 'yessiha@monweinfinity.com,monweci@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// Renvoie l'email de l'admin si le JWT est valide ET que l'email est dans la liste, sinon null.
// Vérification faite ici (serveur) : ne dépend ni du navigateur ni des règles RLS.
async function adminFromRequest(req) {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: srk(), Authorization: `Bearer ${jwt}` } })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  const email = u && u.email ? String(u.email).toLowerCase() : ''
  return email && adminEmails().includes(email) ? email : null
}

module.exports = { sb, adminFromRequest }
