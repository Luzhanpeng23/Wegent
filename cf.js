// ============================================================
// Cloudflare Turnstile 自动点击 - 统一脚本
// MAIN world：劫持 attachShadow，捕获 checkbox 位置比例并 postMessage
// ISOLATED world（chrome.runtime 可用）：转发 postMessage 到 background
// 参考：cf-autoclick-master
// ============================================================

if (window.top !== window.self && window.location.href.includes('challenges.cloudflare.com')) {

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    // ---- ISOLATED world ----
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
    // ---- MAIN world ----
    window.dtp = 1;

    function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    let screenX = getRandomInt(800, 1200);
    let screenY = getRandomInt(400, 600);
    Object.defineProperty(MouseEvent.prototype, 'screenX', { value: screenX });
    Object.defineProperty(MouseEvent.prototype, 'screenY', { value: screenY });

    function runInjectionLogic() {
      // 通过隐藏 iframe 获取绝对干净的原生 attachShadow，防止被其他扩展污染
      function getNativeAttachShadow() {
        try {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          const nativeAttachShadow = iframe.contentWindow.Element.prototype.attachShadow;
          document.body.removeChild(iframe);
          return nativeAttachShadow;
        } catch (e) {
          console.error('[CF] Failed to create iframe for native function extraction:', e);
          return null;
        }
      }

      try {
        const originalAttachShadow = getNativeAttachShadow();
        if (!originalAttachShadow) {
          console.error('[CF] Aborting: Could not retrieve native attachShadow.');
          return;
        }

        Element.prototype.attachShadow = function (...args) {
          const shadowRoot = originalAttachShadow.apply(this, args);
          if (shadowRoot) {
            const existingCheckbox = shadowRoot.querySelector('input[type="checkbox"]');
            if (existingCheckbox) {
              window.mySecretCheckbox = existingCheckbox;
            } else {
              const observer = new MutationObserver((mutations, obs) => {
                const checkbox = shadowRoot.querySelector('input[type="checkbox"]');
                if (checkbox) {
                  window.mySecretCheckbox = checkbox;
                  obs.disconnect();
                }
              });
              observer.observe(shadowRoot, { childList: true, subtree: true });
            }
          }
          return shadowRoot;
        };
      } catch (e) {
        console.error('[CF] Error during prototype override:', e);
      }
    }

    if (document.body) {
      runInjectionLogic();
    } else {
      const observer = new MutationObserver(() => {
        if (document.body) {
          runInjectionLogic();
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }

    // 轮询 checkbox，找到后计算中心比例并发送给 ISOLATED world
    (function pollAndReportCenterRatio() {
      if (window.mySecretCheckbox) {
        const checkbox = window.mySecretCheckbox;
        const rect = checkbox.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (windowWidth > 0 && windowHeight > 0) {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const xRatio = centerX / windowWidth;
          const yRatio = centerY / windowHeight;

          window.postMessage({
            type: 'CHECKBOX_POSITION_RATIO',
            payload: { xRatio, yRatio }
          }, '*');
        }
        try { delete window.mySecretCheckbox; } catch (e) {}
      } else {
        setTimeout(pollAndReportCenterRatio, 200);
      }
    })();
  }
}
