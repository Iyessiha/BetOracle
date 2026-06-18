// Vercel Cron — */5 14h-23h UTC
// Alertes live : buts, cartons, rappels pre-match via Telegram

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const SUPA = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const AK   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const CRON = process.env.CRON_SECRET || ''

  try {
    const r = await fetch(`${SUPA}/functions/v1/live-alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AK}`,
        'apikey': AK
      },
      body: JSON.stringify({ secret: CRON })
    })
    const data = await r.json().catch(() => ({}))
    console.log('[CRON live-alerts]', JSON.stringify(data))
    res.status(200).json({ ok: true, ...data })
  } catch (e) {
    console.error('[CRON live-alerts] Erreur:', e.message)
    res.status(500).json({ error: e.message })
  }
}
