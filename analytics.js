/* ============================================================
   Optional analytics / error monitoring — inert by default.
   Fill in window.PURUPOP_CONFIG (see index.html, just above the
   script tag for this file) with your own GA4 Measurement ID and/or
   Sentry DSN to turn these on. Leave them blank and this file makes
   zero network requests and adds zero tracking.
   ============================================================ */
(function () {
  const cfg = window.PURUPOP_CONFIG || {};

  if (cfg.gaId) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.gaId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag("js", new Date());
    gtag("config", cfg.gaId);
    window.gtag = gtag;
  }

  if (cfg.sentryDsn) {
    const s = document.createElement("script");
    s.src = "https://browser.sentry-cdn.com/7.120.3/bundle.min.js";
    s.crossOrigin = "anonymous";
    s.onload = function () {
      if (window.Sentry) window.Sentry.init({ dsn: cfg.sentryDsn });
    };
    document.head.appendChild(s);
  }
})();
