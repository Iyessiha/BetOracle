// Vercel Cron — 09h00 UTC chaque jour
// Envoie les emails marketing en attente (J+1, J+3, J+7, J+14)

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const SUPA = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const AK   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const CRON = process.env.CRON_SECRET || ''

  try {
    const r = await fetch(`${SUPA}/functions/v1/auth-secure?action=send-marketing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AK}`,
        'apikey': AK
      },
      body: JSON.stringify({ secret: CRON })
    })
    const data = await r.json().catch(() => ({}))
    console.log('[CRON marketing]', JSON.stringify(data))
    res.status(200).json({ ok: true, ...data })
  } catch (e) {
    console.error('[CRON marketing] Erreur:', e.message)
    res.status(500).json({ error: e.message })
  }
}
