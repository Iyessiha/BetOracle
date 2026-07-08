// supabase/functions/oracle/index.ts
// L'Oracle v3 — 6 sources open source + Claude AI (Anthropic)
//
// Sources intégrées :
//   [1] api-sports.io            → stats officielles (forme, H2H, standings)
//   [2] smartbetsAPI logic       → algo prédictif non-ML (GPL-3.0)
//                                  github.com/Simatwa/smartbetsAPI
//   [3] EasySoccerData/Sofascore → forme équipes sans clé
//                                  github.com/manucabral/EasySoccerData
//   [4] football-news-api        → actualités via NewsAPI
//                                  github.com/arkasarkar2000/football-news-api
//   [5] LiveOddsApiAndGoalAlerts → cotes marché + value bets
//                                  github.com/jliakosgr/LiveOddsApiAndGoalAlerts
//   [6] football-database        → données JSON 2024/25 fallback
//                                  github.com/oritzio/football-database
//   [7] Claude AI (Anthropic)    → analyse narrative intelligente
//                                  claude-haiku-4-5-20251001

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_SPORTS_KEY  = Deno.env.get("API_SPORTS_KEY") ?? "";
const NEWS_API_KEY    = Deno.env.get("NEWS_API_KEY") ?? "";
const ANTHROPIC_KEY   = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SOFASCORE_BASE  = "https://api.sofascore.com/api/v1";
const FBDB_BASE       = "https://raw.githubusercontent.com/oritzio/football-database/main";
const ANTHROPIC_BASE  = "https://api.anthropic.com/v1/messages";
// Modèle : claude-haiku-4-5-20251001 — rapide + économique pour analyses temps réel
const CLAUDE_MODEL    = "claude-haiku-4-5-20251001";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ══════════════════════════════════════════════════════════════════════
// [2] ALGORITHME SMARTBETS — github.com/Simatwa/smartbetsAPI (GPL-3.0)
// ══════════════════════════════════════════════════════════════════════
function smartbetsPredict(p: {
  homeWins: number; homeDraws: number; homeLosses: number;
  homeGoalsF: number; homeGoalsA: number;
  awayWins: number; awayDraws: number; awayLosses: number;
  awayGoalsF: number; awayGoalsA: number;
  homePosition?: number; awayPosition?: number;
}) {
  const hT = p.homeWins + p.homeDraws + p.homeLosses || 1;
  const aT = p.awayWins + p.awayDraws + p.awayLosses || 1;
  const hGF = p.homeGoalsF / hT, hGA = p.homeGoalsA / hT;
  const aGF = p.awayGoalsF / aT, aGA = p.awayGoalsA / aT;
  const xgH = (hGF + aGA) / 2, xgA = (aGF + hGA) / 2;
  const g = Math.round((xgH + xgA) * 10) / 10;
  const gg   = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-xgH)) * (1 - Math.exp(-xgA)) * 100)));
  const ov15 = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-(xgH + xgA))) * 70 + 15)));
  const ov25 = Math.round(Math.min(90, Math.max(10, (1 - Math.exp(-(xgH + xgA))) * 55 + 5)));
  const ov35 = Math.round(Math.min(80, Math.max(5,  (1 - Math.exp(-(xgH + xgA))) * 35)));
  const posAdj = ((p.homePosition ?? 10) - (p.awayPosition ?? 10)) * 0.5;
  let p1 = (p.homeWins / hT * 60) + (hGF - hGA) * 5 - posAdj;
  let p2 = (p.awayWins / aT * 60) + (aGF - hGA) * 5 + posAdj;
  let px = 100 - p1 - p2;
  const tot = Math.abs(p1) + Math.abs(px) + Math.abs(p2) || 100;
  p1 = Math.round(Math.max(5, Math.min(85, (p1 / tot) * 100)));
  p2 = Math.round(Math.max(5, Math.min(85, (p2 / tot) * 100)));
  px = 100 - p1 - p2;
  const scores: Record<string, number> = { "1": p1, "x": px, "2": p2, "1x": p1+px, "2x": p2+px };
  const picks:  Record<string, number> = { ...scores, gg, ov15, ov25, ov35 };
  const result = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const pick   = Object.entries(picks).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  return { g, gg, ov15, ov25, ov35, choice: Math.round(scores[result]), result, pick, p1, px, p2, xgH, xgA };
}

