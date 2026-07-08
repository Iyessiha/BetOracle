// Vercel Cron — 08h00 UTC chaque jour
// Génère les coupons IA + envoie sur Telegram + push web

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const SUPA  = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const AK    = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const CRON  = process.env.CRON_SECRET || ''
  const date  = new Date().toISOString().split('T')[0]

  const results = { generate: null, telegram: null, push: null }

  try {
    // 1. Générer les coupons IA
    const genRes = await fetch(`${SUPA}/functions/v1/generate-coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AK}`, 'apikey': AK },
      body: JSON.stringify({ date, admin_key: CRON })
    })
    results.generate = await genRes.json().catch(() => ({}))
    console.log('[CRON] generate:', JSON.stringify(results.generate))

    // 2. Envoyer sur Telegram
    const tgRes = await fetch(`${SUPA}/functions/v1/send-telegram-coupon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AK}`, 'apikey': AK },
      body: JSON.stringify({ date, secret: CRON })
    })
    results.telegram = await tgRes.json().catch(() => ({}))
    console.log('[CRON] telegram:', JSON.stringify(results.telegram))

    // 3. Envoyer push web (coupon Sûr)
    const safeCoupon = results.generate?.coupons?.find(c => c.tier === 'safe')
    if (safeCoupon) {
      const sels = (safeCoupon.selections || []).slice(0, 3)
        .filter(s => s.pick !== '🔒')
        .map(s => `⚽ ${s.team_a} vs ${s.team_b} → ${s.pick} (${s.odds})`)
        .join('\n')

      const pushRes = await fetch(`${SUPA}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AK}`, 'apikey': AK },
        body: JSON.stringify({
          secret: CRON,
          payload: {
            title: `🔮 Coupon Sûr du jour — ×${safeCoupon.total_odds}`,
            body: sels || 'Voir le coupon du jour sur Betoracl Pro',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            url: '/coupons',
            tag: 'daily-coupon'
          }
        })
      })
      results.push = await pushRes.json().catch(() => ({}))
      console.log('[CRON] push:', JSON.stringify(results.push))
    }

    res.status(200).json({ ok: true, date, ...results })
  } catch (e) {
    console.error('[CRON coupons] Erreur:', e.message)
    res.status(500).json({ error: e.message, ...results })
  }
}
