import { useState } from 'react'

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

export default function SkillsManager({ skills = [], onChange }) {
  const [editing, setEditing] = useState(null) // 正在编辑的 skill 副本
  const [paramsText, setParamsText] = useState('') // parameters JSON 编辑文本
  const [headersText, setHeadersText] = useState('') // headers JSON 编辑文本

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
    onChange(updated)
    setEditing(null)
  }

  const removeSkill = (id) => {
    onChange(skills.filter(s => s.id !== id))
  }

  const toggleSkill = (id) => {
    onChange(skills.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  // 列表视图
  if (!editing) {
    return (
      <section className="settings-section-card">
        <div className="settings-section-title">自定义技能 (Skills)</div>
        <p className="settings-hint">技能会作为额外工具注册给模型调用。支持 HTTP 请求和页面 JavaScript 两种类型。</p>

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
          添加技能
        </button>
      </section>
    )
  }

  // 编辑视图
  return (
    <section className="settings-section-card">
      <div className="settings-section-title">
        {skills.find(s => s.id === editing.id) ? '编辑技能' : '添加技能'}
      </div>

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
        <button className="btn-primary btn-sm" onClick={saveEditing}>保存技能</button>
        <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>取消</button>
      </div>
    </section>
  )
}
