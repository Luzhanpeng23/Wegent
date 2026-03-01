import { useEffect, useRef, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useChromeAgent } from './hooks/useChromeAgent'
import Header from './components/Header'
import SettingsPanel from './components/SettingsPanel'
import ChatArea from './components/ChatArea'
import InputArea from './components/InputArea'

export default function App() {
  const {
    messages,
    isProcessing,
    config,
    sendMessage,
    clearConversation,
    saveConfig,
    skillImportPreview,
    skillImportCommit,
    listSkillPackages,
    toggleSkillPackage,
    removeSkillPackage,
    refreshSkillPackage,
  } = useChromeAgent()

  const [view, setView] = useState('chat')
  const [themeModePreview, setThemeModePreview] = useState(null)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const chatEndRef = useRef(null)

  const themeMode = themeModePreview || config?.themeMode || 'light'
  const resolvedDark = themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event) => setSystemPrefersDark(event.matches)
    setSystemPrefersDark(media.matches)

    if (media.addEventListener) {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark)
  }, [resolvedDark])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <TooltipProvider>
      <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <Header
          view={view}
          onClear={clearConversation}
          onOpenSettings={() => setView('settings')}
          onBackToChat={() => setView('chat')}
        />

        {view === 'settings' ? (
          <SettingsPanel
            config={config}
            onThemeModeChange={setThemeModePreview}
            onSave={(newConfig) => {
              saveConfig(newConfig)
              setThemeModePreview(null)
              setView('chat')
            }}
            onCancel={() => {
              setThemeModePreview(null)
              setView('chat')
            }}
            skillApi={{
              preview: skillImportPreview,
              commit: skillImportCommit,
              list: listSkillPackages,
              toggle: toggleSkillPackage,
              remove: removeSkillPackage,
              refresh: refreshSkillPackage,
            }}
          />
        ) : (
          <>
            <ChatArea
              messages={messages}
              chatEndRef={chatEndRef}
              onQuickSend={sendMessage}
            />
            <InputArea
              onSend={sendMessage}
              disabled={isProcessing}
              config={config}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
