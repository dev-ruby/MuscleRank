// Vercel serves this endpoint after Web Analytics is enabled and redeployed.
// Skip local development; the static app does not need an npm build step.
(() => {
  if (location.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  const script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  document.head.append(script);
})();
