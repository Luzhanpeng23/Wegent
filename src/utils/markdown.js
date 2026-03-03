import { marked } from 'marked'
import hljs from 'highlight.js/lib/common'

// 配置 marked
marked.setOptions({
  gfm: true,          // GitHub 风格 Markdown
  breaks: true,       // 换行符转 <br>
})

marked.use({
  renderer: {
    code({ text, lang }) {
      const raw = typeof text === 'string' ? text : ''
      const language = (lang || '').trim().toLowerCase().split(/[\s,]+/)[0]
      const canHighlight = language && hljs.getLanguage(language)

      try {
        const highlighted = canHighlight
          ? hljs.highlight(raw, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(raw).value

        const cls = canHighlight
          ? ` class="hljs language-${escapeHtml(language)}"`
          : ' class="hljs"'

        return `<pre><code${cls}>${highlighted}</code></pre>`
      } catch {
        return `<pre><code class="hljs">${escapeHtml(raw)}</code></pre>`
      }
    },
  },
})

/** Markdown -> HTML（安全转换） */
export function formatMarkdown(text) {
  if (!text) return ''
  try {
    return marked.parse(text)
  } catch {
    return escapeHtml(text)
  }
}

/** 内联 Markdown -> HTML（不包裹 <p>，用于流式片段） */
export function formatMarkdownInline(text) {
  if (!text) return ''
  try {
    return marked.parseInline(text)
  } catch {
    return escapeHtml(text)
  }
}

export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  }
  return String(text).replace(/[&<>"']/g, c => map[c])
}
