// Vercel Serverless Function — Cron 08h00 UTC
// Déclenché automatiquement par vercel.json -> crons

export default async function handler(req, res) {
  // Sécurité : Vercel envoie un header Authorization sur les crons
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const date = new Date().toISOString().split('T')[0]
    const EDGE_URL = 'https://ovulcqsrzkwlnhnyllij.supabase.co/functions/v1/send-telegram-coupon'

    const response = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date })
    })

    const data = await response.json()
    console.log('[CRON coupons]', JSON.stringify(data))
    res.status(200).json({ ok: true, date, result: data })
  } catch (e) {
    console.error('[CRON coupons] Erreur:', e.message)
    res.status(500).json({ error: e.message })
  }
}
