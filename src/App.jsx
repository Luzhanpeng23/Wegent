import { useState, useRef, useEffect } from 'react'
import { useChromeAgent } from './hooks/useChromeAgent'
import Header from './components/Header'
import SettingsPanel from './components/SettingsPanel'
import ChatArea from './components/ChatArea'
import InputArea from './components/InputArea'

const THEME_KEY = 'dom-agent-theme'
const DEFAULT_THEME = 'azure'

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
  const chatEndRef = useRef(null)

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
    <div className="app" data-theme={theme}>
      <div className="app-shell">
        <Header
          view={view}
          onClear={handleClear}
          onOpenSettings={handleOpenSettings}
          onBackToChat={handleBackToChat}
          theme={theme}
          onThemeChange={setTheme}
        />

        {view === 'settings' ? (
          <SettingsPanel
            config={config}
            onSave={handleSaveSettings}
            onCancel={handleBackToChat}
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
