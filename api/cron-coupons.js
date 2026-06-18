// Vercel Cron — 08h00 UTC chaque jour
// Génère et envoie les coupons + messages Telegram marketing

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const SUPA  = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const AK    = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const CRON  = process.env.CRON_SECRET || ''
  const date  = new Date().toISOString().split('T')[0]

  try {
    // 1. Générer les coupons IA du jour
    const genRes = await fetch(`${SUPA}/functions/v1/generate-coupons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AK}`,
        'apikey': AK
      },
      body: JSON.stringify({ date, admin_key: CRON })
    })
    const genData = await genRes.json().catch(() => ({}))
    console.log('[CRON coupons] generate:', JSON.stringify(genData))

    // 2. Envoyer sur Telegram
    const tgRes = await fetch(`${SUPA}/functions/v1/send-telegram-coupon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AK}`,
        'apikey': AK
      },
      body: JSON.stringify({ date, secret: CRON })
    })
    const tgData = await tgRes.json().catch(() => ({}))
    console.log('[CRON coupons] telegram:', JSON.stringify(tgData))

    res.status(200).json({ ok: true, date, generate: genData, telegram: tgData })
  } catch (e) {
    console.error('[CRON coupons] Erreur:', e.message)
    res.status(500).json({ error: e.message })
  }
}
