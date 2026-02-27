import { marked } from 'marked'

// 配置 marked
marked.setOptions({
  gfm: true,          // GitHub 风格 Markdown
  breaks: true,       // 换行符转 <br>
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
