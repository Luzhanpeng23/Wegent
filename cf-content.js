// ============================================================
// Cloudflare Turnstile 自动点击 - content script（ISOLATED world）
// 监听 MAIN world 发来的 checkbox 位置比例，转发给 background
// ============================================================
if (window.top !== window.self && window.location.href.includes('challenges.cloudflare.com')) {
    window.addEventListener('message', (event) => {
        if (event.source === window && event.data && event.data.type === 'CHECKBOX_POSITION_RATIO') {
            const { xRatio, yRatio } = event.data.payload;
            chrome.runtime.sendMessage({
                action: "detectAndClickTurnstile",
                payload: {
                    xRatio: xRatio,
                    yRatio: yRatio
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[CF-AutoClick] Error sending message:', chrome.runtime.lastError.message);
                }
            });
        }
    }, false);
}
