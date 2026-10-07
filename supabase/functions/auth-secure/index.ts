import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPA_URL  = Deno.env.get('SUPABASE_URL')!
const SUPA_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPA_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM_EMAIL = 'Betoracl Pro <bonjour@betoracl.com>'
// Secret interne (appels pg_cron / triggers) : à définir dans les secrets des Edge Functions (INTERNAL_TRIGGER).
// L'ancienne valeur était écrite en clair dans le code : elle doit être changée (rotation) puis mise à jour chez les appelants.
const INTERNAL_TRIGGER = Deno.env.get('INTERNAL_TRIGGER') || ''
const LINK_SECRET = Deno.env.get('EMAIL_LINK_SECRET') || Deno.env.get('CRON_SECRET') || ''
const SITE = 'https://betoracl.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

const DISPOSABLE = [
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  'yopmail.com','yopmail.fr','spam4.me','trashmail.at','trashmail.me',
  'trashmail.net','dispostable.com','mailnesia.com','mailsac.com',
  'burnermail.io','getnada.com','mailtemp.net','maildrop.cc',
  'tempinbox.com','fakeinbox.com','spamgourmet.com','getairmail.com',
  'discard.email','tempr.email','mailexpire.com','filzmail.com',
  'trashmailer.com','guerrillamail.info','grr.la','mailnull.com','throwam.com',
  'sharklasers.com','guerrillamailblock.com','cool.fr.nf','jetable.fr.nf'
]

function isEmailSuspect(email: string): { ok: boolean; reason?: string } {
  const [local, domain] = email.toLowerCase().split('@')
  if (!domain) return { ok: false, reason: 'Email invalide' }
  if (DISPOSABLE.includes(domain)) return { ok: false, reason: 'Emails temporaires non accept\u00e9s. Utilise ton vrai email.' }
  const suspPatterns = [
    /^(temp|trash|spam|fake|throw|disposable)/i,
    /\.(xyz|top|click|gdn|loan|racing|trade|download)$/i
  ]
  for (const p of suspPatterns) {
    if (p.test(domain)) return { ok: false, reason: 'Email non accept\u00e9. Utilise un email personnel (Gmail, Yahoo, Outlook...).' }
  }
  if (local.length < 2) return { ok: false, reason: 'Email invalide' }
  return { ok: true }
}


const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string,string>)[c])

// Jeton de désinscription : identique à api/_lib/email.js (HMAC-SHA256 de l'email en minuscules, 32 premiers hex)
async function unsubToken(email: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LINK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase()))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
async function unsubUrl(email: string): Promise<string> {
  return `${SITE}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${await unsubToken(email)}`
}

async function checkRateLimit(db: any, ip: string, action: string, max: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  try {
    const { data } = await db.from('rate_limits').select('id,count').eq('ip_address', ip).eq('action', action).gte('window_start', windowStart).single()
    if (!data) { await db.from('rate_limits').insert({ ip_address: ip, action, count: 1 }); return true }
    if (data.count >= max) return false
    await db.from('rate_limits').update({ count: data.count + 1 }).eq('id', data.id)
    return true
  } catch { return true }
}

// L'email de bienvenue est envoyé par /api/send-email (Vercel), appelé par signup.html : confirmation + avantages si opt-in.

