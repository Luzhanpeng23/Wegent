const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/

function stripQuotes(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

export function parseSimpleFrontmatter(block) {
  const result = {}
  const lines = String(block || '').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (!match) continue

    const key = match[1]
    const value = stripQuotes(match[2])
    result[key] = value
  }

  return result
}

export function parseSkillMarkdown(markdownText) {
  const raw = String(markdownText || '').replace(/^\uFEFF/, '')
  const match = raw.match(FRONTMATTER_RE)

  if (!match) {
    return {
      raw,
      frontmatter: {},
      body: raw.trim(),
      hasFrontmatter: false,
    }
  }

  const frontmatterBlock = match[1]
  const frontmatter = parseSimpleFrontmatter(frontmatterBlock)
  const body = raw.slice(match[0].length).trim()

  return {
    raw,
    frontmatter,
    body,
    hasFrontmatter: true,
  }
}

export function inferSkillName(parsed) {
  const fmName = String(parsed?.frontmatter?.name || '').trim()
  if (fmName) return fmName

  const body = String(parsed?.body || '')
  const h1 = body.match(/^#\s+(.+)$/m)
  if (h1?.[1]) return h1[1].trim()

  return 'Unnamed Skill'
}

export function inferSkillDescription(parsed) {
  const fmDescription = String(parsed?.frontmatter?.description || '').trim()
  if (fmDescription) return fmDescription

  const body = String(parsed?.body || '')
  const firstTextLine = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))

  if (firstTextLine) {
    return firstTextLine.slice(0, 200)
  }

  return 'Imported SKILL.md'
}

export function sanitizeSkillPackageName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}
