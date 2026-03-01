// ============================================================
// DOM Agent - Background Service Worker
// 负责与 OpenAI 兼容 API 通信，协调 content script 执行操作
// ============================================================

// ---- 配置 ----
const DEFAULT_MULTIMODAL = {
  enabled: true,
  modelSupportsVision: true,
  allowUserImageUpload: true,
  allowToolScreenshotToModel: true,
  maxImagesPerTurn: 2,
  maxImageBytes: 800 * 1024,
  maxTotalImageBytesPerTurn: 1200 * 1024,
  imageMaxWidth: 1280,
  imageMaxHeight: 1280,
  imageFormat: "jpeg",
  imageQuality: 0.82,
  screenshotDetail: "low",
};

const DEFAULT_CONFIG = {
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  maxLoops: 99,
  temperature: 0.9,
  topP: 1,
  maxTokens: 8192,
  multimodal: { ...DEFAULT_MULTIMODAL },
  // 自定义技能列表
  skills: [],
  // MCP 远程服务器列表
  mcpServers: [],
  systemPrompt: `你是一个浏览器操作助手。用户会用自然语言描述他们想在当前网页上执行的操作，你需要通过调用工具来完成这些操作。

操作前请先使用 get_page_info 了解当前页面状态，然后根据需要使用 get_elements 获取页面元素信息。
执行完操作后，简要向用户反馈操作结果。

注意事项：
- CSS 选择器要尽量精确，避免误操作
- 对于复杂操作，分步执行并确认每步结果
- 如果操作失败，尝试其他选择器或方法
- 始终使用中文与用户交流`,
};

