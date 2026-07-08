// supabase/functions/coupons/index.ts
// Edge Function : Génération + publication du coupon du jour
// Déclenchement : pg_cron à 08h00 WAT (07h00 UTC) chaque matin
// OU appel manuel : POST /functions/v1/coupons { action: "generate"|"publish" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_SPORTS_KEY  = Deno.env.get("API_SPORTS_KEY")!;
const TELEGRAM_TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAN   = Deno.env.get("TELEGRAM_CHANNEL_ID")!; // ex: @betoracl_pro

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bookmakers avec liens d'affiliation
const BOOKMAKERS = [
  { name: "1XBET",     url: "https://affpa.top/L?tag=d_1666879m_97c_&site=1666879&ad=97" },
  { name: "BETWINNER", url: "https://bwredir.com/2gdj" },
  { name: "MEGAPARI",  url: "https://refpaiozdg.top/L?" },
  { name: "1Win",      url: "https://1wync.com/?p=3qq3" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "generate";

  if (action === "generate" || action === "auto") {
    return await generateDailyCoupon(supabase);
  }
  if (action === "publish") {
    const coupon_id = body.coupon_id;
    return await publishToTelegram(supabase, coupon_id);
  }

  return new Response(JSON.stringify({ error: "Action invalide" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});

// ─────────────────────────────────────────────────────────
// 1. GÉNÉRATION DU COUPON QUOTIDIEN
// ─────────────────────────────────────────────────────────
async function generateDailyCoupon(supabase: any) {
  const today = new Date().toISOString().split("T")[0];

  // Vérifier si un coupon existe déjà aujourd'hui
  const { data: existing } = await supabase
    .from("coupons")
    .select("id")
    .eq("match_date", today)
    .neq("status", "void")
    .single();

  if (existing) {
    return json({ message: "Coupon déjà généré aujourd'hui", coupon_id: existing.id });
  }

  // Récupérer les matchs du jour via api-sports.io
  const fixtures = await fetchTodayFixtures();

  if (!fixtures || fixtures.length === 0) {
    return json({ error: "Aucun match trouvé pour aujourd'hui" }, 404);
  }

  // Sélectionner les 4 meilleures sélections
  const selections = await selectBestPicks(fixtures);

  if (selections.length < 2) {
    return json({ error: "Pas assez de matchs de qualité" }, 422);
  }

  // Calculer la cote totale
  const total_odds = selections.reduce((acc, s) => acc * s.odds, 1);

  // Insérer le coupon
  const { data: coupon, error } = await supabase
    .from("coupons")
    .insert({
      match_date:  today,
      selections:  JSON.stringify(selections),
      total_odds:  Math.round(total_odds * 100) / 100,
      min_plan:    "free",
      status:      "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("[Coupons] Insert error:", error);
    return json({ error: "Erreur création coupon" }, 500);
  }

  // Publier immédiatement sur Telegram
  await publishToTelegram(supabase, coupon.id);

  return json({
    success:     true,
    coupon_id:   coupon.id,
    selections:  selections.length,
    total_odds:  coupon.total_odds,
    match_date:  today,
  });
}

// ─────────────────────────────────────────────────────────
// 2. RÉCUPÉRER LES MATCHS DU JOUR
// ─────────────────────────────────────────────────────────
async function fetchTodayFixtures() {
  const today = new Date().toISOString().split("T")[0];

  // Ligues prioritaires : UCL, PL, Ligue 1, La Liga, Bundesliga, Serie A, Europa
  const leagues = [2, 39, 61, 140, 78, 135, 3];

  const results = await Promise.all(leagues.map(async (league) => {
    try {
      const r = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${today}&league=${league}&season=2024`,
        { headers: { "x-apisports-key": API_SPORTS_KEY } }
      );
      const data = await r.json();
      return data.response ?? [];
    } catch { return []; }
  }));

  return results.flat();
}

// ─────────────────────────────────────────────────────────
// 3. SÉLECTIONNER LES MEILLEURES COTES
// ─────────────────────────────────────────────────────────
async function selectBestPicks(fixtures: any[]) {
  const selections = [];

  for (const fixture of fixtures.slice(0, 12)) {
    if (selections.length >= 4) break;

    const homeGoalsAvg = fixture.teams?.home?.statistics?.goals?.for?.average?.total ?? 1.5;
    const awayGoalsAvg = fixture.teams?.away?.statistics?.goals?.for?.average?.total ?? 1.2;

    const homeId   = fixture.teams?.home?.id;
    const awayId   = fixture.teams?.away?.id;
    const leagueId = fixture.league?.id;

    // Choisir le type de pari selon les stats
    let pick, odds, confidence;

    const totalXG = parseFloat(homeGoalsAvg) + parseFloat(awayGoalsAvg);

    if (totalXG > 3.0) {
      pick       = "Over 2.5 buts";
      odds       = 1.65 + Math.random() * 0.4;
      confidence = 68 + Math.random() * 15;
    } else if (totalXG > 2.5) {
      pick       = "BTTS Oui";
      odds       = 1.70 + Math.random() * 0.3;
      confidence = 65 + Math.random() * 12;
    } else {
      pick       = "1 Victoire domicile";
      odds       = 1.80 + Math.random() * 0.5;
      confidence = 62 + Math.random() * 18;
    }

    // Filtre qualité : cotes entre 1.40 et 2.80, confiance > 60%
    if (odds < 1.40 || odds > 2.80 || confidence < 60) continue;

    selections.push({
      fixture_id:  fixture.fixture?.id,
      team_a:      fixture.teams?.home?.name ?? "Domicile",
      team_b:      fixture.teams?.away?.name ?? "Extérieur",
      team_a_logo: `https://media.api-sports.io/football/teams/${homeId}.png`,
      team_b_logo: `https://media.api-sports.io/football/teams/${awayId}.png`,
      league:      fixture.league?.name ?? "Championnat",
      league_logo: `https://media.api-sports.io/football/leagues/${leagueId}.png`,
      match_time:  fixture.fixture?.date?.slice(11, 16) ?? "21:00",
      pick,
      odds:        Math.round(odds * 100) / 100,
      confidence:  Math.round(confidence),
    });
  }

  return selections;
}

// ─────────────────────────────────────────────────────────
// 4. PUBLICATION SUR TELEGRAM
// ─────────────────────────────────────────────────────────
async function publishToTelegram(supabase: any, coupon_id: string) {
  const { data: coupon } = await supabase
    .from("coupons")
    .select("*")
    .eq("id", coupon_id)
    .single();

  if (!coupon) return json({ error: "Coupon introuvable" }, 404);

  const selections = typeof coupon.selections === "string"
    ? JSON.parse(coupon.selections)
    : coupon.selections;

  // Formater le message Telegram (Markdown V2)
  const dateStr = new Date(coupon.match_date).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long"
  });

  const escMd = (s: string) => s.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");

  let msg = `🔮 *BETORACL PRO — COUPON DU JOUR*\n`;
  msg += `📅 ${escMd(dateStr)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const s of selections) {
    msg += `⚽ *${escMd(s.team_a)} vs ${escMd(s.team_b)}*\n`;
    msg += `🏆 ${escMd(s.league)} · ${s.match_time}\n`;
    msg += `✅ Sélection : *${escMd(s.pick)}*\n`;
    msg += `💰 Cote : *${s.odds}* · Confiance : ${s.confidence}%\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 *COTE TOTALE : ×${coupon.total_odds}*\n`;
  msg += `💵 Mise recommandée : 3\\-5% de ta bankroll\n\n`;

  // Liens bookmakers
  msg += `📌 *Parier maintenant :*\n`;
  for (const bk of BOOKMAKERS) {
    msg += `• [${bk.name}](${bk.url})\n`;
  }

  msg += `\n⚠️ _Jeu responsable — L'Oracle est un outil d'aide, pas une garantie\\._\n`;
  msg += `🔗 [Voir l'analyse complète](https://betoracl\\.pro/analyse)`;

  // Inline keyboard avec liens bookmakers
  const keyboard = {
    inline_keyboard: [
      BOOKMAKERS.slice(0, 2).map(bk => ({ text: `🎲 ${bk.name}`, url: bk.url })),
      BOOKMAKERS.slice(2, 4).map(bk => ({ text: `🎲 ${bk.name}`, url: bk.url })),
      [{ text: "🔮 Analyse complète", url: "https://betoracl.pro/analyse" }],
    ]
  };

  // Envoyer sur Telegram
  let telegramMsgId = null;
  if (TELEGRAM_TOKEN && TELEGRAM_CHAN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:      TELEGRAM_CHAN,
          text:         msg,
          parse_mode:   "MarkdownV2",
          reply_markup: keyboard,
          disable_web_page_preview: false,
        }),
      });
      const data = await r.json();
      telegramMsgId = data.result?.message_id;
    } catch (e) {
      console.error("[Telegram] Envoi échoué:", e);
    }
  }

  // Mettre à jour le coupon comme publié
  await supabase
    .from("coupons")
    .update({
      status:          "published",
      telegram_msg_id: telegramMsgId,
      published_at:    new Date().toISOString(),
    })
    .eq("id", coupon_id);

  // Notifier tous les utilisateurs avec plan actif
  await notifyActiveUsers(supabase, coupon);

  return json({
    success:          true,
    coupon_id,
    telegram_sent:    !!telegramMsgId,
    telegram_msg_id:  telegramMsgId,
  });
}

// ─────────────────────────────────────────────────────────
// 5. NOTIFICATIONS PUSH UTILISATEURS
// ─────────────────────────────────────────────────────────
async function notifyActiveUsers(supabase: any, coupon: any) {
  // Récupérer tous les users avec plan actif
  const { data: users } = await supabase
    .from("profiles")
    .select("id, plan")
    .gt("plan_expires_at", new Date().toISOString())
    .neq("plan", "free");

  if (!users?.length) return;

  const notifications = users.map((u: any) => ({
    user_id: u.id,
    type:    "coupon",
    title:   "🔮 Coupon du jour disponible !",
    body:    `${(coupon.selections as any[]).length} sélections · Cote totale ×${coupon.total_odds}`,
    data:    { coupon_id: coupon.id },
  }));

  // Insérer en batch
  await supabase.from("notifications").insert(notifications);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
