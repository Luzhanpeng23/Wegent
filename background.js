import {
  parseSkillMarkdown,
  inferSkillName,
  inferSkillDescription,
  sanitizeSkillPackageName,
} from "./src/utils/skillParser.js";

// ============================================================
// Wegent - Background Service Worker
// 负责与 OpenAI 兼容 API 通信，协调 content script 执行操作
// ============================================================

// ---- 配置 ----
const DEFAULT_MULTIMODAL = {
  modelSupportsVision: true,
  imageDetail: "auto",
};

const DEFAULT_SKILL_RUNTIME = {
  enabled: true,
  maxPackages: 20,
  maxSkillBytes: 220 * 1024,
  maxResourcesPerType: 50,
  maxTriggeredSkillsPerTurn: 2,
  maxSkillBodyChars: 6000,
  maxReferencesPerSkill: 2,
  maxReferenceFetchBytes: 180 * 1024,
  maxReferenceSnippetChars: 1200,
  maxTotalReferenceChars: 2400,
  maxExamplesPerSkill: 1,
  maxExampleSnippetChars: 900,
  maxTotalExampleChars: 1500,
};

const DEFAULT_CONFIG = {
  schemaVersion: 3,
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.2",
  maxLoops: 60,
  temperature: 0.9,
  topP: 1,
  maxTokens: 8192,
  multimodal: { ...DEFAULT_MULTIMODAL },
  // Claude Code 风格 Skill Packages（SKILL.md）
  skillPackages: [],
  skillRuntime: { ...DEFAULT_SKILL_RUNTIME },
  // MCP 远程服务器列表
  mcpServers: [],
  // 定时消息任务
  scheduledTasks: [],
  systemPrompt: `你是一个运行在浏览器扩展中的通用Agent。通过灵活调用工具控制浏览器并结合使用远程工具和skill来完成用户要求的复杂任务。

如果涉及浏览器操作，请先使用 get_page_info 了解当前页面状态，然后根据需要使用 get_elements 获取页面元素信息。
执行完操作后，简要向用户反馈操作结果。

浏览器调用注意事项：
- CSS 选择器要尽量精确，避免误操作
- 对于复杂操作，分步执行并确认每步结果
- 如果操作失败，尝试其他选择器或方法
- 始终与用户用相同的语言交流`,
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
const skillReferenceCache = new Map(); // key -> { text, expiresAt }
const runningScheduledTaskIds = new Set();
const SCHEDULE_ALARM_PREFIX = "scheduled_task:";

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

function normalizeSkillRuntime(raw) {
  const merged = {
    ...DEFAULT_SKILL_RUNTIME,
    ...(raw && typeof raw === "object" ? raw : {}),
  };

  return {
    ...merged,
    enabled: merged.enabled !== false,
    maxPackages: Math.floor(clampNumber(merged.maxPackages, DEFAULT_SKILL_RUNTIME.maxPackages, 1, 200)),
    maxSkillBytes: Math.floor(clampNumber(merged.maxSkillBytes, DEFAULT_SKILL_RUNTIME.maxSkillBytes, 8 * 1024, 2 * 1024 * 1024)),
    maxResourcesPerType: Math.floor(clampNumber(merged.maxResourcesPerType, DEFAULT_SKILL_RUNTIME.maxResourcesPerType, 1, 200)),
    maxTriggeredSkillsPerTurn: Math.floor(clampNumber(merged.maxTriggeredSkillsPerTurn, DEFAULT_SKILL_RUNTIME.maxTriggeredSkillsPerTurn, 1, 4)),
    maxSkillBodyChars: Math.floor(clampNumber(merged.maxSkillBodyChars, DEFAULT_SKILL_RUNTIME.maxSkillBodyChars, 800, 20000)),
    maxReferencesPerSkill: Math.floor(clampNumber(merged.maxReferencesPerSkill, DEFAULT_SKILL_RUNTIME.maxReferencesPerSkill, 0, 5)),
    maxReferenceFetchBytes: Math.floor(clampNumber(merged.maxReferenceFetchBytes, DEFAULT_SKILL_RUNTIME.maxReferenceFetchBytes, 8 * 1024, 2 * 1024 * 1024)),
    maxReferenceSnippetChars: Math.floor(clampNumber(merged.maxReferenceSnippetChars, DEFAULT_SKILL_RUNTIME.maxReferenceSnippetChars, 200, 8000)),
    maxTotalReferenceChars: Math.floor(clampNumber(merged.maxTotalReferenceChars, DEFAULT_SKILL_RUNTIME.maxTotalReferenceChars, 0, 12000)),
    maxExamplesPerSkill: Math.floor(clampNumber(merged.maxExamplesPerSkill, DEFAULT_SKILL_RUNTIME.maxExamplesPerSkill, 0, 3)),
    maxExampleSnippetChars: Math.floor(clampNumber(merged.maxExampleSnippetChars, DEFAULT_SKILL_RUNTIME.maxExampleSnippetChars, 200, 4000)),
    maxTotalExampleChars: Math.floor(clampNumber(merged.maxTotalExampleChars, DEFAULT_SKILL_RUNTIME.maxTotalExampleChars, 0, 6000)),
  };
}

function normalizeSkillPackages(raw) {
  if (!Array.isArray(raw)) return [];

  const now = new Date().toISOString();
  const normalized = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name || "").trim();
    if (!name) continue;

    const safeName = sanitizeSkillPackageName(name) || "skill_package";
    const id = String(item.id || `sp_${safeName}_${Date.now().toString(36)}`)
      .trim()
      .replace(/\s+/g, "_");

    const skill = item.skill && typeof item.skill === "object" ? item.skill : {};
    const body = typeof skill.body === "string"
      ? skill.body
      : (typeof item.body === "string" ? item.body : "");
    const rawText = typeof skill.raw === "string"
      ? skill.raw
      : (typeof item.raw === "string" ? item.raw : body);
    const frontmatter = skill.frontmatter && typeof skill.frontmatter === "object"
      ? skill.frontmatter
      : (item.frontmatter && typeof item.frontmatter === "object" ? item.frontmatter : {});

    const resources = item.resources && typeof item.resources === "object" ? item.resources : {};
    const asPathList = (list) => {
      if (!Array.isArray(list)) return [];
      const output = [];
      const seen = new Set();
      for (const value of list) {
        const normalizedPath = normalizeReferencePath(value);
        if (!normalizedPath || seen.has(normalizedPath)) continue;
        seen.add(normalizedPath);
        output.push(normalizedPath);
        if (output.length >= 200) break;
      }
      return output;
    };

    normalized.push({
      id,
      name,
      description: typeof item.description === "string" ? item.description : "",
      enabled: item.enabled !== false,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
      skillUrl: typeof item.skillUrl === "string" ? item.skillUrl : "",
      homepageUrl: typeof item.homepageUrl === "string" ? item.homepageUrl : "",
      importedAt: typeof item.importedAt === "string" ? item.importedAt : now,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
      repository: item.repository && typeof item.repository === "object" ? item.repository : null,
      skillPath: typeof item.skillPath === "string" ? item.skillPath : "SKILL.md",
      resources: {
        references: asPathList(resources.references),
        examples: asPathList(resources.examples),
        scripts: asPathList(resources.scripts),
      },
      skill: {
        frontmatter,
        body,
        raw: rawText,
        bytes: Number(skill.bytes) > 0 ? Number(skill.bytes) : new TextEncoder().encode(rawText).length,
      },
    });
  }

  return normalized;
}