// ---- 工具定义 ----
const TOOLS = [
  {
    type: "function",
    function: {
      name: "navigate",
      description: "导航到指定 URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要导航到的 URL 地址" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_info",
      description: "获取当前页面基本信息，包括 URL、标题、滚动位置等",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_elements",
      description:
        "通过 CSS 选择器查询页面元素，返回匹配元素的标签名、文本、属性等信息",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS 选择器，如 'button', '#id', '.class', 'a[href]'",
          },
          limit: {
            type: "integer",
            description: "最多返回的元素数量，默认 20",
          },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_content",
      description:
        "获取页面的文本内容（或指定元素内的文本内容），用于阅读和分析页面",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "可选的 CSS 选择器，仅获取该元素内的文本。不传则获取整个页面文本",
          },
          maxLength: {
            type: "integer",
            description: "返回文本的最大长度，默认 5000",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click",
      description: "点击页面上匹配选择器的元素",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "要点击的元素的 CSS 选择器",
          },
          index: {
            type: "integer",
            description:
              "如果有多个匹配元素，指定点击第几个（从 0 开始），默认 0",
          },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "在输入框中输入文本",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "输入框的 CSS 选择器",
          },
          text: { type: "string", description: "要输入的文本" },
          clear: {
            type: "boolean",
            description: "是否先清空输入框，默认 true",
          },
          index: {
            type: "integer",
            description: "如果有多个匹配元素，指定第几个（从 0 开始），默认 0",
          },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_option",
      description: "在下拉选择框中选择选项",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "select 元素的 CSS 选择器",
          },
          value: { type: "string", description: "要选择的 option 的 value 值" },
        },
        required: ["selector", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "滚动页面或指定元素",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down", "left", "right", "top", "bottom"],
            description: "滚动方向",
          },
          distance: {
            type: "integer",
            description: "滚动距离（像素），默认 500",
          },
          selector: {
            type: "string",
            description: "可选，滚动指定元素而非整个页面",
          },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_js",
      description:
        "在页面上下文中执行 JavaScript 代码并返回结果。用于复杂操作或获取特殊信息",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "要执行的 JavaScript 代码" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wait",
      description: "等待指定时间或等待元素出现",
      parameters: {
        type: "object",
        properties: {
          ms: { type: "integer", description: "等待的毫秒数" },
          selector: {
            type: "string",
            description: "等待该选择器匹配的元素出现（最多等待 10 秒）",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight",
      description: "高亮显示页面上的指定元素（调试用）",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "要高亮的元素的 CSS 选择器",
          },
          color: {
            type: "string",
            description: "高亮颜色，默认 'rgba(255, 107, 107, 0.3)'",
          },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "截取当前可见页面的截图",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---- 状态管理 ----
let config = {
  ...DEFAULT_CONFIG,
  multimodal: { ...DEFAULT_MULTIMODAL },
};
let conversations = new Map(); // tabId -> messages[]

function normalizeMcpServer(server, fallbackId = "") {
  if (!server || typeof server !== "object") return null;
  const rawUrl = typeof server.url === "string" ? server.url.trim() : "";
  if (!rawUrl) return null;

  const idBase = String(server.id || fallbackId || `m_${Date.now().toString(36)}`);
  const id = idBase.trim() || `m_${Date.now().toString(36)}`;

  let name = typeof server.name === "string" ? server.name.trim() : "";
  if (!name) {
    try {
      name = new URL(rawUrl).hostname;
    } catch {
      name = id;
    }
  }

  return {
    id,
    name,
    url: rawUrl,
    apiKey: typeof server.apiKey === "string" ? server.apiKey : "",
    enabled: server.enabled !== false,
    type: typeof server.type === "string" ? server.type : undefined,
  };
}

function normalizeMcpServers(raw) {
  const source = (raw && typeof raw === "object" && !Array.isArray(raw) && raw.mcpServers)
    ? raw.mcpServers
    : raw;

  if (Array.isArray(source)) {
    return source.map((server, idx) => normalizeMcpServer(server, `mcp_${idx}`)).filter(Boolean);
  }

  // 兼容 Claude Desktop 风格：{ mcpServers: { name: { type, url } } }
  if (source && typeof source === "object") {
    const normalized = [];
    for (const [name, value] of Object.entries(source)) {
      const server = normalizeMcpServer({ ...(value || {}), name }, name);
      if (server) normalized.push(server);
    }
    return normalized;
  }

  return [];
}

function mergeConfig(baseConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...baseConfig,
    multimodal: {
      ...DEFAULT_MULTIMODAL,
      ...(baseConfig.multimodal || {}),
    },
    skills: Array.isArray(baseConfig.skills) ? baseConfig.skills : [],
    mcpServers: normalizeMcpServers(baseConfig.mcpServers),
  };
}

function getErrorMessage(error) {
  if (!error) return "未知错误";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || "未知错误";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function normalizeUserInput(userInput) {
  if (typeof userInput === "string") {
    return { text: userInput, attachments: [] };
  }

  return {
    text: typeof userInput?.text === "string" ? userInput.text : "",
    attachments: Array.isArray(userInput?.attachments) ? userInput.attachments : [],
  };
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const parts = dataUrl.split(",");
  if (parts.length < 2) return 0;
  const base64 = parts[1] || "";
  const paddingMatch = base64.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function getMultimodalConfig() {
  const mm = {
    ...DEFAULT_MULTIMODAL,
    ...(config.multimodal || {}),
  };

  return {
    ...mm,
    maxImagesPerTurn: Math.floor(clampNumber(mm.maxImagesPerTurn, DEFAULT_MULTIMODAL.maxImagesPerTurn, 1, 10)),
    maxImageBytes: Math.floor(clampNumber(mm.maxImageBytes, DEFAULT_MULTIMODAL.maxImageBytes, 64 * 1024, 10 * 1024 * 1024)),
    maxTotalImageBytesPerTurn: Math.floor(
      clampNumber(mm.maxTotalImageBytesPerTurn, DEFAULT_MULTIMODAL.maxTotalImageBytesPerTurn, 128 * 1024, 20 * 1024 * 1024)
    ),
    imageMaxWidth: Math.floor(clampNumber(mm.imageMaxWidth, DEFAULT_MULTIMODAL.imageMaxWidth, 256, 4096)),
    imageMaxHeight: Math.floor(clampNumber(mm.imageMaxHeight, DEFAULT_MULTIMODAL.imageMaxHeight, 256, 4096)),
    imageQuality: clampNumber(mm.imageQuality, DEFAULT_MULTIMODAL.imageQuality, 0.2, 1),
    screenshotDetail: mm.screenshotDetail === "auto" ? "auto" : "low",
  };
}

function isVisionEnabled(multimodal) {
  return !!(multimodal.enabled && multimodal.modelSupportsVision);
}

function normalizeAttachment(raw) {
  if (!raw || raw.kind !== "image") return null;
  if (typeof raw.dataUrl !== "string" || !raw.dataUrl.startsWith("data:image/")) return null;

  const mimeType = typeof raw.mimeType === "string" && raw.mimeType.startsWith("image/")
    ? raw.mimeType
    : "image/jpeg";

  const sizeBytes = Number(raw.sizeBytes) > 0 ? Number(raw.sizeBytes) : estimateDataUrlBytes(raw.dataUrl);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;

  return {
    id: raw.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: "image",
    source: raw.source || "upload",
    mimeType,
    dataUrl: raw.dataUrl,
    width: Number(raw.width) || undefined,
    height: Number(raw.height) || undefined,
    sizeBytes,
  };
}

function sanitizeAttachments(rawAttachments, multimodal) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return [];

  const accepted = [];
  const maxCount = multimodal.maxImagesPerTurn;
  const maxImageBytes = multimodal.maxImageBytes;
  const maxTotalBytes = multimodal.maxTotalImageBytesPerTurn;
  let totalBytes = 0;

  for (const raw of rawAttachments) {
    if (accepted.length >= maxCount) break;

    const attachment = normalizeAttachment(raw);
    if (!attachment) continue;
    if (attachment.sizeBytes > maxImageBytes) continue;
    if (totalBytes + attachment.sizeBytes > maxTotalBytes) continue;

    accepted.push(attachment);
    totalBytes += attachment.sizeBytes;
  }

  return accepted;
}

function buildUserMessage(text, attachments, multimodal) {
  const safeText = typeof text === "string" ? text : "";

  if (!isVisionEnabled(multimodal) || !attachments.length) {
    return { role: "user", content: safeText };
  }

  const content = [];
  if (safeText.trim()) {
    content.push({ type: "text", text: safeText });
  }

  for (const attachment of attachments) {
    content.push({
      type: "image_url",
      image_url: {
        url: attachment.dataUrl,
        detail: multimodal.screenshotDetail,
      },
    });
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "请先识别图片内容，再继续执行用户目标。" });
  }

  return { role: "user", content };
}

