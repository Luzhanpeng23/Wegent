import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatMarkdown } from '@/utils/markdown'

const ReasoningContext = createContext(null)

function useReasoning() {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error('useReasoning 必须在 <Reasoning> 组件内使用')
  }
  return context
}

function Reasoning({
  className,
  isStreaming = false,
  open,
  defaultOpen,
  onOpenChange,
  duration,
  children,
  ...props
}) {
  const resolvedDefaultOpen = defaultOpen ?? isStreaming
  const isControlled = typeof open === 'boolean'
  const [innerOpen, setInnerOpen] = useState(resolvedDefaultOpen)
  const [innerDuration, setInnerDuration] = useState(duration)

  const openRef = useRef(isControlled ? open : innerOpen)
  const startTimeRef = useRef(null)
  const hadStreamingRef = useRef(false)
  const autoCollapsedRef = useRef(false)

  const resolvedOpen = isControlled ? open : innerOpen

  const setOpen = (next) => {
    if (!isControlled) {
      setInnerOpen(next)
    }
    if (onOpenChange) {
      onOpenChange(next)
    }
  }

  useEffect(() => {
    openRef.current = resolvedOpen
  }, [resolvedOpen])

  useEffect(() => {
    if (typeof duration === 'number') {
      setInnerDuration(duration)
    }
  }, [duration])

  useEffect(() => {
    const explicitClose = defaultOpen === false

    if (isStreaming) {
      hadStreamingRef.current = true
      autoCollapsedRef.current = false
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now()
      }

      if (!explicitClose && !openRef.current) {
        setOpen(true)
      }
      return
    }

    if (!startTimeRef.current) return
    const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - startTimeRef.current) / 1000))
    startTimeRef.current = null

    if (typeof duration !== 'number') {
      setInnerDuration(elapsedSeconds)
    }
  }, [isStreaming, defaultOpen, duration])

  useEffect(() => {
    if (isStreaming) return
    if (!hadStreamingRef.current) return
    if (autoCollapsedRef.current) return
    if (!resolvedOpen) return

    const timer = setTimeout(() => {
      autoCollapsedRef.current = true
      setOpen(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [isStreaming, resolvedOpen])

  const contextValue = useMemo(() => ({
    isStreaming,
    duration: typeof duration === 'number' ? duration : innerDuration,
  }), [duration, innerDuration, isStreaming])

  return (
    <ReasoningContext.Provider value={contextValue}>
      <Collapsible
        open={resolvedOpen}
        onOpenChange={setOpen}
        className={cn('w-full border-b pb-1', className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  )
}

function ReasoningTrigger({ className, children, getThinkingMessage, ...props }) {
  const { isStreaming, duration } = useReasoning()

  const label = getThinkingMessage
    ? getThinkingMessage(isStreaming, duration)
    : (isStreaming || !duration ? '思考中' : `已思考 ${duration} 秒`)

  return (
    <CollapsibleTrigger
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <Brain className="size-3.5 shrink-0" />
          <span className={cn(isStreaming ? 'animate-pulse' : '')}>{label}</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </>
      )}
    </CollapsibleTrigger>
  )
}

function ReasoningContent({ className, children, ...props }) {
  return (
    <CollapsibleContent
      className={cn(
        'overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1',
        className,
      )}
      {...props}
    >
      <div
        className="markdown-body min-w-0 px-1.5 pb-2 text-xs text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: formatMarkdown(String(children || '')) }}
      />
    </CollapsibleContent>
  )
}

export { useReasoning, Reasoning, ReasoningTrigger, ReasoningContent }
