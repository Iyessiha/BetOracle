// /api/sitemap.js
// Remplace le sitemap.xml statique : inclut les pages fixes + une entrée par page de match
// publiée dans les 30 derniers jours (au-delà, le trafic de recherche devient négligeable).
// À combiner avec une règle de réécriture dans vercel.json :
//   { "source": "/sitemap.xml", "destination": "/api/sitemap" }

const SUPA_URL = 'https://ovulcqsrzkwlnhnyllij.supabase.co'
const SUPA_AK  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dWxjcXNyemt3bG5obnlsbGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNDc1NzgsImV4cCI6MjA5NjkyMzU3OH0.eJvZE2tgYB42CHYyosZGp8YiMZw4YJRJbdR3d_mmvLw'
const SITE = 'https://betoracl.com'

const STATIC_URLS = [
  { loc: '/', freq: 'daily', priority: '1.0' },
  { loc: '/coupons', freq: 'daily', priority: '0.9' },
  { loc: '/analyse', freq: 'daily', priority: '0.9' },
  { loc: '/comparateur', freq: 'daily', priority: '0.8' },
  { loc: '/signup', freq: 'monthly', priority: '0.8' },
  { loc: '/login', freq: 'monthly', priority: '0.6' },
  { loc: '/checkout', freq: 'weekly', priority: '0.7' },
  { loc: '/cgu', freq: 'yearly', priority: '0.3' },
]

module.exports = async (req, res) => {
  let matches = []
  try {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const r = await fetch(
      `${SUPA_URL}/rest/v1/match_pages?select=slug,match_date&published=eq.true&match_date=gte.${since}&order=match_date.desc&limit=2000`,
      { headers: { apikey: SUPA_AK } }
    )
    matches = await r.json().catch(() => [])
    if (!Array.isArray(matches)) matches = []
  } catch (e) {
    console.error('[sitemap]', e)
  }

  const staticEntries = STATIC_URLS.map(u =>
    `  <url><loc>${SITE}${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`
  ).join('\n')

  const matchEntries = matches.map(m =>
    `  <url><loc>${SITE}/pronostic/${m.slug}</loc><lastmod>${m.match_date}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`
  ).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${matchEntries}
</urlset>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')
  res.status(200).send(xml)
}
