// supabase/functions/payments/index.ts
// Edge Function : Initiation + vérification paiements Mobile Money
// Appel : POST /functions/v1/payments
// Body  : { action: "initiate"|"verify", plan, period, method, phone, tx_reference? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tarifs officiels (en FCFA)
const PRICES: Record<string, Record<string, number>> = {
  starter: { week: 500,  month: 1500 },
  pro:     { week: 1000, month: 3000 },
  elite:   { week: 2000, month: 6000 },
};

// Durées
const DURATIONS: Record<string, number> = {
  week:  7  * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Auth
  const authHeader = req.headers.get("Authorization");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader?.replace("Bearer ", "") ?? ""
  );
  if (authErr || !user) {
    return json({ error: "Non authentifié" }, 401);
  }

  const body = await req.json();
  const { action } = body;

  // ─────────────────────────────────────────────────────────
  // ACTION : INITIATE — Créer une transaction en attente
  // ─────────────────────────────────────────────────────────
  if (action === "initiate") {
    const { plan, period, method, phone } = body;

    if (!plan || !period || !method || !phone) {
      return json({ error: "plan, period, method et phone requis" }, 400);
    }

    const amount = PRICES[plan]?.[period];
    if (!amount) return json({ error: "Plan ou période invalide" }, 400);

    // Générer une référence unique
    const tx_reference = `BOP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Créer la subscription en attente
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .insert({
        user_id:        user.id,
        plan,
        period,
        amount_fcfa:    amount,
        payment_method: method,
        tx_reference,
        status:         "pending",
      })
      .select()
      .single();

    if (subErr) {
      console.error("[Payments] Insert error:", subErr);
      return json({ error: "Erreur création transaction" }, 500);
    }

    // Appel vers l'opérateur Mobile Money
    // En production : intégrer l'API Wave / CinetPay / Kkiapay / Flutterwave
    const paymentUrl = await initiateMobileMoneyPayment({
      method,
      phone,
      amount,
      reference: tx_reference,
      description: `Betoracle Pro — ${plan} (${period === "week" ? "1 semaine" : "1 mois"})`,
    });

    return json({
      tx_reference,
      subscription_id: sub.id,
      amount,
      payment_url: paymentUrl,
      instructions: getPaymentInstructions(method, phone, amount),
    });
  }

  // ─────────────────────────────────────────────────────────
  // ACTION : VERIFY — Vérifier et activer un paiement
  // ─────────────────────────────────────────────────────────
  if (action === "verify") {
    const { tx_reference } = body;
    if (!tx_reference) return json({ error: "tx_reference requis" }, 400);

    // Récupérer la subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tx_reference", tx_reference)
      .eq("user_id", user.id)
      .single();

    if (!sub) return json({ error: "Transaction introuvable" }, 404);
    if (sub.status === "active") return json({ status: "already_active", subscription: sub });

    // Vérifier paiement côté opérateur
    const isPaid = await verifyMobileMoneyPayment(sub.payment_method, tx_reference, sub.tx_id);

    if (!isPaid) {
      return json({ status: "pending", message: "Paiement non encore confirmé" });
    }

    // Calculer les dates d'abonnement
    const starts_at = new Date();
    const ends_at   = new Date(starts_at.getTime() + DURATIONS[sub.period]);

    // Activer la subscription
    await supabase
      .from("subscriptions")
      .update({ status: "active", starts_at, ends_at })
      .eq("id", sub.id);

    // Mettre à jour le profil utilisateur
    await supabase
      .from("profiles")
      .update({ plan: sub.plan, plan_expires_at: ends_at })
      .eq("id", user.id);

    // Vérifier si c'est via parrainage → marquer le referral comme subscribed
    const { data: referral } = await supabase
      .from("referrals")
      .select("id, referrer_id, status")
      .eq("referred_id", user.id)
      .eq("status", "pending")
      .single();

    if (referral) {
      await supabase
        .from("referrals")
        .update({ status: "subscribed" })
        .eq("id", referral.id);
    }

    // Envoyer notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      type:    "payment",
      title:   `Plan ${sub.plan} activé !`,
      body:    `Ton abonnement ${sub.plan} est actif jusqu'au ${ends_at.toLocaleDateString("fr-FR")}.`,
      data:    { subscription_id: sub.id },
    });

    return json({
      status:      "success",
      plan:        sub.plan,
      starts_at,
      ends_at,
      message:     `Plan ${sub.plan} activé avec succès !`,
    });
  }

  return json({ error: "Action invalide. Utiliser: initiate | verify" }, 400);
});

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Intégration Mobile Money
// En production : remplacer par les vraies APIs (CinetPay, Wave, Kkiapay, Flutterwave)
async function initiateMobileMoneyPayment(params: {
  method: string;
  phone: string;
  amount: number;
  reference: string;
  description: string;
}): Promise<string> {
  // CinetPay (supporte Orange CI, MTN CI, Moov, Wave, carte)
  // Doc : https://api.cinetpay.com/
  const CINETPAY_KEY    = Deno.env.get("CINETPAY_KEY") ?? "";
  const CINETPAY_SITEID = Deno.env.get("CINETPAY_SITEID") ?? "";

  if (CINETPAY_KEY) {
    try {
      const r = await fetch("https://api.cinetpay.com/v2/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey:          CINETPAY_KEY,
          site_id:         CINETPAY_SITEID,
          transaction_id:  params.reference,
          amount:          params.amount,
          currency:        "XOF",
          description:     params.description,
          return_url:      `${Deno.env.get("APP_URL")}/welcome.html?payment=success`,
          notify_url:      `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-payment`,
          customer_phone_number: params.phone,
          channels:        "ALL",
          lang:            "FR",
        }),
      });
      const data = await r.json();
      if (data.data?.payment_url) return data.data.payment_url;
    } catch (e) {
      console.error("[Payments] CinetPay error:", e);
    }
  }

  // Fallback : URL de paiement simulée (à remplacer en production)
  return `${Deno.env.get("APP_URL") ?? "https://betoracle.pro"}/paiement?ref=${params.reference}&amount=${params.amount}`;
}

