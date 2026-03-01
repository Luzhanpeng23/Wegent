// ============================================================
// Cloudflare Turnstile - ISOLATED world
// 侦听来自 MAIN world 的 postMessage，转发给 background.js
// ============================================================

if (window.top !== window.self && window.location.href.includes('challenges.cloudflare.com')) {
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.type === 'CHECKBOX_POSITION_RATIO') {
      const { xRatio, yRatio } = event.data.payload;
      chrome.runtime.sendMessage({
        action: 'detectAndClickTurnstile',
        payload: { xRatio, yRatio }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[CF-ISOLATED] Error:', chrome.runtime.lastError.message);
        }
      });
    }
  }, false);
}