async function sendMarketingEmail(email: string, firstName: string, sequence: string, plan: string): Promise<void> {
  if (!RESEND_KEY) return
  const subjects: Record<string, string> = {
    day1:     '\ud83d\udd2e Ton coupon du jour t\u2019attend sur Betoracl Pro',
    day3:     '\u26a1 Analyse un match en 10 secondes avec l\u2019Oracle',
    day7:     '\ud83d\udcca Ce que les plans payants ajoutent \u00e0 ton compte',
    day14:    '\ud83c\udfc6 Value Bet, Kelly et alertes live : d\u00e9couvre le plan Pro',
    win_back: '\ud83d\udc4b On a ajout\u00e9 des analyses depuis ta derni\u00e8re visite'
  }
  const ctaLinks: Record<string, string> = {
    day1:     `${SITE}/coupons`,
    day3:     `${SITE}/analyse`,
    day7:     `${SITE}/#plans`,
    day14:    `${SITE}/#plans`,
    win_back: `${SITE}/`
  }
  const ctaTexts: Record<string, string> = {
    day1:     'Voir mon coupon du jour \u2192',
    day3:     'Analyser un match \u2192',
    day7:     'Comparer les plans \u2192',
    day14:    'D\u00e9couvrir le plan Pro \u2192',
    win_back: 'Revenir sur Betoracl Pro \u2192'
  }
  if (!subjects[sequence]) return
  if (plan !== 'free') return
  const bodyText = sequence === 'day14'
    ? 'Le plan Pro ajoute le Value Bet, le calcul Kelly et les alertes live : des outils pour rep\u00e9rer des cotes qui te semblent sous-\u00e9valu\u00e9es et g\u00e9rer ta mise. Aucun outil ne garantit un gain.'
    : sequence === 'day7' ? 'En plus du plan gratuit, les plans payants d\u00e9bloquent les coupons des 3 niveaux, le suivi de bankroll avec ROI, le Value Bet, le calcul Kelly et les alertes live selon le plan.'
    : sequence === 'win_back' ? 'Cela fait un moment qu\'on ne t\'a pas vu. Ton coupon S\u00fbr du jour et ton cr\u00e9dit Oracle t\'attendent.'
    : 'L\'Oracle est pr\u00eat \u00e0 analyser le match de ton choix : probabilit\u00e9s, BTTS, Over/Under et score probable en quelques secondes.'
  const unsub = await unsubUrl(email)
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060906;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:32px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:#0d130d;border-radius:14px;padding:32px;border:1px solid #1a261a">
<span style="font-size:22px;font-weight:900;color:#22c55e">BET</span><span style="font-size:22px;font-weight:900;color:#F5C842">ORACL</span>
<p style="color:#e4ede4;font-size:18px;font-weight:700;margin:20px 0 8px">Bonjour ${esc(firstName)} \ud83d\udc4b</p>
<p style="color:#7a9a7a;font-size:14px;line-height:1.7;margin:0 0 24px">${bodyText}</p>
<table cellpadding="0" cellspacing="0">
<tr><td style="background:#22c55e;border-radius:10px;padding:13px 26px">
<a href="${ctaLinks[sequence]}" style="color:#000;font-size:14px;font-weight:800;text-decoration:none">${ctaTexts[sequence]}</a>
</td></tr></table>
<p style="color:#6b8a6b;font-size:11px;line-height:1.6;margin:28px 0 0"><strong style="color:#F5C842">Jeu responsable :</strong> les paris sportifs comportent un risque de perte ; nos analyses ne garantissent aucun gain. R\u00e9serv\u00e9 aux 18 ans et plus.</p>
<p style="color:#6b8a6b;font-size:11px;line-height:1.6;margin:10px 0 0">Tu re\u00e7ois cet email car tu as accept\u00e9 de recevoir nos conseils lors de ton inscription (${esc(email)}). MonWe Infinity LLC \u2014 1209 Mountain Road PL NE, STE R, Albuquerque, NM 87110, USA \u00b7 Op\u00e9rations : Abidjan, C\u00f4te d\u2019Ivoire.</p>
<p style="color:#6b8a6b;font-size:11px;margin:10px 0 0"><a href="${unsub}" style="color:#6b8a6b">Se d\u00e9sinscrire des emails promotionnels</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [email], subject: subjects[sequence], html,
        reply_to: 'betoracl@gmail.com',
        headers: { 'List-Unsubscribe': `<${unsub}>, <mailto:monweci@gmail.com?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      })
    })
    const result = await res.json()
    if (!res.ok) console.error('[marketing] Resend error:', JSON.stringify(result))
  } catch (e) { console.error('[marketing] error:', e instanceof Error ? e.message : String(e)) }
}

async function sendLatePaymentApologyEmail(email: string, firstName: string, plan: string, bonusDays: number): Promise<void> {
  if (!RESEND_KEY) return
  const planLabel: Record<string,string> = { starter:'Starter', pro:'Pro', elite:'Elite', vip:'VIP' }
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060906;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:32px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:#0d130d;border-radius:14px;padding:0;border:1px solid rgba(245,200,66,.3);overflow:hidden">
<tr></tr>
<td style="display:block;background:linear-gradient(90deg,#F5C842,#22c55e);height:3px"></td>
<td style="display:block;padding:32px">
<span style="font-size:22px;font-weight:900;color:#22c55e">BET</span><span style="font-size:22px;font-weight:900;color:#F5C842">ORACL</span>
<p style="color:#e4ede4;font-size:20px;font-weight:700;margin:20px 0 12px">D\u00e9sol\u00e9s pour l'attente, ${esc(firstName)} \ud83d\ude4f</p>
<p style="color:#9dbb9a;font-size:14px;line-height:1.75;margin:0 0 16px">
Ton paiement du plan <strong style="color:#F5C842">${planLabel[plan]||plan}</strong> a bien \u00e9t\u00e9 re\u00e7u, mais un incident technique de notre c\u00f4t\u00e9 a retard\u00e9 l'activation de ton acc\u00e8s. C'est corrig\u00e9 \u2014 <strong style="color:#e4ede4">ton compte est maintenant actif</strong>.
</p>
<p style="color:#9dbb9a;font-size:14px;line-height:1.75;margin:0 0 24px">
Pour te remercier de ta patience, on t'offre <strong style="color:#22c55e">${bonusDays} jours suppl\u00e9mentaires</strong> sur ton plan, gratuitement.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:10px;margin-bottom:24px">
<tr><td style="padding:18px 20px;text-align:center">
<div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#7a9a7a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Bonus offert</div>
<div style="font-size:28px;font-weight:900;color:#22c55e">+${bonusDays} jours ${(planLabel[plan]||plan).toUpperCase()}</div>
</td></tr>
</table>
<table cellpadding="0" cellspacing="0">
<tr><td style="background:#22c55e;border-radius:10px;padding:14px 28px">
<a href="https://betoracl.com/dashboard" style="color:#000;font-size:15px;font-weight:800;text-decoration:none">Acc\u00e9der \u00e0 mon espace \u2192</a>
</td></tr></table>
<p style="color:#3a5a3a;font-size:11px;margin:24px 0 0">Une question ? R\u00e9ponds directement \u00e0 cet email, on te lit. \u00b7 Betoracl Pro</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `\u2705 Ton acc\u00e8s ${planLabel[plan]||plan} est activ\u00e9 (+${bonusDays} jours offerts)`, html })
    })
    const result = await res.json()
    if (!res.ok) console.error('[late-payment-apology] Resend error:', JSON.stringify(result))
    else console.log('[late-payment-apology] \u2705 Email envoy\u00e9 \u00e0', email)
  } catch (e) { console.error('[late-payment-apology] error:', e instanceof Error ? e.message : String(e)) }
}

// NOUVEAU : email d'avertissement avant expiration — pousse vers l'abonnement (essai gratuit / plan en cours)
async function sendPlanExpiryWarningEmail(email: string, firstName: string, plan: string, hoursLeft: number, isTrial: boolean): Promise<void> {
  if (!RESEND_KEY) return
  const planLabel: Record<string,string> = { starter:'Starter', pro:'Pro', elite:'Elite', vip:'VIP' }
  const label = planLabel[plan] || plan
  const timeLabel = hoursLeft <= 1 ? 'moins d\'une heure' : `${Math.round(hoursLeft)} heures`
  const intro = isTrial
    ? `Ton acc\u00e8s d'essai gratuit ${label} se termine dans <strong style="color:#F5C842">${timeLabel}</strong>.`
    : `Ton abonnement ${label} se termine dans <strong style="color:#F5C842">${timeLabel}</strong>.`
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060906;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:32px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:#0d130d;border-radius:14px;padding:0;border:1px solid rgba(239,68,68,.3);overflow:hidden">
<tr></tr>
<td style="display:block;background:linear-gradient(90deg,#ef4444,#F5C842);height:3px"></td>
<td style="display:block;padding:32px">
<span style="font-size:22px;font-weight:900;color:#22c55e">BET</span><span style="font-size:22px;font-weight:900;color:#F5C842">ORACL</span>
<p style="color:#e4ede4;font-size:20px;font-weight:700;margin:20px 0 12px">\u23f3 ${esc(firstName)}, ton acc\u00e8s expire bient\u00f4t</p>
<p style="color:#9dbb9a;font-size:14px;line-height:1.75;margin:0 0 20px">${intro}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,.2);border-radius:10px;margin-bottom:24px">
<tr><td style="padding:18px 20px">
<p style="color:#F5C842;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 10px">Ce que tu vas perdre</p>
<p style="color:#e4ede4;font-size:13px;margin:0 0 6px">\u26a1 Coupons 3 niveaux + Value Bet + Kelly Calculator</p>
<p style="color:#e4ede4;font-size:13px;margin:0 0 6px">\ud83d\udd14 Alertes live sur tes matchs</p>
<p style="color:#e4ede4;font-size:13px;margin:0">\ud83d\udcca Historique complet de tes analyses</p>
</td></tr>
</table>
<table cellpadding="0" cellspacing="0">
<tr><td style="background:#22c55e;border-radius:10px;padding:14px 28px">
<a href="https://betoracl.com/checkout?plan=${plan}" style="color:#000;font-size:15px;font-weight:800;text-decoration:none">Garder mon acc\u00e8s \u2192</a>
</td></tr></table>
<p style="color:#3a5a3a;font-size:11px;margin:24px 0 0">Betoracl Pro \u00b7 betoracl.com</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `\u23f3 Ton acc\u00e8s ${label} expire dans ${timeLabel}`, html })
    })
    const result = await res.json()
    if (!res.ok) console.error('[expiry-warning] Resend error:', JSON.stringify(result))
    else console.log('[expiry-warning] \u2705 Email envoy\u00e9 \u00e0', email)
  } catch (e) { console.error('[expiry-warning] error:', e instanceof Error ? e.message : String(e)) }
}