async function verifyMobileMoneyPayment(
  method: string,
  reference: string,
  txId: string | null
): Promise<boolean> {
  const CINETPAY_KEY    = Deno.env.get("CINETPAY_KEY") ?? "";
  const CINETPAY_SITEID = Deno.env.get("CINETPAY_SITEID") ?? "";

  if (CINETPAY_KEY) {
    try {
      const r = await fetch("https://api.cinetpay.com/v2/?check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apikey:         CINETPAY_KEY,
          site_id:        CINETPAY_SITEID,
          transaction_id: reference,
        }),
      });
      const data = await r.json();
      return data.data?.payment_status === "ACCEPTED";
    } catch (e) {
      console.error("[Payments] Verify error:", e);
    }
  }

  // Fallback : en dev, simuler paiement accepté
  return Deno.env.get("ENV") === "development";
}

function getPaymentInstructions(method: string, phone: string, amount: number): string {
  const instructions: Record<string, string> = {
    wave:         `Envoie ${amount} FCFA au +225 XX XX XX XX via Wave depuis ton numéro ${phone}. Réf : dans l'objet du transfert.`,
    orange_money: `Compose #144#1*XXXXXXXXXX*${amount}*Code secret# sur ton téléphone Orange.`,
    mtn_money:    `Compose *133# et suis les instructions pour envoyer ${amount} FCFA au XXXXXXXXXX.`,
    moov_money:   `Compose #155# et transfère ${amount} FCFA au XXXXXXXXXX.`,
    card:         `Tu seras redirigé vers la page de paiement sécurisée par carte.`,
  };
  return instructions[method] ?? "Suis les instructions sur la page de paiement.";
}
