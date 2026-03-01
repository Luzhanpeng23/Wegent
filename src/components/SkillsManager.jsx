import { useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

function upsertPackage(packages, nextPackage) {
  const list = Array.isArray(packages) ? [...packages] : []
  const idx = list.findIndex(item => item.id === nextPackage.id)
  if (idx >= 0) list[idx] = nextPackage
  else list.push(nextPackage)
  return list
}

export default function SkillsManager({
  skillPackages = [],
  skillApi,
  onChange,
}) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [lastRefreshDiff, setLastRefreshDiff] = useState(null)

  const emitChange = (nextSkillPackages) => {
    if (typeof onChange !== 'function') return
    onChange(Array.isArray(nextSkillPackages) ? nextSkillPackages : skillPackages)
  }

  const syncPackagesFromBackend = async () => {
    if (!skillApi?.list) return
    const resp = await skillApi.list()
    if (resp?.ok && Array.isArray(resp.packages)) {
      emitChange(resp.packages)
    }
  }

  useEffect(() => {
    syncPackagesFromBackend().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

      emitChange(nextPackages)
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
      emitChange(nextPackages)

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

      emitChange(nextPackages)
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
      emitChange(nextPackages)
      setActionSuccess(`已删除：${pkg.name}`)

      await syncPackagesFromBackend()
    } catch (e) {
      setActionError(e?.message || '删除失败')
    } finally {
      setActionLoadingId('')
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Skill Packages（Claude Code 风格）</CardTitle>
        <CardDescription>
          支持从 skills.sh 页面、GitHub 仓库或 SKILL.md 直链导入。scripts 仅展示，不会在扩展中执行。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://skills.sh/... 或 https://github.com/..."
          />
          <Button type="button" variant="outline" onClick={handlePreviewImport} disabled={previewing || committing}>
            {previewing ? '解析中...' : '预览'}
          </Button>
          <Button type="button" onClick={handleCommitImport} disabled={!preview || previewing || committing}>
            {committing ? '导入中...' : '导入'}
          </Button>
        </div>

        {actionError && <p className="text-xs text-destructive">{actionError}</p>}
        {actionSuccess && <p className="text-xs text-emerald-700">{actionSuccess}</p>}

        {lastRefreshDiff && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center justify-between">
              <strong className="text-foreground">刷新差异：{lastRefreshDiff.packageName || 'Skill Package'}</strong>
              <Badge variant="outline">Diff</Badge>
            </div>
            <p>
              SKILL.md：{lastRefreshDiff.skill?.changed ? '已变化' : '无变化'}
              {typeof lastRefreshDiff.skill?.bytesDelta === 'number' && `（Δ ${lastRefreshDiff.skill.bytesDelta} bytes）`}
            </p>
            <p>
              references +{lastRefreshDiff.resources?.references?.addedCount || 0} / -{lastRefreshDiff.resources?.references?.removedCount || 0} ·
              examples +{lastRefreshDiff.resources?.examples?.addedCount || 0} / -{lastRefreshDiff.resources?.examples?.removedCount || 0} ·
              scripts +{lastRefreshDiff.resources?.scripts?.addedCount || 0} / -{lastRefreshDiff.resources?.scripts?.removedCount || 0}
            </p>
          </div>
        )}

        {preview && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <strong>{preview.name || 'Unnamed Skill'}</strong>
              <Badge variant="outline">预览</Badge>
            </div>
            <p className="text-muted-foreground">{preview.description || '无描述'}</p>
            <p className="mt-1 text-muted-foreground">来源：{preview.sourceUrl}</p>
            <p className="mt-1 text-muted-foreground">
              references: {preview.resources?.references?.length || 0} · examples: {preview.resources?.examples?.length || 0} · scripts: {preview.resources?.scripts?.length || 0}
            </p>
            {(preview.warnings || []).length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-destructive">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {skillPackages.length > 0 ? (
          <div className="space-y-2">
            {skillPackages.map(pkg => {
              const busy = actionLoadingId === pkg.id
              const desc = pkg.description || pkg.skill?.frontmatter?.description || 'Imported SKILL.md'
              return (
                <div key={pkg.id} className="rounded-md border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!pkg.enabled}
                          onCheckedChange={(checked) => handleTogglePackage(pkg, checked)}
                          disabled={busy}
                        />
                        <span className="truncate text-sm font-semibold">{pkg.name}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{desc}</p>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">ref {pkg.resources?.references?.length || 0}</Badge>
                        <Badge variant="secondary">ex {pkg.resources?.examples?.length || 0}</Badge>
                        <Badge variant="secondary">scripts {pkg.resources?.scripts?.length || 0}</Badge>
                      </div>

                      {(pkg.resources?.scripts || []).length > 0 && (
                        <details className="mt-2 rounded border bg-muted/30 p-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">查看 scripts 清单（只读，不执行）</summary>
                          <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-auto pl-4 text-xs text-muted-foreground">
                            {(pkg.resources?.scripts || []).slice(0, 12).map(path => (
                              <li key={path}>{path}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" title="刷新" onClick={() => handleRefreshPackage(pkg)} disabled={busy}>
                        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" title="删除" onClick={() => handleRemovePackage(pkg)} disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">尚未导入 Skill Package。</p>
        )}
      </CardContent>
    </Card>
  )
}
