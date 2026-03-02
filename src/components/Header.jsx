import { ArrowLeft, Bot, Clock3, Settings, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function ActionButton({ label, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export default function Header({
  view,
  onClear,
  onOpenSchedule,
  onOpenSettings,
  onBackToChat,
}) {
  const inSettings = view === 'settings'
  const inSchedule = view === 'schedule'
  const inSubView = inSettings || inSchedule

  return (
    <header className="flex min-h-14 items-center justify-between border-b bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {inSettings ? '设置中心' : inSchedule ? '定时任务' : 'Wegent'}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {inSettings ? '管理连接与模型参数' : inSchedule ? '自动发送任务消息' : '网页结构化操作面板'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {inSubView ? (
          <ActionButton label="返回对话" onClick={onBackToChat}>
            <ArrowLeft className="h-4 w-4" />
          </ActionButton>
        ) : (
          <>
            <ActionButton label="清空对话" onClick={onClear}>
              <Trash2 className="h-4 w-4" />
            </ActionButton>
            <ActionButton label="定时任务" onClick={onOpenSchedule}>
              <Clock3 className="h-4 w-4" />
            </ActionButton>
            <ActionButton label="设置" onClick={onOpenSettings}>
              <Settings className="h-4 w-4" />
            </ActionButton>
          </>
        )}
      </div>
    </header>
  )
}
