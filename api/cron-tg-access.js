// Vercel Cron — 08h01 UTC chaque jour
// Kick automatique des membres Elite expirés

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const r = await fetch(
      'https://ovulcqsrzkwlnhnyllij.supabase.co/functions/v1/tg-access',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_expired' }),
      }
    )
    const data = await r.json()
    console.log('[CRON tg-access]', JSON.stringify(data))
    res.status(200).json({ ok: true, result: data })
  } catch (e) {
    console.error('[CRON tg-access] Erreur:', e.message)
    res.status(500).json({ error: e.message })
  }
}
