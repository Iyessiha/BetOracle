// api/unsubscribe.js — désinscription des emails promotionnels
// GET  /api/unsubscribe?e=<email>&t=<jeton>  → page de confirmation (clic depuis l'email)
// POST /api/unsubscribe?e=<email>&t=<jeton>  → désinscription en un clic (RFC 8058, boutons Gmail/Yahoo)
// Les emails de service (paiement, compte) ne sont pas concernés.

const { sb, validUnsub, esc } = require('./_lib/email')

module.exports = async (req, res) => {
  const email = String((req.query && req.query.e) || '').toLowerCase()
  const token = String((req.query && req.query.t) || '')
  if (!email || !validUnsub(email, token)) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.send(page('Lien invalide', "Ce lien de désinscription n'est pas valide ou a expiré. Écris-nous à monweci@gmail.com et on s'en occupe."))
  }

  await sb('email_suppressions?on_conflict=email', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ email, source: req.method === 'POST' ? 'one-click' : 'link' }),
  })
  await sb(`profiles?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ marketing_consent: false }),
  })

  if (req.method === 'POST') return res.status(200).json({ ok: true })
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.send(page('Désinscription confirmée', `L'adresse <strong>${esc(email)}</strong> ne recevra plus d'emails promotionnels de Betoracl Pro. Tu continueras à recevoir les messages de service liés à ton compte et à tes paiements.`))
}

function page(title, msg) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Betoracl Pro</title></head>
<body style="margin:0;background:#080C08;color:#e8f0e8;font:16px/1.6 Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px">
<div style="max-width:460px;background:#111711;border:1px solid #2a3a2a;border-radius:16px;padding:28px">
<div style="font-weight:700;letter-spacing:.04em;margin-bottom:14px">BET<span style="color:#F5C842">ORACL</span> PRO</div>
<h1 style="font-size:22px;margin:0 0 10px">${esc(title)}</h1><p style="margin:0 0 18px;color:#9ab09a">${msg}</p>
<a href="https://betoracl.com" style="color:#22C55E">Retour au site</a></div></body></html>`
}