function normalizeScheduledTasks(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  return raw
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;

      const id = String(item.id || `st_${idx}_${Date.now().toString(36)}`).trim();
      if (!id) return null;

      const name = String(item.name || "").trim() || "未命名定时任务";
      const prompt = String(item.prompt || "").trim();
      if (!prompt) return null;

      const triggerRaw = item.trigger && typeof item.trigger === "object" ? item.trigger : {};
      const triggerType = triggerRaw.type === "once" ? "once" : "interval";
      const trigger = { type: triggerType };

      if (triggerType === "once") {
        const runAtMs = Number.isFinite(Date.parse(triggerRaw.runAt)) ? Date.parse(triggerRaw.runAt) : NaN;
        if (!Number.isFinite(runAtMs)) return null;
        trigger.runAt = new Date(runAtMs).toISOString();
      } else {
        const intervalMinutes = Math.floor(clampNumber(triggerRaw.intervalMinutes, 1, 1, 24 * 60));
        trigger.intervalMinutes = intervalMinutes;
      }

      const stateRaw = item.state && typeof item.state === "object" ? item.state : {};
      const validStatus = new Set(["idle", "scheduled", "running", "success", "failed", "skipped"]);
      const status = validStatus.has(stateRaw.status) ? stateRaw.status : "idle";

      const normalizeIso = (value) => {
        const t = Date.parse(value);
        return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
      };

      return {
        id,
        name,
        enabled: item.enabled !== false,
        prompt,
        trigger,
        state: {
          status,
          nextRunAt: normalizeIso(stateRaw.nextRunAt),
          lastRunAt: normalizeIso(stateRaw.lastRunAt),
          lastError: typeof stateRaw.lastError === "string" ? stateRaw.lastError : "",
          totalRuns: Math.max(0, Math.floor(Number(stateRaw.totalRuns) || 0)),
          totalFailures: Math.max(0, Math.floor(Number(stateRaw.totalFailures) || 0)),
        },
        createdAt: normalizeIso(item.createdAt) || isoNow,
        updatedAt: normalizeIso(item.updatedAt) || isoNow,
      };
    })
    .filter(Boolean);
}

function mergeConfig(baseConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...baseConfig,
    schemaVersion: Number(baseConfig.schemaVersion) || DEFAULT_CONFIG.schemaVersion,
    multimodal: {
      ...DEFAULT_MULTIMODAL,
      ...(baseConfig.multimodal || {}),
    },
    skillPackages: normalizeSkillPackages(baseConfig.skillPackages),
    skillRuntime: normalizeSkillRuntime(baseConfig.skillRuntime),
    mcpServers: normalizeMcpServers(baseConfig.mcpServers),
    scheduledTasks: normalizeScheduledTasks(baseConfig.scheduledTasks),
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

const SKILL_IMPORT_TIMEOUT_MS = 15000;
const SKILL_IMPORT_MAX_FETCH_BYTES = 1024 * 1024;

function escapeRegExp(text = "") {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanForMatch(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[\s_\-:/]+/g, "")
    .trim();
}

function normalizeReferencePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function splitTopKeywords(text = "", max = 10) {
  const raw = String(text || "").toLowerCase();
  const words = raw.match(/[a-z0-9_\u4e00-\u9fa5]+/g) || [];
  const stop = new Set([
    "this", "that", "with", "from", "have", "will", "when", "where", "what", "which", "into", "then", "than",
    "以及", "或者", "如果", "可以", "进行", "用于", "通过", "需要", "用户", "当前", "这个", "那个", "我们",
  ]);
  const score = new Map();
  for (const w of words) {
    if (w.length < 2) continue;
    if (stop.has(w)) continue;
    score.set(w, (score.get(w) || 0) + 1);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function tokenizeResourcePath(path = "") {
  return String(path)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter(Boolean);
}

function normalizeHttpUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("请输入技能 URL");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("技能 URL 无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https URL");
  }
  return parsed.toString();
}

function encodeGitHubPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

function parseGitHubRepo(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (u.hostname !== "github.com") return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ""),
    parts,
  };
}

async function fetchTextWithLimit(url, { accept = "text/plain, text/markdown, text/html, application/json", timeoutMs = SKILL_IMPORT_TIMEOUT_MS, maxBytes = SKILL_IMPORT_MAX_FETCH_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": accept,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`请求失败 (${res.status}): ${res.statusText || "unknown"}`);
    }

    const text = await res.text();
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > maxBytes) {
      throw new Error(`远程文件过大（${bytes} bytes）`);
    }

    return {
      text,
      bytes,
      contentType: (res.headers.get("content-type") || "").toLowerCase(),
      finalUrl: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractGithubLikeUrl(text, { preferSegment = "" } = {}) {
  const raw = String(text || "");
  const target = String(preferSegment || "").trim().toLowerCase();

  const rawMatches = raw.match(/https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]*SKILL\.md/ig) || [];
  const repoMatches = raw.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]*)?/ig) || [];

  const candidates = [...new Set([...rawMatches, ...repoMatches])];
  if (candidates.length === 0) return "";

  const scoreUrl = (url) => {
    const lower = String(url || "").toLowerCase();
    let score = 0;

    if (lower.includes("raw.githubusercontent.com") && lower.includes("skill.md")) score += 10;
    if (lower.includes("/blob/") || lower.includes("/tree/")) score += 6;
    if (lower.includes("skill.md")) score += 4;

    if (target) {
      if (lower.includes(`/${target}/`)) score += 20;
      if (lower.endsWith(`/${target}`)) score += 12;
      if (lower.includes(target)) score += 6;
    }

    return score;
  };

  candidates.sort((a, b) => {
    const diff = scoreUrl(b) - scoreUrl(a);
    if (diff !== 0) return diff;
    return a.length - b.length;
  });

  return candidates[0] || "";
}

async function fetchGitHubDefaultBranch(owner, repo) {
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const { text } = await fetchTextWithLimit(api, { accept: "application/vnd.github+json" });
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("无法读取 GitHub 仓库信息");
  }
  return json?.default_branch || "main";
}

function buildResourceIndex(skillPath, allPaths = [], maxPerType = DEFAULT_SKILL_RUNTIME.maxResourcesPerType) {
  const safeSkillPath = String(skillPath || "SKILL.md");
  const lastSlash = safeSkillPath.lastIndexOf("/");
  const baseDir = lastSlash >= 0 ? `${safeSkillPath.slice(0, lastSlash + 1)}` : "";

  const pick = (folderName) => {
    const prefix = `${baseDir}${folderName}/`;
    return allPaths
      .filter(p => typeof p === "string" && p.startsWith(prefix) && !p.endsWith("/"))
      .slice(0, maxPerType);
  };

  return {
    references: pick("references"),
    examples: pick("examples"),
    scripts: pick("scripts"),
  };
}