// 加载配置
async function loadConfig() {
  const stored = await chrome.storage.local.get("domAgentConfig");
  if (stored.domAgentConfig) {
    config = mergeConfig(stored.domAgentConfig);
  } else {
    config = mergeConfig(config);
  }
}

// 保存配置
async function saveConfig(newConfig) {
  const merged = {
    ...config,
    ...(newConfig || {}),
    multimodal: {
      ...(config.multimodal || {}),
      ...((newConfig && newConfig.multimodal) || {}),
    },
  };

  config = mergeConfig(merged);
  await chrome.storage.local.set({ domAgentConfig: config });
}

// ---- 点击侧边栏按钮时打开侧边栏 ----
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// ---- 快捷键切换侧边栏 ----
let sidePanelOpen = false;

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-side-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const windowId = tab.windowId;
    if (sidePanelOpen) {
      // 关闭：先禁用再重新启用
      await chrome.sidePanel.setOptions({ enabled: false });
      await chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel/index.html' });
      sidePanelOpen = false;
    } else {
      // 打开
      await chrome.sidePanel.open({ windowId });
      sidePanelOpen = true;
    }
  }
});

// 监听侧边栏连接状态
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel-alive') {
    sidePanelOpen = true;
    port.onDisconnect.addListener(() => {
      sidePanelOpen = false;
    });
  }
});

