// api/tracking.js — configuration publique des pixels/balises actifs (lue par /tracking.js sur chaque page)
const { sb } = require('./_lib/admin')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET uniquement' })
  const r = await sb('tracking_tags?enabled=eq.true&select=kind,tag_id,custom_html,placement,pages&order=created_at.asc')
  // Échec (ex: table absente) : on renvoie une liste vide, la page ne doit jamais casser à cause du tracking.
  const tags = r.ok && Array.isArray(r.data) ? r.data : []
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json({ tags })
}
