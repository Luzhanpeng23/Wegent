import { useState } from 'react'

const TOOL_LABELS = {
  navigate: '导航',
  get_page_info: '获取页面信息',
  get_elements: '查询元素',
  get_page_content: '获取内容',
  click: '点击',
  type_text: '输入文本',
  select_option: '选择选项',
  scroll: '滚动',
  evaluate_js: '执行脚本',
  wait: '等待',
  highlight: '高亮',
  take_screenshot: '截图',
}

function formatJSON(obj) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function truncate(str, max = 40) {
  if (!str || str.length <= max) return str
  return str.slice(0, max) + '...'
}

export default function ToolCallCard({ name, args, status, result, duration, index }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[name] || name

  // 参数摘要
  const summaryParts = Object.entries(args || {})
    .slice(0, 2)
    .map(([, v]) => truncate(typeof v === 'string' ? v : JSON.stringify(v)))
  const summary = summaryParts.join(', ')

  // 过滤掉截图 base64 数据
  const displayResult = result
    ? result.screenshot
      ? { ...result, screenshot: '[base64 图片数据已省略]' }
      : result
    : null

  return (
    <div className="tool-call">
      <div className="tool-call-header" onClick={() => setExpanded(v => !v)}>
        <div className="tool-call-left">
          <svg
            className={`tool-call-chevron ${expanded ? 'expanded' : ''}`}
            viewBox="0 0 24 24" width="14" height="14"
            fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="tool-call-name">{label}</span>
          {summary && <span className="tool-call-summary">{summary}</span>}
        </div>
        <div className="tool-call-right">
          <span className="tool-call-index">#{index}</span>
          <StatusBadge status={status} duration={duration} />
        </div>
      </div>

      {expanded && (
        <div className="tool-call-detail">
          <div className="tool-detail-section">
            <div className="tool-detail-label">参数</div>
            <pre className="tool-detail-code">{formatJSON(args)}</pre>
          </div>
          {displayResult && (
            <div className="tool-detail-section">
              <div className="tool-detail-label">
                返回结果
                {duration != null && <span className="tool-duration">({duration}ms)</span>}
              </div>
              <pre className="tool-detail-code">{formatJSON(displayResult)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, duration }) {
  if (status === 'running') {
    return (
      <span className="tool-call-status running">
        <svg className="spin-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        执行中
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="tool-call-status success">
        完成
        {duration != null && <span className="tool-call-duration">{duration}ms</span>}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="tool-call-status error">
        失败
        {duration != null && <span className="tool-call-duration">{duration}ms</span>}
      </span>
    )
  }
  return null
}