// ---- API 调用 ----
async function callAPI(messages, { stream = false, onDelta, onToolCalls } = {}) {
  // 合并内置工具 + Skills + MCP 动态工具
  const dynamicTools = buildDynamicTools();
  const allTools = [...TOOLS, ...dynamicTools.map(t => ({ type: t.type, function: t.function }))];

  const body = {
    model: config.model,
    messages: messages,
    tools: allTools.length > 0 ? allTools : undefined,
    tool_choice: allTools.length > 0 ? "auto" : undefined,
    stream: stream,
  };
  if (config.temperature !== undefined) body.temperature = Number(config.temperature);
  if (config.topP !== undefined) body.top_p = Number(config.topP);
  if (config.maxTokens) body.max_tokens = Number(config.maxTokens);
  // 流式模式下请求返回 usage 信息（可选）
  if (stream) body.stream_options = { include_usage: true };

  const response = await fetch(`${config.apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
  }

  // 非流式：直接返回 JSON
  if (!stream) {
    return await response.json();
  }

  // ---- 流式处理（SSE） ----
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentAccum = "";
  // tool_calls 的增量合并结构: { index -> { id, type, function: { name, arguments } } }
  const toolCallsMap = {};
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // 保留最后一行（可能不完整）
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      finishReason = parsed.choices[0].finish_reason || finishReason;

      // 文本增量
      if (delta.content) {
        contentAccum += delta.content;
        if (onDelta) onDelta(delta.content, contentAccum);
      }

      // tool_calls 增量
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallsMap[idx]) {
            toolCallsMap[idx] = {
              id: tc.id || "",
              type: tc.type || "function",
              function: { name: tc.function?.name || "", arguments: "" },
            };
          } else {
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name;
          }
          if (tc.function?.arguments) {
            toolCallsMap[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    }
  }

  // 组装工具调用数组
  const toolCalls = Object.keys(toolCallsMap).length > 0
    ? Object.keys(toolCallsMap)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => toolCallsMap[k])
    : undefined;

  if (toolCalls && onToolCalls) onToolCalls(toolCalls);

  // 构造与非流式一致的返回结构
  const assistantMessage = {
    role: "assistant",
    content: contentAccum || null,
  };
  if (toolCalls) assistantMessage.tool_calls = toolCalls;

  return {
    choices: [
      {
        message: assistantMessage,
        finish_reason: finishReason || "stop",
      },
    ],
  };
}

// ---- 执行工具调用 ----

// ============================================================
// MCP (Model Context Protocol) 远程工具调用客户端
// 支持 Streamable HTTP 传输（JSON-RPC 2.0）
// ============================================================
const mcpSessionState = new Map(); // serverId -> { tools[], sessionId }
const mcpToolNameMap = new Map();   // 完整工具名 -> { serverId, toolName, serverObj }

function mcpJsonRpc(method, params = {}, id = null) {
  return { jsonrpc: "2.0", method, params, id: id ?? Date.now() };
}

function parseMcpSsePayload(text) {
  const raw = String(text || "");
  const events = raw.split(/\r?\n\r?\n/);
  const payloads = [];

  for (const eventText of events) {
    const lines = eventText.split(/\r?\n/);
    const dataLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      dataLines.push(trimmed.slice(5).trim());
    }

    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n").trim();
    if (!data || data === "[DONE]") continue;

    try {
      const parsed = JSON.parse(data);
      payloads.push(parsed);
    } catch {
      // 忽略无法解析的事件
    }
  }

  return payloads;
}

function toSafeMcpToolName(serverId, rawToolName) {
  const normalize = (v, fallback) => {
    const s = String(v || "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return s || fallback;
  };

  // FNV-1a 32-bit，保证短哈希稳定，避免重名冲突
  const hashBase = `${serverId}::${rawToolName}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < hashBase.length; i++) {
    hash ^= hashBase.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  const suffix = `_${hash.toString(36)}`;

  const safeServerId = normalize(serverId, "server");
  const safeToolName = normalize(rawToolName, "tool");

  // 兼容 function.name 限制（最大 64）
  const prefix = `mcp_${safeServerId}_`;
  const maxToolLen = Math.max(1, 64 - prefix.length - suffix.length);
  const trimmedToolName = safeToolName.slice(0, maxToolLen);

  return `${prefix}${trimmedToolName}${suffix}`;
}

async function mcpRequest(server, method, params = {}, { useSession = true } = {}) {
  const requestId = Date.now() + Math.floor(Math.random() * 1000);
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (server.apiKey) headers["Authorization"] = `Bearer ${server.apiKey}`;
  const session = mcpSessionState.get(server.id);
  if (useSession && session?.sessionId) headers["Mcp-Session-Id"] = session.sessionId;

  const res = await fetch(server.url, {
    method: "POST",
    headers,
    body: JSON.stringify(mcpJsonRpc(method, params, requestId)),
  });
  if (!res.ok) throw new Error(`MCP ${method} 失败 (${res.status}): ${await res.text()}`);

  // 记录 session id
  const sid = res.headers.get("Mcp-Session-Id");
  if (sid) {
    const s = mcpSessionState.get(server.id) || {};
    s.sessionId = sid;
    mcpSessionState.set(server.id, s);
  }

  const contentType = (res.headers.get("Content-Type") || "").toLowerCase();
  const rawText = await res.text();
  let payloads = [];

  if (contentType.includes("text/event-stream")) {
    payloads = parseMcpSsePayload(rawText);
  } else {
    try {
      const json = JSON.parse(rawText);
      payloads = Array.isArray(json) ? json : [json];
    } catch {
      throw new Error(`MCP ${method} 返回非 JSON 响应: ${rawText.slice(0, 300)}`);
    }
  }

  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new Error(`MCP ${method} 未返回可解析的数据`);
  }

  const payload = payloads.find(item => item && item.id === requestId)
    || payloads.find(item => item && item.result)
    || payloads.find(item => item && item.error)
    || payloads[payloads.length - 1];

  if (!payload || typeof payload !== "object") {
    throw new Error(`MCP ${method} 响应格式无效`);
  }

  if (payload.error) {
    throw new Error(`MCP ${method} 错误: ${payload.error.message || JSON.stringify(payload.error)}`);
  }

  if (payload.result === undefined) {
    throw new Error(`MCP ${method} 缺少 result 字段`);
  }

  return payload.result;
}

