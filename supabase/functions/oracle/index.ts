// supabase/functions/oracle/index.ts
// L'Oracle v2 — moteur enrichi par 5 sources open source
//
// Sources intégrées :
//   [1] api-sports.io        → stats officielles (forme, H2H, standings)
//   [2] smartbetsAPI logic   → algorithme prédictif non-ML (g, gg, ov15, ov25, pick)
//                              github.com/Simatwa/smartbetsAPI (GPL-3.0)
//   [3] EasySoccerData       → Sofascore comme source secondaire
//                              github.com/manucabral/EasySoccerData
//   [4] football-news-api    → actualités contextuelles du match
//                              github.com/arkasarkar2000/football-news-api
//   [5] LiveOddsApiAndGoalAlerts → cotes marché + détection value bets
//                              github.com/jliakosgr/LiveOddsApiAndGoalAlerts
//   [6] football-database    → données JSON statiques fallback saison 2024/25
//                              github.com/oritzio/football-database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_SPORTS_KEY = Deno.env.get("API_SPORTS_KEY") ?? "";
const NEWS_API_KEY   = Deno.env.get("NEWS_API_KEY") ?? "";
const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const FBDB_BASE      = "https://raw.githubusercontent.com/oritzio/football-database/main";

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
// [2] ALGORITHME SMARTBETS — traduit Python → TypeScript
//     github.com/Simatwa/smartbetsAPI (GPL-3.0)
//     Paramètres : forme home/away, buts, classement
//     Sorties : g, gg, ov15, ov25, ov35, choice, result, pick
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
  const hGF = p.homeGoalsF / hT;
  const hGA = p.homeGoalsA / hT;
  const aGF = p.awayGoalsF / aT;
  const aGA = p.awayGoalsA / aT;

  const xgH = (hGF + aGA) / 2;
  const xgA = (aGF + hGA) / 2;
  const g   = Math.round((xgH + xgA) * 10) / 10;

  // Probabilités Poisson
  const gg   = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-xgH)) * (1 - Math.exp(-xgA)) * 100)));
  const ov15 = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-(xgH + xgA))) * 70 + 15)));
  const ov25 = Math.round(Math.min(90, Math.max(10, (1 - Math.exp(-(xgH + xgA))) * 55 + 5)));
  const ov35 = Math.round(Math.min(80, Math.max(5,  (1 - Math.exp(-(xgH + xgA))) * 35)));

  // 1X2 avec ajustement classement
  const posAdj = ((p.homePosition ?? 10) - (p.awayPosition ?? 10)) * 0.5;
  let p1 = (p.homeWins / hT * 60) + (hGF - hGA) * 5 - posAdj;
  let p2 = (p.awayWins / aT * 60) + (aGF - hGA) * 5 + posAdj;
  let px = 100 - p1 - p2;
  const tot = Math.abs(p1) + Math.abs(px) + Math.abs(p2) || 100;
  p1 = Math.round(Math.max(5, Math.min(85, (p1 / tot) * 100)));
  p2 = Math.round(Math.max(5, Math.min(85, (p2 / tot) * 100)));
  px = 100 - p1 - p2;

  // Meilleur pick
  const scores: Record<string, number> = { "1": p1, "x": px, "2": p2, "1x": p1+px, "2x": p2+px };
  const picks:  Record<string, number> = { ...scores, gg, ov15, ov25, ov35 };
  const result = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const pick   = Object.entries(picks).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const choice = Math.round(scores[result]);

  return { g, gg, ov15, ov25, ov35, choice, result, pick, p1, px, p2, xgH, xgA };
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

function extractApiSportsStats(s: any) {
  const f = s?.fixtures;
  return {
    wins:     (f?.wins?.home ?? 0)  + (f?.wins?.away ?? 0),
    draws:    (f?.draws?.home ?? 0) + (f?.draws?.away ?? 0),
    losses:   (f?.loses?.home ?? 0) + (f?.loses?.away ?? 0),
    goalsF:   s?.goals?.for?.total?.total  ?? 0,
    goalsA:   s?.goals?.against?.total?.total ?? 0,
    teamName: s?.team?.name ?? "",
    teamLogo: s?.team?.logo ?? "",
  };
}

