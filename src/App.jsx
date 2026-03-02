import { useEffect, useRef, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useChromeAgent } from './hooks/useChromeAgent'
import Header from './components/Header'
import SettingsPanel from './components/SettingsPanel'
import ScheduleManager from './components/ScheduleManager'
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

  const [view, setView] = useState('chat') // chat | schedule | settings
  const [themeModePreview, setThemeModePreview] = useState(null)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const chatEndRef = useRef(null)

  const themeMode = themeModePreview || config?.themeMode || 'system'
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
          onOpenSchedule={() => setView('schedule')}
          onOpenSettings={() => setView('settings')}
          onBackToChat={() => setView('chat')}
        />

        {view === 'schedule' ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div className="space-y-3 overflow-x-hidden p-3 pb-1">
                <ScheduleManager
                  tasks={Array.isArray(config?.scheduledTasks) ? config.scheduledTasks : []}
                  onChange={(scheduledTasks) => {
                    saveConfig({ scheduledTasks })
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t bg-background px-3 py-2">
              <Button type="button" variant="outline" onClick={() => setView('chat')}>返回对话</Button>
            </div>
          </main>
        ) : view === 'settings' ? (
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
