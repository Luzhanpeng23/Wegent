import { useEffect, useState } from 'react'

const EMPTY_SKILL = {
  id: '',
  name: '',
  description: '',
  enabled: true,
  type: 'http',
  parameters: { type: 'object', properties: {} },
  config: {
    // http
    url: '',
    method: 'GET',
    headers: {},
    bodyTemplate: '',
    // javascript
    code: '',
  },
}

function genId() {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function upsertPackage(packages, nextPackage) {
  const list = Array.isArray(packages) ? [...packages] : []
  const idx = list.findIndex(item => item.id === nextPackage.id)
  if (idx >= 0) list[idx] = nextPackage
  else list.push(nextPackage)
  return list
}

export default function SkillsManager({
  skills = [],
  skillPackages = [],
  skillApi,
  onChange,
}) {
  const [legacyOpen, setLegacyOpen] = useState(false)

  // 新版 Skill Package 状态
  const [sourceUrl, setSourceUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [lastRefreshDiff, setLastRefreshDiff] = useState(null)

  // 旧版 skills 编辑器状态（兼容保留）
  const [editing, setEditing] = useState(null)
  const [paramsText, setParamsText] = useState('')
  const [headersText, setHeadersText] = useState('')

  const emitChange = (nextSkills, nextSkillPackages) => {
    if (typeof onChange !== 'function') return
    onChange({
      skills: Array.isArray(nextSkills) ? nextSkills : skills,
      skillPackages: Array.isArray(nextSkillPackages) ? nextSkillPackages : skillPackages,
    })
  }

  const syncPackagesFromBackend = async () => {
    if (!skillApi?.list) return
    const resp = await skillApi.list()
    if (resp?.ok && Array.isArray(resp.packages)) {
      emitChange(skills, resp.packages)
    }
  }

  useEffect(() => {
    syncPackagesFromBackend().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------
  // 新版 Skill Package 操作
  // --------------------
  const handlePreviewImport = async () => {
    if (!sourceUrl.trim()) return
    setActionError('')
    setActionSuccess('')
    setPreview(null)

    if (!skillApi?.preview) {
      setActionError('当前环境不支持在线导入预览')
      return
    }

    setPreviewing(true)
    try {
      const resp = await skillApi.preview(sourceUrl.trim())
      if (!resp?.ok) {
        setActionError(resp?.error || '预览失败')
        return
      }
      setPreview(resp.preview)
    } catch (e) {
      setActionError(e?.message || '预览失败')
    } finally {
      setPreviewing(false)
    }
  }

  const handleCommitImport = async () => {
    if (!preview) return
    setActionError('')
    setActionSuccess('')

    if (!skillApi?.commit) {
      setActionError('当前环境不支持导入')
      return
    }

    setCommitting(true)
    try {
      const resp = await skillApi.commit(preview)
      if (!resp?.ok) {
        setActionError(resp?.error || '导入失败')
        return
      }

      const nextPackages = resp.package
        ? upsertPackage(skillPackages, resp.package)
        : skillPackages

      emitChange(skills, nextPackages)
      setActionSuccess('Skill 包已导入')
      setSourceUrl('')
      setPreview(null)

      await syncPackagesFromBackend()
    } catch (e) {
      setActionError(e?.message || '导入失败')
    } finally {
      setCommitting(false)
    }
  }

  const handleTogglePackage = async (pkg, enabled) => {
    if (!skillApi?.toggle) {
      setActionError('当前环境不支持启用/禁用')
      return
    }

    setActionError('')
    setActionSuccess('')
    setActionLoadingId(pkg.id)

    try {
      const resp = await skillApi.toggle(pkg.id, enabled)
      if (!resp?.ok) {
        setActionError(resp?.error || '更新失败')
        return
      }

      const nextPackages = (skillPackages || []).map(item =>
        item.id === pkg.id ? { ...item, enabled } : item
      )
      emitChange(skills, nextPackages)

      await syncPackagesFromBackend()
    } catch (e) {
      setActionError(e?.message || '更新失败')
    } finally {
      setActionLoadingId('')
    }
  }

  const handleRefreshPackage = async (pkg) => {
    if (!skillApi?.refresh) {
      setActionError('当前环境不支持刷新')
      return
    }

    setActionError('')
    setActionSuccess('')
    setLastRefreshDiff(null)
    setActionLoadingId(pkg.id)

    try {
      const resp = await skillApi.refresh(pkg.id)
      if (!resp?.ok) {
        setActionError(resp?.error || '刷新失败')
        return
      }

      const nextPackages = resp.package
        ? upsertPackage(skillPackages, resp.package)
        : skillPackages

      emitChange(skills, nextPackages)
      setActionSuccess(`已刷新：${pkg.name}`)
      if (resp?.diff) {
        setLastRefreshDiff({ packageName: pkg.name, ...resp.diff })
      }

      await syncPackagesFromBackend()
    } catch (e) {
      setActionError(e?.message || '刷新失败')
    } finally {
      setActionLoadingId('')
    }
  }

  const handleRemovePackage = async (pkg) => {
    if (!skillApi?.remove) {
      setActionError('当前环境不支持删除')
      return
    }

    setActionError('')
    setActionSuccess('')
    setActionLoadingId(pkg.id)

    try {
      const resp = await skillApi.remove(pkg.id)
      if (!resp?.ok) {
        setActionError(resp?.error || '删除失败')
        return
      }

      const nextPackages = (skillPackages || []).filter(item => item.id !== pkg.id)
      emitChange(skills, nextPackages)
      setActionSuccess(`已删除：${pkg.name}`)

      await syncPackagesFromBackend()
    } catch (e) {
      setActionError(e?.message || '删除失败')
    } finally {
      setActionLoadingId('')
    }
  }

  // --------------------
  // 旧版 skills 兼容编辑器
  // --------------------
  const startEdit = (skill) => {
    setEditing({ ...skill, config: { ...EMPTY_SKILL.config, ...skill.config } })
    setParamsText(JSON.stringify(skill.parameters || EMPTY_SKILL.parameters, null, 2))
    setHeadersText(JSON.stringify(skill.config?.headers || {}, null, 2))
  }

  const startAdd = () => {
    const s = { ...EMPTY_SKILL, id: genId(), config: { ...EMPTY_SKILL.config } }
    setEditing(s)
    setParamsText(JSON.stringify(s.parameters, null, 2))
    setHeadersText('{}')
  }

  const saveEditing = () => {
    if (!editing || !editing.name.trim()) return
    let params
    try { params = JSON.parse(paramsText) } catch { params = EMPTY_SKILL.parameters }
    let headers
    try { headers = JSON.parse(headersText) } catch { headers = {} }

    const saved = {
      ...editing,
      name: editing.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
      parameters: params,
      config: { ...editing.config, headers },
    }

    const idx = skills.findIndex(s => s.id === saved.id)
    const updated = [...skills]
    if (idx >= 0) updated[idx] = saved
    else updated.push(saved)

    emitChange(updated, skillPackages)
    setEditing(null)
  }

  const removeSkill = (id) => {
    emitChange(skills.filter(s => s.id !== id), skillPackages)
  }

  const toggleSkill = (id) => {
    emitChange(skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s), skillPackages)
  }

  return (
    <>
      <section className="settings-section-card">
        <div className="settings-section-title">Skill Packages（Claude Code 风格）</div>
        <p className="settings-hint">
          支持从 skills.sh 页面、GitHub 仓库或 SKILL.md 直链导入。脚本资源（scripts）只做展示，不会在扩展内执行。
        </p>

        <div className="skill-import-row">
          <input
            type="text"
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://skills.sh/... 或 https://github.com/..."
          />
          <button className="btn-secondary btn-sm" onClick={handlePreviewImport} disabled={previewing || committing}>
            {previewing ? '解析中...' : '预览'}
          </button>
          <button className="btn-primary btn-sm" onClick={handleCommitImport} disabled={!preview || previewing || committing}>
            {committing ? '导入中...' : '导入'}
          </button>
        </div>

        {actionError && <p className="settings-hint" style={{ color: '#cf674f' }}>{actionError}</p>}
        {actionSuccess && <p className="settings-hint" style={{ color: '#2c8a62' }}>{actionSuccess}</p>}
        {lastRefreshDiff && (
          <div className="skill-preview-card">
            <div className="skill-preview-head">
              <strong>刷新差异：{lastRefreshDiff.packageName || 'Skill Package'}</strong>
              <span className="ext-item-badge">Diff</span>
            </div>
            <p className="settings-hint">
              SKILL.md：{lastRefreshDiff.skill?.changed ? '已变化' : '无变化'}
              {typeof lastRefreshDiff.skill?.bytesDelta === 'number' && `（Δ ${lastRefreshDiff.skill.bytesDelta} bytes）`}
            </p>
            <p className="settings-hint">
              references +{lastRefreshDiff.resources?.references?.addedCount || 0} / -{lastRefreshDiff.resources?.references?.removedCount || 0} ·
              examples +{lastRefreshDiff.resources?.examples?.addedCount || 0} / -{lastRefreshDiff.resources?.examples?.removedCount || 0} ·
              scripts +{lastRefreshDiff.resources?.scripts?.addedCount || 0} / -{lastRefreshDiff.resources?.scripts?.removedCount || 0}
            </p>
          </div>
        )}

        {preview && (
          <div className="skill-preview-card">
            <div className="skill-preview-head">
              <strong>{preview.name || 'Unnamed Skill'}</strong>
              <span className="ext-item-badge">预览</span>
            </div>
            <p className="settings-hint">{preview.description || '无描述'}</p>
            <p className="settings-hint">来源：{preview.sourceUrl}</p>
            <p className="settings-hint">
              references: {preview.resources?.references?.length || 0} · examples: {preview.resources?.examples?.length || 0} · scripts: {preview.resources?.scripts?.length || 0}
            </p>
            {(preview.warnings || []).length > 0 && (
              <ul className="skill-warnings">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {skillPackages.length > 0 ? (
          <div className="ext-list">
            {skillPackages.map(pkg => {
              const busy = actionLoadingId === pkg.id
              const desc = pkg.description || pkg.skill?.frontmatter?.description || 'Imported SKILL.md'
              return (
                <div key={pkg.id} className="ext-list-item skill-package-item">
                  <div className="skill-package-main">
                    <label className="toggle-item compact">
                      <input
                        type="checkbox"
                        checked={!!pkg.enabled}
                        onChange={e => handleTogglePackage(pkg, e.target.checked)}
                        disabled={busy}
                      />
                      <span className="ext-item-name">{pkg.name}</span>
                    </label>
                    <span className="skill-package-desc">{desc}</span>
                    <div className="skill-package-meta">
                      <span className="ext-item-badge">ref {pkg.resources?.references?.length || 0}</span>
                      <span className="ext-item-badge">ex {pkg.resources?.examples?.length || 0}</span>
                      <span className="ext-item-badge">scripts {pkg.resources?.scripts?.length || 0}</span>
                    </div>
                    {(pkg.resources?.scripts || []).length > 0 && (
                      <details className="skill-resource-details">
                        <summary>查看 scripts 清单（只读，不执行）</summary>
                        <ul>
                          {(pkg.resources?.scripts || []).slice(0, 12).map(path => (
                            <li key={path}>{path}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  <div className="ext-item-actions">
                    <button className="icon-btn-sm" title="刷新" onClick={() => handleRefreshPackage(pkg)} disabled={busy}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                      </svg>
                    </button>
                    <button className="icon-btn-sm danger" title="删除" onClick={() => handleRemovePackage(pkg)} disabled={busy}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="settings-hint">尚未导入 Skill Package。</p>
        )}
      </section>

      {!editing ? (
        <section className="settings-section-card">
          <button className="legacy-skill-toggle" onClick={() => setLegacyOpen(v => !v)}>
            <span>旧版可执行技能（兼容）</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
              className={legacyOpen ? 'expanded' : ''}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {legacyOpen && (
            <>
              <p className="settings-hint">该区域为历史功能（HTTP / JavaScript 执行型工具），建议优先使用上方 Skill Package。</p>

              {skills.length > 0 && (
                <div className="ext-list">
                  {skills.map(skill => (
                    <div key={skill.id} className="ext-list-item">
                      <label className="toggle-item compact">
                        <input type="checkbox" checked={!!skill.enabled} onChange={() => toggleSkill(skill.id)} />
                        <span className="ext-item-name">{skill.name}</span>
                      </label>
                      <span className="ext-item-badge">{skill.type}</span>
                      <div className="ext-item-actions">
                        <button className="icon-btn-sm" title="编辑" onClick={() => startEdit(skill)}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="icon-btn-sm danger" title="删除" onClick={() => removeSkill(skill.id)}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn-add" onClick={startAdd}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                添加旧版技能
              </button>
            </>
          )}
        </section>
      ) : (
        <section className="settings-section-card">
          <div className="settings-section-title">{skills.find(s => s.id === editing.id) ? '编辑旧版技能' : '添加旧版技能'}</div>

          <div className="form-group">
            <label>技能名称（英文，用作工具名）</label>
            <input
              type="text"
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="my_tool"
            />
          </div>

          <div className="form-group">
            <label>描述</label>
            <input
              type="text"
              value={editing.description}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="这个技能做什么..."
            />
          </div>

          <div className="form-group">
            <label>类型</label>
            <select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
              <option value="http">HTTP 请求</option>
              <option value="javascript">JavaScript（页面执行）</option>
            </select>
          </div>

          <div className="form-group">
            <label>参数 Schema（JSON）</label>
            <textarea
              rows="4"
              value={paramsText}
              onChange={e => setParamsText(e.target.value)}
              placeholder='{"type":"object","properties":{"query":{"type":"string"}}}'
              className="mono-textarea"
            />
          </div>

          {editing.type === 'http' && (
            <>
              <div className="form-row">
                <div className="form-group form-group-third">
                  <label>Method</label>
                  <select
                    value={editing.config.method || 'GET'}
                    onChange={e => setEditing({ ...editing, config: { ...editing.config, method: e.target.value } })}
                  >
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                    <option>PATCH</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>URL（支持 {'{{param}}'} 模板）</label>
                  <input
                    type="text"
                    value={editing.config.url || ''}
                    onChange={e => setEditing({ ...editing, config: { ...editing.config, url: e.target.value } })}
                    placeholder="https://api.example.com/{{query}}"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Headers（JSON）</label>
                <textarea
                  rows="3"
                  value={headersText}
                  onChange={e => setHeadersText(e.target.value)}
                  placeholder='{"Authorization":"Bearer xxx"}'
                  className="mono-textarea"
                />
              </div>

              <div className="form-group">
                <label>Body 模板（支持 {'{{param}}'} 替换）</label>
                <textarea
                  rows="3"
                  value={editing.config.bodyTemplate || ''}
                  onChange={e => setEditing({ ...editing, config: { ...editing.config, bodyTemplate: e.target.value } })}
                  placeholder='{"query":"{{query}}"}'
                  className="mono-textarea"
                />
              </div>
            </>
          )}

          {editing.type === 'javascript' && (
            <div className="form-group">
              <label>JavaScript 代码（可通过 __args 访问参数）</label>
              <textarea
                rows="6"
                value={editing.config.code || ''}
                onChange={e => setEditing({ ...editing, config: { ...editing.config, code: e.target.value } })}
                placeholder="return document.title + ' - ' + __args.query"
                className="mono-textarea"
              />
            </div>
          )}

          <div className="ext-edit-actions">
            <button className="btn-primary btn-sm" onClick={saveEditing}>保存旧版技能</button>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>取消</button>
          </div>
        </section>
      )}
    </>
  )
}
