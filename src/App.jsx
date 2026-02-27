import { useState, useRef, useEffect } from 'react'
import { useChromeAgent } from './hooks/useChromeAgent'
import Header from './components/Header'
import SettingsPanel from './components/SettingsPanel'
import ChatArea from './components/ChatArea'
import InputArea from './components/InputArea'

const THEME_KEY = 'dom-agent-theme'
const DEFAULT_THEME = 'azure-auto'

// 根据存储的主题值解析出实际应用的 data-theme
function resolveTheme(stored, prefersDark) {
  const base = stored.replace('-dark', '').replace('-auto', '')
  if (stored.endsWith('-auto')) {
    return prefersDark ? `${base}-dark` : base
  }
  return stored // 浅色或深色，直接使用
}

export default function App() {
  const {
    messages,
    isProcessing,
    config,
    sendMessage,
    clearConversation,
    saveConfig,
  } = useChromeAgent()

  const [view, setView] = useState('chat')
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || DEFAULT_THEME
    } catch {
      return DEFAULT_THEME
    }
  })
  // 系统明暗偏好状态
  const [prefersDark, setPrefersDark] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )
  const chatEndRef = useRef(null)

  // 监听系统明暗偏好变化
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql) return
    const handler = (e) => setPrefersDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // 消息更新时自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // 忽略不支持 localStorage 的环境
    }
  }, [theme])

  // 解析出实际应用的主题
  const appliedTheme = resolveTheme(theme, prefersDark)

  const handleSend = (input) => {
    sendMessage(input)
  }

  const handleClear = () => {
    clearConversation()
  }

  const handleSaveSettings = (newConfig) => {
    saveConfig(newConfig)
    setView('chat')
  }

  const handleOpenSettings = () => {
    setView('settings')
  }

  const handleBackToChat = () => {
    setView('chat')
  }

  return (
    <div className="app" data-theme={appliedTheme}>
      <div className="app-shell">
        <Header
          view={view}
          onClear={handleClear}
          onOpenSettings={handleOpenSettings}
          onBackToChat={handleBackToChat}
        />

        {view === 'settings' ? (
          <SettingsPanel
            config={config}
            onSave={handleSaveSettings}
            onCancel={handleBackToChat}
            theme={theme}
            onThemeChange={setTheme}
          />
        ) : (
          <>
            <ChatArea
              messages={messages}
              chatEndRef={chatEndRef}
              onQuickSend={handleSend}
            />
            <InputArea
              onSend={handleSend}
              disabled={isProcessing}
              config={config}
            />
          </>
        )}
      </div>
    </div>
  )
}
