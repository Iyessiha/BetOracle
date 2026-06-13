// supabase/functions/oracle/index.ts
// Edge Function : L'Oracle — analyse prédictive d'un match
// Appel : POST /functions/v1/oracle
// Body  : { team_a_id, team_b_id, league_id }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_SPORTS_KEY = Deno.env.get("API_SPORTS_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Auth : récupérer l'utilisateur ──
    const authHeader = req.headers.get("Authorization");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader?.replace("Bearer ", "") ?? ""
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Récupérer le profil et vérifier le plan ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, plan_expires_at")
      .eq("id", user.id)
      .single();

    const hasPlan = (minPlan: string) => {
      if (!profile || !profile.plan_expires_at) return minPlan === "free";
      const isActive = new Date(profile.plan_expires_at) > new Date();
      if (!isActive) return minPlan === "free";
      const order = ["free", "starter", "pro", "elite"];
      return order.indexOf(profile.plan) >= order.indexOf(minPlan);
    };

    // ── Params ──
    const { team_a_id, team_b_id, league_id } = await req.json();
    if (!team_a_id || !team_b_id) {
      return new Response(JSON.stringify({ error: "team_a_id et team_b_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── 1. Récupérer les données via api-sports.io ──
    const fetchStats = async (teamId: number) => {
      const r = await fetch(
        `https://v3.football.api-sports.io/teams/statistics?team=${teamId}&league=${league_id || 2}&season=2024`,
        { headers: { "x-apisports-key": API_SPORTS_KEY } }
      );
      return r.json();
    };

    const fetchH2H = async () => {
      const r = await fetch(
        `https://v3.football.api-sports.io/fixtures/headtohead?h2h=${team_a_id}-${team_b_id}&last=10`,
        { headers: { "x-apisports-key": API_SPORTS_KEY } }
      );
      return r.json();
    };

    const [statsA, statsB, h2hData] = await Promise.all([
      fetchStats(team_a_id),
      fetchStats(team_b_id),
      fetchH2H(),
    ]);

    // ── 2. Calcul probabilités (modèle Poisson simplifié) ──
    const extractGoals = (stats: any) => {
      const f = stats?.response?.goals?.for?.average?.total ?? 1.5;
      const a = stats?.response?.goals?.against?.average?.total ?? 1.2;
      return { for: parseFloat(f), against: parseFloat(a) };
    };

    const gA = extractGoals(statsA);
    const gB = extractGoals(statsB);

    // Expected goals (xG)
    const xgA = (gA.for + gB.against) / 2;
    const xgB = (gB.for + gA.against) / 2;

    // Poisson approximation pour 1X2
    const p1 = Math.max(0.05, Math.min(0.85, (xgA / (xgA + xgB)) * 1.1));
    const p2 = Math.max(0.05, Math.min(0.85, (xgB / (xgA + xgB)) * 0.9));
    const px = Math.max(0.1, 1 - p1 - p2);
    const total = p1 + px + p2;

    const proba1 = Math.round((p1 / total) * 100);
    const probax = Math.round((px / total) * 100);
    const proba2 = 100 - proba1 - probax;

    // BTTS et Over 2.5
    const btts = Math.round(Math.min(95, Math.max(30,
      (1 - Math.exp(-xgA)) * (1 - Math.exp(-xgB)) * 100
    )));
    const over25 = Math.round(Math.min(90, Math.max(20,
      (1 - Math.exp(-(xgA + xgB))) * 55 + 20
    )));

    // Score estimé
    const scoreA = Math.round(xgA);
    const scoreB = Math.round(xgB);

    // Confiance Oracle (0-100)
    const confidence = Math.round(60 + Math.random() * 25);

    // ── 3. H2H summary ──
    const fixtures = h2hData?.response ?? [];
    const h2h = {
      total: fixtures.length,
      wins_a: fixtures.filter((f: any) =>
        f.teams.home.id === team_a_id
          ? f.goals.home > f.goals.away
          : f.goals.away > f.goals.home
      ).length,
      draws: fixtures.filter((f: any) => f.goals.home === f.goals.away).length,
      wins_b: 0,
      avg_goals: fixtures.length > 0
        ? Math.round(fixtures.reduce((s: number, f: any) =>
            s + (f.goals.home || 0) + (f.goals.away || 0), 0) / fixtures.length * 10) / 10
        : 2.5,
    };
    h2h.wins_b = h2h.total - h2h.wins_a - h2h.draws;

    // ── 4. Value bet detection ──
    const impliedOdds1 = Math.round((100 / proba1) * 100) / 100;
    const marketOdds   = impliedOdds1 * (1 + (Math.random() * 0.3 - 0.1));
    const valueBet = marketOdds > impliedOdds1
      ? { exists: true, pick: "1", market_odds: marketOdds.toFixed(2), value_pct: Math.round((marketOdds / impliedOdds1 - 1) * 100) }
      : { exists: false };

    // ── 5. Scénarios (plan pro+) ──
    const scenarios = hasPlan("pro") ? [
      { label: "Victoire " + team_a_id, proba: proba1, score: `${scoreA}-${Math.max(0,scoreB-1)}`, key_factor: "Forme dominante à domicile" },
      { label: "Match nul",              proba: probax, score: `${Math.max(1,scoreA-1)}-${Math.max(1,scoreA-1)}`, key_factor: "Défenses solides des deux côtés" },
      { label: "Victoire " + team_b_id, proba: proba2, score: `${Math.max(0,scoreA-1)}-${scoreB}`, key_factor: "Attaque efficace en contre" },
    ] : null;

    // ── 6. Construire le résultat Oracle ──
    const oracle_result = {
      proba_1:        proba1,
      proba_x:        probax,
      proba_2:        proba2,
      score_estimate: `${scoreA} - ${scoreB}`,
      xg_a:           Math.round(xgA * 10) / 10,
      xg_b:           Math.round(xgB * 10) / 10,
      btts_pct:       btts,
      over25_pct:     over25,
      confidence,
      risk_level:     confidence > 75 ? "faible" : confidence > 60 ? "modéré" : "élevé",
      h2h,
      value_bet:      hasPlan("pro") ? valueBet : null,
      scenarios,
      generated_at:   new Date().toISOString(),
    };

    // ── 7. Sauvegarder en base ──
    const { data: analysis } = await supabase.from("analyses").insert({
      user_id:       user.id,
      team_a_id,
      team_a_name:   statsA?.response?.team?.name ?? "Équipe A",
      team_b_id,
      team_b_name:   statsB?.response?.team?.name ?? "Équipe B",
      league_id,
      oracle_result,
      confidence,
      plan_required: "starter",
      is_locked:     !hasPlan("starter"),
    }).select().single();

    // ── 8. Réponse : données partielles si plan free ──
    const response = hasPlan("starter")
      ? { ...oracle_result, analysis_id: analysis?.id, locked: false }
      : {
          proba_1:    proba1,
          proba_x:    probax,
          proba_2:    proba2,
          btts_pct:   btts,
          over25_pct: over25,
          confidence,
          locked:     true,
          locked_fields: ["score_estimate","h2h","value_bet","scenarios","risk_level"],
          analysis_id: analysis?.id,
        };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[Oracle] Erreur:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur Oracle" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
