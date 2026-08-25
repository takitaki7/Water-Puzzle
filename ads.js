/* ============================================================
   Rewarded-ad adapter — provider-agnostic, inert by default.

   IMPORTANT: Google AdMob only serves ads to *native* apps (iOS /
   Android). It cannot serve ads to a page opened in a browser, so it
   only becomes available once this game is wrapped natively (e.g. with
   Capacitor + @capacitor-community/admob). Google's equivalent product
   for the plain web build is Google Ad Manager.

   Because of that split, the game never calls an ad network directly.
   It calls PuruPopAds.showRewarded(kind) and gets back a promise that
   resolves true (reward earned) or false (dismissed / unavailable).
   Whichever provider is configured supplies that promise; when none is
   configured the caller falls back to the built-in simulated ad, so the
   reward flow stays playable in development and on the web build.

   Configure via window.PURUPOP_CONFIG.ads in index.html.
   ============================================================ */
(function () {
  const cfg = (window.PURUPOP_CONFIG || {}).ads || {};

  // Ad unit ids per reward slot. Google's public test ids are used when
  // testMode is on, so you can verify the wiring before your own units
  // are approved.
  const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";

  function unitFor(kind) {
    if (cfg.testMode) return TEST_REWARDED_ID;
    const units = cfg.rewardedUnitIds || {};
    return units[kind] || cfg.rewardedUnitId || "";
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
      admobReady = plugin.initialize({
        initializeForTesting: !!cfg.testMode,
      }).catch((err) => {
        // Reset so a later attempt can retry instead of being stuck on a
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
    if (!plugin || !adId) return null; // not available → caller falls back

    await initAdMob(plugin);
    await plugin.prepareRewardVideoAd({ adId, isTesting: !!cfg.testMode });
    // Resolves with the reward object when the user earned it; the
    // plugin rejects or returns no reward when the ad was dismissed.
    const reward = await plugin.showRewardVideoAd();
    return !!reward;
  }

  /* ---------- public API ---------- */
  const Ads = {
    /* Which provider will actually serve, for diagnostics / README. */
    provider() {
      if (cfg.provider === "admob" && admobPlugin() && unitFor("hint")) return "admob";
      return "none";
    },

    /* Returns true if a real network is wired up and should be tried. */
    available() {
      return Ads.provider() !== "none";
    },

    /* Resolve true when the reward is earned, false when it isn't, and
       null when no provider could handle it (caller should fall back). */
    async showRewarded(kind) {
      if (Ads.provider() !== "admob") return null;
      try {
        return await showAdMobRewarded(kind);
      } catch (err) {
        // A failed ad must never block the player from their reward
        // path — report and let the caller fall back.
        if (window.Sentry) window.Sentry.captureException(err);
        else console.warn("[PuruPop] rewarded ad failed:", err);
        return null;
      }
    },
  };

  window.PuruPopAds = Ads;
})();
