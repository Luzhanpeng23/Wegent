import { useState, useEffect, useCallback, useRef } from 'react'

/** 判断是否在 Chrome 扩展环境中运行 */
const isChromeExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id

/** 非扩展环境下的默认配置（用于开发预览） */
const DEV_CONFIG = {
  schemaVersion: 3,
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  maxLoops: 20,
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  themeMode: 'system',
  multimodal: {
    modelSupportsVision: true,
    imageDetail: 'auto',
  },
  // Claude Code 风格 Skill Packages
  skillPackages: [],
  skillRuntime: {
    enabled: true,
    maxPackages: 20,
    maxSkillBytes: 220 * 1024,
    maxResourcesPerType: 50,
  },
  mcpServers: [],
  scheduledTasks: [],
  systemPrompt: '',
}

/** Chrome 扩展消息通信 Hook */
export function useChromeAgent() {
  const [messages, setMessages] = useState([])       // 聊天消息列表
  const [isProcessing, setIsProcessing] = useState(false)
  const [tabId, setTabId] = useState(null)
  const [config, setConfig] = useState(isChromeExtension ? null : DEV_CONFIG)
  const toolCountRef = useRef(0)

  const hasReasoningContent = (value) => typeof value === 'string' && value.trim().length > 0

  // 初始化：获取当前标签页和配置
  useEffect(() => {
    if (!isChromeExtension) return

    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }).then(resp => {
      setTabId(resp.tabId)
    })
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }).then(cfg => {
      setConfig(cfg)
    })

    // 建立长连接，让 background 追踪侧边栏开关状态
    const port = chrome.runtime.connect({ name: 'sidepanel-alive' })

    // 标签页切换监听
    const handleActivated = (info) => setTabId(info.tabId)
    chrome.tabs.onActivated.addListener(handleActivated)
    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated)
      port.disconnect()
    }
  }, [])

  // 监听 background 发来的 Agent 更新
  useEffect(() => {
    if (!isChromeExtension) return

    const handler = (message) => {
      if (message.type !== 'AGENT_UPDATE' || !message.payload) return
      const p = message.payload

      switch (p.type) {
        case 'thinking':
          setMessages(prev => {
            // 避免重复添加
            if (prev.length > 0 && prev[prev.length - 1].type === 'thinking') return prev
            return [...prev, { type: 'thinking', id: Date.now() }]
          })
          break

        case 'tool_call':
          toolCountRef.current += 1
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            const normalized = [...filtered]
            const last = normalized[normalized.length - 1]
            if (last && last.type === 'reasoning' && last.streaming) {
              normalized[normalized.length - 1] = {
                ...last,
                streaming: false,
              }
            }

            return [...normalized, {
              type: 'tool_call',
              id: Date.now(),
              name: p.name,
              args: p.args,
              index: toolCountRef.current,
              loopIndex: p.loopIndex,
              status: 'running',
              result: null,
              duration: null,
            }]
          })
          break

        case 'tool_result':
          setMessages(prev => {
            const updated = [...prev]
            // 找到最后一个匹配的 tool_call
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'tool_call' && updated[i].status === 'running') {
                updated[i] = {
                  ...updated[i],
                  status: p.result?.success ? 'success' : 'error',
                  result: p.result,
                  duration: p.duration,
                }
                break
              }
            }
            return updated
          })
          break

        case 'screenshot':
          setMessages(prev => [...prev, {
            type: 'screenshot',
            id: Date.now(),
            data: p.data,
          }])
          break

        case 'reasoning_delta':
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            const nextContent = p.content || p.delta || ''
            if (!hasReasoningContent(nextContent)) return filtered

            const last = filtered[filtered.length - 1]
            if (last && last.type === 'reasoning' && last.streaming) {
              const updated = [...filtered]
              updated[updated.length - 1] = {
                ...last,
                content: nextContent,
              }
              return updated
            }

            return [...filtered, {
              type: 'reasoning',
              id: Date.now(),
              content: nextContent,
              streaming: true,
            }]
          })
          break

        case 'assistant_delta':
          // 流式增量：累积更新最后一条 assistant 消息，或新建一条
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            const updated = [...filtered]
            const lastItem = updated[updated.length - 1]

            if (lastItem && lastItem.type === 'reasoning' && lastItem.streaming) {
              updated[updated.length - 1] = {
                ...lastItem,
                streaming: false,
              }
            }

            const last = updated[updated.length - 1]
            if (last && last.type === 'assistant' && last.streaming) {
              updated[updated.length - 1] = {
                ...last,
                content: p.content || '',
              }
              return updated
            }

            return [...updated, {
              type: 'assistant',
              id: Date.now(),
              content: p.content || p.delta || '',
              streaming: true,
            }]
          })
          break

        case 'assistant_message':
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            const normalized = [...filtered]

            for (let i = normalized.length - 1; i >= 0; i--) {
              if (normalized[i].type === 'reasoning' && normalized[i].streaming) {
                normalized[i] = {
                  ...normalized[i],
                  streaming: false,
                }
                break
              }
            }

            const last = normalized[normalized.length - 1]
            if (last && last.type === 'assistant' && last.streaming) {
              normalized[normalized.length - 1] = {
                ...last,
                content: p.content || last.content || '',
                streaming: false,
              }
              return normalized
            }

            return [...normalized, {
              type: 'assistant',
              id: Date.now(),
              content: p.content || '',
              streaming: false,
            }]
          })
          setIsProcessing(false)
          break

        case 'error':
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            return [...filtered, {
              type: 'error',
              id: Date.now(),
              content: p.message,
            }]
          })
          setIsProcessing(false)
          break
      }
    }

    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 发送消息（兼容纯文本与多模态输入）
  const sendMessage = useCallback((input) => {
    const payload = typeof input === 'string'
      ? { text: input, attachments: [] }
      : {
          text: typeof input?.text === 'string' ? input.text : '',
          attachments: Array.isArray(input?.attachments) ? input.attachments : [],
        }

    const text = payload.text.trim()
    const hasAttachments = payload.attachments.length > 0
    if ((!text && !hasAttachments) || isProcessing) return

    toolCountRef.current = 0
    setIsProcessing(true)
    setMessages(prev => [...prev, {
      type: 'user',
      id: Date.now(),
      content: payload.text,
      attachments: payload.attachments,
    }])

    if (!isChromeExtension) {
      // 开发预览模式：模拟助手回复
      setTimeout(() => {
        setMessages(prev => [...prev, {
          type: 'assistant',
          id: Date.now(),
          content: `[开发预览] 收到消息: "${payload.text || '[仅图片输入]'}"\n\n此模式下无法连接 Chrome 扩展后台，仅用于 UI 预览。请在 Chrome 中加载扩展以使用完整功能。`,
        }])
        setIsProcessing(false)
      }, 800)
      return
    }

    chrome.runtime.sendMessage({
      type: 'CHAT_MESSAGE',
      tabId: tabId,
      text: payload.text,
      attachments: payload.attachments,
    })
  }, [isProcessing, tabId])

  // 清空对话
  const clearConversation = useCallback(async () => {
    if (isChromeExtension && tabId) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_CONVERSATION', tabId })
    }
    setMessages([])
    toolCountRef.current = 0
    setIsProcessing(false)
  }, [tabId])

  // 保存配置
  const saveConfig = useCallback(async (newConfig) => {
    if (isChromeExtension) {
      await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', config: newConfig })
    }
    setConfig(prev => ({
      ...(prev || DEV_CONFIG),
      ...(newConfig || {}),
      themeMode: (newConfig?.themeMode || prev?.themeMode || DEV_CONFIG.themeMode),
      multimodal: {
        ...((prev && prev.multimodal) || DEV_CONFIG.multimodal),
        ...((newConfig && newConfig.multimodal) || {}),
      },
      skillPackages: Array.isArray(newConfig?.skillPackages) ? newConfig.skillPackages : (prev?.skillPackages || []),
      skillRuntime: {
        ...((prev && prev.skillRuntime) || DEV_CONFIG.skillRuntime),
        ...((newConfig && newConfig.skillRuntime) || {}),
      },
      mcpServers: Array.isArray(newConfig?.mcpServers) ? newConfig.mcpServers : (prev?.mcpServers || []),
      scheduledTasks: Array.isArray(newConfig?.scheduledTasks) ? newConfig.scheduledTasks : (prev?.scheduledTasks || []),
    }))
  }, [])

  const skillImportPreview = useCallback(async (sourceUrl) => {
    if (!isChromeExtension) {
      return { ok: false, error: '仅在 Chrome 扩展环境可用' }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_IMPORT_PREVIEW', sourceUrl })
  }, [])

  const skillImportCommit = useCallback(async (preview) => {
    if (!isChromeExtension) {
      return { ok: false, error: '仅在 Chrome 扩展环境可用' }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_IMPORT_COMMIT', preview })
  }, [])

  const listSkillPackages = useCallback(async () => {
    if (!isChromeExtension) {
      return { ok: true, packages: config?.skillPackages || [] }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_PACKAGE_LIST' })
  }, [config?.skillPackages])

  const toggleSkillPackage = useCallback(async (packageId, enabled) => {
    if (!isChromeExtension) {
      return { ok: false, error: '仅在 Chrome 扩展环境可用' }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_PACKAGE_TOGGLE', packageId, enabled })
  }, [])

  const removeSkillPackage = useCallback(async (packageId) => {
    if (!isChromeExtension) {
      return { ok: false, error: '仅在 Chrome 扩展环境可用' }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_PACKAGE_REMOVE', packageId })
  }, [])

  const refreshSkillPackage = useCallback(async (packageId) => {
    if (!isChromeExtension) {
      return { ok: false, error: '仅在 Chrome 扩展环境可用' }
    }
    return chrome.runtime.sendMessage({ type: 'SKILL_PACKAGE_REFRESH', packageId })
  }, [])

  return {
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
  }
}
