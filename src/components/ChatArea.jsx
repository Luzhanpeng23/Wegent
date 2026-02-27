import ToolCallCard from './ToolCallCard'
import { formatMarkdown } from '../utils/markdown'

const SUGGESTIONS = [
  { text: '帮我看看这个页面有什么内容', label: '查看页面内容', icon: 'doc' },
  { text: '找到页面上所有的链接', label: '查找所有链接', icon: 'link' },
  { text: '滚动到页面底部', label: '滚动到底部', icon: 'down' },
  { text: '截取当前页面截图', label: '截取截图', icon: 'camera' },
]

function SuggestionIcon({ name }) {
  if (name === 'doc') {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    )
  }
  if (name === 'link') {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 007.54.54l2.92-2.92a5 5 0 00-7.07-7.07L11 6" />
        <path d="M14 11a5 5 0 00-7.54-.54l-2.92 2.92a5 5 0 007.07 7.07L13 18" />
      </svg>
    )
  }
  if (name === 'down') {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14" />
        <path d="M19 12l-7 7-7-7" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

export default function ChatArea({ messages, chatEndRef, onQuickSend }) {
  const isEmpty = messages.length === 0

  return (
    <main className="chat-container">
      <div className="chat-stream">
        {isEmpty && <WelcomeMessage onQuickSend={onQuickSend} />}

        {messages.map(msg => {
          switch (msg.type) {
            case 'user':
              return <UserMessage key={msg.id} text={msg.content} attachments={msg.attachments} />
            case 'assistant':
              return <AssistantMessage key={msg.id} text={msg.content} />
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
    </main>
  )
}

function WelcomeMessage({ onQuickSend }) {
  return (
    <section className="welcome-message">
      <div className="welcome-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      </div>

      <div className="welcome-copy">
        <h2>开始一次结构化网页操作</h2>
        <p>直接输入目标，或从下面的快捷动作开始。</p>
      </div>

      <div className="suggestion-chips">
        {SUGGESTIONS.map(s => (
          <button key={s.text} className="chip" onClick={() => onQuickSend(s.text)}>
            <SuggestionIcon name={s.icon} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function UserMessage({ text, attachments = [] }) {
  return (
    <div className="message message-user">
      <div className="bubble bubble-user">
        {text ? <div>{text}</div> : null}
        {attachments.length > 0 ? (
          <div className="message-attachments">
            {attachments.map(item => (
              <button
                key={item.id}
                type="button"
                className="message-attachment"
                onClick={() => window.open(item.dataUrl, '_blank')}
                title="查看图片"
              >
                <img src={item.dataUrl} alt="用户上传图片" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AssistantMessage({ text }) {
  return (
    <div className="message message-assistant">
      <div className="bubble" dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }} />
    </div>
  )
}

function ErrorMessage({ text }) {
  return (
    <div className="message message-error">
      <div className="bubble bubble-error">{text}</div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="thinking">
      <div className="thinking-dots">
        <span /><span /><span />
      </div>
      <span className="thinking-text">思考中...</span>
    </div>
  )
}

function Screenshot({ data }) {
  return (
    <div className="screenshot-wrapper">
      <img
        src={data}
        className="screenshot-img"
        alt="页面截图"
        onClick={() => window.open(data, '_blank')}
      />
    </div>
  )
}
