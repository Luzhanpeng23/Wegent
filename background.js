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
  maxLoops: 20,
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  multimodal: { ...DEFAULT_MULTIMODAL },
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

function mergeConfig(baseConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...baseConfig,
    multimodal: {
      ...DEFAULT_MULTIMODAL,
      ...(baseConfig.multimodal || {}),
    },
  };
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

// ---- API 调用 ----
async function callAPI(messages) {
  const body = {
    model: config.model,
    messages: messages,
    tools: TOOLS,
    tool_choice: "auto",
  };
  if (config.temperature !== undefined) body.temperature = Number(config.temperature);
  if (config.topP !== undefined) body.top_p = Number(config.topP);
  if (config.maxTokens) body.max_tokens = Number(config.maxTokens);

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

  return await response.json();
}

// ---- 执行工具调用 ----
async function executeTool(tabId, name, args) {
  try {
    switch (name) {
      case "navigate":
        await chrome.tabs.update(tabId, { url: args.url });
        // 等待页面加载
        await new Promise((resolve) => {
          const listener = (id, changeInfo) => {
            if (id === tabId && changeInfo.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // 超时 15 秒
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
        // 发送到 content script 执行
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
      const response = await callAPI(messages);
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
        const funcArgs = JSON.parse(toolCall.function.arguments);

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

// ---- 消息监听 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
});

// 初始化
loadConfig();
