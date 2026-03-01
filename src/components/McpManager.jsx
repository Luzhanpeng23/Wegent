import { useState, useCallback } from 'react'
import {
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

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
  const [showKey, setShowKey] = useState(false)

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

  const getStatusMeta = (st) => {
    if (!st) return { type: 'neutral', label: '未检测' }
    if (st.error) return { type: 'error', label: '连接失败' }
    if (st.count > 0) return { type: 'success', label: `${st.count} 工具` }
    return { type: 'warn', label: '无工具' }
  }

  if (!editing) {
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">MCP 远程服务</CardTitle>
          <CardDescription>连接 MCP (Model Context Protocol) 服务器，获取远程工具能力。</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-4">
          {refreshError && <p className="text-xs text-destructive">{refreshError}</p>}

          {servers.length > 0 && (
            <div className="space-y-2">
              {servers.map(server => {
                const st = mcpStatus[server.id]
                const statusMeta = getStatusMeta(st)
                const isExpanded = expandedServer === server.id
                const hasTools = st?.tools?.length > 0

                return (
                  <div key={server.id} className="overflow-hidden rounded-md border bg-card">
                    <div className="flex items-start gap-2 p-3">
                      <Switch checked={!!server.enabled} onCheckedChange={() => toggleServer(server.id)} />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{server.name || server.url}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{server.url}</div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {statusMeta.type === 'success' && <Badge variant="outline" className="border-emerald-200 text-emerald-700">{statusMeta.label}</Badge>}
                          {statusMeta.type === 'error' && <Badge variant="destructive">{statusMeta.label}</Badge>}
                          {statusMeta.type === 'warn' && <Badge variant="secondary">{statusMeta.label}</Badge>}
                          {statusMeta.type === 'neutral' && <Badge variant="secondary">{statusMeta.label}</Badge>}

                          {st && !st.error && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => hasTools && toggleExpand(server.id)}
                              disabled={!hasTools}
                              title={hasTools ? '查看工具列表' : '无工具'}
                            >
                              {st.count} 工具
                              {hasTools && (
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" title="编辑" onClick={() => startEdit(server)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" title="删除" onClick={() => removeServer(server.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {st?.error && (
                      <div className="flex items-start gap-1.5 border-t bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{st.error}</span>
                      </div>
                    )}

                    {isExpanded && hasTools && (
                      <div className="border-t bg-muted/30 p-2">
                        <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                          <Wrench className="h-3.5 w-3.5" />
                          已注册 {st.tools.length} 个工具
                        </div>

                        <div className="space-y-1.5">
                          {st.tools.map((tool, i) => (
                            <div key={i} className="rounded border bg-background px-2 py-1.5">
                              <div className="font-mono text-xs font-semibold">{tool.name}</div>
                              {tool.description && (
                                <div className="mt-0.5 text-[11px] text-muted-foreground">{tool.description}</div>
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

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={startAdd}>
              <Plus className="h-4 w-4" />
              添加服务器
            </Button>

            {servers.length > 0 && (
              <Button type="button" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '连接中...' : '测试连接'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{servers.find(s => s.id === editing.id) ? '编辑 MCP 服务器' : '添加 MCP 服务器'}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        <div className="space-y-1.5">
          <Label>名称</Label>
          <Input
            type="text"
            value={editing.name}
            onChange={e => setEditing({ ...editing, name: e.target.value })}
            placeholder="My MCP Server"
          />
        </div>

        <div className="space-y-1.5">
          <Label>服务器 URL</Label>
          <Input
            type="text"
            value={editing.url}
            onChange={e => setEditing({ ...editing, url: e.target.value })}
            placeholder="https://mcp-server.example.com/mcp"
          />
        </div>

        <div className="space-y-1.5">
          <Label>API Key（可选）</Label>
          <div className="flex items-center gap-2">
            <Input
              type={showKey ? 'text' : 'password'}
              value={editing.apiKey}
              onChange={e => setEditing({ ...editing, apiKey: e.target.value })}
              placeholder="Bearer token..."
            />
            <Button type="button" variant="outline" size="icon-sm" title={showKey ? '隐藏' : '显示'} onClick={() => setShowKey(v => !v)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={saveEditing}>保存</Button>
          <Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button>
        </div>
      </CardContent>
    </Card>
  )
}