async function mcpInitialize(server) {
  const protocolVersions = ["2025-03-26", "2024-11-05"];
  const capabilityCandidates = [
    {},
    { tools: {} },
    { tools: { listChanged: true } },
  ];
  let lastError = null;

  // initialize 前清理旧 session，避免服务端会话状态不一致
  const state = mcpSessionState.get(server.id) || {};
  delete state.sessionId;
  mcpSessionState.set(server.id, state);

  for (const protocolVersion of protocolVersions) {
    for (const capabilities of capabilityCandidates) {
      try {
        const result = await mcpRequest(server, "initialize", {
          protocolVersion,
          capabilities,
          clientInfo: { name: "DOM Agent", version: "1.0.0" },
        }, { useSession: false });

        // 发送 initialized 通知
        const headers = {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        };
        if (server.apiKey) headers["Authorization"] = `Bearer ${server.apiKey}`;
        const session = mcpSessionState.get(server.id);
        if (session?.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
        fetch(server.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        }).catch(() => {});

        return result;
      } catch (e) {
        lastError = e;
      }
    }
  }

  throw lastError || new Error("MCP initialize 失败");
}

async function mcpListTools(server) {
  const result = await mcpRequest(server, "tools/list", {});
  return result?.tools || [];
}

async function mcpCallTool(server, toolName, args) {
  const result = await mcpRequest(server, "tools/call", { name: toolName, arguments: args });
  return result;
}

async function refreshMcpTools(serversOverride = null) {
  const servers = Array.isArray(serversOverride) ? serversOverride : (config.mcpServers || []);
  for (const server of servers) {
    if (!server?.id || !server.enabled || !server.url) continue;
    try {
      await mcpInitialize(server);
      const tools = await mcpListTools(server);
      const s = mcpSessionState.get(server.id) || {};
      s.tools = tools;
      s.error = null;
      mcpSessionState.set(server.id, s);
    } catch (e) {
      console.warn(`[MCP] 连接 ${server.name || server.url} 失败:`, e.message);
      const s = mcpSessionState.get(server.id) || {};
      s.tools = [];
      s.error = e.message;
      mcpSessionState.set(server.id, s);
    }
  }
}

// 将 MCP + Skills 远程工具转换成 OpenAI function tool 格式
function buildDynamicTools() {
  const extraTools = [];

  // Skills → tools
  for (const skill of config.skills || []) {
    if (!skill.enabled || !skill.name) continue;
    const params = skill.parameters || { type: "object", properties: {} };
    extraTools.push({
      type: "function",
      function: {
        name: `skill_${skill.name}`,
        description: skill.description || skill.name,
        parameters: params,
      },
      _source: "skill",
      _skillId: skill.id,
    });
  }

  // MCP → tools
  mcpToolNameMap.clear();
  for (const server of config.mcpServers || []) {
    if (!server.enabled) continue;
    const session = mcpSessionState.get(server.id);
    if (!session?.tools) continue;
    for (const tool of session.tools) {
      const registeredName = toSafeMcpToolName(server.id, tool.name);
      mcpToolNameMap.set(registeredName, { serverId: server.id, toolName: tool.name });
      extraTools.push({
        type: "function",
        function: {
          name: registeredName,
          description: `[${server.name || "MCP"}] ${tool.description || tool.name}`,
          parameters: tool.inputSchema || { type: "object", properties: {} },
        },
        _source: "mcp",
        _serverId: server.id,
        _mcpToolName: tool.name,
      });
    }
  }

  return extraTools;
}

