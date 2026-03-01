// ============================================================
// Cloudflare Turnstile 自动点击 - 统一脚本
// MAIN world：劫持 attachShadow，捕获 checkbox 位置比例并 postMessage
// ISOLATED world（chrome.runtime 可用）：转发 postMessage 到 background
// ============================================================

// 仅在 Cloudflare Turnstile challenge iframe 内执行
if (window.top !== window.self && window.location.href.includes('challenges.cloudflare.com')) {

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    // ---- ISOLATED world：侦听 MAIN world 的 postMessage，转发给 background ----
    window.addEventListener('message', (event) => {
      if (event.source === window && event.data && event.data.type === 'CHECKBOX_POSITION_RATIO') {
        const { xRatio, yRatio } = event.data.payload;
        chrome.runtime.sendMessage({
          action: 'detectAndClickTurnstile',
          payload: { xRatio, yRatio }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[CF] Error:', chrome.runtime.lastError.message);
          }
        });
      }
    }, false);

  } else {
    // ---- MAIN world：劫持 attachShadow，捕获 checkbox 位置并 postMessage ----
    window.dtp = 1;

    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const screenX = getRandomInt(800, 1200);
    const screenY = getRandomInt(400, 600);
    Object.defineProperty(MouseEvent.prototype, 'screenX', { value: screenX });
    Object.defineProperty(MouseEvent.prototype, 'screenY', { value: screenY });

    function runInjectionLogic() {
      function getNativeAttachShadow() {
        try {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          const native = iframe.contentWindow.Element.prototype.attachShadow;
          document.body.removeChild(iframe);
          return native;
        } catch (e) {
          console.error('[CF] Failed to get native attachShadow:', e);
          return null;
        }
      }

      try {
        const originalAttachShadow = getNativeAttachShadow();
        if (!originalAttachShadow) return;

        Element.prototype.attachShadow = function (...args) {
          const shadowRoot = originalAttachShadow.apply(this, args);
          if (shadowRoot) {
            const existing = shadowRoot.querySelector('input[type="checkbox"]');
            if (existing) {
              window.mySecretCheckbox = existing;
            } else {
              const obs = new MutationObserver((_, o) => {
                const cb = shadowRoot.querySelector('input[type="checkbox"]');
                if (cb) { window.mySecretCheckbox = cb; o.disconnect(); }
              });
              obs.observe(shadowRoot, { childList: true, subtree: true });
            }
          }
          return shadowRoot;
        };
      } catch (e) {
        console.error('[CF] Error overriding attachShadow:', e);
      }
    }

    if (document.body) {
      runInjectionLogic();
    } else {
      const obs = new MutationObserver(() => {
        if (document.body) { runInjectionLogic(); obs.disconnect(); }
      });
      obs.observe(document.documentElement, { childList: true });
    }

    (function pollAndReport() {
      if (window.mySecretCheckbox) {
        const rect = window.mySecretCheckbox.getBoundingClientRect();
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w > 0 && h > 0) {
          window.postMessage({
            type: 'CHECKBOX_POSITION_RATIO',
            payload: {
              xRatio: (rect.left + rect.width / 2) / w,
              yRatio: (rect.top + rect.height / 2) / h,
            }
          }, '*');
        }
        try { delete window.mySecretCheckbox; } catch (e) {}
      } else {
        setTimeout(pollAndReport, 200);
      }
    })();
  }
}
