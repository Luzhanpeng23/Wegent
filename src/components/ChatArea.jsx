import { Camera, FileSearch, Link2, ScrollText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import ToolCallCard from './ToolCallCard'
import { formatMarkdown } from '../utils/markdown'

const SUGGESTIONS = [
  { text: '帮我看看这个页面有什么内容', label: '查看页面内容', icon: 'doc' },
  { text: '找到页面上所有的链接', label: '查找所有链接', icon: 'link' },
  { text: '滚动到页面底部', label: '滚动到底部', icon: 'down' },
  { text: '截取当前页面截图', label: '截取截图', icon: 'camera' },
]

function SuggestionIcon({ name }) {
  if (name === 'doc') return <FileSearch className="h-3.5 w-3.5" />
  if (name === 'link') return <Link2 className="h-3.5 w-3.5" />
  if (name === 'down') return <ScrollText className="h-3.5 w-3.5" />
  return <Camera className="h-3.5 w-3.5" />
}

function WelcomeMessage({ onQuickSend }) {
  return (
    <Card className="ml-2 gap-3 py-4">
      <div className="px-4">
        <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border bg-muted text-primary">
          <ScrollText className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold">开始一次结构化网页操作</h2>
        <p className="mt-1 text-xs text-muted-foreground">直接输入目标，或从下面的快捷动作开始。</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s.text}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => onQuickSend(s.text)}
            >
              <SuggestionIcon name={s.icon} />
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  )
}

function UserMessage({ text, attachments = [] }) {
  return (
    <div className="flex justify-end">
      <Card className="max-w-[88%] gap-2 border-primary/15 bg-primary py-2 text-primary-foreground">
        <div className="px-3 text-sm leading-relaxed">{text || ''}</div>
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 pb-1">
            {attachments.map((item) => (
              <button
                key={item.id}
                type="button"
                className="h-12 w-12 overflow-hidden rounded border border-white/30 bg-white/10"
                onClick={() => window.open(item.dataUrl, '_blank')}
                title="查看图片"
              >
                <img src={item.dataUrl} alt="用户上传图片" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  )
}

function AssistantMessage({ text, streaming }) {
  return (
    <div className="flex justify-start">
      <Card className="ml-2 max-w-[88%] gap-0 py-0">
        <div
          className={`markdown-body px-3 py-2 text-sm leading-relaxed ${streaming ? 'streaming' : ''}`}
          dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }}
        />
      </Card>
    </div>
  )
}

function ErrorMessage({ text }) {
  return (
    <div className="flex justify-start">
      <Card className="ml-2 max-w-[88%] gap-0 border-destructive/30 bg-destructive/10 py-0 text-destructive">
        <div className="px-3 py-2 text-sm">{text}</div>
      </Card>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <Card className="ml-2 inline-flex flex-row items-center gap-2 py-2 pl-3 pr-3">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        </div>
        <span className="text-xs text-muted-foreground">思考中...</span>
      </Card>
    </div>
  )
}

function Screenshot({ data }) {
  return (
    <div className="flex justify-start">
      <Card className="ml-2 max-w-[88%] overflow-hidden py-0">
        <button type="button" className="block" onClick={() => window.open(data, '_blank')}>
          <img src={data} alt="页面截图" className="block w-full" />
        </button>
      </Card>
    </div>
  )
}

export default function ChatArea({ messages, chatEndRef, onQuickSend }) {
  const isEmpty = messages.length === 0

  return (
    <main className="min-h-0 flex-1 bg-background">
      <ScrollArea className="h-full">
        <div className="space-y-3 px-3 py-3">
          <div className="px-2">
            <Badge variant="secondary">会话</Badge>
          </div>

          {isEmpty && <WelcomeMessage onQuickSend={onQuickSend} />}

          {messages.map((msg) => {
            switch (msg.type) {
              case 'user':
                return <UserMessage key={msg.id} text={msg.content} attachments={msg.attachments} />
              case 'assistant':
                return <AssistantMessage key={msg.id} text={msg.content} streaming={msg.streaming} />
              case 'error':
                return <ErrorMessage key={msg.id} text={msg.content} />
              case 'thinking':
                return <ThinkingIndicator key={msg.id} />
              case 'tool_call':
                return (
                  <ToolCallCard
                    key={msg.id}
                    name={msg.name}
                    args={msg.args}
                    status={msg.status}
                    result={msg.result}
                    duration={msg.duration}
                    index={msg.index}
                  />
                )
              case 'screenshot':
                return <Screenshot key={msg.id} data={msg.data} />
              default:
                return null
            }
          })}

          <div ref={chatEndRef} />
        </div>
      </ScrollArea>
    </main>
  )
}