// ============================================================
// Skills 技能执行器
// 支持 javascript（页面执行）和 http（HTTP 请求）两种类型
// ============================================================
async function executeSkill(tabId, skill, args) {
  try {
    switch (skill.type) {
      case "javascript": {
        // 在页面上下文中执行预设 JS 代码
        let code = skill.config?.code || "";
        // 将参数注入为 __args 变量
        code = `(function(__args){ ${code} })(${JSON.stringify(args)})`;
        const results = await chrome.tabs.sendMessage(tabId, {
          type: "EXECUTE_TOOL",
          tool: "evaluate_js",
          args: { code },
        });
        return results;
      }

      case "http": {
        const cfg = skill.config || {};
        let url = cfg.url || "";
        let body = cfg.bodyTemplate || "";
        let headers = { ...(cfg.headers || {}) };

        // 简单模板替换：{{key}} → args.key
        const replaceTpl = (str) =>
          str.replace(/\{\{(\w+)\}\}/g, (_, k) => (args[k] !== undefined ? String(args[k]) : ""));
        url = replaceTpl(url);
        body = replaceTpl(body);
        for (const [hk, hv] of Object.entries(headers)) {
          headers[hk] = replaceTpl(hv);
        }

        const method = (cfg.method || "GET").toUpperCase();
        const fetchOpts = { method, headers };
        if (method !== "GET" && method !== "HEAD" && body) {
          fetchOpts.body = body;
          if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        }

        const res = await fetch(url, fetchOpts);
        const text = await res.text();
        let result;
        try { result = JSON.parse(text); } catch { result = text; }
        return { success: res.ok, status: res.status, data: result };
      }

      default:
        return { success: false, error: `未知技能类型: ${skill.type}` };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 统一工具执行路由
async function executeTool(tabId, name, args) {
  try {
    // 路由 Skill 调用
    if (name.startsWith("skill_")) {
      const skillName = name.slice(6);
      const skill = (config.skills || []).find(s => s.name === skillName && s.enabled);
      if (!skill) return { success: false, error: `未找到技能: ${skillName}` };
      return await executeSkill(tabId, skill, args);
    }

    // 路由 MCP 调用（通过查找表获取 serverId / toolName，避免下划线歧义）
    if (name.startsWith("mcp_")) {
      const mapping = mcpToolNameMap.get(name);
      if (!mapping) return { success: false, error: `无效 MCP 工具名: ${name}` };
      const { serverId, toolName } = mapping;
      const server = (config.mcpServers || []).find(s => s.id === serverId && s.enabled);
      if (!server) return { success: false, error: `MCP 服务器未找到或未启用: ${serverId}` };
      const result = await mcpCallTool(server, toolName, args);
      // MCP 工具返回 content 数组 [{type:"text",text:"..."}]
      if (result?.content) {
        const textParts = result.content.filter(c => c.type === "text").map(c => c.text);
        return { success: !result.isError, data: textParts.join("\n") || result.content };
      }
      return { success: true, data: result };
    }

    // 内置工具
    switch (name) {
      case "navigate":
        await chrome.tabs.update(tabId, { url: args.url });
        await new Promise((resolve) => {
          const listener = (id, changeInfo) => {
            if (id === tabId && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 15000);
        });
        const tab = await chrome.tabs.get(tabId);
        return { success: true, url: tab.url, title: tab.title };

      case "take_screenshot":
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
          format: "png",
        });
        return { success: true, screenshot: dataUrl };

      default:
        const results = await chrome.tabs.sendMessage(tabId, {
          type: "EXECUTE_TOOL",
          tool: name,
          args: args,
        });
        return results;
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ---- Agent 循环 ----
async function runAgent(tabId, rawUserInput, sendUpdate) {
  // 每次运行前重新加载配置，防止 service worker 重启后丢失内存中的配置
  await loadConfig();

  // 刷新 MCP 工具列表（静默失败）
  if ((config.mcpServers || []).some(s => s.enabled)) {
    await refreshMcpTools().catch(e => console.warn("[MCP] 刷新失败:", e.message));
  }

  if (!config.apiKey) {
    sendUpdate({
      type: "error",
      message: "请先在设置中配置 API Key",
    });
    return;
  }

  const multimodal = getMultimodalConfig();
  const userInput = normalizeUserInput(rawUserInput);

  let attachments = [];
  if (multimodal.enabled && multimodal.allowUserImageUpload) {
    attachments = sanitizeAttachments(userInput.attachments, multimodal);
  }

  const visionEnabled = isVisionEnabled(multimodal);

  if (!userInput.text.trim() && attachments.length === 0) {
    sendUpdate({
      type: "error",
      message: "请输入文本或上传图片后再发送。",
    });
    return;
  }

  if (!visionEnabled && !userInput.text.trim() && attachments.length > 0) {
    sendUpdate({
      type: "error",
      message: "当前模型未启用视觉能力，请输入文本或在设置中开启视觉支持。",
    });
    return;
  }

  // 获取或创建会话
  if (!conversations.has(tabId)) {
    conversations.set(tabId, [{ role: "system", content: config.systemPrompt }]);
  }
  const messages = conversations.get(tabId);
  messages.push(buildUserMessage(userInput.text, attachments, multimodal));

  sendUpdate({ type: "thinking" });

  try {
    let loopCount = 0;
    const MAX_LOOPS = config.maxLoops || 20;

    sendUpdate({ type: "info", message: `最大调用轮次: ${MAX_LOOPS}` });

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      const response = await callAPI(messages, {
        stream: true,
        onDelta: (delta, full) => {
          sendUpdate({
            type: "assistant_delta",
            delta: delta,
            content: full,
          });
        },
      });
      const choice = response.choices[0];
      const assistantMessage = choice.message;

      messages.push(assistantMessage);

      // 如果没有工具调用，返回最终回复
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        sendUpdate({
          type: "assistant_message",
          content: assistantMessage.content || "",
        });
        return;
      }

      // 执行所有工具调用
      for (const toolCall of assistantMessage.tool_calls) {
        const funcName = toolCall.function.name;
        let funcArgs = {};
        try {
          const rawArgs = toolCall?.function?.arguments;
          funcArgs = rawArgs ? JSON.parse(rawArgs) : {};
        } catch {
          funcArgs = {};
        }

        sendUpdate({
          type: "tool_call",
          name: funcName,
          args: funcArgs,
          loopIndex: loopCount,
        });

        const startTime = Date.now();
        const result = await executeTool(tabId, funcName, funcArgs);
        const duration = Date.now() - startTime;

        // 处理截图 - 单独发送
        if (funcName === "take_screenshot" && result.screenshot) {
          sendUpdate({
            type: "screenshot",
            data: result.screenshot,
          });
        }

        sendUpdate({
          type: "tool_result",
          name: funcName,
          result: result,
          duration: duration,
          loopIndex: loopCount,
        });

        // 截图默认传摘要；在开启视觉回注时追加图片用户消息
        let toolResult = result;
        let screenshotFollowupMessage = null;

        if (funcName === "take_screenshot" && result.screenshot) {
          if (isVisionEnabled(multimodal) && multimodal.allowToolScreenshotToModel) {
            const screenshotAttachment = sanitizeAttachments(
              [
                {
                  id: `shot_${Date.now()}`,
                  kind: "image",
                  source: "tool_screenshot",
                  mimeType: "image/png",
                  dataUrl: result.screenshot,
                  sizeBytes: estimateDataUrlBytes(result.screenshot),
                },
              ],
              multimodal
            );

            if (screenshotAttachment.length > 0) {
              screenshotFollowupMessage = buildUserMessage(
                "这是当前页面截图，请先识别关键视觉信息，再决定下一步工具调用。",
                screenshotAttachment,
                multimodal
              );
              toolResult = {
                success: true,
                message: "截图已捕获并用于视觉推理。",
              };
            } else {
              toolResult = {
                success: true,
                message: "截图已捕获，但因大小限制未加入视觉上下文。",
              };
            }
          } else {
            toolResult = {
              success: true,
              message: "截图已成功捕获并展示给用户",
            };
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });

        if (screenshotFollowupMessage) {
          messages.push(screenshotFollowupMessage);
        }
      }
    }

    sendUpdate({
      type: "error",
      message: "操作步骤过多，已自动停止。请尝试更简单的指令。",
    });
  } catch (error) {
    sendUpdate({
      type: "error",
      message: `错误: ${error.message}`,
    });
  }
}

// ============================================================
// Cloudflare Turnstile CDP 自动点击
// ============================================================
const CDP_DEBUGGER_VERSION = "1.3";

async function attachDebuggerWithRetry(tabId, maxRetries = 3, retryDelay = 500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, CDP_DEBUGGER_VERSION, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      return;
    } catch (error) {
      console.warn(`[CDP] Attempt ${attempt}/${maxRetries} to attach debugger failed: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryDelay));
      } else {
        throw new Error(`Failed to attach debugger after ${maxRetries} attempts.`);
      }
    }
  }
}

async function findIframeAndClickAtRatio(tabId, payload) {
  const { xRatio, yRatio } = payload;
  const maxRetries = 3;
  const retryDelay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      function getAttr(attrs, name) {
        if (!attrs) return undefined;
        for (let j = 0; j < attrs.length; j += 2) {
          if (attrs[j] === name) return attrs[j + 1];
        }
      }

      const { nodes } = await chrome.debugger.sendCommand({ tabId }, "DOM.getFlattenedDocument", {
        depth: -1,
        pierce: true
      });

      const iframeNode = nodes.find(n => {
        if (n.nodeName !== 'IFRAME') return false;
        const src = getAttr(n.attributes, 'src') || '';
        return src.includes('challenges.cloudflare.com');
      });
      if (!iframeNode) throw new Error('Turnstile iframe not found');

      const { model: iframeBox } = await chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", {
        nodeId: iframeNode.nodeId
      });

      const [x_start, y_start, , , x_end, y_end] = iframeBox.content;
      const clickX = x_start + ((x_end - x_start) * xRatio);
      const clickY = y_start + ((y_end - y_start) * yRatio);

      await cdpClickAtCoordinates(tabId, clickX, clickY);
      return { success: true };
    } catch (error) {
      console.warn(`[CDP] Attempt ${i + 1} error:`, error.message || error);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  }
  return { success: false, error: 'Failed to click iframe after all retries' };
}

async function cdpClickAtCoordinates(tabId, x, y) {
  const dispatch = (type, button) => {
    return chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
      type, x, y, button,
      buttons: button === "left" ? 1 : 0,
      clickCount: 1
    });
  };
  await dispatch("mousePressed", "left");
  await new Promise(r => setTimeout(r, Math.random() * 30 + 20));
  await dispatch("mouseReleased", "left");
}

// ---- 消息监听 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Cloudflare Turnstile 自动点击
  if (message.action === "detectAndClickTurnstile" && message.payload) {
    const tabId = sender.tab.id;
    (async () => {
      try {
        await attachDebuggerWithRetry(tabId);
        const send = (m, p) => chrome.debugger.sendCommand({ tabId }, m, p);
        await send("Page.enable");
        await send("Runtime.enable");
        await send("DOM.enable");
        const result = await findIframeAndClickAtRatio(tabId, message.payload);
        sendResponse(result);
      } catch (error) {
        console.error('[CDP] Critical error:', error);
        sendResponse({ success: false, error: error.message });
      } finally {
        chrome.debugger.detach({ tabId }, () => {});
      }
    })();
    return true;
  }

  if (sender?.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "消息来源无效" });
    return true;
  }

  if (message.type === "CHAT_MESSAGE") {
    const { tabId, text, attachments } = message;
    runAgent(
      tabId,
      {
        text: text || "",
        attachments: Array.isArray(attachments) ? attachments : [],
      },
      (update) => {
        // 发送更新到 sidepanel
        chrome.runtime.sendMessage({ type: "AGENT_UPDATE", payload: update }).catch(() => {});
      }
    );
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_CONFIG") {
    loadConfig().then(() => sendResponse(config));
    return true;
  }

  if (message.type === "SAVE_CONFIG") {
    saveConfig(message.config).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CLEAR_CONVERSATION") {
    conversations.delete(message.tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      sendResponse({ tabId: tabs[0]?.id });
    });
    return true;
  }

  // 刷新 MCP 工具列表
  if (message.type === "REFRESH_MCP") {
    const requestServers = normalizeMcpServers(message.servers);
    const serversForRefresh = requestServers.length > 0 ? requestServers : null;

    loadConfig().then(() => refreshMcpTools(serversForRefresh)).then(() => {
      const sourceServers = serversForRefresh || config.mcpServers || [];
      const results = {};
      for (const server of sourceServers) {
        if (!server?.id) continue;
        const session = mcpSessionState.get(server.id);
        results[server.id] = {
          tools: (session?.tools || []).map(t => ({
            name: t.name,
            description: t.description || '',
          })),
          error: session?.error || null,
          count: session?.tools?.length || 0,
        };
      }

      const hasAnyServer = sourceServers.length > 0;
      const hasAnyError = Object.values(results).some(v => !!v?.error);
      if (!hasAnyServer) {
        sendResponse({ ok: false, error: "未检测到可用 MCP 服务器配置", results });
        return;
      }

      if (hasAnyError) {
        const firstError = Object.values(results).find(v => !!v?.error)?.error || "MCP 刷新失败";
        sendResponse({ ok: false, error: firstError, results });
        return;
      }

      sendResponse({ ok: true, results });
    }).catch(e => sendResponse({ ok: false, error: getErrorMessage(e) }));
    return true;
  }
});

// 初始化
loadConfig();
