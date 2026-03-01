import { useState, useEffect } from 'react'
import SkillsManager from './SkillsManager'
import McpManager from './McpManager'

const THEME_OPTIONS = [
  { value: 'azure', label: '雾蓝', color: '#2f6fed' },
  { value: 'sage', label: '雾绿', color: '#2c8a62' },
  { value: 'coral', label: '暖珊瑚', color: '#cf674f' },
  { value: 'slate', label: '石墨灰', color: '#3f5aa8' },
]

export default function SettingsPanel({ config, onSave, onCancel, theme, onThemeChange, skillApi }) {
  const [form, setForm] = useState({
    apiBase: '',
    apiKey: '',
    model: '',
    maxLoops: 20,
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1,
    systemPrompt: '',
    skills: [],
    skillPackages: [],
    mcpServers: [],
    multimodal: {
      enabled: true,
      modelSupportsVision: true,
      allowUserImageUpload: true,
      allowToolScreenshotToModel: true,
      maxImagesPerTurn: 2,
      maxImageBytes: 819200,
      maxTotalImageBytesPerTurn: 1228800,
      imageMaxWidth: 1280,
      imageMaxHeight: 1280,
      imageFormat: 'jpeg',
      imageQuality: 0.82,
      screenshotDetail: 'low',
    },
  })
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (config) {
      setForm({
        apiBase: config.apiBase || '',
        apiKey: config.apiKey || '',
        model: config.model || '',
        maxLoops: config.maxLoops ?? 20,
        maxTokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.7,
        topP: config.topP ?? 1,
        systemPrompt: config.systemPrompt || '',
        skills: Array.isArray(config.skills) ? config.skills : [],
        skillPackages: Array.isArray(config.skillPackages) ? config.skillPackages : [],
        mcpServers: Array.isArray(config.mcpServers) ? config.mcpServers : [],
        multimodal: {
          enabled: config.multimodal?.enabled ?? true,
          modelSupportsVision: config.multimodal?.modelSupportsVision ?? true,
          allowUserImageUpload: config.multimodal?.allowUserImageUpload ?? true,
          allowToolScreenshotToModel: config.multimodal?.allowToolScreenshotToModel ?? true,
          maxImagesPerTurn: config.multimodal?.maxImagesPerTurn ?? 2,
          maxImageBytes: config.multimodal?.maxImageBytes ?? 819200,
          maxTotalImageBytesPerTurn: config.multimodal?.maxTotalImageBytesPerTurn ?? 1228800,
          imageMaxWidth: config.multimodal?.imageMaxWidth ?? 1280,
          imageMaxHeight: config.multimodal?.imageMaxHeight ?? 1280,
          imageFormat: config.multimodal?.imageFormat ?? 'jpeg',
          imageQuality: config.multimodal?.imageQuality ?? 0.82,
          screenshotDetail: config.multimodal?.screenshotDetail ?? 'low',
        },
      })
    }
  }, [config])

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const updateMultimodal = (key, value) => {
    setForm(prev => ({
      ...prev,
      multimodal: {
        ...prev.multimodal,
        [key]: value,
      },
    }))
  }

  const handleSave = () => {
    onSave({
      ...form,
      maxLoops: parseInt(form.maxLoops) || 20,
      maxTokens: parseInt(form.maxTokens) || 4096,
      temperature: parseFloat(form.temperature) ?? 0.7,
      topP: parseFloat(form.topP) ?? 1,
      skills: form.skills,
      skillPackages: form.skillPackages,
      mcpServers: form.mcpServers,
      multimodal: {
        ...form.multimodal,
        enabled: !!form.multimodal.enabled,
        modelSupportsVision: !!form.multimodal.modelSupportsVision,
        allowUserImageUpload: !!form.multimodal.allowUserImageUpload,
        allowToolScreenshotToModel: !!form.multimodal.allowToolScreenshotToModel,
        maxImagesPerTurn: parseInt(form.multimodal.maxImagesPerTurn) || 2,
        maxImageBytes: parseInt(form.multimodal.maxImageBytes) || 819200,
        maxTotalImageBytesPerTurn: parseInt(form.multimodal.maxTotalImageBytesPerTurn) || 1228800,
        imageMaxWidth: parseInt(form.multimodal.imageMaxWidth) || 1280,
        imageMaxHeight: parseInt(form.multimodal.imageMaxHeight) || 1280,
        imageFormat: form.multimodal.imageFormat === 'png' ? 'png' : 'jpeg',
        imageQuality: parseFloat(form.multimodal.imageQuality) || 0.82,
        screenshotDetail: form.multimodal.screenshotDetail === 'auto' ? 'auto' : 'low',
      },
    })
  }

  return (
    <main className="settings-page">
      <div className="settings-page-head">
        <h2>连接与参数设置</h2>
        <p>这里的修改会立即影响后续对话请求。</p>
      </div>

      <div className="settings-page-scroll">
        <section className="settings-section-card">
          <div className="settings-section-title">外观主题</div>

          <div className="theme-mode-toggle">
            <button
              className={`theme-mode-btn${!theme.endsWith('-dark') && !theme.endsWith('-auto') ? ' active' : ''}`}
              onClick={() => {
                const base = theme.replace('-dark', '').replace('-auto', '')
                onThemeChange(base)
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              浅色
            </button>
            <button
              className={`theme-mode-btn${theme.endsWith('-dark') ? ' active' : ''}`}
              onClick={() => {
                const base = theme.replace('-dark', '').replace('-auto', '')
                onThemeChange(base + '-dark')
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              深色
            </button>
            <button
              className={`theme-mode-btn${theme.endsWith('-auto') ? ' active' : ''}`}
              onClick={() => {
                const base = theme.replace('-dark', '').replace('-auto', '')
                onThemeChange(base + '-auto')
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="18" rx="3" />
                <path d="M12 3v18" />
                <path d="M12 8h5M12 12h6M12 16h4" />
              </svg>
              跟随系统
            </button>
          </div>

          <div className="theme-palette-grid">
            {THEME_OPTIONS.map(opt => {
              const baseTheme = theme.replace('-dark', '').replace('-auto', '')
              const isActive = baseTheme === opt.value
              return (
                <button
                  key={opt.value}
                  className={`theme-palette-item${isActive ? ' active' : ''}`}
                  onClick={() => {
                    const suffix = theme.endsWith('-dark') ? '-dark' : theme.endsWith('-auto') ? '-auto' : ''
                    onThemeChange(opt.value + suffix)
                  }}
                  title={opt.label}
                >
                  <span className="theme-palette-dot" style={{ background: opt.color }} />
                  <span className="theme-palette-label">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-title">API 配置</div>

          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="text"
              value={form.apiBase}
              onChange={e => update('apiBase', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label>API Key</label>
            <div className="input-with-action">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={e => update('apiKey', e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="icon-btn-sm"
                title={showKey ? '隐藏' : '显示'}
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>模型</label>
            <input
              type="text"
              value={form.model}
              onChange={e => update('model', e.target.value)}
              placeholder="gpt-4o"
            />
          </div>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-title">参数调整</div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>最大调用轮次</label>
              <input
                type="number"
                value={form.maxLoops}
                onChange={e => update('maxLoops', e.target.value)}
                min="1"
                max="50"
              />
            </div>
            <div className="form-group form-group-half">
              <label>最大 Tokens</label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={e => update('maxTokens', e.target.value)}
                min="256"
                max="128000"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>Temperature</label>
              <input
                type="number"
                value={form.temperature}
                onChange={e => update('temperature', e.target.value)}
                min="0"
                max="2"
                step="0.1"
              />
            </div>
            <div className="form-group form-group-half">
              <label>Top P</label>
              <input
                type="number"
                value={form.topP}
                onChange={e => update('topP', e.target.value)}
                min="0"
                max="1"
                step="0.05"
              />
            </div>
          </div>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-title">多模态设置</div>

          <div className="toggle-grid">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={!!form.multimodal.enabled}
                onChange={e => updateMultimodal('enabled', e.target.checked)}
              />
              <span>启用多模态</span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={!!form.multimodal.modelSupportsVision}
                onChange={e => updateMultimodal('modelSupportsVision', e.target.checked)}
              />
              <span>模型支持视觉</span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={!!form.multimodal.allowUserImageUpload}
                onChange={e => updateMultimodal('allowUserImageUpload', e.target.checked)}
              />
              <span>允许用户上传图片</span>
            </label>

            <label className="toggle-item">
              <input
                type="checkbox"
                checked={!!form.multimodal.allowToolScreenshotToModel}
                onChange={e => updateMultimodal('allowToolScreenshotToModel', e.target.checked)}
              />
              <span>截图回注模型</span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>每轮最多图片数</label>
              <input
                type="number"
                value={form.multimodal.maxImagesPerTurn}
                onChange={e => updateMultimodal('maxImagesPerTurn', e.target.value)}
                min="1"
                max="10"
              />
            </div>
            <div className="form-group form-group-half">
              <label>单图大小上限（字节）</label>
              <input
                type="number"
                value={form.multimodal.maxImageBytes}
                onChange={e => updateMultimodal('maxImageBytes', e.target.value)}
                min="65536"
                max="10485760"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>单轮总大小上限（字节）</label>
              <input
                type="number"
                value={form.multimodal.maxTotalImageBytesPerTurn}
                onChange={e => updateMultimodal('maxTotalImageBytesPerTurn', e.target.value)}
                min="131072"
                max="20971520"
              />
            </div>
            <div className="form-group form-group-half">
              <label>压缩质量</label>
              <input
                type="number"
                value={form.multimodal.imageQuality}
                onChange={e => updateMultimodal('imageQuality', e.target.value)}
                min="0.2"
                max="1"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>图片最大宽度</label>
              <input
                type="number"
                value={form.multimodal.imageMaxWidth}
                onChange={e => updateMultimodal('imageMaxWidth', e.target.value)}
                min="256"
                max="4096"
              />
            </div>
            <div className="form-group form-group-half">
              <label>图片最大高度</label>
              <input
                type="number"
                value={form.multimodal.imageMaxHeight}
                onChange={e => updateMultimodal('imageMaxHeight', e.target.value)}
                min="256"
                max="4096"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group form-group-half">
              <label>图片格式</label>
              <select
                value={form.multimodal.imageFormat}
                onChange={e => updateMultimodal('imageFormat', e.target.value)}
              >
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
              </select>
            </div>
            <div className="form-group form-group-half">
              <label>截图识别精度</label>
              <select
                value={form.multimodal.screenshotDetail}
                onChange={e => updateMultimodal('screenshotDetail', e.target.value)}
              >
                <option value="low">low</option>
                <option value="auto">auto</option>
              </select>
            </div>
          </div>
        </section>

        <SkillsManager
          skills={form.skills}
          skillPackages={form.skillPackages}
          skillApi={skillApi}
          onChange={(payload) => setForm(prev => ({
            ...prev,
            skills: Array.isArray(payload?.skills) ? payload.skills : prev.skills,
            skillPackages: Array.isArray(payload?.skillPackages) ? payload.skillPackages : prev.skillPackages,
          }))}
        />

        <McpManager
          servers={form.mcpServers}
          onChange={(mcpServers) => setForm(prev => ({ ...prev, mcpServers }))}
        />

        <section className="settings-section-card">
          <div className="settings-section-title">系统提示词</div>
          <div className="form-group">
            <textarea
              rows="5"
              value={form.systemPrompt}
              onChange={e => update('systemPrompt', e.target.value)}
              placeholder="自定义 system prompt..."
            />
          </div>
        </section>
      </div>

      <div className="settings-page-actions">
        <button className="btn-primary" onClick={handleSave}>保存设置并返回</button>
        <button className="btn-secondary" onClick={onCancel}>取消</button>
      </div>
    </main>
  )
}