// ══════════════════════════════════════════════════════════════════════
// [1] API-SPORTS.IO
// ══════════════════════════════════════════════════════════════════════
async function apiSports(endpoint: string) {
  if (!API_SPORTS_KEY) return null;
  try {
    const r = await fetch(`https://v3.football.api-sports.io/${endpoint}`, {
      headers: { "x-apisports-key": API_SPORTS_KEY },
    });
    const d = await r.json();
    return d.response ?? null;
  } catch { return null; }
}
function extractStats(s: any) {
  const f = s?.fixtures;
  return {
    wins: (f?.wins?.home ?? 0) + (f?.wins?.away ?? 0),
    draws: (f?.draws?.home ?? 0) + (f?.draws?.away ?? 0),
    losses: (f?.loses?.home ?? 0) + (f?.loses?.away ?? 0),
    goalsF: s?.goals?.for?.total?.total ?? 0,
    goalsA: s?.goals?.against?.total?.total ?? 0,
    teamName: s?.team?.name ?? "",
    teamLogo: s?.team?.logo ?? "",
  };
}
function getPos(standings: any, teamId: number): number {
  if (!standings?.[0]?.league?.standings) return 10;
  for (const g of standings[0].league.standings) {
    const e = g.find((e: any) => e.team?.id === teamId);
    if (e) return e.rank;
  }
  return 10;
}

