// ============================================================
// Wegent - Content Script
// 在页面上下文中执行各种 DOM 操作
// ============================================================

(() => {
  // 防止重复注入
  if (window.__domAgentInjected) return;
  window.__domAgentInjected = true;

  // ---- 工具实现 ----

  /** 获取页面基本信息 */
  function getPageInfo() {
    return {
      success: true,
      url: location.href,
      title: document.title,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  /** 描述单个元素 */
  function describeElement(el, index) {
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    const isVisible =
      styles.display !== "none" &&
      styles.visibility !== "hidden" &&
      styles.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;

    const desc = {
      index: index,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().slice(0, 100),
      isVisible: isVisible,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };

    // 常用属性
    if (el.id) desc.id = el.id;
    if (el.className && typeof el.className === "string")
      desc.class = el.className.trim().slice(0, 100);
    if (el.href) desc.href = el.href;
    if (el.src) desc.src = el.src;
    if (el.type) desc.type = el.type;
    if (el.name) desc.name = el.name;
    if (el.value !== undefined && el.value !== "") desc.value = el.value;
    if (el.placeholder) desc.placeholder = el.placeholder;
    if (el.getAttribute("aria-label"))
      desc.ariaLabel = el.getAttribute("aria-label");
    if (el.getAttribute("role")) desc.role = el.getAttribute("role");
    if (el.disabled) desc.disabled = true;
    if (el.checked !== undefined) desc.checked = el.checked;

    return desc;
  }

  /** 查询元素 */
  function getElements(args) {
    try {
      const limit = args.limit || 20;
      const elements = Array.from(document.querySelectorAll(args.selector));
      const described = elements.slice(0, limit).map((el, i) => describeElement(el, i));
      return {
        success: true,
        total: elements.length,
        returned: described.length,
        elements: described,
      };
    } catch (e) {
      return { success: false, error: `选择器无效: ${e.message}` };
    }
  }

  /** 获取页面文本内容 */
  function getPageContent(args) {
    const maxLength = args.maxLength || 5000;
    let text;
    if (args.selector) {
      const el = document.querySelector(args.selector);
      if (!el) return { success: false, error: `未找到元素: ${args.selector}` };
      text = el.innerText || el.textContent || "";
    } else {
      text = document.body.innerText || document.body.textContent || "";
    }
    text = text.trim();
    const truncated = text.length > maxLength;
    return {
      success: true,
      content: text.slice(0, maxLength),
      totalLength: text.length,
      truncated: truncated,
    };
  }

  /** 点击元素 */
  function clickElement(args) {
    try {
      const elements = document.querySelectorAll(args.selector);
      const index = args.index || 0;
      if (elements.length === 0) {
        return { success: false, error: `未找到元素: ${args.selector}` };
      }
      if (index >= elements.length) {
        return {
          success: false,
          error: `索引 ${index} 超出范围，共找到 ${elements.length} 个元素`,
        };
      }
      const el = elements[index];
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      // 闪烁高亮效果
      flashElement(el);

      // 触发点击
      el.click();
      return {
        success: true,
        clicked: describeElement(el, index),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 输入文本 */
  function typeText(args) {
    try {
      const elements = document.querySelectorAll(args.selector);
      const index = args.index || 0;
      if (elements.length === 0) {
        return { success: false, error: `未找到元素: ${args.selector}` };
      }
      const el = elements[index];
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();

      if (args.clear !== false) {
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 逐步设置值并触发事件
      el.value = args.text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      flashElement(el);

      return {
        success: true,
        element: describeElement(el, index),
        typedText: args.text,
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 选择下拉选项 */
  function selectOption(args) {
    try {
      const el = document.querySelector(args.selector);
      if (!el) return { success: false, error: `未找到元素: ${args.selector}` };
      if (el.tagName.toLowerCase() !== "select") {
        return { success: false, error: "目标元素不是 select 下拉框" };
      }
      el.value = args.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      flashElement(el);
      return { success: true, selectedValue: args.value };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 滚动 */
  function scroll(args) {
    const distance = args.distance || 500;
    const target = args.selector
      ? document.querySelector(args.selector)
      : window;

    if (args.selector && !target) {
      return { success: false, error: `未找到元素: ${args.selector}` };
    }

    const scrollTarget = target === window ? document.documentElement : target;

    switch (args.direction) {
      case "up":
        (target === window ? window : target).scrollBy({
          top: -distance,
          behavior: "smooth",
        });
        break;
      case "down":
        (target === window ? window : target).scrollBy({
          top: distance,
          behavior: "smooth",
        });
        break;
      case "left":
        (target === window ? window : target).scrollBy({
          left: -distance,
          behavior: "smooth",
        });
        break;
      case "right":
        (target === window ? window : target).scrollBy({
          left: distance,
          behavior: "smooth",
        });
        break;
      case "top":
        (target === window ? window : target).scrollTo({
          top: 0,
          behavior: "smooth",
        });
        break;
      case "bottom":
        (target === window ? window : target).scrollTo({
          top: scrollTarget.scrollHeight,
          behavior: "smooth",
        });
        break;
    }

    return {
      success: true,
      direction: args.direction,
      scrollY: window.scrollY,
    };
  }

  /** 执行 JS */
  function evaluateJS(args) {
    try {
      const result = eval(args.code);
      return {
        success: true,
        result:
          typeof result === "object" ? JSON.stringify(result, null, 2) : String(result),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 等待 */
  async function waitFor(args) {
    if (args.selector) {
      const timeout = 10000;
      const interval = 200;
      let elapsed = 0;
      while (elapsed < timeout) {
        if (document.querySelector(args.selector)) {
          return { success: true, found: true, elapsed: elapsed };
        }
        await new Promise((r) => setTimeout(r, interval));
        elapsed += interval;
      }
      return { success: false, error: `等待超时: ${args.selector}` };
    }
    if (args.ms) {
      await new Promise((r) => setTimeout(r, Math.min(args.ms, 30000)));
      return { success: true, waited: args.ms };
    }
    return { success: false, error: "请指定 ms 或 selector 参数" };
  }

  /** 高亮元素 */
  function highlightElements(args) {
    try {
      const color = args.color || "rgba(255, 107, 107, 0.3)";
      const elements = document.querySelectorAll(args.selector);
      if (elements.length === 0) {
        return { success: false, error: `未找到元素: ${args.selector}` };
      }
      elements.forEach((el) => {
        el.style.outline = `2px solid ${color}`;
        el.style.backgroundColor = color;
        setTimeout(() => {
          el.style.outline = "";
          el.style.backgroundColor = "";
        }, 3000);
      });
      return { success: true, highlighted: elements.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /** 闪烁效果 */
  function flashElement(el) {
    const original = el.style.outline;
    el.style.outline = "2px solid #4f8cff";
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      el.style.outline = original;
      el.style.outlineOffset = "";
    }, 800);
  }

  // ---- 消息处理 ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "EXECUTE_TOOL") return;

    const { tool, args } = message;

    // 异步工具需要特殊处理
    if (tool === "wait") {
      waitFor(args || {}).then(sendResponse);
      return true; // 保持连接
    }

    // 同步工具
    const handlers = {
      get_page_info: () => getPageInfo(),
      get_elements: () => getElements(args || {}),
      get_page_content: () => getPageContent(args || {}),
      click: () => clickElement(args || {}),
      type_text: () => typeText(args || {}),
      select_option: () => selectOption(args || {}),
      scroll: () => scroll(args || {}),
      evaluate_js: () => evaluateJS(args || {}),
      highlight: () => highlightElements(args || {}),
    };

    const handler = handlers[tool];
    if (handler) {
      sendResponse(handler());
    } else {
      sendResponse({ success: false, error: `未知工具: ${tool}` });
    }

    return true;
  });
})();
