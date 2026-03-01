import { useState, useCallback } from 'react'

const isChromeExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id

function genId() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export default function McpManager({ servers = [], onChange }) {
  const [editing, setEditing] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [mcpStatus, setMcpStatus] = useState({}) // serverId -> { count, error, tools[] }
  const [expandedServer, setExpandedServer] = useState(null) // 展开查看工具的 serverId

  const startEdit = (server) => {
    setEditing({ ...server })
  }

  const startAdd = () => {
    setEditing({
      id: genId(),
      name: '',
      url: '',
      apiKey: '',
      enabled: true,
    })
  }

  const saveEditing = () => {
    if (!editing || !editing.url.trim()) return
    let name = editing.name.trim()
    if (!name) {
      try { name = new URL(editing.url).hostname } catch { name = editing.url }
    }
    const saved = { ...editing, name }
    const idx = servers.findIndex(s => s.id === saved.id)
    const updated = [...servers]
    if (idx >= 0) updated[idx] = saved
    else updated.push(saved)
    onChange(updated)
    setEditing(null)
  }

  const removeServer = (id) => {
    onChange(servers.filter(s => s.id !== id))
    setMcpStatus(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (expandedServer === id) setExpandedServer(null)
  }

  const toggleServer = (id) => {
    onChange(servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const handleRefresh = useCallback(async () => {
    if (!isChromeExtension) return
    setRefreshError('')
    setRefreshing(true)
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'REFRESH_MCP', servers })
      if (resp?.results) {
        setMcpStatus(resp.results)
      }
      if (!resp?.ok) {
        const firstServerError = Object.values(resp?.results || {}).find(v => v?.error)?.error
        setRefreshError(firstServerError || resp?.error || 'MCP 刷新失败，请检查服务地址和鉴权配置')
      }
    } catch (e) {
      console.error('[MCP] refresh failed:', e)
      setRefreshError(e?.message || 'MCP 刷新失败')
    } finally {
      setRefreshing(false)
    }
  }, [servers])

  const toggleExpand = (id) => {
    setExpandedServer(prev => prev === id ? null : id)
  }

  const [showKey, setShowKey] = useState(false)

  // 获取状态指示样式
  const getStatusDot = (st) => {
    if (!st) return null // 未刷新过
    if (st.error) return 'error'
    if (st.count > 0) return 'success'
    return 'warn'
  }

  if (!editing) {
    return (
      <section className="settings-section-card">
        <div className="settings-section-title">MCP 远程服务</div>
        <p className="settings-hint">连接 MCP (Model Context Protocol) 服务器，获取远程工具能力。支持 Streamable HTTP 传输。</p>
        {refreshError && <p className="settings-hint" style={{ color: '#dc2626' }}>{refreshError}</p>}

        {servers.length > 0 && (
          <div className="mcp-server-list">
            {servers.map(server => {
              const st = mcpStatus[server.id]
              const statusType = getStatusDot(st)
              const isExpanded = expandedServer === server.id
              const hasTools = st?.tools?.length > 0

              return (
                <div key={server.id} className={`mcp-server-card${statusType ? ` status-${statusType}` : ''}`}>
                  {/* 服务器头部行 */}
                  <div className="mcp-server-header">
                    <label className="toggle-item compact">
                      <input type="checkbox" checked={!!server.enabled} onChange={() => toggleServer(server.id)} />
                      <div className="mcp-server-info">
                        <span className="ext-item-name">{server.name || server.url}</span>
                        <span className="mcp-server-url">{server.url}</span>
                      </div>
                    </label>
                    <div className="mcp-server-meta">
                      {statusType && (
                        <span className={`mcp-status-dot ${statusType}`} title={
                          st?.error ? `错误: ${st.error}` :
                          st?.count > 0 ? `已加载 ${st.count} 个工具` : '未获取到工具'
                        } />
                      )}
                      {st && !st.error && (
                        <button
                          className={`mcp-tool-count${hasTools ? ' clickable' : ''}`}
                          onClick={() => hasTools && toggleExpand(server.id)}
                          title={hasTools ? '点击查看工具列表' : '无工具'}
                        >
                          {st.count} 工具
                          {hasTools && (
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
                              className={`mcp-chevron${isExpanded ? ' expanded' : ''}`}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          )}
                        </button>
                      )}
                      {st?.error && (
                        <span className="ext-item-badge error" title={st.error}>连接失败</span>
                      )}
                      <div className="ext-item-actions">
                        <button className="icon-btn-sm" title="编辑" onClick={() => startEdit(server)}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="icon-btn-sm danger" title="删除" onClick={() => removeServer(server.id)}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 错误详情 */}
                  {st?.error && (
                    <div className="mcp-error-detail">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {st.error}
                    </div>
                  )}

                  {/* 工具列表展开区域 */}
                  {isExpanded && hasTools && (
                    <div className="mcp-tools-panel">
                      <div className="mcp-tools-header">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                        </svg>
                        已注册 {st.tools.length} 个工具
                      </div>
                      <div className="mcp-tools-grid">
                        {st.tools.map((tool, i) => (
                          <div key={i} className="mcp-tool-item">
                            <span className="mcp-tool-name">{tool.name}</span>
                            {tool.description && (
                              <span className="mcp-tool-desc">{tool.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="ext-bottom-actions">
          <button className="btn-add" onClick={startAdd}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加服务器
          </button>
          {servers.length > 0 && (
            <button className="btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
                className={refreshing ? 'spin' : ''}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
              {refreshing ? '连接中...' : '测试连接'}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="settings-section-card">
      <div className="settings-section-title">
        {servers.find(s => s.id === editing.id) ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
      </div>

      <div className="form-group">
        <label>名称</label>
        <input
          type="text"
          value={editing.name}
          onChange={e => setEditing({ ...editing, name: e.target.value })}
          placeholder="My MCP Server"
        />
      </div>

      <div className="form-group">
        <label>服务器 URL</label>
        <input
          type="text"
          value={editing.url}
          onChange={e => setEditing({ ...editing, url: e.target.value })}
          placeholder="https://mcp-server.example.com/mcp"
        />
      </div>

      <div className="form-group">
        <label>API Key（可选）</label>
        <div className="input-with-action">
          <input
            type={showKey ? 'text' : 'password'}
            value={editing.apiKey}
            onChange={e => setEditing({ ...editing, apiKey: e.target.value })}
            placeholder="Bearer token..."
          />
          <button className="icon-btn-sm" title={showKey ? '隐藏' : '显示'} onClick={() => setShowKey(v => !v)}>
            {showKey ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="ext-edit-actions">
        <button className="btn-primary btn-sm" onClick={saveEditing}>保存</button>
        <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>取消</button>
      </div>
    </section>
  )
}