function getStandingPosition(standings: any, teamId: number): number {
  if (!standings?.[0]?.league?.standings) return 10;
  for (const group of standings[0].league.standings) {
    const e = group.find((e: any) => e.team?.id === teamId);
    if (e) return e.rank;
  }
  return 10;
}

// ══════════════════════════════════════════════════════════════════════
// [3] SOFASCORE — EasySoccerData pattern
//     github.com/manucabral/EasySoccerData
//     API publique Sofascore, sans clé
// ══════════════════════════════════════════════════════════════════════
async function fetchSofascore(teamId: number) {
  try {
    const r = await fetch(`${SOFASCORE_BASE}/team/${teamId}/events/last/0`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const d = await r.json();
    const events = (d?.events ?? []).slice(-6);
    const form = events.map((e: any) => {
      const isHome   = e.homeTeam?.id === teamId;
      const homeGoal = e.homeScore?.current ?? 0;
      const awayGoal = e.awayScore?.current ?? 0;
      if (isHome) return homeGoal > awayGoal ? "W" : homeGoal === awayGoal ? "D" : "L";
      return awayGoal > homeGoal ? "W" : awayGoal === homeGoal ? "D" : "L";
    });
    const avgGoalsFor  = events.reduce((s: number, e: any) => {
      const isHome = e.homeTeam?.id === teamId;
      return s + (isHome ? (e.homeScore?.current ?? 0) : (e.awayScore?.current ?? 0));
    }, 0) / (events.length || 1);
    const avgGoalsAgainst = events.reduce((s: number, e: any) => {
      const isHome = e.homeTeam?.id === teamId;
      return s + (isHome ? (e.awayScore?.current ?? 0) : (e.homeScore?.current ?? 0));
    }, 0) / (events.length || 1);

    return {
      form,
      form_str:        form.join(""),
      form_label:      form.filter((r: string) => r === "W").length >= 4 ? "🔥 Grande forme"
                     : form.filter((r: string) => r === "W").length >= 3 ? "✅ Bonne forme"
                     : form.filter((r: string) => r === "W").length >= 2 ? "⚡ Instable"
                     : "❌ Mauvaise forme",
      avg_goals_for:   Math.round(avgGoalsFor * 10) / 10,
      avg_goals_against: Math.round(avgGoalsAgainst * 10) / 10,
      source:          "sofascore",
    };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// [6] FOOTBALL-DATABASE — données JSON fallback
//     github.com/oritzio/football-database (saison 2024/25)
//     Ligues disponibles : UCL, PL, Ligue1, LaLiga, Serie A, Bundesliga
// ══════════════════════════════════════════════════════════════════════
const LEAGUE_FILES: Record<number, string> = {
  2:   "champions-league/2024-2025",
  39:  "premier-league/2024-2025",
  61:  "ligue-1/2024-2025",
  140: "la-liga/2024-2025",
  135: "serie-a/2024-2025",
  78:  "bundesliga/2024-2025",
};

async function fetchFootballDatabase(leagueId: number, teamName: string) {
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
      position: entry.position ?? null,
      points:   entry.points   ?? null,
      played:   entry.played   ?? null,
      wins:     entry.wins     ?? null,
      draws:    entry.draws    ?? null,
      losses:   entry.losses   ?? null,
      gf:       entry.goalsFor ?? null,
      ga:       entry.goalsAgainst ?? null,
      source:   "football-database",
    };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// [4] FOOTBALL NEWS — actualités contextuelles
//     Inspiré de github.com/arkasarkar2000/football-news-api
//     NewsAPI (gratuit 100 req/jour)
// ══════════════════════════════════════════════════════════════════════
async function fetchMatchNews(teamA: string, teamB: string): Promise<any[]> {
  if (!NEWS_API_KEY || !teamA || !teamB) return [];
  try {
    const q   = encodeURIComponent(`"${teamA}" OR "${teamB}"`);
    const r   = await fetch(
      `https://newsapi.org/v2/everything?q=${q}&language=fr&pageSize=4&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
    );
    const d = await r.json();
    return (d.articles ?? []).slice(0, 4).map((a: any) => ({
      title:       a.title,
      source:      a.source?.name,
      published:   a.publishedAt?.slice(0, 10),
      url:         a.url,
    }));
  } catch { return []; }
}

// ══════════════════════════════════════════════════════════════════════
// [5] COTES MARCHÉ + VALUE BETS
//     Inspiré de github.com/jliakosgr/LiveOddsApiAndGoalAlerts
//     Source : api-sports odds endpoint
// ══════════════════════════════════════════════════════════════════════
async function fetchMarketOdds(fixtureId: number) {
  if (!fixtureId || !API_SPORTS_KEY) return null;
  try {
    const data = await apiSports(`odds?fixture=${fixtureId}&bet=1`); // bet=1 = Match Winner
    const values = data?.[0]?.bookmakers?.[0]?.bets?.[0]?.values;
    if (!values) return null;
    return {
      odds_1:      parseFloat(values.find((v: any) => v.value === "Home")?.odd ?? "0"),
      odds_x:      parseFloat(values.find((v: any) => v.value === "Draw")?.odd ?? "0"),
      odds_2:      parseFloat(values.find((v: any) => v.value === "Away")?.odd ?? "0"),
      bookmaker:   data[0].bookmakers[0]?.name ?? "Bwin",
      updated_at:  data[0].update,
    };
  } catch { return null; }
}

function detectValueBets(p1: number, px: number, p2: number, odds: any) {
  if (!odds) return [];
  const results = [];
  const check = (pick: string, proba: number, odd: number) => {
    if (odd <= 1) return;
    const impliedP = (1 / odd) * 100;
    const value    = proba - impliedP;
    if (value > 3) {
      const kelly = Math.max(0, proba / 100 - (1 - proba / 100) / (odd - 1));
      results.push({
        pick,
        oracle_proba:   proba,
        market_odds:    odd,
        implied_proba:  Math.round(impliedP),
        value_pct:      Math.round(value * 10) / 10,
        kelly_pct:      Math.round(kelly * 100 * 10) / 10,
        rating:         value > 10 ? "⭐⭐⭐ Excellent" : value > 6 ? "⭐⭐ Bon" : "⭐ Acceptable",
      });
    }
  };
  check("1", p1, odds.odds_1);
  check("X", px, odds.odds_x);
  check("2", p2, odds.odds_2);
  return results.sort((a, b) => b.value_pct - a.value_pct);
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Auth
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user }, error: ae } = await supabase.auth.getUser(token);
    if (ae || !user) return json({ error: "Non authentifié" }, 401);

    // Plan
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

    // ── COLLECTE PARALLÈLE TOUTES SOURCES ──
    const [
      rawStatsA, rawStatsB, rawH2H, rawStandings, rawOdds,
      sofaA, sofaB,
    ] = await Promise.all([
      apiSports(`teams/statistics?team=${team_a_id}&league=${league_id}&season=2024`),
      apiSports(`teams/statistics?team=${team_b_id}&league=${league_id}&season=2024`),
      apiSports(`fixtures/headtohead?h2h=${team_a_id}-${team_b_id}&last=10`),
      apiSports(`standings?league=${league_id}&season=2024`),
      hasPlan("pro") && fixture_id ? fetchMarketOdds(fixture_id) : Promise.resolve(null),
      fetchSofascore(team_a_id),
      fetchSofascore(team_b_id),
    ]);

    // Extraire stats api-sports
    const stA = extractApiSportsStats(rawStatsA);
    const stB = extractApiSportsStats(rawStatsB);

    // Positions classement
    const posA = getStandingPosition(rawStandings, team_a_id);
    const posB = getStandingPosition(rawStandings, team_b_id);

    // Fallback football-database si api-sports vide
    const [dbA, dbB] = await Promise.all([
      stA.wins + stA.draws + stA.losses < 3 ? fetchFootballDatabase(league_id, stA.teamName) : Promise.resolve(null),
      stB.wins + stB.draws + stB.losses < 3 ? fetchFootballDatabase(league_id, stB.teamName) : Promise.resolve(null),
    ]);

    // Fusionner avec fallback [6]
    if (dbA) {
      stA.wins   = stA.wins   || dbA.wins   || 0;
      stA.draws  = stA.draws  || dbA.draws  || 0;
      stA.losses = stA.losses || dbA.losses || 0;
      stA.goalsF = stA.goalsF || dbA.gf     || 0;
      stA.goalsA = stA.goalsA || dbA.ga     || 0;
    }
    if (dbB) {
      stB.wins   = stB.wins   || dbB.wins   || 0;
      stB.draws  = stB.draws  || dbB.draws  || 0;
      stB.losses = stB.losses || dbB.losses || 0;
      stB.goalsF = stB.goalsF || dbB.gf     || 0;
      stB.goalsA = stB.goalsA || dbB.ga     || 0;
    }

    // ── [2] ALGORITHME SMARTBETS ──
    const smart = smartbetsPredict({
      homeWins: stA.wins, homeDraws: stA.draws, homeLosses: stA.losses,
      homeGoalsF: stA.goalsF, homeGoalsA: stA.goalsA,
      awayWins: stB.wins, awayDraws: stB.draws, awayLosses: stB.losses,
      awayGoalsF: stB.goalsF, awayGoalsA: stB.goalsA,
      homePosition: posA, awayPosition: posB,
    });

    // ── H2H ──
    const fx = rawH2H ?? [];
    const h2h = {
      total:    fx.length,
      wins_a:   fx.filter((f: any) => f.teams?.home?.id === team_a_id ? f.goals?.home > f.goals?.away : f.goals?.away > f.goals?.home).length,
      draws:    fx.filter((f: any) => f.goals?.home === f.goals?.away).length,
      wins_b:   0,
      avg_goals: fx.length
        ? Math.round(fx.reduce((s: number, f: any) => s + (f.goals?.home||0) + (f.goals?.away||0), 0) / fx.length * 10) / 10
        : 2.5,
      last_5: fx.slice(-5).map((f: any) => ({
        date:  f.fixture?.date?.slice(0,10),
        score: `${f.goals?.home}-${f.goals?.away}`,
        win:   f.teams?.home?.id === team_a_id
          ? (f.goals?.home > f.goals?.away ? "A" : f.goals?.home === f.goals?.away ? "X" : "B")
          : (f.goals?.away > f.goals?.home ? "A" : f.goals?.away === f.goals?.home ? "X" : "B"),
      })),
    };
    h2h.wins_b = h2h.total - h2h.wins_a - h2h.draws;

    // ── [5] VALUE BETS ──
    const valueBets = detectValueBets(smart.p1, smart.px, smart.p2, rawOdds);

    // ── SCORE CONFIANCE ──
    const srcCount = [
      stA.wins + stA.draws > 3,
      stB.wins + stB.draws > 3,
      h2h.total > 0,
      !!sofaA,
      !!sofaB,
      posA < 25,
      posB < 25,
      !!rawOdds,
      !!dbA || !!dbB,
    ].filter(Boolean).length;
    const confidence = Math.round(48 + srcCount * 5.5 + Math.random() * 4);

    // ── SCÉNARIOS PRO ──
    const scenarios = hasPlan("pro") ? [
      {
        label:      `Victoire ${stA.teamName || "Domicile"}`,
        pick:       "1", proba: smart.p1,
        score_est:  `${Math.max(1,Math.round(smart.xgH))}-${Math.max(0,Math.round(smart.xgA)-1)}`,
        key_factor: posA < posB ? "Meilleur classement + avantage domicile" : "Forme récente supérieure",
      },
      {
        label:      "Match nul",
        pick:       "X", proba: smart.px,
        score_est:  `1-1`,
        key_factor: "Valeur similaire, défenses solides",
      },
      {
        label:      `Victoire ${stB.teamName || "Extérieur"}`,
        pick:       "2", proba: smart.p2,
        score_est:  `${Math.max(0,Math.round(smart.xgH)-1)}-${Math.max(1,Math.round(smart.xgA))}`,
        key_factor: posB < posA ? "Mieux classé + bonne forme" : "Force offensive prouvée",
      },
    ] : null;

    // ── [4] ACTUALITÉS ──
    const news = hasPlan("pro")
      ? await fetchMatchNews(stA.teamName, stB.teamName)
      : [];

    // ── SOURCES UTILISÉES ──
    const sources = [
      API_SPORTS_KEY ? "api-sports.io" : null,
      sofaA || sofaB  ? "sofascore (EasySoccerData)"  : null,
      dbA || dbB      ? "football-database"             : null,
      rawOdds         ? "live-odds (LiveOddsAPI)"       : null,
      news.length > 0 ? "football-news-api"             : null,
      "smartbetsAPI-algo",
    ].filter(Boolean);

    // ── RÉSULTAT COMPLET ──
    const oracle_result = {
      // [2] Smartbets algo
      proba_1: smart.p1, proba_x: smart.px, proba_2: smart.p2,
      pick: smart.pick, result: smart.result,
      g: smart.g, gg: smart.gg, ov15: smart.ov15, ov25: smart.ov25, ov35: smart.ov35,
      xg_home: Math.round(smart.xgH * 10) / 10,
      xg_away: Math.round(smart.xgA * 10) / 10,
      // [1] Api-sports
      positions:   { a: posA, b: posB },
      standings_a: dbA,
      standings_b: dbB,
      // [3] Sofascore
      form_a: sofaA,
      form_b: sofaB,
      // H2H
      h2h,
      // [5] Cotes + value bets
      market_odds: rawOdds,
      value_bets:  hasPlan("pro") ? valueBets : null,
      // Scénarios
      scenarios,
      // [4] Actualités
      news: hasPlan("pro") ? news : null,
      // Oracle
      confidence,
      risk_level:  confidence > 78 ? "faible" : confidence > 65 ? "modéré" : "élevé",
      oracle_pick: {
        pick:       smart.pick,
        result:     smart.result,
        confidence,
        reasoning: [
          `xG domicile ${Math.round(smart.xgH*10)/10} · xG extérieur ${Math.round(smart.xgA*10)/10}`,
          `BTTS ${smart.gg}% · Over 1.5 ${smart.ov15}% · Over 2.5 ${smart.ov25}%`,
          sofaA ? `Forme ${stA.teamName} : ${sofaA.form_str} (${sofaA.form_label})` : "",
          sofaB ? `Forme ${stB.teamName} : ${sofaB.form_str} (${sofaB.form_label})` : "",
          h2h.wins_a > h2h.wins_b
            ? `H2H favorable ${stA.teamName} (${h2h.wins_a}V ${h2h.draws}N ${h2h.wins_b}D)`
            : `H2H favorable ${stB.teamName} (${h2h.wins_b}V ${h2h.draws}N ${h2h.wins_a}D)`,
          valueBets.length > 0 ? `Value bet détecté : ${valueBets[0].pick} @ ${valueBets[0].market_odds} (value +${valueBets[0].value_pct}%)` : "",
        ].filter(Boolean).join(" · "),
      },
      sources,
      generated_at: new Date().toISOString(),
    };

    // Sauvegarder
    const { data: analysis } = await supabase.from("analyses").insert({
      user_id:       user.id,
      team_a_id,     team_a_name: stA.teamName || `Équipe ${team_a_id}`,
      team_b_id,     team_b_name: stB.teamName || `Équipe ${team_b_id}`,
      league_id,     oracle_result, confidence,
      plan_required: "starter",
      is_locked:     !hasPlan("starter"),
    }).select().single();

    // Réponse selon plan
    if (hasPlan("starter")) {
      return json({ ...oracle_result, analysis_id: analysis?.id, locked: false });
    }

    // Plan Free — aperçu limité
    return json({
      proba_1: smart.p1, proba_x: smart.px, proba_2: smart.p2,
      gg: smart.gg, ov15: smart.ov15, confidence,
      locked: true,
      locked_fields: ["g","ov25","ov35","h2h","form_a","form_b","scenarios",
                      "value_bets","market_odds","oracle_pick","news","standings_a","standings_b"],
      analysis_id: analysis?.id,
    });

  } catch (err) {
    console.error("[Oracle v2]", err);
    return json({ error: "Erreur Oracle", detail: String(err) }, 500);
  }
});
