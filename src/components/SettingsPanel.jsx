import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import SkillsManager from './SkillsManager'
import McpManager from './McpManager'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export default function SettingsPanel({ config, onSave, onCancel, onThemeModeChange, skillApi }) {
  const [form, setForm] = useState({
    apiBase: '',
    apiKey: '',
    model: '',
    maxLoops: 20,
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1,
    systemPrompt: '',
    themeMode: 'system',
    skillPackages: [],
    mcpServers: [],
    multimodal: {
      modelSupportsVision: true,
      imageDetail: 'auto',
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
        themeMode: config.themeMode || 'system',
        skillPackages: Array.isArray(config.skillPackages) ? config.skillPackages : [],
        mcpServers: Array.isArray(config.mcpServers) ? config.mcpServers : [],
        multimodal: {
          modelSupportsVision: config.multimodal?.modelSupportsVision ?? true,
          imageDetail: ['auto', 'low', 'high'].includes(config.multimodal?.imageDetail)
            ? config.multimodal.imageDetail
            : 'auto',
        },
      })
    }
  }, [config])

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'themeMode') {
      onThemeModeChange?.(value)
    }
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
      themeMode: ['light', 'dark', 'system'].includes(form.themeMode) ? form.themeMode : 'system',
      skillPackages: form.skillPackages,
      mcpServers: form.mcpServers,
      multimodal: {
        modelSupportsVision: !!form.multimodal.modelSupportsVision,
        imageDetail: ['auto', 'low', 'high'].includes(form.multimodal.imageDetail)
          ? form.multimodal.imageDetail
          : 'auto',
      },
    })
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="space-y-3 overflow-x-hidden p-3 pb-1">
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">外观主题</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <div className="space-y-1.5">
                  <div className="inline-flex w-full rounded-md border bg-muted/30 p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={form.themeMode === 'light' ? 'secondary' : 'ghost'}
                      className="flex-1"
                      onClick={() => update('themeMode', 'light')}
                      aria-pressed={form.themeMode === 'light'}
                    >
                      浅色
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.themeMode === 'dark' ? 'secondary' : 'ghost'}
                      className="flex-1"
                      onClick={() => update('themeMode', 'dark')}
                      aria-pressed={form.themeMode === 'dark'}
                    >
                      深色
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.themeMode === 'system' ? 'secondary' : 'ghost'}
                      className="flex-1"
                      onClick={() => update('themeMode', 'system')}
                      aria-pressed={form.themeMode === 'system'}
                    >
                      跟随系统
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">API 配置</CardTitle>
                <CardDescription>配置请求地址、密钥和模型。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                <div className="space-y-1.5">
                  <Label htmlFor="api-base">API Base URL</Label>
                  <Input
                    id="api-base"
                    type="text"
                    value={form.apiBase}
                    onChange={(e) => update('apiBase', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="api-key">API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="api-key"
                      type={showKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={(e) => update('apiKey', e.target.value)}
                      placeholder="sk-..."
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title={showKey ? '隐藏' : '显示'}
                      onClick={() => setShowKey(v => !v)}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="model">模型</Label>
                  <Input
                    id="model"
                    type="text"
                    value={form.model}
                    onChange={(e) => update('model', e.target.value)}
                    placeholder="gpt-4o"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">参数调整</CardTitle>
                <CardDescription>控制模型输出行为与 token 消耗上限。</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 *:min-w-0">
                <div className="space-y-1.5">
                  <Label htmlFor="max-loops">最大调用轮次</Label>
                  <Input
                    id="max-loops"
                    type="number"
                    value={form.maxLoops}
                    onChange={(e) => update('maxLoops', e.target.value)}
                    min="1"
                    max="50"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="max-tokens">最大 Tokens</Label>
                  <Input
                    id="max-tokens"
                    type="number"
                    value={form.maxTokens}
                    onChange={(e) => update('maxTokens', e.target.value)}
                    min="256"
                    max="128000"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    type="number"
                    value={form.temperature}
                    onChange={(e) => update('temperature', e.target.value)}
                    min="0"
                    max="2"
                    step="0.1"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="top-p">Top P</Label>
                  <Input
                    id="top-p"
                    type="number"
                    value={form.topP}
                    onChange={(e) => update('topP', e.target.value)}
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>

                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-[auto_96px] sm:items-center">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="mm-vision" className="text-xs">支持 Vision</Label>
                    <Switch
                      id="mm-vision"
                      checked={!!form.multimodal.modelSupportsVision}
                      onCheckedChange={(checked) => updateMultimodal('modelSupportsVision', checked)}
                    />
                  </div>

                  <div className="min-w-0">
                    <Label htmlFor="mm-image-detail" className="sr-only">图像输入细节级别</Label>
                    <Select
                      value={form.multimodal.imageDetail}
                      onValueChange={(value) => updateMultimodal('imageDetail', value)}
                      disabled={!form.multimodal.modelSupportsVision}
                    >
                      <SelectTrigger id="mm-image-detail" className="h-8 w-full min-w-0">
                        <SelectValue placeholder="细节" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">auto</SelectItem>
                        <SelectItem value="low">low</SelectItem>
                        <SelectItem value="high">high</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <SkillsManager
              skillPackages={form.skillPackages}
              skillApi={skillApi}
              onChange={(nextSkillPackages) => setForm(prev => ({
                ...prev,
                skillPackages: Array.isArray(nextSkillPackages) ? nextSkillPackages : prev.skillPackages,
              }))}
            />

            <McpManager
              servers={form.mcpServers}
              onChange={(mcpServers) => setForm(prev => ({ ...prev, mcpServers }))}
            />

            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">系统提示词</CardTitle>
                <CardDescription>可选，覆盖默认 system prompt。</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <Textarea
                  rows={5}
                  value={form.systemPrompt}
                  onChange={(e) => update('systemPrompt', e.target.value)}
                  placeholder="自定义 system prompt..."
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-background px-3 py-2">
          <Button type="button" onClick={handleSave}>保存设置并返回</Button>
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        </div>
    </main>
  )
}
