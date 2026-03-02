import { useMemo, useRef, useState } from 'react'
import { ImagePlus, SendHorizontal, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const DEFAULT_MULTIMODAL = {
  modelSupportsVision: true,
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

async function compressImageDataUrl(dataUrl) {
  const image = await loadImage(dataUrl)
  const maxWidth = 1280
  const maxHeight = 1280
  const quality = 0.82
  const mimeType = 'image/jpeg'

  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片处理失败')

  ctx.drawImage(image, 0, 0, width, height)

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

  const uploadEnabled = !!multimodal.modelSupportsVision
  const maxImagesPerTurn = 10
  const maxImageBytes = 20 * 1024 * 1024

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
        const compressed = await compressImageDataUrl(originalDataUrl)

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
    <footer className="border-t bg-background p-3">
      <div className="space-y-2">
        {uploadEnabled && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImagePlus className="h-3.5 w-3.5" />
            <span>支持直接粘贴图片（Ctrl+V）</span>
            <Badge variant="secondary">{attachments.length}/{maxImagesPerTurn}</Badge>
          </div>
        )}

        {uploadError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map(item => (
              <div key={item.id} className="relative h-12 w-12 overflow-hidden rounded-md border bg-muted">
                <img src={item.dataUrl} alt="上传预览" className="h-full w-full object-cover" />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute top-0.5 right-0.5 h-4 w-4 p-0"
                  onClick={() => handleRemoveAttachment(item.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="描述你想执行的网页操作..."
            rows={1}
            className="min-h-[42px] max-h-[120px] resize-none pr-12"
          />

          <Button
            type="button"
            size="icon-sm"
            className="absolute top-1/2 right-2 -translate-y-1/2"
            onClick={handleSend}
            disabled={disabled || isPreparingImage || (!text.trim() && attachments.length === 0)}
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </footer>
  )
}
