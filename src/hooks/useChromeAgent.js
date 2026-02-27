import { useState, useEffect, useCallback, useRef } from 'react'

/** 判断是否在 Chrome 扩展环境中运行 */
const isChromeExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id

/** 非扩展环境下的默认配置（用于开发预览） */
const DEV_CONFIG = {
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  maxLoops: 20,
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  multimodal: {
    enabled: true,
    modelSupportsVision: true,
    allowUserImageUpload: true,
    allowToolScreenshotToModel: true,
    maxImagesPerTurn: 2,
    maxImageBytes: 800 * 1024,
    maxTotalImageBytesPerTurn: 1200 * 1024,
    imageMaxWidth: 1280,
    imageMaxHeight: 1280,
    imageFormat: 'jpeg',
    imageQuality: 0.82,
    screenshotDetail: 'low',
  },
  systemPrompt: '',
}

/** Chrome 扩展消息通信 Hook */
export function useChromeAgent() {
  const [messages, setMessages] = useState([])       // 聊天消息列表
  const [isProcessing, setIsProcessing] = useState(false)
  const [tabId, setTabId] = useState(null)
  const [config, setConfig] = useState(isChromeExtension ? null : DEV_CONFIG)
  const toolCountRef = useRef(0)

  // 初始化：获取当前标签页和配置
  useEffect(() => {
    if (!isChromeExtension) return

    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }).then(resp => {
      setTabId(resp.tabId)
    })
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }).then(cfg => {
      setConfig(cfg)
    })

    // 标签页切换监听
    const handleActivated = (info) => setTabId(info.tabId)
    chrome.tabs.onActivated.addListener(handleActivated)
    return () => chrome.tabs.onActivated.removeListener(handleActivated)
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
            return [...filtered, {
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

        case 'assistant_message':
          setMessages(prev => {
            const filtered = prev.filter(m => m.type !== 'thinking')
            return [...filtered, {
              type: 'assistant',
              id: Date.now(),
              content: p.content || '',
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
      multimodal: {
        ...((prev && prev.multimodal) || DEV_CONFIG.multimodal),
        ...((newConfig && newConfig.multimodal) || {}),
      },
    }))
  }, [])

  return {
    messages,
    isProcessing,
    config,
    sendMessage,
    clearConversation,
    saveConfig,
  }
}
