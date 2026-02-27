import { useMemo, useRef, useState } from 'react'

const DEFAULT_MULTIMODAL = {
  enabled: true,
  modelSupportsVision: true,
  allowUserImageUpload: true,
  maxImagesPerTurn: 2,
  maxImageBytes: 800 * 1024,
  imageMaxWidth: 1280,
  imageMaxHeight: 1280,
  imageFormat: 'jpeg',
  imageQuality: 0.82,
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const parts = dataUrl.split(',')
  if (parts.length < 2) return 0
  const base64 = parts[1] || ''
  const paddingMatch = base64.match(/=+$/)
  const padding = paddingMatch ? paddingMatch[0].length : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

async function compressImageDataUrl(dataUrl, options) {
  const image = await loadImage(dataUrl)
  const maxWidth = clampNumber(options.imageMaxWidth, 1280, 256, 4096)
  const maxHeight = clampNumber(options.imageMaxHeight, 1280, 256, 4096)
  const quality = clampNumber(options.imageQuality, 0.82, 0.2, 1)
  const format = options.imageFormat === 'png' ? 'png' : 'jpeg'

  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片处理失败')

  ctx.drawImage(image, 0, 0, width, height)

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const outputDataUrl = canvas.toDataURL(mimeType, quality)

  return {
    dataUrl: outputDataUrl,
    mimeType,
    width,
    height,
    sizeBytes: estimateDataUrlBytes(outputDataUrl),
  }
}

export default function InputArea({ onSend, disabled, config }) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploadError, setUploadError] = useState('')
  const [isPreparingImage, setIsPreparingImage] = useState(false)
  const textareaRef = useRef(null)

  const multimodal = useMemo(() => ({
    ...DEFAULT_MULTIMODAL,
    ...((config && config.multimodal) || {}),
  }), [config])

  const uploadEnabled = !!(multimodal.enabled && multimodal.allowUserImageUpload)
  const maxImagesPerTurn = Math.floor(clampNumber(multimodal.maxImagesPerTurn, 2, 1, 10))
  const maxImageBytes = Math.floor(clampNumber(multimodal.maxImageBytes, 800 * 1024, 64 * 1024, 10 * 1024 * 1024))

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || disabled || isPreparingImage) return

    onSend({
      text: trimmed,
      attachments,
    })

    setText('')
    setAttachments([])
    setUploadError('')
    resetTextareaHeight()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e) => {
    setText(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }

  const handleRemoveAttachment = (id) => {
    setAttachments(prev => prev.filter(item => item.id !== id))
    setUploadError('')
  }

  const appendImagesFromFiles = async (files) => {
    if (!uploadEnabled) {
      setUploadError('当前已关闭图片上传，请在设置中开启多模态上传。')
      return
    }

    const remain = Math.max(0, maxImagesPerTurn - attachments.length)
    if (remain <= 0) {
      setUploadError(`本轮最多上传 ${maxImagesPerTurn} 张图片。`)
      return
    }

    const candidates = files
      .filter(file => file && file.type && file.type.startsWith('image/'))
      .slice(0, remain)

    if (candidates.length === 0) {
      return
    }

    setIsPreparingImage(true)
    setUploadError('')

    try {
      const prepared = []

      for (const file of candidates) {
        const originalDataUrl = await readFileAsDataUrl(file)
        const compressed = await compressImageDataUrl(originalDataUrl, multimodal)

        if (compressed.sizeBytes > maxImageBytes) {
          continue
        }

        prepared.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'image',
          source: 'upload',
          name: file.name || 'clipboard-image',
          mimeType: compressed.mimeType,
          dataUrl: compressed.dataUrl,
          width: compressed.width,
          height: compressed.height,
          sizeBytes: compressed.sizeBytes,
        })
      }

      if (prepared.length === 0) {
        setUploadError('图片过大或处理失败，请尝试更小图片。')
      } else {
        setAttachments(prev => [...prev, ...prepared].slice(0, maxImagesPerTurn))
      }
    } catch {
      setUploadError('图片处理失败，请重试。')
    } finally {
      setIsPreparingImage(false)
    }
  }

  const handlePaste = async (e) => {
    if (!uploadEnabled || disabled || isPreparingImage) return

    const items = Array.from(e.clipboardData?.items || [])
    if (items.length === 0) return

    const imageFiles = items
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean)

    if (imageFiles.length === 0) return

    e.preventDefault()
    await appendImagesFromFiles(imageFiles)
  }

  return (
    <footer className="input-area">
      {uploadEnabled && (
        <div className="attachment-hint">
          支持直接粘贴图片（Ctrl+V） · 已选 {attachments.length}/{maxImagesPerTurn}
        </div>
      )}

      {uploadError && <div className="attachment-error">{uploadError}</div>}

      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map(item => (
            <div key={item.id} className="attachment-item">
              <img src={item.dataUrl} alt="上传预览" className="attachment-thumb" />
              <button
                type="button"
                className="attachment-remove"
                onClick={() => handleRemoveAttachment(item.id)}
                title="移除图片"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="描述你想执行的网页操作..."
          rows="1"
        />

        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || isPreparingImage || (!text.trim() && attachments.length === 0)}
          title="发送"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11.5L21 3l-8.5 18-2-7L3 11.5z" />
          </svg>
        </button>
      </div>
    </footer>
  )
}
