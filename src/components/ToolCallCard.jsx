import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const TOOL_LABELS = {
  navigate: '导航',
  get_page_info: '获取页面信息',
  get_elements: '查询元素',
  get_page_content: '获取内容',
  click: '点击',
  type_text: '输入文本',
  select_option: '选择选项',
  scroll: '滚动',
  evaluate_js: '执行脚本',
  wait: '等待',
  highlight: '高亮',
  take_screenshot: '截图',
}

function formatJSON(obj) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function truncate(str, max = 40) {
  if (!str || str.length <= max) return str
  return str.slice(0, max) + '...'
}

function StatusBadge({ status, duration }) {
  if (status === 'running') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        执行中
      </Badge>
    )
  }

  if (status === 'success') {
    return (
      <Badge variant="outline" className="border-emerald-200 text-emerald-700">
        完成{duration != null ? ` · ${duration}ms` : ''}
      </Badge>
    )
  }

  if (status === 'error') {
    return (
      <Badge variant="destructive">
        失败{duration != null ? ` · ${duration}ms` : ''}
      </Badge>
    )
  }

  return null
}

export default function ToolCallCard({ name, args, status, result, duration, index }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[name] || name

  const summaryParts = Object.entries(args || {})
    .slice(0, 2)
    .map(([, v]) => truncate(typeof v === 'string' ? v : JSON.stringify(v)))
  const summary = summaryParts.join(', ')

  const displayResult = result
    ? result.screenshot
      ? { ...result, screenshot: '[base64 图片数据已省略]' }
      : result
    : null

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="ml-2 gap-0 overflow-hidden py-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 bg-muted/50 px-3 py-2 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
              <span className="text-sm font-semibold">{label}</span>
              {summary && (
                <span className="truncate text-xs text-muted-foreground">{summary}</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">#{index}</span>
              <StatusBadge status={status} duration={duration} />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div className="space-y-3 p-3">
            <section className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                参数
              </div>
              <pre className="max-h-52 overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">
                {formatJSON(args)}
              </pre>
            </section>

            {displayResult && (
              <>
                <Separator />
                <section className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    返回结果{duration != null ? `（${duration}ms）` : ''}
                  </div>
                  <pre className="max-h-52 overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">
                    {formatJSON(displayResult)}
                  </pre>
                </section>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