async function resolveGitHubSkillSource(urlString) {
  const parsed = parseGitHubRepo(urlString);
  if (!parsed) throw new Error("GitHub 地址格式无效");

  const { owner, repo, parts } = parsed;
  let ref = "";
  let explicitPath = "";

  if (parts[2] === "blob" || parts[2] === "tree") {
    ref = parts[3] || "";
    explicitPath = parts.slice(4).join("/");
  }

  if (!ref) {
    ref = await fetchGitHubDefaultBranch(owner, repo);
  }

  let allRepoPaths = [];
  try {
    const treeApi = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const { text } = await fetchTextWithLimit(treeApi, { accept: "application/vnd.github+json" });
    const treeJson = JSON.parse(text);
    allRepoPaths = Array.isArray(treeJson?.tree)
      ? treeJson.tree
          .filter(item => item?.type === "blob" && typeof item.path === "string")
          .map(item => item.path)
      : [];
  } catch {
    allRepoPaths = [];
  }

  let skillPath = "";

  if (explicitPath && /(^|\/)SKILL\.md$/i.test(explicitPath)) {
    skillPath = explicitPath;
  } else if (explicitPath && allRepoPaths.length > 0) {
    const normalizedPath = explicitPath.replace(/^\/+|\/+$/g, "");
    const normalizedLower = normalizedPath.toLowerCase();
    const skillCandidates = allRepoPaths.filter(p => /(^|\/)SKILL\.md$/i.test(p));

    const preferredPrefixes = [
      normalizedPath,
      `skills/${normalizedPath}`,
    ].filter(Boolean);

    const scored = skillCandidates
      .map((path) => {
        const lower = path.toLowerCase();
        let score = 0;

        for (const prefix of preferredPrefixes) {
          const lowerPrefix = prefix.toLowerCase();
          if (lower === `${lowerPrefix}/skill.md`) score = Math.max(score, 120);
          else if (lower.startsWith(`${lowerPrefix}/`)) score = Math.max(score, 100);
        }

        if (normalizedLower && lower.includes(`/${normalizedLower}/`)) {
          score = Math.max(score, 80);
        }

        if (normalizedLower && lower.endsWith(`/${normalizedLower}/skill.md`)) {
          score = Math.max(score, 110);
        }

        return { path, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;
        return a.path.length - b.path.length;
      });

    if (scored.length > 0) {
      skillPath = scored[0].path;
    }
  }

  if (!skillPath && allRepoPaths.length > 0) {
    const candidates = allRepoPaths.filter(p => /(^|\/)SKILL\.md$/i.test(p));
    candidates.sort((a, b) => a.length - b.length);
    skillPath = candidates[0] || "";
  }

  if (!skillPath) {
    skillPath = "SKILL.md";
  }

  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodeGitHubPath(skillPath)}`;
  const markdown = await fetchTextWithLimit(rawUrl, { accept: "text/plain, text/markdown" });

  return {
    sourceUrl: urlString,
    skillUrl: markdown.finalUrl,
    markdownText: markdown.text,
    markdownBytes: markdown.bytes,
    repository: {
      host: "github",
      owner,
      repo,
      ref,
    },
    skillPath,
    resourceIndex: buildResourceIndex(skillPath, allRepoPaths),
  };
}

async function resolveRawGithubSkillSource(urlString) {
  const u = new URL(urlString);
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 4) {
    throw new Error("raw.githubusercontent.com 地址无效");
  }

  const owner = parts[0];
  const repo = parts[1];
  const ref = parts[2];
  const skillPath = parts.slice(3).join("/");

  if (!/(^|\/)SKILL\.md$/i.test(skillPath)) {
    throw new Error("请提供指向 SKILL.md 的 raw.githubusercontent.com 地址");
  }

  const markdown = await fetchTextWithLimit(urlString, { accept: "text/plain, text/markdown" });

  return {
    sourceUrl: urlString,
    skillUrl: markdown.finalUrl,
    markdownText: markdown.text,
    markdownBytes: markdown.bytes,
    repository: {
      host: "github",
      owner,
      repo,
      ref,
    },
    skillPath,
    resourceIndex: buildResourceIndex(skillPath, []),
  };
}

async function resolveSkillImportSource(inputUrl) {
  const normalized = normalizeHttpUrl(inputUrl);
  const urlObj = new URL(normalized);

  if (urlObj.hostname === "raw.githubusercontent.com") {
    return resolveRawGithubSkillSource(normalized);
  }

  if (urlObj.hostname === "github.com") {
    return resolveGitHubSkillSource(normalized);
  }

  if (urlObj.hostname.endsWith("skills.sh")) {
    const page = await fetchTextWithLimit(normalized, { accept: "text/html, text/plain" });

    if (/(^|\/)SKILL\.md$/i.test(urlObj.pathname) || page.contentType.includes("markdown") || page.contentType.includes("text/plain")) {
      return {
        sourceUrl: normalized,
        skillUrl: page.finalUrl,
        markdownText: page.text,
        markdownBytes: page.bytes,
        repository: null,
        skillPath: "SKILL.md",
        resourceIndex: { references: [], examples: [], scripts: [] },
      };
    }

    const slugHint = urlObj.pathname.split("/").filter(Boolean).at(-1) || "";

    // 1) 优先尝试从 skills.sh URL 直接推导 GitHub Skill Package 具体子目录
    const seg = urlObj.pathname.split("/").filter(Boolean);
    if (seg.length >= 3) {
      const owner = seg[0];
      const repo = seg[1];
      const maybeSkill = seg.slice(2).join("/");
      const preferredRepoUrl = `https://github.com/${owner}/${repo}/tree/main/${maybeSkill}`;
      try {
        return await resolveGitHubSkillSource(preferredRepoUrl);
      } catch {
        // 继续降级策略
      }
    }

    // 2) 从页面里选择最匹配当前 slug 的 GitHub 链接
    const githubUrl = extractGithubLikeUrl(page.text, { preferSegment: slugHint });
    if (!githubUrl) {
      throw new Error("未在 skills.sh 页面中解析到 GitHub Skill Package 链接");
    }

    if (githubUrl.includes("raw.githubusercontent.com")) {
      return resolveRawGithubSkillSource(githubUrl);
    }

    // 3) 若拿到的是 repo 根地址，且 URL 含 skill slug，则再尝试拼 tree 路径
    const parsedGh = parseGitHubRepo(githubUrl);
    if (parsedGh && slugHint && parsedGh.parts.length <= 2) {
      const fallbackTree = `https://github.com/${parsedGh.owner}/${parsedGh.repo}/tree/main/${slugHint}`;
      try {
        return await resolveGitHubSkillSource(fallbackTree);
      } catch {
        // 忽略，回退到默认 repo 解析
      }
    }

    return resolveGitHubSkillSource(githubUrl);
  }

  if (/(^|\/)SKILL\.md$/i.test(urlObj.pathname) || urlObj.pathname.toLowerCase().endsWith(".md")) {
    const markdown = await fetchTextWithLimit(normalized, { accept: "text/plain, text/markdown" });
    return {
      sourceUrl: normalized,
      skillUrl: markdown.finalUrl,
      markdownText: markdown.text,
      markdownBytes: markdown.bytes,
      repository: null,
      skillPath: "SKILL.md",
      resourceIndex: { references: [], examples: [], scripts: [] },
    };
  }

  throw new Error("暂不支持该 URL，请提供 skills.sh 页面、GitHub 仓库地址或 SKILL.md 直链");
}

function computeResourceDiff(previousResources, nextResources) {
  const prev = {
    references: Array.isArray(previousResources?.references) ? previousResources.references : [],
    examples: Array.isArray(previousResources?.examples) ? previousResources.examples : [],
    scripts: Array.isArray(previousResources?.scripts) ? previousResources.scripts : [],
  };
  const next = {
    references: Array.isArray(nextResources?.references) ? nextResources.references : [],
    examples: Array.isArray(nextResources?.examples) ? nextResources.examples : [],
    scripts: Array.isArray(nextResources?.scripts) ? nextResources.scripts : [],
  };

  const diffOne = (a, b) => {
    const aSet = new Set(a.map(normalizeReferencePath));
    const bSet = new Set(b.map(normalizeReferencePath));
    const added = [];
    const removed = [];

    for (const item of bSet) {
      if (item && !aSet.has(item)) added.push(item);
    }
    for (const item of aSet) {
      if (item && !bSet.has(item)) removed.push(item);
    }

    added.sort();
    removed.sort();
    return { added, removed, addedCount: added.length, removedCount: removed.length };
  };

  const references = diffOne(prev.references, next.references);
  const examples = diffOne(prev.examples, next.examples);
  const scripts = diffOne(prev.scripts, next.scripts);

  return {
    references,
    examples,
    scripts,
    changed: Boolean(
      references.addedCount || references.removedCount ||
      examples.addedCount || examples.removedCount ||
      scripts.addedCount || scripts.removedCount
    ),
  };
}