// NOUVEAU : notification (email) une fois le plan effectivement expire et repasse en Free.
async function sendPlanExpiredEmail(email: string, firstName: string, plan: string): Promise<void> {
  if (!RESEND_KEY) return
  const planLabel: Record<string,string> = { starter:'Starter', pro:'Pro', elite:'Elite', vip:'VIP' }
  const label = planLabel[plan] || plan
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060906;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
<tr><td style="padding:32px 24px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="background:#0d130d;border-radius:14px;padding:32px;border:1px solid #1a261a">
<span style="font-size:22px;font-weight:900;color:#22c55e">BET</span><span style="font-size:22px;font-weight:900;color:#F5C842">ORACL</span>
<p style="color:#e4ede4;font-size:18px;font-weight:700;margin:20px 0 12px">${esc(firstName)}, ton acc\u00e8s ${label} a expir\u00e9</p>
<p style="color:#9dbb9a;font-size:14px;line-height:1.75;margin:0 0 24px">Tu es repass\u00e9 automatiquement au plan Free. Tu gardes 1 analyse Oracle par jour et le coupon S\u00fbr gratuit \u2014 mais le Value Bet, les alertes live et les coupons compl\u00e8ts ne sont plus accessibles.</p>
<table cellpadding="0" cellspacing="0">
<tr><td style="background:#22c55e;border-radius:10px;padding:13px 26px">
<a href="https://betoracl.com/checkout" style="color:#000;font-size:14px;font-weight:800;text-decoration:none">R\u00e9activer mon acc\u00e8s \u2192</a>
</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>`
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `Ton acc\u00e8s ${label} a expir\u00e9 \u2014 tu es repass\u00e9 en Free`, html })
    })
    const result = await res.json()
    if (!res.ok) console.error('[plan-expired] Resend error:', JSON.stringify(result))
  } catch (e) { console.error('[plan-expired] error:', e instanceof Error ? e.message : String(e)) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || ''
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1'
  const db = createClient(SUPA_URL, SUPA_SVC)
  try {
    const body = await req.json()

    if (action === 'check-email') {
      const { email } = body
      if (!email) return new Response(JSON.stringify({ ok: false, reason: 'Email requis' }), { headers: CORS })
      const domain = email.toLowerCase().split('@')[1] || ''
      if (DISPOSABLE.includes(domain)) return new Response(JSON.stringify({ ok: false, reason: 'Emails temporaires non accept\u00e9s' }), { headers: CORS })
      const suspect = isEmailSuspect(email)
      return new Response(JSON.stringify(suspect.ok ? { ok: true } : { ok: false, reason: suspect.reason }), { headers: CORS })
    }

    if (action === 'signup') {
      const { email, password, full_name, ref_code } = body
      const marketingConsent = body.marketing_consent === true // opt-in explicite, jamais par d\u00e9faut
      const allowed = await checkRateLimit(db, ip, 'signup', 5)
      if (!allowed) return new Response(JSON.stringify({ error: 'Trop de tentatives. R\u00e9essaie dans 1 heure.', code: 'RATE_LIMITED' }), { status: 429, headers: CORS })
      if (!email || !email.includes('@')) return new Response(JSON.stringify({ error: 'Adresse email invalide.', code: 'INVALID_EMAIL' }), { status: 400, headers: CORS })
      const suspect = isEmailSuspect(email)
      if (!suspect.ok) return new Response(JSON.stringify({ error: suspect.reason, code: 'DISPOSABLE_EMAIL' }), { status: 400, headers: CORS })
      if (!password || password.length < 8) return new Response(JSON.stringify({ error: 'Mot de passe trop court (minimum 8 caract\u00e8res).', code: 'WEAK_PASSWORD' }), { status: 400, headers: CORS })
      const { data: existing } = await db.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle()
      if (existing) return new Response(JSON.stringify({ error: 'Cet email est d\u00e9j\u00e0 utilis\u00e9. Connecte-toi ?', code: 'EMAIL_EXISTS' }), { status: 409, headers: CORS })
      const authRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_SVC, 'Authorization': `Bearer ${SUPA_SVC}` },
        body: JSON.stringify({ email: email.toLowerCase(), password, email_confirm: true, user_metadata: { full_name: full_name || '' } })
      })
      const authData = await authRes.json()
      if (!authData.id) {
        const msg = (authData.message || authData.msg || authData.error_description || '').toLowerCase()
        if (msg.includes('already registered') || msg.includes('email_exists'))
          return new Response(JSON.stringify({ error: 'Cet email est d\u00e9j\u00e0 utilis\u00e9. Connecte-toi ?', code: 'EMAIL_EXISTS' }), { status: 409, headers: CORS })
        return new Response(JSON.stringify({ error: 'Erreur lors de la cr\u00e9ation du compte.', code: 'AUTH_ERROR' }), { status: 400, headers: CORS })
      }
      const userId = authData.id
      const loginRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}` },
        body: JSON.stringify({ email: email.toLowerCase(), password })
      })
      const loginData = await loginRes.json()

      let referredBy: string | null = null
      if (ref_code) {
        try {
          const { data: refProf } = await db.from('profiles').select('id').eq('ref_code', ref_code.toUpperCase()).maybeSingle()
          if (refProf) {
            referredBy = refProf.id
            await db.from('referrals').insert({ referrer_id: refProf.id, referred_id: userId, status: 'pending' })
            const { error: incrErr } = await db.rpc('increment_referral_count', { p_user_id: refProf.id })
            if (incrErr) console.error('[signup] increment_referral_count error:', incrErr)
          }
        } catch (e) { console.error('[signup] referral handling error:', e) }
      }

      const firstName = (full_name || email.split('@')[0]).split(' ')[0]
      try {
        await db.from('profiles').upsert({
          id: userId, email: email.toLowerCase(), full_name: full_name || firstName,
          plan: 'free', email_verified: true, signup_ip: ip,
          referred_by: referredBy, marketing_consent: marketingConsent,
          marketing_consent_at: marketingConsent ? new Date().toISOString() : null,
          onboarding_completed: false, onboarding_step: 0
        })
      } catch (e) { console.error('[signup] profile upsert:', e) }

      // S\u00e9quences promotionnelles : uniquement si l'utilisateur a coch\u00e9 la case marketing
      if (marketingConsent) {
        try {
          const { error: seqErr } = await db.rpc('create_marketing_sequences', { p_user_id: userId, p_email: email.toLowerCase() })
          if (seqErr) console.error('[signup] create_marketing_sequences error:', seqErr)
        } catch (e) { console.error('[signup] create_marketing_sequences exception:', e) }
      }

      // Email de bienvenue : envoy\u00e9 par /api/send-email (appel\u00e9 par signup.html), plus ici \u2192 pas de doublon.
      try { await db.from('user_events').insert({ user_id: userId, event: 'signup', metadata: { ip, ref_code: ref_code || null } }) } catch (_) {}

      return new Response(JSON.stringify({
        success: true, user_id: userId,
        access_token: loginData.access_token || null,
        refresh_token: loginData.refresh_token || null,
        effective_plan: 'free', is_new_user: true,
        message: 'Inscription r\u00e9ussie ! Bienvenue sur Betoracl Pro.'
      }), { headers: CORS })
    }

    if (action === 'login') {
      const { email, password } = body
      if (!email || !password) return new Response(JSON.stringify({ error: 'Email et mot de passe requis.', code: 'MISSING_FIELDS' }), { status: 400, headers: CORS })
      const allowed = await checkRateLimit(db, ip, 'login', 10)
      if (!allowed) return new Response(JSON.stringify({ error: 'Trop de tentatives. R\u00e9essaie dans 1 heure.', code: 'RATE_LIMITED' }), { status: 429, headers: CORS })
      const loginRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}` },
        body: JSON.stringify({ email, password })
      })
      const loginData = await loginRes.json()
      if (!loginData?.access_token || !loginData?.user?.id)
        return new Response(JSON.stringify({ error: 'Email ou mot de passe incorrect.', code: 'INVALID_CREDENTIALS' }), { status: 401, headers: CORS })
      const userId = loginData.user.id
      let profile: any = null
      try {
        const { data } = await db.from('profiles')
          .select('is_banned,ban_reason,full_name,plan,plan_expires_at,is_admin,onboarding_completed')
          .eq('id', userId).maybeSingle()
        profile = data
      } catch (_) {}
      if (profile?.is_banned)
        return new Response(JSON.stringify({ error: `Compte suspendu : ${profile.ban_reason || 'contacte le support'}`, code: 'BANNED' }), { status: 403, headers: CORS })
      let effectivePlan = 'free'
      try { const { data } = await db.rpc('get_effective_plan', { p_user_id: userId }); if (data) effectivePlan = data } catch (_) {}
      try { await db.rpc('track_event', { p_user_id: userId, p_event: 'login', p_meta: { ip } }) } catch (_) {}
      try {
        const ua = req.headers.get('user-agent') || ''
        await db.from('user_sessions').insert({ user_id: userId, ip_address: ip, user_agent: ua, device_type: /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop', is_active: true })
      } catch (_) {}
      return new Response(JSON.stringify({
        success: true,
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
        user_id: userId,
        first_name: profile?.full_name?.split(' ')[0] || email.split('@')[0],
        effective_plan: effectivePlan,
        plan: profile?.plan || 'free',
        plan_expires_at: profile?.plan_expires_at || null,
        is_admin: profile?.is_admin === true,
        onboarding_completed: profile?.onboarding_completed === true
      }), { headers: CORS })
    }

    if (action === 'verify') {
      const { token } = body
      if (!token) return new Response(JSON.stringify({ valid: false }), { headers: CORS })
      const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` } })
      const userData = await userRes.json()
      if (!userData?.id) return new Response(JSON.stringify({ valid: false }), { headers: CORS })
      let effectivePlan = 'free', profile: any = null
      try { const { data } = await db.rpc('get_effective_plan', { p_user_id: userData.id }); if (data) effectivePlan = data } catch (_) {}
      try {
        const { data } = await db.from('profiles')
          .select('full_name,streak_days,analyses_today,referral_count,login_count,plan_expires_at,plan,is_admin,onboarding_completed,ref_code')
          .eq('id', userData.id).maybeSingle()
        profile = data
      } catch (_) {}
      return new Response(JSON.stringify({
        valid: true, user_id: userData.id, email: userData.email,
        first_name: profile?.full_name?.split(' ')[0] || (userData.email || '').split('@')[0],
        effective_plan: effectivePlan, plan: profile?.plan || 'free',
        plan_expires_at: profile?.plan_expires_at || null,
        streak_days: profile?.streak_days || 0,
        analyses_today: profile?.analyses_today || 0,
        referral_count: profile?.referral_count || 0,
        login_count: profile?.login_count || 0,
        is_admin: profile?.is_admin === true,
        onboarding_completed: profile?.onboarding_completed === true,
        ref_code: profile?.ref_code || null
      }), { headers: CORS })
    }

    if (action === 'send-marketing') {
      const secret = body.secret ?? ''
      const authorized = (secret && secret === Deno.env.get('CRON_SECRET')) || (INTERNAL_TRIGGER !== '' && secret === INTERNAL_TRIGGER)
      if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      const now = new Date().toISOString()
      const { data: pending, error: pendErr } = await db.from('marketing_sequences')
        .select('id,user_id,email,sequence_name')
        .eq('status', 'pending')
        .lte('scheduled_for', now)
        .limit(30)
      if (pendErr) console.error('[send-marketing] query error:', pendErr)
      if (!pending?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: CORS })
      let sent = 0
      for (const seq of pending) {
        try {
          const { data: prof } = await db.from('profiles').select('full_name,plan,marketing_consent').eq('id', seq.user_id).maybeSingle()
          const { data: sup } = await db.from('email_suppressions').select('email').eq('email', String(seq.email).toLowerCase()).maybeSingle()
          if (!prof || prof.marketing_consent !== true || sup) {
            await db.from('marketing_sequences').update({ status: 'skipped' }).eq('id', seq.id)
            continue
          }
          const firstName = prof?.full_name?.split(' ')[0] || seq.email.split('@')[0]
          await sendMarketingEmail(seq.email, firstName, seq.sequence_name, prof?.plan || 'free')
          await db.from('marketing_sequences').update({ status: 'sent', sent_at: now }).eq('id', seq.id)
          sent++
        } catch (_) {
          await db.from('marketing_sequences').update({ status: 'skipped' }).eq('id', seq.id)
        }
      }
      return new Response(JSON.stringify({ sent, scanned: pending.length }), { headers: CORS })
    }

    if (action === 'send-late-payment-apology') {
      const secret = body.secret ?? ''
      const authorized = (secret && secret === Deno.env.get('CRON_SECRET')) || (INTERNAL_TRIGGER !== '' && secret === INTERNAL_TRIGGER)
      if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      const { email, full_name, plan, bonus_days } = body
      if (!email || !plan) return new Response(JSON.stringify({ error: 'email et plan requis' }), { status: 400, headers: CORS })
      const firstName = (full_name || email.split('@')[0]).split(' ')[0]
      await sendLatePaymentApologyEmail(email, firstName, plan, Number(bonus_days) || 7)
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    }

    // NOUVEAU : avertissement avant expiration (essai gratuit ou plan payant)
    if (action === 'send-plan-expiry-warning') {
      const secret = body.secret ?? ''
      const authorized = (secret && secret === Deno.env.get('CRON_SECRET')) || (INTERNAL_TRIGGER !== '' && secret === INTERNAL_TRIGGER)
      if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      const { email, full_name, plan, hours_left, is_trial } = body
      if (!email || !plan) return new Response(JSON.stringify({ error: 'email et plan requis' }), { status: 400, headers: CORS })
      const firstName = (full_name || email.split('@')[0]).split(' ')[0]
      await sendPlanExpiryWarningEmail(email, firstName, plan, Number(hours_left) || 4, !!is_trial)
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    }

    // NOUVEAU : notification apres expiration effective
    if (action === 'send-plan-expired') {
      const secret = body.secret ?? ''
      const authorized = (secret && secret === Deno.env.get('CRON_SECRET')) || (INTERNAL_TRIGGER !== '' && secret === INTERNAL_TRIGGER)
      if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      const { email, full_name, plan } = body
      if (!email || !plan) return new Response(JSON.stringify({ error: 'email et plan requis' }), { status: 400, headers: CORS })
      const firstName = (full_name || email.split('@')[0]).split(' ')[0]
      await sendPlanExpiredEmail(email, firstName, plan)
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    }

    if (action === 'complete-onboarding') {
      const { token } = body
      if (!token) return new Response(JSON.stringify({ ok: false }), { headers: CORS })
      const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${token}` } })
      const userData = await userRes.json()
      if (!userData?.id) return new Response(JSON.stringify({ ok: false }), { headers: CORS })
      await db.from('profiles').update({ onboarding_completed: true }).eq('id', userData.id)
      return new Response(JSON.stringify({ ok: true }), { headers: CORS })
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), { status: 400, headers: CORS })
  } catch (e) {
    console.error('[auth-secure] fatal:', e instanceof Error ? e.message : String(e))
    return new Response(JSON.stringify({ error: 'Erreur interne. R\u00e9essaie dans quelques secondes.' }), { status: 500, headers: CORS })
  }
})