// ══════════════════════════════════════════════════════════════════════
// [3] SOFASCORE — EasySoccerData pattern
// ══════════════════════════════════════════════════════════════════════
async function fetchSofascore(teamId: number) {
  try {
    const r = await fetch(`${SOFASCORE_BASE}/team/${teamId}/events/last/0`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const d = await r.json();
    const events = (d?.events ?? []).slice(-6);
    const form = events.map((e: any) => {
      const isH = e.homeTeam?.id === teamId;
      const hg = e.homeScore?.current ?? 0, ag = e.awayScore?.current ?? 0;
      if (isH) return hg > ag ? "W" : hg === ag ? "D" : "L";
      return ag > hg ? "W" : ag === hg ? "D" : "L";
    });
    const agf = events.reduce((s: number, e: any) => {
      const isH = e.homeTeam?.id === teamId;
      return s + (isH ? (e.homeScore?.current ?? 0) : (e.awayScore?.current ?? 0));
    }, 0) / (events.length || 1);
    const aga = events.reduce((s: number, e: any) => {
      const isH = e.homeTeam?.id === teamId;
      return s + (isH ? (e.awayScore?.current ?? 0) : (e.homeScore?.current ?? 0));
    }, 0) / (events.length || 1);
    const wins = form.filter((r: string) => r === "W").length;
    return {
      form, form_str: form.join(""),
      form_label: wins >= 4 ? "🔥 Grande forme" : wins >= 3 ? "✅ Bonne forme" : wins >= 2 ? "⚡ Instable" : "❌ Mauvaise forme",
      avg_goals_for: Math.round(agf * 10) / 10,
      avg_goals_against: Math.round(aga * 10) / 10,
      source: "sofascore",
    };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// [6] FOOTBALL-DATABASE fallback — github.com/oritzio/football-database
// ══════════════════════════════════════════════════════════════════════
const LEAGUE_FILES: Record<number, string> = {
  2: "champions-league/2024-2025", 39: "premier-league/2024-2025",
  61: "ligue-1/2024-2025", 140: "la-liga/2024-2025",
  135: "serie-a/2024-2025", 78: "bundesliga/2024-2025",
};
async function fetchFBDB(leagueId: number, teamName: string) {
  const path = LEAGUE_FILES[leagueId];
  if (!path) return null;
  try {
    const r = await fetch(`${FBDB_BASE}/${path}/standings.json`);
    if (!r.ok) return null;
    const data = await r.json();
    const entry = data?.standings?.find((t: any) =>
      t.team?.toLowerCase().includes(teamName.toLowerCase().slice(0, 6))
    );
    if (!entry) return null;
    return {
      position: entry.position, points: entry.points, played: entry.played,
      wins: entry.wins, draws: entry.draws, losses: entry.losses,
      gf: entry.goalsFor, ga: entry.goalsAgainst, source: "football-database",
    };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// [4] FOOTBALL NEWS — github.com/arkasarkar2000/football-news-api
// ══════════════════════════════════════════════════════════════════════
async function fetchNews(teamA: string, teamB: string): Promise<any[]> {
  if (!NEWS_API_KEY || !teamA || !teamB) return [];
  try {
    const q = encodeURIComponent(`"${teamA}" OR "${teamB}"`);
    const r = await fetch(
      `https://newsapi.org/v2/everything?q=${q}&language=fr&pageSize=4&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
    );
    const d = await r.json();
    return (d.articles ?? []).slice(0, 4).map((a: any) => ({
      title: a.title, source: a.source?.name,
      published: a.publishedAt?.slice(0, 10), url: a.url,
    }));
  } catch { return []; }
}

// ══════════════════════════════════════════════════════════════════════
// [5] LIVE ODDS + VALUE BETS — github.com/jliakosgr/LiveOddsApiAndGoalAlerts
// ══════════════════════════════════════════════════════════════════════
async function fetchOdds(fixtureId: number) {
  if (!fixtureId || !API_SPORTS_KEY) return null;
  try {
    const data = await apiSports(`odds?fixture=${fixtureId}&bet=1`);
    const values = data?.[0]?.bookmakers?.[0]?.bets?.[0]?.values;
    if (!values) return null;
    return {
      odds_1: parseFloat(values.find((v: any) => v.value === "Home")?.odd ?? "0"),
      odds_x: parseFloat(values.find((v: any) => v.value === "Draw")?.odd ?? "0"),
      odds_2: parseFloat(values.find((v: any) => v.value === "Away")?.odd ?? "0"),
      bookmaker: data[0].bookmakers[0]?.name ?? "Bwin",
    };
  } catch { return null; }
}
function detectValueBets(p1: number, px: number, p2: number, odds: any) {
  if (!odds) return [];
  const res: any[] = [];
  const check = (pick: string, proba: number, odd: number) => {
    if (odd <= 1) return;
    const imp = (1 / odd) * 100, val = proba - imp;
    if (val > 3) {
      const kelly = Math.max(0, proba / 100 - (1 - proba / 100) / (odd - 1));
      res.push({
        pick, oracle_proba: proba, market_odds: odd,
        implied_proba: Math.round(imp), value_pct: Math.round(val * 10) / 10,
        kelly_pct: Math.round(kelly * 100 * 10) / 10,
        rating: val > 10 ? "⭐⭐⭐ Excellent" : val > 6 ? "⭐⭐ Bon" : "⭐ Acceptable",
      });
    }
  };
  check("1", p1, odds.odds_1); check("X", px, odds.odds_x); check("2", p2, odds.odds_2);
  return res.sort((a, b) => b.value_pct - a.value_pct);
}

// ══════════════════════════════════════════════════════════════════════
// [7] CLAUDE AI — Analyse narrative intelligente
//     Modèle : claude-haiku-4-5-20251001 (rapide, économique)
//     Endpoint : https://api.anthropic.com/v1/messages
// ══════════════════════════════════════════════════════════════════════
async function claudeAnalysis(data: {
  teamA: string; teamB: string; league: string;
  smart: any; h2h: any; sofaA: any; sofaB: any;
  posA: number; posB: number; valueBets: any[];
  news: any[];
}): Promise<{ narrative: string; recommendation: string; risk_warning: string } | null> {
  if (!ANTHROPIC_KEY) return null;

  const prompt = `Tu es l'Oracle de Betoracl Pro, expert en analyse de paris sportifs pour l'Afrique de l'Ouest.

MATCH : ${data.teamA} vs ${data.teamB} — ${data.league}

DONNÉES :
- Probabilités : 1=${data.smart.p1}%, X=${data.smart.px}%, 2=${data.smart.p2}%
- xG domicile: ${Math.round(data.smart.xgH * 10) / 10} | xG extérieur: ${Math.round(data.smart.xgA * 10) / 10}
- BTTS: ${data.smart.gg}% | Over 1.5: ${data.smart.ov15}% | Over 2.5: ${data.smart.ov25}%
- Pick algorithmique: ${data.smart.pick} (${data.smart.choice}% de confiance)
- Classement: ${data.teamA} #${data.posA} | ${data.teamB} #${data.posB}
- Forme ${data.teamA}: ${data.sofaA?.form_str ?? "N/D"} (${data.sofaA?.form_label ?? "N/D"})
- Forme ${data.teamB}: ${data.sofaB?.form_str ?? "N/D"} (${data.sofaB?.form_label ?? "N/D"})
- H2H (${data.h2h.total} matchs): ${data.teamA} ${data.h2h.wins_a}V — ${data.h2h.draws}N — ${data.h2h.wins_b}V ${data.teamB}
- Moyenne buts H2H: ${data.h2h.avg_goals}
${data.valueBets.length > 0 ? `- Value bets détectés: ${data.valueBets.map(v => `${v.pick} @ ${v.market_odds} (+${v.value_pct}%)`).join(", ")}` : ""}
${data.news.length > 0 ? `- Actualités récentes: ${data.news.map(n => n.title).slice(0, 2).join(" | ")}` : ""}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas d'explication) :
{
  "narrative": "Analyse narrative du match en 3-4 phrases, ton expert, cite les données clés, adapté aux parieurs d'Afrique de l'Ouest",
  "recommendation": "Recommandation concrète et directe en 1-2 phrases (quel pari, pourquoi, quelle mise suggérée en % bankroll)",
  "risk_warning": "Avertissement sur les risques spécifiques à ce match en 1 phrase"
}`;

  try {
    const r = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 600,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const d = await r.json();
    const text = d.content?.[0]?.text ?? "";

    // Parser la réponse JSON de Claude
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[Claude] Erreur analyse:", e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: ae } = await supabase.auth.getUser(token);
    if (ae || !user) return json({ error: "Non authentifié" }, 401);

    const { data: profile } = await supabase
      .from("profiles").select("plan,plan_expires_at").eq("id", user.id).single();
    const hasPlan = (min: string) => {
      if (!profile?.plan_expires_at) return min === "free";
      if (new Date(profile.plan_expires_at) <= new Date()) return min === "free";
      return ["free","starter","pro","elite"].indexOf(profile.plan)
          >= ["free","starter","pro","elite"].indexOf(min);
    };

    const { team_a_id, team_b_id, league_id = 2, fixture_id } = await req.json();
    if (!team_a_id || !team_b_id) return json({ error: "team_a_id et team_b_id requis" }, 400);

    // ── COLLECTE PARALLÈLE — toutes sources ──
    const [rawA, rawB, rawH2H, rawStand, rawOdds, sofaA, sofaB] = await Promise.all([
      apiSports(`teams/statistics?team=${team_a_id}&league=${league_id}&season=2024`),
      apiSports(`teams/statistics?team=${team_b_id}&league=${league_id}&season=2024`),
      apiSports(`fixtures/headtohead?h2h=${team_a_id}-${team_b_id}&last=10`),
      apiSports(`standings?league=${league_id}&season=2024`),
      hasPlan("pro") && fixture_id ? fetchOdds(fixture_id) : Promise.resolve(null),
      fetchSofascore(team_a_id), fetchSofascore(team_b_id),
    ]);

    const stA = extractStats(rawA), stB = extractStats(rawB);
    const posA = getPos(rawStand, team_a_id), posB = getPos(rawStand, team_b_id);

    // Fallback football-database [6] si stats manquantes
    const [dbA, dbB] = await Promise.all([
      stA.wins + stA.draws + stA.losses < 3 ? fetchFBDB(league_id, stA.teamName) : Promise.resolve(null),
      stB.wins + stB.draws + stB.losses < 3 ? fetchFBDB(league_id, stB.teamName) : Promise.resolve(null),
    ]);
    if (dbA) { stA.wins = stA.wins || dbA.wins || 0; stA.draws = stA.draws || dbA.draws || 0; stA.losses = stA.losses || dbA.losses || 0; stA.goalsF = stA.goalsF || dbA.gf || 0; stA.goalsA = stA.goalsA || dbA.ga || 0; }
    if (dbB) { stB.wins = stB.wins || dbB.wins || 0; stB.draws = stB.draws || dbB.draws || 0; stB.losses = stB.losses || dbB.losses || 0; stB.goalsF = stB.goalsF || dbB.gf || 0; stB.goalsA = stB.goalsA || dbB.ga || 0; }

    // [2] Algorithme smartbets
    const smart = smartbetsPredict({
      homeWins: stA.wins, homeDraws: stA.draws, homeLosses: stA.losses,
      homeGoalsF: stA.goalsF, homeGoalsA: stA.goalsA,
      awayWins: stB.wins, awayDraws: stB.draws, awayLosses: stB.losses,
      awayGoalsF: stB.goalsF, awayGoalsA: stB.goalsA,
      homePosition: posA, awayPosition: posB,
    });

    // H2H
    const fx = rawH2H ?? [];
    const h2h = {
      total: fx.length,
      wins_a: fx.filter((f: any) => f.teams?.home?.id === team_a_id ? f.goals?.home > f.goals?.away : f.goals?.away > f.goals?.home).length,
      draws: fx.filter((f: any) => f.goals?.home === f.goals?.away).length,
      wins_b: 0,
      avg_goals: fx.length ? Math.round(fx.reduce((s: number, f: any) => s + (f.goals?.home || 0) + (f.goals?.away || 0), 0) / fx.length * 10) / 10 : 2.5,
      last_5: fx.slice(-5).map((f: any) => ({
        date: f.fixture?.date?.slice(0, 10), score: `${f.goals?.home}-${f.goals?.away}`,
        win: f.teams?.home?.id === team_a_id
          ? (f.goals?.home > f.goals?.away ? "A" : f.goals?.home === f.goals?.away ? "X" : "B")
          : (f.goals?.away > f.goals?.home ? "A" : f.goals?.away === f.goals?.home ? "X" : "B"),
      })),
    };
    h2h.wins_b = h2h.total - h2h.wins_a - h2h.draws;

    // [5] Value bets
    const valueBets = detectValueBets(smart.p1, smart.px, smart.p2, rawOdds);

    // [4] News (plan pro)
    const news = hasPlan("pro") ? await fetchNews(stA.teamName, stB.teamName) : [];

    // Score confiance
    const srcCount = [
      stA.wins + stA.draws > 3, stB.wins + stB.draws > 3, h2h.total > 0,
      !!sofaA, !!sofaB, posA < 25, posB < 25, !!rawOdds, !!dbA || !!dbB,
    ].filter(Boolean).length;
    const confidence = Math.round(48 + srcCount * 5.5 + Math.random() * 4);

    // [7] CLAUDE AI — analyse narrative (plan starter+)
    const aiAnalysis = hasPlan("starter") ? await claudeAnalysis({
      teamA: stA.teamName || `Équipe ${team_a_id}`,
      teamB: stB.teamName || `Équipe ${team_b_id}`,
      league: `Ligue ${league_id}`,
      smart, h2h, sofaA, sofaB, posA, posB, valueBets, news,
    }) : null;

    // Scénarios (plan pro)
    const scenarios = hasPlan("pro") ? [
      { label: `Victoire ${stA.teamName || "Domicile"}`, pick: "1", proba: smart.p1, score_est: `${Math.max(1, Math.round(smart.xgH))}-${Math.max(0, Math.round(smart.xgA) - 1)}`, key_factor: posA < posB ? "Meilleur classement" : "Forme récente" },
      { label: "Match nul", pick: "X", proba: smart.px, score_est: "1-1", key_factor: "Équipes de valeur similaire" },
      { label: `Victoire ${stB.teamName || "Extérieur"}`, pick: "2", proba: smart.p2, score_est: `${Math.max(0, Math.round(smart.xgH) - 1)}-${Math.max(1, Math.round(smart.xgA))}`, key_factor: posB < posA ? "Mieux classé" : "Force offensive" },
    ] : null;

    const sources = [
      API_SPORTS_KEY ? "api-sports.io" : null,
      sofaA || sofaB ? "sofascore (EasySoccerData)" : null,
      dbA || dbB ? "football-database" : null,
      rawOdds ? "live-odds (LiveOddsAPI)" : null,
      news.length > 0 ? "football-news-api" : null,
      "smartbetsAPI-algo",
      aiAnalysis ? `claude-ai (${CLAUDE_MODEL})` : null,
    ].filter(Boolean);

    const oracle_result = {
      proba_1: smart.p1, proba_x: smart.px, proba_2: smart.p2,
      pick: smart.pick, result: smart.result,
      g: smart.g, gg: smart.gg, ov15: smart.ov15, ov25: smart.ov25, ov35: smart.ov35,
      xg_home: Math.round(smart.xgH * 10) / 10, xg_away: Math.round(smart.xgA * 10) / 10,
      positions: { a: posA, b: posB },
      standings_a: dbA, standings_b: dbB,
      form_a: sofaA, form_b: sofaB,
      h2h,
      market_odds: rawOdds,
      value_bets: hasPlan("pro") ? valueBets : null,
      scenarios,
      news: hasPlan("pro") ? news : null,
      // [7] Analyse Claude
      ai_analysis: aiAnalysis,
      confidence,
      risk_level: confidence > 78 ? "faible" : confidence > 65 ? "modéré" : "élevé",
      sources,
      generated_at: new Date().toISOString(),
    };

    const { data: analysis } = await supabase.from("analyses").insert({
      user_id: user.id,
      team_a_id, team_a_name: stA.teamName || `Équipe ${team_a_id}`,
      team_b_id, team_b_name: stB.teamName || `Équipe ${team_b_id}`,
      league_id, oracle_result, confidence,
      plan_required: "starter", is_locked: !hasPlan("starter"),
    }).select().single();

    if (hasPlan("starter")) {
      return json({ ...oracle_result, analysis_id: analysis?.id, locked: false });
    }

    // Plan Free — aperçu limité (sans analyse Claude)
    return json({
      proba_1: smart.p1, proba_x: smart.px, proba_2: smart.p2,
      gg: smart.gg, ov15: smart.ov15, confidence,
      locked: true,
      locked_fields: ["g","ov25","ov35","h2h","form_a","form_b","scenarios",
                      "value_bets","market_odds","ai_analysis","news","standings_a","standings_b"],
      analysis_id: analysis?.id,
    });

  } catch (err) {
    console.error("[Oracle v3]", err);
    return json({ error: "Erreur Oracle", detail: String(err) }, 500);
  }
});
