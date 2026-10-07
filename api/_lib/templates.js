// api/_lib/templates.js — gabarits d'emails Betoracl Pro (FR)
// Deux emails :
//   welcome            → confirmation de compte (transactionnel) + bloc "avantages des plans" (marketing,
//                        affiché UNIQUEMENT si l'utilisateur a consenti et ne s'est pas désinscrit)
//   payment_activated  → plan activé + comment recevoir les coupons sur Telegram (transactionnel)

const { SITE, esc } = require('./email')

const C = { bg: '#080C08', card: '#111711', line: '#2a3a2a', text: '#e8f0e8', muted: '#9ab09a', green: '#22C55E', gold: '#F5C842' }

const PLAN_LABEL = { starter: 'Starter', pro: 'Pro', elite: 'Elite' }

function button(label, url, color) {
  const bg = color || C.green
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${bg};border-radius:10px">
<a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font:700 15px Arial,Helvetica,sans-serif;color:#000;text-decoration:none">${esc(label)}</a></td></tr></table>`
}

function layout({ preheader, body, unsubscribeUrl, reason }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>Betoracl Pro</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:16px">
<tr><td style="padding:24px 28px 0;font:700 20px Arial,Helvetica,sans-serif;letter-spacing:.04em;color:#fff">BET<span style="color:${C.gold}">ORACL</span> PRO</td></tr>
<tr><td style="padding:8px 28px 28px;font:15px/1.65 Arial,Helvetica,sans-serif;color:${C.text}">${body}</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid ${C.line};font:12px/1.6 Arial,Helvetica,sans-serif;color:${C.muted}">
<p style="margin:0 0 10px"><strong style="color:${C.gold}">Jeu responsable :</strong> les paris sportifs comportent un risque de perte. Ne misez que ce que vous pouvez vous permettre de perdre. Nos analyses sont un outil d'aide à la décision et ne garantissent aucun gain. Réservé aux personnes de 18 ans et plus.</p>
<p style="margin:0 0 10px">${esc(reason)}</p>
<p style="margin:0 0 10px">MonWe Infinity LLC, société à responsabilité limitée immatriculée au Nouveau-Mexique (États-Unis) — 1209 Mountain Road PL NE, STE R, Albuquerque, NM 87110, USA · Opérations : Abidjan, Côte d'Ivoire · monweci@gmail.com</p>
${unsubscribeUrl ? `<p style="margin:0"><a href="${esc(unsubscribeUrl)}" style="color:${C.muted}">Se désinscrire des emails promotionnels</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`
}

const h1 = (t) => `<h1 style="margin:18px 0 8px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:#fff">${t}</h1>`

// ── 1) Bienvenue / confirmation de compte ────────────────────
function welcome({ firstName, email, refCode, withMarketing, unsubscribeUrl }) {
  const name = esc(firstName || 'là')
  const refLink = refCode ? `${SITE}/signup?ref=${encodeURIComponent(refCode)}` : null

  const marketing = withMarketing ? `
<div style="margin:26px 0 0;padding:18px;border:1px solid ${C.line};border-radius:12px;background:#0d120d">
<p style="margin:0 0 10px;font:700 16px Arial,Helvetica,sans-serif;color:${C.gold}">Ce que débloquent les plans payants</p>
<p style="margin:0 0 6px"><strong style="color:${C.green}">Starter</strong> — les 3 niveaux de coupons (Sûr / Équilibré / Audacieux), le suivi de bankroll avec ROI, les stats 1X2 et la forme des équipes.</p>
<p style="margin:0 0 6px"><strong style="color:${C.green}">Pro</strong> — tout Starter, plus Value Bet & calcul Kelly, alertes en direct (y compris sur Telegram), confrontations directes (H2H) et comparateur de cotes.</p>
<p style="margin:0 0 6px"><strong style="color:${C.green}">Elite</strong> — tout Pro, plus le canal Telegram privé, les statistiques joueurs avancées, le coaching et le support prioritaire.</p>
<p style="margin:10px 0 0;color:${C.muted}">Sans engagement : tu choisis la semaine ou le mois.</p>
${button('Voir les plans', SITE + '/#plans', C.gold)}
</div>` : ''

  const html = layout({
    preheader: `${firstName || 'Ton'} compte Betoracl Pro est prêt — voici comment démarrer.`,
    unsubscribeUrl: withMarketing ? unsubscribeUrl : null,
    reason: `Tu reçois cet email car un compte Betoracl Pro a été créé avec l'adresse ${email}. Si ce n'est pas toi, ignore ce message.`,
    body: `${h1(`Bienvenue ${name}, ton compte est prêt`)}
<p>Ton compte est créé et actif. Voici ce que tu as dès maintenant, gratuitement :</p>
<ul style="padding-left:20px;margin:0 0 6px">
<li>le <strong>coupon Sûr du jour</strong>,</li>
<li><strong>1 crédit Oracle par jour</strong> (cumulable jusqu'à 3),</li>
<li>un suivi de <strong>bankroll</strong> de base.</li>
</ul>
${button('Ouvrir mon tableau de bord', SITE + '/dashboard')}
${refLink ? `<p style="margin:0 0 4px"><strong>Parraine tes amis.</strong> Ton lien personnel : <a href="${esc(refLink)}" style="color:${C.green}">${esc(refLink.replace('https://', ''))}</a><br><span style="color:${C.muted}">Chaque filleul qui s'abonne te rapproche des récompenses du classement.</span></p>` : ''}
${marketing}`,
  })

  const text = `Bienvenue ${firstName || ''}, ton compte Betoracl Pro est prêt.

Gratuit dès maintenant : coupon Sûr du jour, 1 crédit Oracle par jour (cumulable jusqu'à 3), suivi de bankroll de base.
Tableau de bord : ${SITE}/dashboard
${refLink ? `Ton lien de parrainage : ${refLink}\n` : ''}${withMarketing ? `\nPlans payants : Starter (3 niveaux de coupons, bankroll + ROI, stats 1X2), Pro (+ Value Bet & Kelly, alertes live dont Telegram, H2H, comparateur), Elite (+ canal Telegram privé, stats joueurs avancées, coaching, support prioritaire). Plans : ${SITE}/#plans\n` : ''}
Jeu responsable : les paris comportent un risque de perte, nos analyses ne garantissent aucun gain. Réservé aux 18 ans et plus.
Tu reçois cet email car un compte a été créé avec ${email}.
MonWe Infinity LLC — 1209 Mountain Road PL NE, STE R, Albuquerque, NM 87110, USA — monweci@gmail.com
${withMarketing && unsubscribeUrl ? `Se désinscrire des emails promotionnels : ${unsubscribeUrl}` : ''}`

  return { subject: `Bienvenue sur Betoracl Pro, ${firstName || 'ton compte est prêt'}`, html, text }
}

// ── 2) Paiement validé : plan actif + accès Telegram ─────────
function paymentActivated({ firstName, email, plan, expiresAt }) {
  const label = PLAN_LABEL[plan] || plan
  const date = expiresAt ? new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const elite = plan === 'elite'
  const telegram = plan === 'pro' || plan === 'elite'

  const tgSteps = elite
    ? `<ol style="padding-left:20px;margin:0 0 6px">
<li>Ouvre ton <a href="${SITE}/dashboard" style="color:${C.green}">tableau de bord</a>.</li>
<li>Dans la carte <strong>« Canal Telegram Elite »</strong>, appuie sur <strong>« Rejoindre le canal privé »</strong>.</li>
<li>Utilise le lien généré — il ne fonctionne <strong>qu'une seule fois</strong>, donc ouvre-le directement dans Telegram.</li>
</ol>`
    : `<ol style="padding-left:20px;margin:0 0 6px">
<li>Ouvre ton <a href="${SITE}/dashboard" style="color:${C.green}">tableau de bord</a>.</li>
<li>Dans le bloc <strong>« Alertes Telegram »</strong>, appuie sur <strong>« Lier mon Telegram »</strong>.</li>
<li>Telegram s'ouvre sur <a href="https://t.me/betoraclexbot" style="color:${C.green}">@betoraclexbot</a> : appuie sur <strong>Démarrer</strong>. C'est lié.</li>
</ol>`

  const html = layout({
    preheader: `Ton plan ${label} est actif${date ? ' jusqu\'au ' + date : ''}.${telegram ? ' Active Telegram en 1 minute.' : ''}`,
    unsubscribeUrl: null,
    reason: `Tu reçois cet email car un paiement a été validé sur le compte ${email}. C'est un message de service lié à ton abonnement.`,
    body: `${h1(`Ton plan ${esc(label)} est actif`)}
<p>Merci ${esc(firstName || '')}, ton paiement est bien reçu${date ? ` et ton plan ${esc(label)} est valable jusqu'au <strong>${esc(date)}</strong>` : ''}.</p>
${telegram
      ? `<p style="margin:18px 0 6px;font:700 16px Arial,Helvetica,sans-serif;color:${C.gold}">Active Telegram</p>
<p style="margin:0 0 8px">${elite ? 'Le coupon du jour est publié dans le canal privé <strong>chaque matin vers 08h00 (heure d\'Abidjan)</strong>.' : 'Reçois tes alertes directement dans Telegram.'} Active-le une fois, puis tu n'as plus besoin d'ouvrir le site :</p>
${tgSteps}
${button('Activer Telegram', SITE + '/dashboard', C.green)}`
      : `<p style="margin:18px 0 8px">Ton coupon du jour t'attend sur ton tableau de bord, chaque matin.</p>
${button('Ouvrir mon tableau de bord', SITE + '/dashboard', C.green)}`}
<p style="color:${C.muted}">Un souci pour te connecter ? Réponds simplement à cet email, on t'aide rapidement.</p>`,
  })

  const text = `Ton plan ${label} est actif${date ? ' jusqu\'au ' + date : ''}. Merci ${firstName || ''} !

${telegram
    ? (elite
      ? `Active Telegram : le coupon du jour est publié dans le canal privé chaque matin vers 08h00 (heure d'Abidjan).\n1. Ouvre ton tableau de bord : ${SITE}/dashboard\n2. Carte "Canal Telegram Elite" > "Rejoindre le canal privé"\n3. Ouvre le lien généré dans Telegram (usage unique).`
      : `Active Telegram pour recevoir tes alertes :\n1. Ouvre ton tableau de bord : ${SITE}/dashboard\n2. Bloc "Alertes Telegram" > "Lier mon Telegram"\n3. Dans @betoraclexbot (https://t.me/betoraclexbot), appuie sur Démarrer.`)
    : `Ton coupon du jour t'attend sur ton tableau de bord : ${SITE}/dashboard`}

Un souci ? Réponds à cet email.
Jeu responsable : les paris comportent un risque de perte, nos analyses ne garantissent aucun gain. Réservé aux 18 ans et plus.
Message de service lié à ton abonnement (compte ${email}).
MonWe Infinity LLC — 1209 Mountain Road PL NE, STE R, Albuquerque, NM 87110, USA — monweci@gmail.com`

  return { subject: telegram ? `Ton plan ${label} est actif — active Telegram en 1 minute` : `Ton plan ${label} est actif`, html, text }
}

module.exports = { welcome, paymentActivated }
