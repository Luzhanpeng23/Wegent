// ============================================================
// DOM Agent - 侧边栏应用逻辑
// ============================================================

const $ = (sel) => document.querySelector(sel);

// ---- DOM 元素 ----
const chatContainer = $("#chat-container");
const inputMessage = $("#input-message");
const btnSend = $("#btn-send");
const btnClear = $("#btn-clear");
const btnSettings = $("#btn-settings");
const settingsPanel = $("#settings-panel");
const btnSaveSettings = $("#btn-save-settings");
const btnCancelSettings = $("#btn-cancel-settings");

let currentTabId = null;
let isProcessing = false;
let lastToolCallEl = null;
let toolCallCounter = 0; // 工具调用计数器

// ---- 初始化 ----
async function init() {
  const resp = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" });
  currentTabId = resp.tabId;

  const config = await chrome.runtime.sendMessage({ type: "GET_CONFIG" });
  fillSettingsForm(config);

  chrome.tabs.onActivated.addListener((info) => {
    currentTabId = info.tabId;
  });

  // API Key 显示/隐藏切换
  const btnToggle = $("#btn-toggle-key");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      const input = $("#input-api-key");
      input.type = input.type === "password" ? "text" : "password";
    });
  }
}

function fillSettingsForm(config) {
  $("#input-api-base").value = config.apiBase || "";
  $("#input-api-key").value = config.apiKey || "";
  $("#input-model").value = config.model || "";
  $("#input-max-loops").value = config.maxLoops || 20;
  $("#input-max-tokens").value = config.maxTokens || 4096;
  $("#input-temperature").value = config.temperature ?? 0.7;
  $("#input-top-p").value = config.topP ?? 1;
  $("#input-system-prompt").value = config.systemPrompt || "";
}

function collectSettings() {
  return {
    apiBase: $("#input-api-base").value.trim(),
    apiKey: $("#input-api-key").value.trim(),
    model: $("#input-model").value.trim(),
    maxLoops: parseInt($("#input-max-loops").value) || 20,
    maxTokens: parseInt($("#input-max-tokens").value) || 4096,
    temperature: parseFloat($("#input-temperature").value) ?? 0.7,
    topP: parseFloat($("#input-top-p").value) ?? 1,
    systemPrompt: $("#input-system-prompt").value.trim(),
  };
}

// ---- 工具函数 ----
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  html = html.replace(/\n/g, "<br>");
  return html;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function removeWelcome() {
  const el = $(".welcome-message");
  if (el) el.remove();
}

function formatJSON(obj) {
  try {
    if (typeof obj === "string") obj = JSON.parse(obj);
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function truncateText(text, max = 200) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + "...";
}

// ---- 消息渲染 ----
function addUserMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-user";
  wrapper.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  chatContainer.appendChild(wrapper);
}

function addAssistantMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-assistant";
  wrapper.innerHTML = `<div class="bubble">${formatMarkdown(text)}</div>`;
  chatContainer.appendChild(wrapper);
}

function addErrorMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-error";
  wrapper.innerHTML = `<div class="bubble bubble-error">${escapeHtml(text)}</div>`;
  chatContainer.appendChild(wrapper);
}

function addThinking() {
  if ($(".thinking")) return;
  const el = document.createElement("div");
  el.className = "thinking";
  el.innerHTML = `
    <div class="thinking-dots"><span></span><span></span><span></span></div>
    <span class="thinking-text">思考中...</span>
  `;
  chatContainer.appendChild(el);
}

function removeThinking() {
  const el = $(".thinking");
  if (el) el.remove();
}

/** 创建可展开的工具调用卡片 */
function addToolCall(name, args, loopIndex) {
  toolCallCounter++;
  const toolLabels = {
    navigate: "🧭 导航",
    get_page_info: "ℹ️ 获取页面信息",
    get_elements: "🔍 查询元素",
    get_page_content: "📄 获取内容",
    click: "👆 点击",
    type_text: "⌨️ 输入文本",
    select_option: "📋 选择选项",
    scroll: "📜 滚动",
    evaluate_js: "⚡ 执行脚本",
    wait: "⏳ 等待",
    highlight: "🎨 高亮",
    take_screenshot: "📸 截图",
  };

  const label = toolLabels[name] || name;

  // 主要参数摘要（简短显示在标题行）
  const summaryParts = Object.entries(args || {})
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return truncateText(val, 40);
    });
  const summaryText = summaryParts.join(", ");

  // 完整参数（展开后显示）
  const fullArgs = formatJSON(args || {});

  const el = document.createElement("div");
  el.className = "tool-call";
  el.dataset.toolId = toolCallCounter;

  el.innerHTML = `
    <div class="tool-call-header" data-toggle="tool-${toolCallCounter}">
      <div class="tool-call-left">
        <svg class="tool-call-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span class="tool-call-name">${label}</span>
        <span class="tool-call-summary">${escapeHtml(summaryText)}</span>
      </div>
      <div class="tool-call-right">
        <span class="tool-call-index">#${toolCallCounter}</span>
        <span class="tool-call-status running">
          <svg class="spin-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          执行中
        </span>
      </div>
    </div>
    <div class="tool-call-detail collapsed" id="tool-${toolCallCounter}">
      <div class="tool-detail-section">
        <div class="tool-detail-label">参数</div>
        <pre class="tool-detail-code">${escapeHtml(fullArgs)}</pre>
      </div>
      <div class="tool-detail-section tool-result-section" style="display:none">
        <div class="tool-detail-label">返回结果 <span class="tool-duration"></span></div>
        <pre class="tool-detail-code tool-result-code"></pre>
      </div>
    </div>
  `;

  // 点击展开/收起
  const header = el.querySelector(".tool-call-header");
  header.addEventListener("click", () => {
    const detail = el.querySelector(".tool-call-detail");
    const chevron = el.querySelector(".tool-call-chevron");
    detail.classList.toggle("collapsed");
    chevron.classList.toggle("expanded");
  });

  chatContainer.appendChild(el);
  lastToolCallEl = el;
}

