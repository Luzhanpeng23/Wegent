const THEME_OPTIONS = [
  { value: 'azure', label: '雾蓝' },
  { value: 'sage', label: '雾绿' },
  { value: 'coral', label: '暖珊瑚' },
  { value: 'slate', label: '石墨灰' },
]

export default function Header({
  view,
  onClear,
  onOpenSettings,
  onBackToChat,
  theme,
  onThemeChange,
}) {
  const inSettings = view === 'settings'

  return (
    <header className="header">
      <div className="header-brand">
        <div className="logo-wrap">
          <svg className="logo-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
            <path d="M8 12h8M12 8v8" />
          </svg>
        </div>
        <div className="header-titles">
          <h1 className="header-title">{inSettings ? '设置中心' : 'DOM Agent'}</h1>
          <p className="header-subtitle">{inSettings ? '管理连接与模型参数' : '网页结构化操作面板'}</p>
        </div>
      </div>

      <div className="header-actions">
        <label className="theme-field" title="切换配色">
          <span>配色</span>
          <select
            className="theme-select"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            aria-label="切换配色"
          >
            {THEME_OPTIONS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        {inSettings ? (
          <button className="icon-btn" title="返回对话" onClick={onBackToChat}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        ) : (
          <>
            <button className="icon-btn" title="清空对话" onClick={onClear}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
              </svg>
            </button>

            <button className="icon-btn" title="设置" onClick={onOpenSettings}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </header>
  )
}
