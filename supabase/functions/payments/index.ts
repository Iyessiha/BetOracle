// supabase/functions/payments/index.ts
// GeniusPay v3 — API Marchand officielle
// Doc : https://pay.genius.ci/docs/api
//
// Actions :
//   initiate → POST /api/v1/merchant/payments → checkout_url GeniusPay
//   verify   → GET  /api/v1/merchant/payments/{reference} → activer abonnement
//   webhook  → reçoit les events GeniusPay (payment.completed, payment.failed)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GP_API_KEY    = Deno.env.get("GENIUSPAY_API_KEY") ?? "";
const GP_API_SECRET = Deno.env.get("GENIUSPAY_API_SECRET") ?? "";
const APP_URL       = Deno.env.get("APP_URL") ?? "https://bet-oracle.vercel.app";

// Base URL GeniusPay
const GP_BASE = "https://pay.genius.ci/api/v1/merchant/payments";

// Tarifs Betoracle Pro (FCFA)
const PRICES: Record<string, Record<string, number>> = {
  starter: { week: 500,  month: 1500 },
  pro:     { week: 1000, month: 3000 },
  elite:   { week: 2000, month: 6000 },
};

const DURATIONS: Record<string, number> = {
  week:  7  * 24 * 3600 * 1000,
  month: 30 * 24 * 3600 * 1000,
};

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-geniuspay-signature",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Headers GeniusPay
function gpHeaders() {
  return {
    "Content-Type":  "application/json",
    "X-API-Key":     GP_API_KEY,
    "X-API-Secret":  GP_API_SECRET,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url    = new URL(req.url);
  const body   = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const action = body.action ?? url.searchParams.get("action") ?? "";

  // ══════════════════════════════════════════════
  // WEBHOOK GeniusPay (pas d'auth Supabase requise)
  // ══════════════════════════════════════════════
  if (action === "webhook" || url.pathname.endsWith("/webhook")) {
    return handleWebhook(req, body);
  }

  // ══════════════════════════════════════════════
  // AUTH SUPABASE pour les autres actions
  // ══════════════════════════════════════════════
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const { data: { user }, error: ae } = await supabase.auth.getUser(token);
  if (ae || !user) return json({ error: "Non authentifié" }, 401);

  // ══════════════════════════════════════════════
  // ACTION : INITIATE — Créer un paiement GeniusPay
  // ══════════════════════════════════════════════
  if (action === "initiate") {
    const { plan, period, phone } = body;

    if (!plan || !period) return json({ error: "plan et period requis" }, 400);

    const amount = PRICES[plan]?.[period];
    if (!amount) return json({ error: "Plan ou période invalide" }, 400);

    // Référence interne
    const tx_reference = `BOP-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

    // Récupérer le profil pour nom + email
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .single();

    // Créer subscription pending dans Supabase
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .insert({
        user_id:        user.id,
        plan,
        period,
        amount_fcfa:    amount,
        payment_method: "geniuspay",
        tx_reference,
        status:         "pending",
      })
      .select()
      .single();

    if (subErr) {
      console.error("[Payments] Insert sub:", subErr);
      return json({ error: "Erreur création transaction" }, 500);
    }

    // Appel API GeniusPay — pas de payment_method → page checkout universelle
    const gpPayload: Record<string, unknown> = {
      amount,
      currency:    "XOF",
      description: `Betoracle Pro — Plan ${plan.charAt(0).toUpperCase()+plan.slice(1)} (${period === "week" ? "1 semaine" : "1 mois"})`,
      customer: {
        name:    profile?.full_name || user.email?.split("@")[0] || "Client",
        email:   user.email,
        phone:   phone || profile?.phone || "",
        country: "CI",
      },
      success_url: `${APP_URL}/payment-success.html?ref=${tx_reference}&sub=${sub.id}`,
      error_url:   `${APP_URL}/payment-error.html?ref=${tx_reference}`,
      metadata: {
        user_id:       user.id,
        subscription_id: sub.id,
        tx_reference,
        plan,
        period,
      },
    };

    // Si téléphone fourni → paiement direct (Wave auto-détecté par GeniusPay)
    if (phone) gpPayload.customer = { ...gpPayload.customer as object, phone };

    let gpData: any = null;
    let checkout_url = "";

    if (GP_API_KEY && GP_API_SECRET) {
      try {
        const gpRes = await fetch(GP_BASE, {
          method:  "POST",
          headers: gpHeaders(),
          body:    JSON.stringify(gpPayload),
        });

        const gpJson = await gpRes.json();
        console.log("[GeniusPay] Réponse:", JSON.stringify(gpJson));

        if (gpJson.success && gpJson.data) {
          gpData      = gpJson.data;
          checkout_url = gpData.checkout_url || gpData.payment_url || "";

          // Stocker la référence GeniusPay
          await supabase.from("subscriptions")
            .update({ tx_id: String(gpData.id || gpData.reference) })
            .eq("id", sub.id);
        } else {
          console.error("[GeniusPay] Erreur:", gpJson);
        }
      } catch (e) {
        console.error("[GeniusPay] Fetch error:", e);
      }
    } else {
      // Mode démo — pas de clés configurées
      checkout_url = `${APP_URL}/payment-demo.html?ref=${tx_reference}&amount=${amount}&plan=${plan}`;
      console.warn("[Payments] Clés GeniusPay non configurées — mode démo");
    }

    return json({
      success:         true,
      tx_reference,
      subscription_id: sub.id,
      amount,
      plan,
      period,
      checkout_url,
      geniuspay_id:    gpData?.id,
      geniuspay_ref:   gpData?.reference,
      mode:            GP_API_KEY ? "live" : "demo",
    });
  }

  // ══════════════════════════════════════════════
  // ACTION : VERIFY — Vérifier et activer le paiement
  // ══════════════════════════════════════════════
  if (action === "verify") {
    const { tx_reference, geniuspay_reference } = body;
    if (!tx_reference) return json({ error: "tx_reference requis" }, 400);

    // Récupérer la subscription locale
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tx_reference", tx_reference)
      .eq("user_id", user.id)
      .single();

    if (!sub) return json({ error: "Transaction introuvable" }, 404);
    if (sub.status === "active") return json({ status: "already_active", subscription: sub });

    // Vérifier côté GeniusPay
    let gpStatus = "pending";
    const refToCheck = geniuspay_reference || sub.tx_id;

    if (GP_API_KEY && GP_API_SECRET && refToCheck) {
      try {
        const gpRes = await fetch(`${GP_BASE}/${refToCheck}`, {
          headers: gpHeaders(),
        });
        const gpJson = await gpRes.json();
        console.log("[GeniusPay] Verify:", JSON.stringify(gpJson?.data?.status));

        if (gpJson.success && gpJson.data) {
          gpStatus = gpJson.data.status; // "pending" | "completed" | "failed"
        }
      } catch (e) {
        console.error("[GeniusPay] Verify error:", e);
      }
    }

    if (gpStatus !== "completed") {
      return json({ status: gpStatus, message: "Paiement non encore confirmé" });
    }

    // Activer
    return await activateSubscription(supabase, sub, user.id);
  }

  // ══════════════════════════════════════════════
  // ACTION : STATUS — Statut d'une transaction
  // ══════════════════════════════════════════════
  if (action === "status") {
    const { tx_reference } = body;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tx_reference", tx_reference)
      .eq("user_id", user.id)
      .single();
    return json(sub ? { found: true, status: sub.status, subscription: sub } : { found: false });
  }

  return json({ error: "Action invalide. Utiliser: initiate | verify | status | webhook" }, 400);
});

// ══════════════════════════════════════════════
// WEBHOOK GeniusPay
// ══════════════════════════════════════════════
async function handleWebhook(req: Request, body: any) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Extraire les données de l'événement GeniusPay
  // Format webhook : { event: "payment.completed", data: { reference, metadata, status, amount } }
  const event    = body.event ?? body.type ?? "";
  const data     = body.data ?? body;
  const reference = data.reference ?? data.tx_reference ?? "";
  const metadata  = data.metadata ?? {};

  console.log("[Webhook] Event:", event, "Ref:", reference);

  if (!event || !reference) {
    return new Response("OK", { status: 200 });
  }

  // Trouver la subscription via metadata ou tx_id
  const txRef = metadata.tx_reference || reference;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .or(`tx_reference.eq.${txRef},tx_id.eq.${reference}`)
    .single();

  if (!sub) {
    console.warn("[Webhook] Subscription non trouvée pour ref:", reference);
    return new Response("OK", { status: 200 });
  }

  if (event === "payment.completed" || data.status === "completed") {
    await activateSubscription(supabase, sub, sub.user_id);
    console.log("[Webhook] ✅ Abonnement activé pour user:", sub.user_id);
  }

  if (event === "payment.failed" || data.status === "failed") {
    await supabase.from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", sub.id);
    console.log("[Webhook] ❌ Paiement échoué pour sub:", sub.id);
  }

  return new Response("OK", { status: 200 });
}

// ══════════════════════════════════════════════
// ACTIVER UN ABONNEMENT
// ══════════════════════════════════════════════
async function activateSubscription(supabase: any, sub: any, userId: string) {
  const starts_at = new Date();
  const ends_at   = new Date(starts_at.getTime() + DURATIONS[sub.period]);

  // Mettre à jour la subscription
  await supabase.from("subscriptions")
    .update({ status: "active", starts_at, ends_at })
    .eq("id", sub.id);

  // Mettre à jour le profil utilisateur
  await supabase.from("profiles")
    .update({ plan: sub.plan, plan_expires_at: ends_at })
    .eq("id", userId);

  // Parrainage : marquer comme subscribed
  const { data: ref } = await supabase
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", userId)
    .eq("status", "pending")
    .single();

  if (ref) {
    await supabase.from("referrals")
      .update({ status: "subscribed" })
      .eq("id", ref.id);
    await supabase.from("profiles")
      .update({ referral_count: supabase.sql`referral_count + 1` })
      .eq("id", ref.referrer_id);
  }

  // Notification
  await supabase.from("notifications").insert({
    user_id: userId,
    type:    "payment",
    title:   `✅ Plan ${sub.plan} activé !`,
    body:    `Ton abonnement ${sub.plan} est actif jusqu'au ${ends_at.toLocaleDateString("fr-FR")}.`,
    data:    { subscription_id: sub.id },
  });

  return json({
    status:   "success",
    plan:     sub.plan,
    starts_at,
    ends_at,
    message:  `Plan ${sub.plan} activé jusqu'au ${ends_at.toLocaleDateString("fr-FR")} !`,
  });
}
