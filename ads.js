/* ============================================================
   Rewarded-ad adapter — provider-agnostic, inert by default.

   Which provider you can use depends entirely on where the game ships,
   and the choices are mutually exclusive:

   - Google AdMob only serves *native* apps (iOS / Android). It cannot
     serve a page opened in a browser, so it only becomes available once
     this game is wrapped natively (e.g. Capacitor + AdMob plugin).
   - Game portals (Poki, CrazyGames, …) sell the ads themselves and pay
     a revenue share. Their terms require their own SDK and forbid
     running a third-party ad network inside the game, so shipping to a
     portal means using the portal's SDK *instead of* AdMob, never both.

   Because of that, the game never calls an ad network directly. It
   calls PuruPopAds.showRewarded(kind) and gets back a promise resolving
   true (reward earned), false (dismissed), or null (no provider could
   handle it → the caller falls back to the built-in simulated ad, which
   keeps the reward flow playable in development).

   Configure via window.PURUPOP_CONFIG.ads in index.html.
   ============================================================ */
(function () {
  const cfg = (window.PURUPOP_CONFIG || {}).ads || {};
  const provider = cfg.provider || "";

  // Google's public test unit, so the wiring can be verified before your
  // own AdMob units are approved.
  const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";
  const POKI_SDK_URL = cfg.pokiSdkUrl || "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";

  function unitFor(kind) {
    if (cfg.testMode) return TEST_REWARDED_ID;
    const units = cfg.rewardedUnitIds || {};
    return units[kind] || cfg.rewardedUnitId || "";
  }

  /* Portals require the game to be silent while an ad plays. */
  function mute(on) {
    if (typeof window.PuruPopSetAdMuted === "function") window.PuruPopSetAdMuted(on);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }

  /* ---------- Capacitor AdMob (native iOS / Android builds) ---------- */
  function admobPlugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.Plugins) return null;
    return cap.Plugins.AdMob || null;
  }

  let admobReady = null;
  function initAdMob(plugin) {
    if (!admobReady) {
      admobReady = plugin
        .initialize({ initializeForTesting: !!cfg.testMode })
        .catch((err) => {
          // Reset so a later attempt retries instead of being stuck on a
          // rejected promise forever.
          admobReady = null;
          throw err;
        });
    }
    return admobReady;
  }

  async function showAdMobRewarded(kind) {
    const plugin = admobPlugin();
    const adId = unitFor(kind);
    if (!plugin || !adId) return null;
    await initAdMob(plugin);
    await plugin.prepareRewardVideoAd({ adId, isTesting: !!cfg.testMode });
    const reward = await plugin.showRewardVideoAd();
    return !!reward;
  }

  /* ---------- Poki (web portal) ----------
     Poki's SDK also wants to know when actual gameplay is running, so it
     can avoid interrupting a live board, and expects an explicit signal
     once loading has finished. Those are review requirements, not just
     optimizations, hence gameplayStart/gameplayStop below. */
  let pokiReady = null;
  function initPoki() {
    if (!pokiReady) {
      pokiReady = loadScript(POKI_SDK_URL)
        .then(() => {
          if (!window.PokiSDK) throw new Error("PokiSDK missing after load");
          if (cfg.testMode) window.PokiSDK.setDebug(true);
          return window.PokiSDK.init();
        })
        .then(() => {
          window.PokiSDK.gameLoadingFinished();
        })
        .catch((err) => {
          pokiReady = null;
          throw err;
        });
    }
    return pokiReady;
  }

  async function showPokiRewarded() {
    await initPoki();
    mute(true);
    try {
      // Resolves true only when the player actually earned the reward.
      return !!(await window.PokiSDK.rewardedBreak());
    } finally {
      mute(false);
    }
  }

  /* ---------- public API ---------- */
  const Ads = {
    /* Which provider will actually serve, for diagnostics / README. */
    provider() {
      if (provider === "admob" && admobPlugin() && unitFor("hint")) return "admob";
      if (provider === "poki") return "poki";
      return "none";
    },

    available() {
      return Ads.provider() !== "none";
    },

    /* Kick off SDK loading early so the first ad isn't a cold start.
       Safe to call when no provider is configured. */
    init() {
      if (Ads.provider() === "poki") initPoki().catch(report);
    },

    /* True (reward earned) / false (not earned) / null (unhandled). */
    async showRewarded(kind) {
      try {
        const p = Ads.provider();
        if (p === "admob") return await showAdMobRewarded(kind);
        if (p === "poki") return await showPokiRewarded();
        return null;
      } catch (err) {
        // A failed ad must never block the player's reward path — report
        // it and let the caller fall back to the simulated flow.
        mute(false);
        report(err);
        return null;
      }
    },

    /* Non-rewarded interstitial, shown between levels. Portals expect
       these; AdMob interstitials are not wired up here, so this is a
       no-op unless a portal SDK is active. */
    async commercialBreak() {
      if (Ads.provider() !== "poki") return;
      try {
        await initPoki();
        mute(true);
        await window.PokiSDK.commercialBreak();
      } catch (err) {
        report(err);
      } finally {
        mute(false);
      }
    },

    /* Portal SDKs need to know when a board is actually being played. */
    gameplayStart() {
      if (Ads.provider() === "poki" && window.PokiSDK) {
        try { window.PokiSDK.gameplayStart(); } catch (err) { report(err); }
      }
    },
    gameplayStop() {
      if (Ads.provider() === "poki" && window.PokiSDK) {
        try { window.PokiSDK.gameplayStop(); } catch (err) { report(err); }
      }
    },
  };

  function report(err) {
    if (window.Sentry) window.Sentry.captureException(err);
    else console.warn("[PuruPop] ads:", err);
  }

  window.PuruPopAds = Ads;
  Ads.init();
})();
