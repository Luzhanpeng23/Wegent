import { useMemo, useState } from 'react'
import { Clock3, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

function genId() {
  return 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function toLocalDateTimeValue(isoString) {
  const t = Date.parse(isoString || '')
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  return `${y}-${m}-${day}T${h}:${min}`
}

function formatTime(isoString) {
  const t = Date.parse(isoString || '')
  if (!Number.isFinite(t)) return '-'
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

function statusMeta(status) {
  if (status === 'running') return { label: '运行中', className: 'border-amber-200 text-amber-700' }
  if (status === 'success') return { label: '成功', className: 'border-emerald-200 text-emerald-700' }
  if (status === 'failed') return { label: '失败', className: 'border-rose-200 text-rose-700' }
  if (status === 'skipped') return { label: '跳过', className: 'border-slate-200 text-slate-600' }
  if (status === 'scheduled') return { label: '已计划', className: 'border-sky-200 text-sky-700' }
  return { label: '空闲', className: 'border-slate-200 text-slate-600' }
}

function defaultDraft() {
  const now = new Date()
  const runAt = new Date(now.getTime() + 5 * 60 * 1000)
  return {
    id: genId(),
    name: '',
    enabled: true,
    prompt: '',
    triggerType: 'interval',
    runAtLocal: toLocalDateTimeValue(runAt.toISOString()),
    intervalMinutes: '5',
  }
}

function toDraft(task) {
  const trigger = task?.trigger || {}
  return {
    id: task?.id || genId(),
    name: task?.name || '',
    enabled: task?.enabled !== false,
    prompt: task?.prompt || '',
    triggerType: trigger.type === 'once' ? 'once' : 'interval',
    runAtLocal: toLocalDateTimeValue(trigger.runAt),
    intervalMinutes: String(trigger.intervalMinutes || 5),
  }
}

function buildTaskFromDraft(draft, existing) {
  const nowIso = new Date().toISOString()
  const name = draft.name.trim() || '未命名定时任务'
  const prompt = draft.prompt.trim()

  if (!prompt) {
    return { error: '请输入任务消息内容' }
  }

  const triggerType = draft.triggerType === 'once' ? 'once' : 'interval'
  let trigger

  if (triggerType === 'once') {
    if (!draft.runAtLocal) {
      return { error: '请选择执行时间' }
    }
    const runAt = new Date(draft.runAtLocal)
    if (!Number.isFinite(runAt.getTime())) {
      return { error: '执行时间格式无效' }
    }
    if (runAt.getTime() <= Date.now()) {
      return { error: '执行时间必须晚于当前时间' }
    }
    trigger = { type: 'once', runAt: runAt.toISOString() }
  } else {
    const intervalMinutes = Math.max(1, Math.floor(Number(draft.intervalMinutes) || 1))
    trigger = { type: 'interval', intervalMinutes }
  }

  const prevState = existing?.state || {}

  return {
    value: {
      id: draft.id,
      name,
      enabled: draft.enabled !== false,
      prompt,
      trigger,
      state: {
        status: prevState.status || 'idle',
        nextRunAt: prevState.nextRunAt,
        lastRunAt: prevState.lastRunAt,
        lastError: prevState.lastError || '',
        totalRuns: Number(prevState.totalRuns) || 0,
        totalFailures: Number(prevState.totalFailures) || 0,
      },
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    },
  }
}

export default function ScheduleManager({ tasks = [], onChange }) {
  const [editing, setEditing] = useState(null)
  const [errorText, setErrorText] = useState('')

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aTime = Date.parse(a?.updatedAt || '') || 0
      const bTime = Date.parse(b?.updatedAt || '') || 0
      return bTime - aTime
    })
  }, [tasks])

  const emitChange = (nextTasks) => {
    if (typeof onChange !== 'function') return
    onChange(Array.isArray(nextTasks) ? nextTasks : tasks)
  }

  const startAdd = () => {
    setErrorText('')
    setEditing(defaultDraft())
  }

  const startEdit = (task) => {
    setErrorText('')
    setEditing(toDraft(task))
  }

  const toggleTask = (id, enabled) => {
    const next = tasks.map(task => task.id === id ? {
      ...task,
      enabled,
      updatedAt: new Date().toISOString(),
    } : task)
    emitChange(next)
  }

  const removeTask = (id) => {
    const next = tasks.filter(task => task.id !== id)
    emitChange(next)
    if (editing?.id === id) {
      setEditing(null)
      setErrorText('')
    }
  }

  const saveEditing = () => {
    if (!editing) return
    const existing = tasks.find(task => task.id === editing.id)
    const built = buildTaskFromDraft(editing, existing)
    if (built.error) {
      setErrorText(built.error)
      return
    }

    const nextTask = built.value
    const idx = tasks.findIndex(task => task.id === nextTask.id)
    const nextTasks = [...tasks]
    if (idx >= 0) nextTasks[idx] = nextTask
    else nextTasks.push(nextTask)

    emitChange(nextTasks)
    setEditing(null)
    setErrorText('')
  }

  if (editing) {
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">{tasks.find(t => t.id === editing.id) ? '编辑定时任务' : '新增定时任务'}</CardTitle>
          <CardDescription>任务触发后会像用户一样自动发送消息给 Agent。</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-4">
          {errorText && <p className="text-xs text-destructive">{errorText}</p>}

          <div className="space-y-1.5">
            <Label>任务名称</Label>
            <Input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：每日巡检"
            />
          </div>

          <div className="space-y-1.5">
            <Label>任务消息</Label>
            <Textarea
              rows={4}
              value={editing.prompt}
              onChange={(e) => setEditing(prev => ({ ...prev, prompt: e.target.value }))}
              placeholder="例如：检查当前页面是否有未处理告警，并给出简要结论"
            />
          </div>

          <div className="space-y-1.5">
            <Label>触发方式</Label>
            <Select
              value={editing.triggerType}
              onValueChange={(value) => setEditing(prev => ({ ...prev, triggerType: value === 'once' ? 'once' : 'interval' }))}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="请选择触发方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">每 N 分钟</SelectItem>
                <SelectItem value="once">一次性</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {editing.triggerType === 'once' ? (
            <div className="space-y-1.5">
              <Label>执行时间</Label>
              <Input
                type="datetime-local"
                value={editing.runAtLocal}
                onChange={(e) => setEditing(prev => ({ ...prev, runAtLocal: e.target.value }))}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>间隔（分钟）</Label>
              <Input
                type="number"
                min="1"
                max="1440"
                value={editing.intervalMinutes}
                onChange={(e) => setEditing(prev => ({ ...prev, intervalMinutes: e.target.value }))}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              checked={!!editing.enabled}
              onCheckedChange={(checked) => setEditing(prev => ({ ...prev, enabled: checked }))}
            />
            <span className="text-xs text-muted-foreground">启用该任务</span>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={saveEditing}>保存</Button>
            <Button type="button" variant="outline" onClick={() => { setEditing(null); setErrorText('') }}>取消</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">定时任务</CardTitle>
        <CardDescription>按计划自动发送消息给 Agent，执行通用任务。</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        {sortedTasks.length > 0 ? (
          <div className="space-y-2">
            {sortedTasks.map(task => {
              const meta = statusMeta(task?.state?.status)
              const trigger = task?.trigger?.type === 'once'
                ? `一次性 · ${formatTime(task?.trigger?.runAt)}`
                : `每 ${task?.trigger?.intervalMinutes || 1} 分钟`

              return (
                <div key={task.id} className="rounded-md border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <Switch
                      checked={!!task.enabled}
                      onCheckedChange={(checked) => toggleTask(task.id, checked)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{task.name || '未命名定时任务'}</span>
                        <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">{trigger}</div>

                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        下次执行：{formatTime(task?.state?.nextRunAt)}
                      </div>

                      {task?.state?.lastRunAt && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          上次执行：{formatTime(task.state.lastRunAt)}
                        </div>
                      )}

                      {task?.state?.lastError && (
                        <div className="mt-1 text-xs text-destructive">{task.state.lastError}</div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" title="编辑" onClick={() => startEdit(task)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" title="删除" onClick={() => removeTask(task.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂无定时任务。</p>
        )}

        <Button type="button" variant="outline" onClick={startAdd}>
          <Plus className="h-4 w-4" />
          添加任务
        </Button>
      </CardContent>
    </Card>
  )
}
