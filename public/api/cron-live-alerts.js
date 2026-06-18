export const config = { runtime: 'edge' }
export default async function handler(req) {
  const SUPA = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
  const AK   = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const CRON = process.env.CRON_SECRET || ''
  const res  = await fetch(`${SUPA}/functions/v1/live-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': AK },
    body: JSON.stringify({ secret: CRON })
  })
  const data = await res.json().catch(() => ({}))
  return new Response(JSON.stringify({ ok: true, ...data }), { status: 200 })
}
