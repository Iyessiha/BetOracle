/**
 * BETORACLE PRO — Client Supabase
 * Intégration frontend : Auth, Analyses Oracle, Paiements, Bankroll
 * Inclure AVANT betoracle-logos.js dans chaque page HTML
 *
 * Usage :
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *   <script src="../assets/js/betoracle-client.js"></script>
 */

(function () {
  // ── CONFIG (remplacer par tes vraies clés Supabase) ──
  const SUPABASE_URL    = "https://TON_PROJECT_ID.supabase.co";
  const SUPABASE_ANON   = "TA_ANON_KEY_ICI";

  // Init client Supabase
  const { createClient } = window.supabase ?? {};
  const db = createClient ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

  if (!db) {
    console.warn("[Betoracle] Supabase SDK non chargé — mode démo actif");
  }

  // ════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════
  const Auth = {

    /** Inscription email + mot de passe */
    async signUp({ email, password, fullName, phone, refCode }) {
      if (!db) return mockSuccess({ user: { id: "demo", email } });

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone }
        }
      });
      if (error) return { error };

      // Mettre à jour le profil avec le téléphone et le parrainage
      if (data.user) {
        await db.from("profiles").update({ phone }).eq("id", data.user.id);

        // Enregistrer le parrainage si code fourni
        if (refCode) {
          const { data: referrer } = await db
            .from("profiles")
            .select("id")
            .eq("ref_code", refCode.toUpperCase())
            .single();

          if (referrer) {
            await db.from("referrals").insert({
              referrer_id: referrer.id,
              referred_id: data.user.id,
              status: "pending",
            });
            await db.from("profiles")
              .update({ referred_by: referrer.id })
              .eq("id", data.user.id);
          }
        }
      }

      return { data };
    },

    /** Connexion */
    async signIn({ email, password }) {
      if (!db) return mockSuccess({ user: { id: "demo", email } });
      return db.auth.signInWithPassword({ email, password });
    },

    /** Connexion Google */
    async signInGoogle() {
      if (!db) return mockSuccess({});
      return db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/welcome.html` }
      });
    },

    /** Déconnexion */
    async signOut() {
      if (!db) return;
      return db.auth.signOut();
    },

    /** Récupérer l'utilisateur courant */
    async getUser() {
      if (!db) return getDemoUser();
      const { data: { user } } = await db.auth.getUser();
      return user;
    },

    /** Récupérer le profil + dashboard */
    async getProfile() {
      if (!db) return getDemoProfile();
      const user = await Auth.getUser();
      if (!user) return null;
      const { data } = await db
        .from("user_dashboard")
        .select("*")
        .eq("id", user.id)
        .single();
      return data;
    },

    /** Écouter les changements d'état auth */
    onAuthChange(callback) {
      if (!db) return () => {};
      const { data } = db.auth.onAuthStateChange(callback);
      return data.subscription.unsubscribe;
    }
  };

  // ════════════════════════════════════════════════════
  // ORACLE (analyses)
  // ════════════════════════════════════════════════════
  const Oracle = {

    /** Analyser un match */
    async analyze({ teamAId, teamBId, leagueId }) {
      if (!db) return getDemoAnalysis(teamAId, teamBId);
      const { data: { session } } = await db.auth.getSession();
      if (!session) return { error: "Non connecté" };

      const r = await fetch(`${SUPABASE_URL}/functions/v1/oracle`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey":        SUPABASE_ANON,
        },
        body: JSON.stringify({ team_a_id: teamAId, team_b_id: teamBId, league_id: leagueId }),
      });
      return r.json();
    },

    /** Récupérer l'historique des analyses */
    async getHistory(limit = 10) {
      if (!db) return { data: [] };
      const user = await Auth.getUser();
      if (!user) return { data: [] };
      return db.from("analyses")
        .select("id, team_a_name, team_b_name, league_name, confidence, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
    },

    /** Coupon du jour */
    async getTodayCoupon() {
      if (!db) return getDemoCoupon();
      const { data } = await db.from("today_coupon").select("*").single();
      return data;
    },

    /** Écouter les nouvelles cotes en temps réel */
    subscribeToLiveCoupons(callback) {
      if (!db) return () => {};
      const channel = db.channel("coupons-live")
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "coupons" },
          payload => callback(payload.new)
        )
        .subscribe();
      return () => db.removeChannel(channel);
    }
  };

  // ════════════════════════════════════════════════════
  // PAIEMENTS
  // ════════════════════════════════════════════════════
  const Payments = {

    /** Initier un paiement */
    async initiate({ plan, period, method, phone }) {
      if (!db) return mockSuccess({ tx_reference: "DEMO-123", payment_url: "#" });
      const { data: { session } } = await db.auth.getSession();
      if (!session) return { error: "Non connecté" };

      const r = await fetch(`${SUPABASE_URL}/functions/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey":        SUPABASE_ANON,
        },
        body: JSON.stringify({ action: "initiate", plan, period, method, phone }),
      });
      return r.json();
    },

    /** Vérifier un paiement */
    async verify(txReference) {
      if (!db) return mockSuccess({ status: "success", plan: "pro" });
      const { data: { session } } = await db.auth.getSession();
      if (!session) return { error: "Non connecté" };

      const r = await fetch(`${SUPABASE_URL}/functions/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey":        SUPABASE_ANON,
        },
        body: JSON.stringify({ action: "verify", tx_reference: txReference }),
      });
      return r.json();
    },

    /** Historique des paiements */
    async getHistory() {
      if (!db) return { data: [] };
      const user = await Auth.getUser();
      if (!user) return { data: [] };
      return db.from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
    }
  };

  // ════════════════════════════════════════════════════
  // BANKROLL
  // ════════════════════════════════════════════════════
  const Bankroll = {

    /** Récupérer la bankroll */
    async get() {
      if (!db) return getDemoBankroll();
      const user = await Auth.getUser();
      if (!user) return null;
      const { data } = await db.from("bankroll").select("*").eq("user_id", user.id).single();
      return data;
    },

    /** Initialiser la bankroll */
    async init(initialAmount) {
      if (!db) return mockSuccess({});
      const user = await Auth.getUser();
      if (!user) return { error: "Non connecté" };
      return db.from("bankroll")
        .update({ balance_fcfa: initialAmount, initial_fcfa: initialAmount })
        .eq("user_id", user.id);
    },

    /** Enregistrer un pari */
    async addBet({ teamA, teamB, league, pick, odds, stakeFcfa, bookmaker, matchDate }) {
      if (!db) return mockSuccess({});
      const user = await Auth.getUser();
      if (!user) return { error: "Non connecté" };

      const { data, error } = await db.from("bets").insert({
        user_id:    user.id,
        team_a:     teamA,
        team_b:     teamB,
        league,
        pick,
        odds,
        stake_fcfa: stakeFcfa,
        bookmaker,
        match_date: matchDate,
      }).select().single();

      // Mettre à jour balance immédiatement
      if (!error) {
        const bk = await Bankroll.get();
        if (bk) {
          await db.from("bankroll")
            .update({ balance_fcfa: bk.balance_fcfa - stakeFcfa })
            .eq("user_id", user.id);
        }
      }

      return { data, error };
    },

    /** Mettre à jour le résultat d'un pari */
    async updateBetResult(betId, status) {
      if (!db) return mockSuccess({});
      const { data: bet } = await db.from("bets").select("*").eq("id", betId).single();
      if (!bet) return { error: "Pari introuvable" };

      const payout = status === "won" ? Math.round(bet.stake_fcfa * bet.odds) : 0;

      const { data, error } = await db.from("bets")
        .update({ status, payout_fcfa: payout })
        .eq("id", betId)
        .select().single();

      // Mettre à jour balance si gagné
      if (!error && status === "won") {
        const bk = await Bankroll.get();
        if (bk) {
          await db.from("bankroll")
            .update({ balance_fcfa: bk.balance_fcfa + payout })
            .eq("user_id", bet.user_id);
        }
      }

      return { data, error };
    },

    /** Calculer la mise Kelly */
    async calcKelly({ bankroll, odds, probability }) {
      if (!db) {
        const k = Math.max(0, probability / 100 - (1 - probability / 100) / (odds - 1));
        return { kelly_pct: Math.round(k * 100 * 100) / 100, stake_fcfa: Math.floor(bankroll * k * 0.25 / 100) * 100 };
      }
      const { data } = await db.rpc("kelly_stake", {
        p_bankroll: bankroll,
        p_odds:     odds,
        p_proba:    probability / 100,
      });
      return data;
    }
  };

  // ════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════
  const Notifications = {
    async getUnread() {
      if (!db) return { data: [] };
      const user = await Auth.getUser();
      if (!user) return { data: [] };
      return db.from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(20);
    },

    async markRead(id) {
      if (!db) return;
      return db.from("notifications").update({ read: true }).eq("id", id);
    },

    async markAllRead() {
      if (!db) return;
      const user = await Auth.getUser();
      if (!user) return;
      return db.from("notifications").update({ read: true }).eq("user_id", user.id);
    },

    subscribeToNew(callback) {
      if (!db) return () => {};
      const user = Auth.getUser();
      const channel = db.channel("notifs-live")
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications",
            filter: `user_id=eq.${user?.id}` },
          payload => callback(payload.new)
        ).subscribe();
      return () => db.removeChannel(channel);
    }
  };

  // ════════════════════════════════════════════════════
  // DONNÉES DÉMO (si Supabase non configuré)
  // ════════════════════════════════════════════════════
  function mockSuccess(data) { return { data }; }
  function getDemoUser() {
    return { id: "demo-user", email: "demo@betoracle.pro" };
  }
  function getDemoProfile() {
    return {
      id: "demo-user", email: "demo@betoracle.pro", full_name: "Parieur Pro",
      plan: "pro", plan_expires_at: new Date(Date.now() + 7*86400000).toISOString(),
      is_plan_active: true, ref_code: "ORACLE-DEMO",
      balance_fcfa: 75000, roi_pct: 18.4, total_bets: 42, wins: 28, losses: 14,
      win_rate_pct: 66.7,
    };
  }
  function getDemoBankroll() {
    return { balance_fcfa: 75000, initial_fcfa: 50000, roi_pct: 18.4,
             total_bets: 42, wins: 28, losses: 14 };
  }
  function getDemoAnalysis(tA, tB) {
    return {
      proba_1: 54, proba_x: 22, proba_2: 24,
      score_estimate: "2 - 1", btts_pct: 72, over25_pct: 65,
      confidence: 87, locked: false,
      h2h: { total: 10, wins_a: 6, draws: 2, wins_b: 2, avg_goals: 3.2 },
      value_bet: { exists: true, pick: "1", market_odds: "2.15", value_pct: 16 },
    };
  }
  function getDemoCoupon() {
    return {
      id: "demo-coupon", match_date: new Date().toISOString().split("T")[0],
      total_odds: 4.87, status: "published",
      selections: [
        { team_a: "Real Madrid", team_b: "Man City",  league: "Champions League", pick: "1 Victoire RM",  odds: 1.85 },
        { team_a: "PSG",         team_b: "Lyon",       league: "Ligue 1",         pick: "BTTS Oui",        odds: 1.70 },
        { team_a: "Arsenal",     team_b: "Chelsea",    league: "Premier League",   pick: "+2.5 Buts",       odds: 1.65 },
        { team_a: "Inter",       team_b: "Juventus",   league: "Serie A",          pick: "X Nul",           odds: 2.10 },
      ]
    };
  }

  // ════════════════════════════════════════════════════
  // EXPORT GLOBAL
  // ════════════════════════════════════════════════════
  window.BetOracleDB = { Auth, Oracle, Payments, Bankroll, Notifications, db };

  // Auto-init : vérifier l'auth et mettre à jour l'UI
  document.addEventListener("DOMContentLoaded", async () => {
    const user = await Auth.getUser();
    if (user) {
      // Mettre à jour les éléments UI avec le nom de l'utilisateur
      document.querySelectorAll("[data-user-name]").forEach(el => {
        el.textContent = user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "Parieur";
      });
      document.querySelectorAll("[data-auth-hidden]").forEach(el => el.style.display = "none");
      document.querySelectorAll("[data-auth-show]").forEach(el => el.style.display = "");
    } else {
      document.querySelectorAll("[data-auth-hidden]").forEach(el => el.style.display = "");
      document.querySelectorAll("[data-auth-show]").forEach(el => el.style.display = "none");
    }
  });

})();