/** 更新工具调用结果 */
function updateToolResult(result, duration) {
  if (!lastToolCallEl) return;

  const statusEl = lastToolCallEl.querySelector(".tool-call-status");
  if (statusEl) {
    statusEl.classList.remove("running");
    if (result && result.success) {
      statusEl.className = "tool-call-status success";
      statusEl.innerHTML = `✓ 完成`;
    } else {
      statusEl.className = "tool-call-status error";
      statusEl.innerHTML = `✗ 失败`;
    }
    if (duration !== undefined) {
      statusEl.innerHTML += ` <span class="tool-call-duration">${duration}ms</span>`;
    }
  }

  // 填充结果详情
  const resultSection = lastToolCallEl.querySelector(".tool-result-section");
  const resultCode = lastToolCallEl.querySelector(".tool-result-code");
  const durationEl = lastToolCallEl.querySelector(".tool-duration");

  if (resultSection && resultCode) {
    // 过滤掉 screenshot 数据（太大了）
    let displayResult = result;
    if (result && result.screenshot) {
      displayResult = { ...result, screenshot: "[base64 图片数据已省略]" };
    }
    resultCode.textContent = formatJSON(displayResult);
    resultSection.style.display = "";
  }
  if (durationEl && duration !== undefined) {
    durationEl.textContent = `(${duration}ms)`;
  }
}

function addScreenshot(dataUrl) {
  const el = document.createElement("div");
  el.className = "screenshot-wrapper";
  el.innerHTML = `<img src="${dataUrl}" class="screenshot-img" alt="页面截图" />`;
  el.querySelector("img").addEventListener("click", () => window.open(dataUrl, "_blank"));
  chatContainer.appendChild(el);
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ---- Agent 更新处理 ----
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "AGENT_UPDATE" || !message.payload) return;

  const p = message.payload;

  switch (p.type) {
    case "thinking":
      addThinking();
      break;

    case "info":
      // 静默信息，不显示
      break;

    case "tool_call":
      removeThinking();
      addToolCall(p.name, p.args, p.loopIndex);
      break;

    case "tool_result":
      updateToolResult(p.result, p.duration);
      break;

    case "screenshot":
      addScreenshot(p.data);
      break;

    case "assistant_message":
      removeThinking();
      if (p.content) addAssistantMessage(p.content);
      isProcessing = false;
      btnSend.disabled = false;
      break;

    case "error":
      removeThinking();
      addErrorMessage(p.message);
      isProcessing = false;
      btnSend.disabled = false;
      break;
  }

  scrollToBottom();
});

// ---- 发送消息 ----
async function sendMessage() {
  const text = inputMessage.value.trim();
  if (!text || isProcessing) return;

  isProcessing = true;
  inputMessage.value = "";
  inputMessage.style.height = "auto";
  btnSend.disabled = true;
  toolCallCounter = 0; // 重置每轮计数器

  removeWelcome();
  addUserMessage(text);
  addThinking();
  scrollToBottom();

  chrome.runtime.sendMessage({
    type: "CHAT_MESSAGE",
    tabId: currentTabId,
    text: text,
  });
}

// ---- 事件绑定 ----
btnSend.addEventListener("click", sendMessage);

inputMessage.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

inputMessage.addEventListener("input", () => {
  inputMessage.style.height = "auto";
  inputMessage.style.height = Math.min(inputMessage.scrollHeight, 120) + "px";
});

btnClear.addEventListener("click", async () => {
  if (currentTabId) {
    await chrome.runtime.sendMessage({ type: "CLEAR_CONVERSATION", tabId: currentTabId });
  }
  location.reload();
});

btnSettings.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

btnCancelSettings.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

btnSaveSettings.addEventListener("click", async () => {
  const newConfig = collectSettings();
  await chrome.runtime.sendMessage({ type: "SAVE_CONFIG", config: newConfig });
  settingsPanel.classList.add("hidden");
  showToast("设置已保存");
});

// 快捷建议按钮
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) {
    inputMessage.value = e.target.dataset.text;
    sendMessage();
  }
});

// ---- 启动 ----
init();