function computeSkillContentDiff(previousSkill, nextSkill) {
  const prevRaw = String(previousSkill?.raw || previousSkill?.body || "");
  const nextRaw = String(nextSkill?.raw || nextSkill?.body || "");
  const prevBytes = Number(previousSkill?.bytes) > 0 ? Number(previousSkill.bytes) : new TextEncoder().encode(prevRaw).length;
  const nextBytes = Number(nextSkill?.bytes) > 0 ? Number(nextSkill.bytes) : new TextEncoder().encode(nextRaw).length;

  return {
    changed: prevRaw !== nextRaw,
    previousBytes: prevBytes,
    nextBytes,
    bytesDelta: nextBytes - prevBytes,
  };
}

function buildSkillImportPreview(resolvedSource) {
  const parsed = parseSkillMarkdown(resolvedSource.markdownText);
  const name = inferSkillName(parsed);
  const description = inferSkillDescription(parsed);
  const skillBody = String(parsed.body || "").trim();
  const skillRaw = String(parsed.raw || "");
  const bytes = Number(resolvedSource.markdownBytes) > 0
    ? Number(resolvedSource.markdownBytes)
    : new TextEncoder().encode(skillRaw).length;

  const warnings = [];
  if (!parsed.hasFrontmatter) {
    warnings.push("未检测到 YAML frontmatter，可能不是标准 Claude Code skill。");
  }
  if (!String(parsed.frontmatter?.description || "").trim()) {
    warnings.push("frontmatter 缺少 description，触发效果可能较弱。");
  }
  if (!skillBody) {
    warnings.push("SKILL.md 正文为空。");
  }

  const scriptsCount = resolvedSource.resourceIndex?.scripts?.length || 0;
  if (scriptsCount > 0) {
    warnings.push(`检测到 ${scriptsCount} 个 scripts 资源；当前扩展仅展示，不执行远程脚本。`);
  }

  return {
    sourceUrl: resolvedSource.sourceUrl,
    skillUrl: resolvedSource.skillUrl,
    name,
    safeName: sanitizeSkillPackageName(name) || "skill_package",
    description,
    warnings,
    repository: resolvedSource.repository,
    skillPath: resolvedSource.skillPath || "SKILL.md",
    resources: {
      references: resolvedSource.resourceIndex?.references || [],
      examples: resolvedSource.resourceIndex?.examples || [],
      scripts: resolvedSource.resourceIndex?.scripts || [],
    },
    skill: {
      frontmatter: parsed.frontmatter || {},
      body: skillBody,
      raw: skillRaw,
      bytes,
    },
  };
}

function buildSkillPackageFromPreview(preview, previous = null) {
  const now = new Date().toISOString();
  const safeName = sanitizeSkillPackageName(preview?.name || "") || "skill_package";
  const prevId = previous && typeof previous.id === "string" ? previous.id : "";

  return {
    id: prevId || `sp_${safeName}_${Date.now().toString(36)}`,
    name: String(preview?.name || "Unnamed Skill"),
    description: String(preview?.description || "Imported SKILL.md"),
    enabled: previous ? previous.enabled !== false : true,
    sourceUrl: String(preview?.sourceUrl || ""),
    skillUrl: String(preview?.skillUrl || ""),
    homepageUrl: String(preview?.sourceUrl || ""),
    importedAt: previous?.importedAt || now,
    updatedAt: now,
    repository: preview?.repository || null,
    skillPath: String(preview?.skillPath || "SKILL.md"),
    resources: {
      references: Array.isArray(preview?.resources?.references) ? preview.resources.references : [],
      examples: Array.isArray(preview?.resources?.examples) ? preview.resources.examples : [],
      scripts: Array.isArray(preview?.resources?.scripts) ? preview.resources.scripts : [],
    },
    skill: {
      frontmatter: preview?.skill?.frontmatter || {},
      body: String(preview?.skill?.body || ""),
      raw: String(preview?.skill?.raw || ""),
      bytes: Number(preview?.skill?.bytes) > 0 ? Number(preview.skill.bytes) : new TextEncoder().encode(String(preview?.skill?.raw || "")).length,
    },
  };
}

function upsertSkillPackage(packages, nextPackage) {
  const list = Array.isArray(packages) ? [...packages] : [];
  const index = list.findIndex(item => item?.id === nextPackage.id || (item?.sourceUrl && item.sourceUrl === nextPackage.sourceUrl));
  if (index >= 0) {
    list[index] = nextPackage;
  } else {
    list.push(nextPackage);
  }
  return list;
}

function extractTriggerPhrases(description = "") {
  const text = String(description || "");
  const phrases = [];
  const regex = /["“](.+?)["”]/g;
  let match;

  while ((match = regex.exec(text))) {
    const phrase = String(match[1] || "").trim();
    if (phrase) phrases.push(phrase);
  }

  return phrases;
}

function scorePathAgainstKeywords(path, keywords) {
  const tokens = tokenizeResourcePath(path);
  if (tokens.length === 0 || keywords.length === 0) return 0;

  let score = 0;
  for (const keyword of keywords) {
    const kw = cleanForMatch(keyword);
    if (!kw) continue;

    for (const token of tokens) {
      if (token === kw) {
        score += 3;
      } else if (token.includes(kw) || kw.includes(token)) {
        score += 1;
      }
    }
  }

  return score;
}

function pickReferenceCandidates(pkg, userText, runtime) {
  const refs = Array.isArray(pkg?.resources?.references)
    ? pkg.resources.references.map(normalizeReferencePath).filter(Boolean)
    : [];

  if (refs.length === 0) return [];

  const keywords = splitTopKeywords(userText, 12);
  const scored = refs.map(path => {
    let score = scorePathAgainstKeywords(path, keywords);
    const lower = path.toLowerCase();
    if (lower.includes("overview") || lower.includes("readme") || lower.includes("guide")) {
      score += 1;
    }
    return { path, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  const maxPerSkill = Math.max(1, Math.min(5, Number(runtime.maxReferencesPerSkill) || DEFAULT_SKILL_RUNTIME.maxReferencesPerSkill));
  const top = scored.slice(0, maxPerSkill).map(item => item.path);

  if (top.length === 0) {
    return refs.slice(0, maxPerSkill);
  }

  return top;
}

function pickExampleCandidates(pkg, userText, runtime) {
  const examples = Array.isArray(pkg?.resources?.examples)
    ? pkg.resources.examples.map(normalizeReferencePath).filter(Boolean)
    : [];

  if (examples.length === 0) return [];

  const keywords = splitTopKeywords(userText, 12);
  const scored = examples.map(path => {
    let score = scorePathAgainstKeywords(path, keywords);
    const lower = path.toLowerCase();
    if (lower.includes("example") || lower.includes("demo") || lower.includes("sample")) {
      score += 1;
    }
    return { path, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  const maxPerSkill = Math.max(0, Math.min(3, Number(runtime.maxExamplesPerSkill) || DEFAULT_SKILL_RUNTIME.maxExamplesPerSkill));
  if (maxPerSkill === 0) return [];

  const top = scored.slice(0, maxPerSkill).map(item => item.path);
  if (top.length === 0) return examples.slice(0, maxPerSkill);
  return top;
}

function buildRawGitHubFileUrl(repository, path) {
  if (!repository || repository.host !== "github") return "";
  if (!repository.owner || !repository.repo || !repository.ref) return "";

  const normalizedPath = normalizeReferencePath(path);
  if (!normalizedPath) return "";

  return `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${encodeURIComponent(repository.ref)}/${encodeGitHubPath(normalizedPath)}`;
}

function readCachedReferenceSnippet(cacheKey) {
  const cached = skillReferenceCache.get(cacheKey);
  if (!cached) return "";
  if (cached.expiresAt <= Date.now()) {
    skillReferenceCache.delete(cacheKey);
    return "";
  }
  return String(cached.text || "");
}

function writeCachedReferenceSnippet(cacheKey, text) {
  const safeText = String(text || "");
  if (!safeText) return;
  skillReferenceCache.set(cacheKey, {
    text: safeText,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

function extractReferenceSnippet(text, userText, maxChars) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";

  const maxLength = Math.max(300, Number(maxChars) || DEFAULT_SKILL_RUNTIME.maxReferenceSnippetChars);
  const keywords = splitTopKeywords(userText, 10)
    .map(cleanForMatch)
    .filter(Boolean)
    .slice(0, 8);

  if (keywords.length === 0) {
    return normalized.slice(0, maxLength).trim();
  }

  const keywordRegex = new RegExp(keywords.map(escapeRegExp).join("|"), "i");
  const lines = normalized.split("\n");
  const snippets = [];
  const used = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineForMatch = cleanForMatch(line);
    if (!lineForMatch || !keywordRegex.test(lineForMatch)) continue;

    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length - 1, i + 2);
    const key = `${start}-${end}`;
    if (used.has(key)) continue;
    used.add(key);

    const block = lines.slice(start, end + 1).join("\n").trim();
    if (!block) continue;
    snippets.push(block);

    const joined = snippets.join("\n---\n");
    if (joined.length >= maxLength) {
      return joined.slice(0, maxLength).trim();
    }
  }

  if (snippets.length > 0) {
    return snippets.join("\n---\n").slice(0, maxLength).trim();
  }

  return normalized.slice(0, maxLength).trim();
}

async function fetchReferenceSnippetForPackage(pkg, referencePath, userText, runtime) {
  const normalizedPath = normalizeReferencePath(referencePath);
  if (!normalizedPath) return "";

  const cacheKey = [
    pkg?.id || "pkg",
    pkg?.repository?.owner || "",
    pkg?.repository?.repo || "",
    pkg?.repository?.ref || "",
    normalizedPath,
  ].join("::");

  const cached = readCachedReferenceSnippet(cacheKey);
  if (cached) return cached;

  const url = buildRawGitHubFileUrl(pkg?.repository, normalizedPath);
  if (!url) return "";

  const maxFetchBytes = Math.max(16 * 1024, Number(runtime.maxReferenceFetchBytes) || DEFAULT_SKILL_RUNTIME.maxReferenceFetchBytes);
  const maxSnippetChars = Math.max(300, Number(runtime.maxReferenceSnippetChars) || DEFAULT_SKILL_RUNTIME.maxReferenceSnippetChars);

  const { text } = await fetchTextWithLimit(url, {
    accept: "text/plain, text/markdown",
    maxBytes: maxFetchBytes,
    timeoutMs: SKILL_IMPORT_TIMEOUT_MS,
  });

  const snippet = extractReferenceSnippet(text, userText, maxSnippetChars);
  writeCachedReferenceSnippet(cacheKey, snippet);
  return snippet;
}

async function loadReferenceSnippetsForPackage(pkg, userText, runtime, remainingChars) {
  const candidates = pickReferenceCandidates(pkg, userText, runtime);
  const snippets = [];
  let remaining = Math.max(0, Number(remainingChars) || 0);

  for (const path of candidates) {
    if (remaining <= 0) break;
    try {
      const snippet = await fetchReferenceSnippetForPackage(pkg, path, userText, runtime);
      if (!snippet) continue;
      const clipped = snippet.slice(0, remaining);
      if (!clipped.trim()) continue;

      snippets.push({ path, snippet: clipped.trim() });
      remaining -= clipped.length;
    } catch {
      // 忽略单个 reference 拉取失败
    }
  }

  return snippets;
}

async function fetchExampleSnippetForPackage(pkg, examplePath, userText, runtime) {
  const normalizedPath = normalizeReferencePath(examplePath);
  if (!normalizedPath) return "";

  const cacheKey = [
    "ex",
    pkg?.id || "pkg",
    pkg?.repository?.owner || "",
    pkg?.repository?.repo || "",
    pkg?.repository?.ref || "",
    normalizedPath,
  ].join("::");

  const cached = readCachedReferenceSnippet(cacheKey);
  if (cached) return cached;

  const url = buildRawGitHubFileUrl(pkg?.repository, normalizedPath);
  if (!url) return "";

  const maxFetchBytes = Math.max(16 * 1024, Number(runtime.maxReferenceFetchBytes) || DEFAULT_SKILL_RUNTIME.maxReferenceFetchBytes);
  const maxSnippetChars = Math.max(300, Number(runtime.maxExampleSnippetChars) || DEFAULT_SKILL_RUNTIME.maxExampleSnippetChars);

  const { text } = await fetchTextWithLimit(url, {
    accept: "text/plain, text/markdown",
    maxBytes: maxFetchBytes,
    timeoutMs: SKILL_IMPORT_TIMEOUT_MS,
  });

  const snippet = extractReferenceSnippet(text, userText, maxSnippetChars);
  writeCachedReferenceSnippet(cacheKey, snippet);
  return snippet;
}

async function loadExampleSnippetsForPackage(pkg, userText, runtime, remainingChars) {
  const candidates = pickExampleCandidates(pkg, userText, runtime);
  const snippets = [];
  let remaining = Math.max(0, Number(remainingChars) || 0);

  for (const path of candidates) {
    if (remaining <= 0) break;
    try {
      const snippet = await fetchExampleSnippetForPackage(pkg, path, userText, runtime);
      if (!snippet) continue;
      const clipped = snippet.slice(0, remaining);
      if (!clipped.trim()) continue;

      snippets.push({ path, snippet: clipped.trim() });
      remaining -= clipped.length;
    } catch {
      // 忽略单个 example 拉取失败
    }
  }

  return snippets;
}

function scoreSkillPackageForInput(pkg, userText) {
  const text = String(userText || "").trim().toLowerCase();
  const normalizedText = cleanForMatch(userText);
  if (!text || !normalizedText) return 0;

  let score = 0;
  const pkgName = String(pkg?.name || "").trim();
  const normalizedName = cleanForMatch(pkgName);
  if (normalizedName && normalizedText.includes(normalizedName)) {
    score += 8;
  }

  const descText = String(pkg?.skill?.frontmatter?.description || pkg?.description || "").trim();
  const descLower = descText.toLowerCase();
  const triggers = extractTriggerPhrases(descText);

  for (const phrase of triggers) {
    const p = String(phrase || "").trim().toLowerCase();
    if (!p) continue;
    if (text.includes(p) || normalizedText.includes(cleanForMatch(p))) {
      score += 10;
    }
  }

  const keywords = splitTopKeywords(userText, 12);
  let keywordHits = 0;
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    if (!lower) continue;
    if (descLower.includes(lower)) {
      keywordHits += 1;
    }
  }
  score += Math.min(6, keywordHits * 2);

  if (score === 0 && pkgName && text.includes(pkgName.toLowerCase())) {
    score += 4;
  }

  return score;
}

function selectSkillPackagesForInput(userText) {
  const runtime = normalizeSkillRuntime(config.skillRuntime);
  if (!runtime.enabled) return [];

  const text = String(userText || "").trim();
  if (!text) return [];

  const candidates = [];
  for (const pkg of config.skillPackages || []) {
    if (!pkg?.enabled) continue;
    const score = scoreSkillPackageForInput(pkg, userText);
    if (score <= 0) continue;
    candidates.push({ pkg, score });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.pkg?.name || "").localeCompare(String(b.pkg?.name || ""));
  });

  const maxTriggered = Math.max(
    1,
    Math.min(4, Number(runtime.maxTriggeredSkillsPerTurn) || DEFAULT_SKILL_RUNTIME.maxTriggeredSkillsPerTurn)
  );

  return candidates.slice(0, maxTriggered).map(item => item.pkg);
}

async function buildSkillContextMessage(userText, selectedPackages) {
  if (!Array.isArray(selectedPackages) || selectedPackages.length === 0) return "";

  const runtime = normalizeSkillRuntime(config.skillRuntime);
  const maxBodyChars = Math.max(1000, Number(runtime.maxSkillBodyChars) || DEFAULT_SKILL_RUNTIME.maxSkillBodyChars);
  let remainingRefChars = Math.max(0, Number(runtime.maxTotalReferenceChars) || DEFAULT_SKILL_RUNTIME.maxTotalReferenceChars);
  let remainingExampleChars = Math.max(0, Number(runtime.maxTotalExampleChars) || DEFAULT_SKILL_RUNTIME.maxTotalExampleChars);

  const blocks = [];

  for (let index = 0; index < selectedPackages.length; index++) {
    const pkg = selectedPackages[index];
    const desc = String(pkg.description || pkg.skill?.frontmatter?.description || "").trim();
    const body = String(pkg.skill?.body || pkg.skill?.raw || "").trim();
    const trimmedBody = body.length > maxBodyChars ? `${body.slice(0, maxBodyChars)}\n...(truncated)` : body;

    const references = remainingRefChars > 0
      ? await loadReferenceSnippetsForPackage(pkg, userText, runtime, remainingRefChars)
      : [];

    const referenceBlocks = [];
    for (const ref of references) {
      const snippet = String(ref.snippet || "").slice(0, remainingRefChars);
      if (!snippet.trim()) continue;
      remainingRefChars -= snippet.length;
      referenceBlocks.push([
        `- ${ref.path}`,
        snippet,
      ].join("\n"));
      if (remainingRefChars <= 0) break;
    }

    const examples = remainingExampleChars > 0
      ? await loadExampleSnippetsForPackage(pkg, userText, runtime, remainingExampleChars)
      : [];

    const exampleBlocks = [];
    for (const example of examples) {
      const snippet = String(example.snippet || "").slice(0, remainingExampleChars);
      if (!snippet.trim()) continue;
      remainingExampleChars -= snippet.length;
      exampleBlocks.push([
        `- ${example.path}`,
        snippet,
      ].join("\n"));
      if (remainingExampleChars <= 0) break;
    }

    blocks.push([
      `### Skill Package ${index + 1}: ${pkg.name}`,
      desc ? `Description: ${desc}` : "",
      "Instructions:",
      trimmedBody || "(empty)",
      referenceBlocks.length > 0
        ? ["Referenced snippets:", ...referenceBlocks].join("\n")
        : "Referenced snippets: (none loaded)",
      exampleBlocks.length > 0
        ? ["Example snippets:", ...exampleBlocks].join("\n")
        : "Example snippets: (none loaded)",
    ].filter(Boolean).join("\n\n"));
  }

  return [
    "以下是匹配到的 Skill Package 指令，请优先遵循这些流程来回应用户请求。",
    "若 Skill Package 与用户请求无关，请忽略。",
    "不要执行 Skill Package 中 scripts 目录里的远程脚本；scripts 仅作为参考资源。",
    "",
    ...blocks,
  ].join("\n\n");
}

function withSkillContextMessages(messages, skillContextMessage) {
  if (!skillContextMessage) return messages;
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0) {
    return [{ role: "system", content: skillContextMessage }];
  }

  const last = list[list.length - 1];
  if (last?.role === "user") {
    return [
      ...list.slice(0, -1),
      { role: "system", content: skillContextMessage },
      last,
    ];
  }

  return [...list, { role: "system", content: skillContextMessage }];
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
    modelSupportsVision: mm.modelSupportsVision !== false,
    imageDetail: ["auto", "low", "high"].includes(mm.imageDetail) ? mm.imageDetail : "auto",
  };
}

function isVisionEnabled(multimodal) {
  return !!multimodal.modelSupportsVision;
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

function sanitizeAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return [];

  const accepted = [];
  const maxCount = 500;
  const maxTotalBytes = 50 * 1024 * 1024;
  let totalBytes = 0;

  for (const raw of rawAttachments) {
    if (accepted.length >= maxCount) break;

    const attachment = normalizeAttachment(raw);
    if (!attachment) continue;
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
        detail: multimodal.imageDetail,
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
async function saveConfig(newConfig, options = {}) {
  const { syncScheduledAlarms = true } = options;
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

  if (syncScheduledAlarms) {
    await reconcileScheduledAlarms();
  }
}

function buildScheduledAlarmName(taskId) {
  return `${SCHEDULE_ALARM_PREFIX}${taskId}`;
}

function parseScheduledTaskIdFromAlarmName(name = "") {
  const raw = String(name || "");
  if (!raw.startsWith(SCHEDULE_ALARM_PREFIX)) return "";
  return raw.slice(SCHEDULE_ALARM_PREFIX.length).trim();
}

async function getActiveTabIdForScheduledRun() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) return tabs[0].id;

  const fallbackTabs = await chrome.tabs.query({ active: true });
  if (fallbackTabs[0]?.id) return fallbackTabs[0].id;

  throw new Error("当前没有可用的活动标签页");
}

async function persistScheduledTasks(nextTasks, options = {}) {
  const { syncScheduledAlarms = false } = options;
  config = mergeConfig({
    ...config,
    scheduledTasks: Array.isArray(nextTasks) ? nextTasks : [],
  });
  await chrome.storage.local.set({ domAgentConfig: config });
  if (syncScheduledAlarms) {
    await reconcileScheduledAlarms();
  }
}

async function patchScheduledTask(taskId, updater, options = {}) {
  const { syncScheduledAlarms = false } = options;
  const tasks = Array.isArray(config.scheduledTasks) ? config.scheduledTasks : [];
  const idx = tasks.findIndex(item => item.id === taskId);
  if (idx < 0) return null;

  const current = tasks[idx];
  const next = typeof updater === "function" ? updater(current) : current;
  if (!next || typeof next !== "object") return null;

  const updatedTasks = [...tasks];
  updatedTasks[idx] = next;
  await persistScheduledTasks(updatedTasks, { syncScheduledAlarms });
  return updatedTasks[idx];
}

async function reconcileScheduledAlarms() {
  const tasks = Array.isArray(config.scheduledTasks) ? config.scheduledTasks : [];
  const existingAlarms = await chrome.alarms.getAll();
  const scheduleAlarms = existingAlarms.filter(alarm => alarm.name?.startsWith(SCHEDULE_ALARM_PREFIX));
  const alarmByName = new Map(scheduleAlarms.map(alarm => [alarm.name, alarm]));
  const desiredAlarmNames = new Set();

  const now = Date.now();
  let changed = false;
  const nextTasks = tasks.map(task => {
    const state = task?.state && typeof task.state === "object" ? task.state : {};
    return {
      ...task,
      state: {
        ...state,
      },
    };
  });

  for (const task of nextTasks) {
    const alarmName = buildScheduledAlarmName(task.id);

    if (!task.enabled) {
      if (task.state?.nextRunAt) {
        task.state.nextRunAt = undefined;
        changed = true;
      }
      continue;
    }

    const trigger = task.trigger && typeof task.trigger === "object" ? task.trigger : { type: "interval", intervalMinutes: 1 };
    desiredAlarmNames.add(alarmName);
    const existing = alarmByName.get(alarmName);

    if (trigger.type === "once") {
      const runAtMs = Date.parse(trigger.runAt || "");
      if (!Number.isFinite(runAtMs)) {
        task.enabled = false;
        task.state.status = "failed";
        task.state.lastError = "无效的执行时间";
        task.state.nextRunAt = undefined;
        task.updatedAt = new Date().toISOString();
        changed = true;
        desiredAlarmNames.delete(alarmName);
        continue;
      }

      const targetWhen = Math.max(now + 800, runAtMs);
      const needCreate = !existing || Number(existing.periodInMinutes) > 0 || Math.abs((existing.scheduledTime || 0) - targetWhen) > 1000;
      if (needCreate) {
        await chrome.alarms.clear(alarmName);
        chrome.alarms.create(alarmName, { when: targetWhen });
      }

      const nextRunAt = new Date(targetWhen).toISOString();
      if (task.state.nextRunAt !== nextRunAt) {
        task.state.nextRunAt = nextRunAt;
        changed = true;
      }
      if (task.state.status !== "running" && task.state.status !== "scheduled") {
        task.state.status = "scheduled";
        changed = true;
      }
      continue;
    }

    const intervalMinutes = Math.floor(clampNumber(trigger.intervalMinutes, 1, 1, 24 * 60));
    const needCreate = !existing || Math.floor(existing.periodInMinutes || 0) !== intervalMinutes;
    if (needCreate) {
      await chrome.alarms.clear(alarmName);
      chrome.alarms.create(alarmName, {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes,
      });
    }

    const nextRunAt = (!needCreate && existing?.scheduledTime)
      ? new Date(existing.scheduledTime).toISOString()
      : new Date(now + intervalMinutes * 60 * 1000).toISOString();

    if (task.state.nextRunAt !== nextRunAt) {
      task.state.nextRunAt = nextRunAt;
      changed = true;
    }
    if (task.state.status !== "running" && task.state.status !== "scheduled") {
      task.state.status = "scheduled";
      changed = true;
    }
  }

  for (const alarm of scheduleAlarms) {
    if (!desiredAlarmNames.has(alarm.name)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  if (changed) {
    await persistScheduledTasks(nextTasks, { syncScheduledAlarms: false });
  }
}

function emitAgentUpdate(update) {
  chrome.runtime.sendMessage({ type: "AGENT_UPDATE", payload: update }).catch(() => {});
}

async function runScheduledTask(taskId) {
  await loadConfig();
  const task = (config.scheduledTasks || []).find(item => item.id === taskId);
  if (!task || !task.enabled) return;

  const nowIso = new Date().toISOString();

  if (runningScheduledTaskIds.has(taskId)) {
    await patchScheduledTask(taskId, current => ({
      ...current,
      state: {
        ...(current.state || {}),
        status: "skipped",
        lastRunAt: nowIso,
        lastError: "上一轮任务尚未结束，本轮已跳过",
      },
      updatedAt: nowIso,
    }));
    return;
  }

  runningScheduledTaskIds.add(taskId);

  try {
    await patchScheduledTask(taskId, current => ({
      ...current,
      state: {
        ...(current.state || {}),
        status: "running",
        lastError: "",
      },
      updatedAt: nowIso,
    }));

    let status = "success";
    let lastError = "";

    try {
      if (!config.apiKey) {
        throw new Error("请先在设置中配置 API Key");
      }

      const tabId = await getActiveTabIdForScheduledRun();
      let runtimeError = "";
      await runAgent(tabId, { text: task.prompt, attachments: [] }, (update) => {
        emitAgentUpdate(update);
        if (!runtimeError && update?.type === "error") {
          runtimeError = String(update.message || "任务执行失败");
        }
      });

      if (runtimeError) {
        status = "failed";
        lastError = runtimeError;
      }
    } catch (error) {
      status = "failed";
      lastError = getErrorMessage(error);
    }

    const completedAt = new Date().toISOString();

    await patchScheduledTask(taskId, current => {
      const trigger = current.trigger && typeof current.trigger === "object" ? current.trigger : { type: "interval", intervalMinutes: 1 };
      const intervalMinutes = Math.floor(clampNumber(trigger.intervalMinutes, 1, 1, 24 * 60));
      const isOnce = trigger.type === "once";

      return {
        ...current,
        enabled: isOnce ? false : current.enabled,
        state: {
          ...(current.state || {}),
          status,
          lastRunAt: completedAt,
          lastError,
          totalRuns: Math.max(0, Math.floor(Number(current.state?.totalRuns) || 0)) + 1,
          totalFailures: Math.max(0, Math.floor(Number(current.state?.totalFailures) || 0)) + (status === "failed" ? 1 : 0),
          nextRunAt: isOnce
            ? undefined
            : new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString(),
        },
        updatedAt: completedAt,
      };
    }, { syncScheduledAlarms: task.trigger?.type === "once" });
  } finally {
    runningScheduledTaskIds.delete(taskId);
  }
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

chrome.alarms.onAlarm.addListener((alarm) => {
  const taskId = parseScheduledTaskIdFromAlarmName(alarm?.name);
  if (!taskId) return;
  runScheduledTask(taskId).catch((error) => {
    console.error("[schedule] 定时任务执行失败:", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  loadConfig()
    .then(() => reconcileScheduledAlarms())
    .catch((error) => console.warn("[schedule] onStartup 同步失败:", error?.message || error));
});

chrome.runtime.onInstalled.addListener(() => {
  loadConfig()
    .then(() => reconcileScheduledAlarms())
    .catch((error) => console.warn("[schedule] onInstalled 同步失败:", error?.message || error));
});

function extractReasoningDelta(delta) {
  if (!delta || typeof delta !== "object") return "";

  const flattenText = (value) => {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          if (typeof item.text === "string") return item.text;
          if (typeof item.content === "string") return item.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  };

  const candidates = [
    delta.reasoning,
    delta.reasoning_content,
    delta.reasoningContent,
    delta.reasoning_text,
    delta.reasoningText,
  ];

  for (const candidate of candidates) {
    const text = flattenText(candidate);
    if (typeof text === "string" && text.trim()) return text;
  }

  return "";
}

// ---- API 调用 ----
async function callAPI(messages, { stream = false, onDelta, onReasoningDelta, onToolCalls, skillContextMessage = "" } = {}) {
  // 合并内置工具 + Skill Package 上下文 + MCP 动态工具
  const dynamicTools = buildDynamicTools();
  const allTools = [...TOOLS, ...dynamicTools.map(t => ({ type: t.type, function: t.function }))];
  const requestMessages = withSkillContextMessages(messages, skillContextMessage);

  const body = {
    model: config.model,
    messages: requestMessages,
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
  let reasoningAccum = "";
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

      // reasoning 增量
      const reasoningDelta = extractReasoningDelta(delta);
      if (reasoningDelta) {
        reasoningAccum += reasoningDelta;
        if (onReasoningDelta) onReasoningDelta(reasoningDelta, reasoningAccum);
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
          clientInfo: { name: "Wegent", version: "1.0.0" },
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

// 将 MCP 远程工具转换成 OpenAI function tool 格式
function buildDynamicTools() {
  const extraTools = [];

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

// 统一工具执行路由
async function executeTool(tabId, name, args) {
  try {
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
  if (multimodal.modelSupportsVision) {
    attachments = sanitizeAttachments(userInput.attachments);
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
      message: "当前模型未启用视觉能力，请输入文本或在设置中开启 Vision 支持。",
    });
    return;
  }

  // 获取或创建会话
  if (!conversations.has(tabId)) {
    conversations.set(tabId, [{ role: "system", content: config.systemPrompt }]);
  }
  const messages = conversations.get(tabId);
  messages.push(buildUserMessage(userInput.text, attachments, multimodal));

  const selectedSkillPackages = selectSkillPackagesForInput(userInput.text);

  sendUpdate({ type: "thinking" });

  try {
    const skillContextMessage = await buildSkillContextMessage(userInput.text, selectedSkillPackages);
    let loopCount = 0;
    const MAX_LOOPS = config.maxLoops || 20;

    sendUpdate({ type: "info", message: `最大调用轮次: ${MAX_LOOPS}` });

    while (loopCount < MAX_LOOPS) {
      loopCount++;
      const response = await callAPI(messages, {
        stream: true,
        skillContextMessage,
        onDelta: (delta, full) => {
          sendUpdate({
            type: "assistant_delta",
            delta: delta,
            content: full,
          });
        },
        onReasoningDelta: (delta, full) => {
          sendUpdate({
            type: "reasoning_delta",
            delta,
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
          if (isVisionEnabled(multimodal)) {
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
    saveConfig(message.config)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));
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

  if (message.type === "SKILL_IMPORT_PREVIEW") {
    const sourceUrl = String(message?.sourceUrl || "").trim();
    resolveSkillImportSource(sourceUrl)
      .then(buildSkillImportPreview)
      .then(preview => {
        const runtime = normalizeSkillRuntime(config.skillRuntime);
        if (preview.skill.bytes > runtime.maxSkillBytes) {
          sendResponse({
            ok: false,
            error: `SKILL.md 超出大小限制：${preview.skill.bytes} bytes > ${runtime.maxSkillBytes} bytes`,
          });
          return;
        }
        sendResponse({ ok: true, preview });
      })
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.type === "SKILL_IMPORT_COMMIT") {
    const preview = message?.preview;
    if (!preview || typeof preview !== "object") {
      sendResponse({ ok: false, error: "缺少预览数据，请先执行预览" });
      return true;
    }

    loadConfig()
      .then(async () => {
        const runtime = normalizeSkillRuntime(config.skillRuntime);
        const currentPackages = normalizeSkillPackages(config.skillPackages);
        const existing = currentPackages.find(item => item.sourceUrl && item.sourceUrl === preview.sourceUrl) || null;
        const nextPackage = buildSkillPackageFromPreview(preview, existing);

        if (!existing && currentPackages.length >= runtime.maxPackages) {
          throw new Error(`Skill 包数量已达上限（${runtime.maxPackages}）`);
        }
        if (nextPackage.skill.bytes > runtime.maxSkillBytes) {
          throw new Error(`SKILL.md 超出大小限制：${nextPackage.skill.bytes} bytes > ${runtime.maxSkillBytes} bytes`);
        }

        const nextPackages = upsertSkillPackage(currentPackages, nextPackage);
        await saveConfig({
          ...config,
          skillPackages: nextPackages,
        });

        return nextPackage;
      })
      .then(saved => sendResponse({ ok: true, package: saved }))
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));

    return true;
  }

  if (message.type === "SKILL_PACKAGE_LIST") {
    loadConfig()
      .then(() => {
        const packages = normalizeSkillPackages(config.skillPackages);
        sendResponse({ ok: true, packages });
      })
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));
    return true;
  }

  if (message.type === "SKILL_PACKAGE_TOGGLE") {
    const packageId = String(message?.packageId || "").trim();
    const enabled = message?.enabled !== false;
    if (!packageId) {
      sendResponse({ ok: false, error: "缺少 packageId" });
      return true;
    }

    loadConfig()
      .then(async () => {
        const packages = normalizeSkillPackages(config.skillPackages);
        const idx = packages.findIndex(item => item.id === packageId);
        if (idx < 0) {
          throw new Error("未找到指定 Skill 包");
        }

        packages[idx] = {
          ...packages[idx],
          enabled,
          updatedAt: new Date().toISOString(),
        };

        await saveConfig({
          ...config,
          skillPackages: packages,
        });

        return packages[idx];
      })
      .then(updated => sendResponse({ ok: true, package: updated }))
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));

    return true;
  }

  if (message.type === "SKILL_PACKAGE_REMOVE") {
    const packageId = String(message?.packageId || "").trim();
    if (!packageId) {
      sendResponse({ ok: false, error: "缺少 packageId" });
      return true;
    }

    loadConfig()
      .then(async () => {
        const packages = normalizeSkillPackages(config.skillPackages);
        const nextPackages = packages.filter(item => item.id !== packageId);
        if (nextPackages.length === packages.length) {
          throw new Error("未找到指定 Skill 包");
        }

        await saveConfig({
          ...config,
          skillPackages: nextPackages,
        });
      })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));

    return true;
  }

  if (message.type === "SKILL_PACKAGE_REFRESH") {
    const packageId = String(message?.packageId || "").trim();
    if (!packageId) {
      sendResponse({ ok: false, error: "缺少 packageId" });
      return true;
    }

    loadConfig()
      .then(async () => {
        const packages = normalizeSkillPackages(config.skillPackages);
        const idx = packages.findIndex(item => item.id === packageId);
        if (idx < 0) {
          throw new Error("未找到指定 Skill 包");
        }

        const current = packages[idx];
        if (!current.sourceUrl) {
          throw new Error("当前 Skill 包缺少 sourceUrl，无法刷新");
        }

        const resolved = await resolveSkillImportSource(current.sourceUrl);
        const preview = buildSkillImportPreview(resolved);
        const runtime = normalizeSkillRuntime(config.skillRuntime);
        if (preview.skill.bytes > runtime.maxSkillBytes) {
          throw new Error(`SKILL.md 超出大小限制：${preview.skill.bytes} bytes > ${runtime.maxSkillBytes} bytes`);
        }

        const refreshed = buildSkillPackageFromPreview(preview, current);
        const resourceDiff = computeResourceDiff(current.resources, refreshed.resources);
        const skillDiff = computeSkillContentDiff(current.skill, refreshed.skill);

        packages[idx] = refreshed;

        await saveConfig({
          ...config,
          skillPackages: packages,
        });

        return {
          package: refreshed,
          diff: {
            resources: resourceDiff,
            skill: skillDiff,
          },
        };
      })
      .then(result => sendResponse({ ok: true, package: result.package, diff: result.diff }))
      .catch(error => sendResponse({ ok: false, error: getErrorMessage(error) }));

    return true;
  }
});

// 初始化
loadConfig().then(() => reconcileScheduledAlarms()).catch(() => {});
