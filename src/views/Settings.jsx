'use client'
import { useState, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { DEFAULT_SCORING_CONFIG, getDimensionLabel, normalizeScoringConfig } from '../lib/jobScoring'

const LLM_STORAGE_KEY = 'offerflow_llm_config'

const LLM_PRESETS = {
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  siliconflow: { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  qwen: { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  custom: { label: '自定义', baseUrl: '', model: '' },
}

const SCORING_FIELDS = [
  { key: 'preferredCities', label: '优先城市', hint: '命中后城市维度给高分，多个值用逗号分隔' },
  { key: 'acceptableCities', label: '可接受城市', hint: '非首选但仍可考虑的城市' },
  { key: 'targetKeywords', label: '目标方向关键词', hint: '用于判断岗位名称/JD 是否匹配主方向' },
  { key: 'strongKeywords', label: '强匹配关键词', hint: '命中这些词会明显提高岗位匹配分' },
  { key: 'preferredOrgKeywords', label: '偏好单位关键词', hint: '央国企、事业单位、军工、交通等稳定性关键词' },
  { key: 'privateOrgKeywords', label: '私企/互联网关键词', hint: '用于区分央国企薪资红线和私企薪资红线' },
  { key: 'avoidKeywords', label: '风险关键词', hint: '命中后会降低强度/稳定性分' },
]

const WEIGHT_KEYS = ['city', 'org', 'salary', 'role', 'workLife', 'status']

function loadLlmConfig() {
  if (typeof window === 'undefined') return { llmProvider: 'deepseek', llmApiKey: '', llmBaseUrl: '', llmModel: '' }
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const preset = LLM_PRESETS[parsed.llmProvider]
      if (preset && parsed.llmProvider !== 'custom') {
        if (!parsed.llmBaseUrl) parsed.llmBaseUrl = preset.baseUrl
        if (!parsed.llmModel) parsed.llmModel = preset.model
      }
      return parsed
    }
  } catch {}
  return { llmProvider: 'deepseek', llmApiKey: '', llmBaseUrl: '', llmModel: '' }
}

function saveLlmConfig(config) {
  try {
    localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(config))
  } catch {}
}

function TextInput({ label, value, onChange, placeholder, hint }) {
  return (
    <div>
      <label className="text-sm text-offer-muted block mb-1">{label}</label>
      <input
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text placeholder:text-theme-muted outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
      />
      {hint && <p className="mt-1 text-xs text-offer-muted/80">{hint}</p>}
    </div>
  )
}

function TextAreaInput({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="text-sm text-offer-muted block mb-1">{label}</label>
      <textarea
        value={value || ''}
        onChange={onChange}
        rows={3}
        className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text placeholder:text-theme-muted outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20 resize-y"
      />
      {hint && <p className="mt-1 text-xs text-offer-muted/80">{hint}</p>}
    </div>
  )
}

export default function Settings() {
  const { settings, setSettings } = useApp()

  const [form, setForm] = useState({ ...settings, jobScoring: normalizeScoringConfig(settings) })
  const [saved, setSaved] = useState(false)

  const [llmForm, setLlmForm] = useState(loadLlmConfig)
  const [llmSaved, setLlmSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    setForm({ ...settings, jobScoring: normalizeScoringConfig(settings) })
  }, [settings])

  const handleSave = () => {
    setSettings({ ...form, jobScoring: normalizeScoringConfig(form) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const setScoring = (key, value) => {
    setForm((prev) => ({
      ...prev,
      jobScoring: {
        ...normalizeScoringConfig(prev),
        [key]: value,
      },
    }))
  }

  const setWeight = (key, value) => {
    const numeric = Math.max(0, Number(value) || 0)
    setForm((prev) => {
      const current = normalizeScoringConfig(prev)
      return {
        ...prev,
        jobScoring: {
          ...current,
          weights: {
            ...current.weights,
            [key]: numeric,
          },
        },
      }
    })
  }

  const resetScoring = () => {
    setForm((prev) => ({ ...prev, jobScoring: DEFAULT_SCORING_CONFIG }))
  }

  const handleProviderChange = (provider) => {
    const preset = LLM_PRESETS[provider]
    setLlmForm((prev) => ({
      ...prev,
      llmProvider: provider,
      llmBaseUrl: preset?.baseUrl || prev.llmBaseUrl,
      llmModel: preset?.model || prev.llmModel,
    }))
  }

  const handleLlmChange = (key) => (e) => {
    setLlmForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const handleLlmSave = () => {
    saveLlmConfig(llmForm)
    setLlmSaved(true)
    setTestResult(null)
    setTimeout(() => setLlmSaved(false), 2000)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const baseUrl = llmForm.llmBaseUrl.replace(/\/+$/, '')
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${llmForm.llmApiKey}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTestResult({ ok: true, msg: `连接成功！可用模型 ${data.data?.length || '未知'} 个` })
      } else if (res.status === 401) {
        setTestResult({ ok: false, msg: 'API Key 无效（401）' })
      } else {
        setTestResult({ ok: false, msg: `连接失败（${res.status}）` })
      }
    } catch (err) {
      setTestResult({ ok: false, msg: `网络错误: ${err.message}` })
    } finally {
      setTesting(false)
    }
  }

  const scoring = normalizeScoringConfig(form)
  const weightTotal = WEIGHT_KEYS.reduce((sum, key) => sum + (Number(scoring.weights?.[key]) || 0), 0)

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-white mb-1">设置</h1>
      <p className="text-offer-muted text-sm mb-6">管理个人资料、AI 模型和岗位评分标准</p>

      <div className="space-y-4">
        <div className="card-modern p-5">
          <h2 className="text-white font-semibold mb-4">个人资料</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: '姓名', key: 'name' },
              { label: '邮箱', key: 'email' },
              { label: '目标岗位', key: 'targetPosition' },
            ].map((f) => (
              <TextInput key={f.key} label={f.label} value={form[f.key] || ''} onChange={set(f.key)} />
            ))}
          </div>
        </div>

        <div className="card-modern p-5">
          <h2 className="text-white font-semibold mb-4">偏好设置</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: '期望工作地点', key: 'targetCities' },
              { label: '期望薪资范围', key: 'salaryExpectation' },
              { label: '工作性质', key: 'workType' },
            ].map((f) => (
              <TextInput key={f.key} label={f.label} value={form[f.key] || ''} onChange={set(f.key)} />
            ))}
          </div>
        </div>

        <div className="card-modern p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-white font-semibold">岗位评分标准</h2>
              <p className="text-xs text-offer-muted mt-1">用于岗位库和岗位详情页的 100 分求职决策评分。不同用户可以按自己的城市、薪资红线和方向关键词调整。</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScoring('enabled', !scoring.enabled)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${scoring.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-theme-border text-offer-muted'}`}
              >
                {scoring.enabled ? '评分已启用' : '评分已关闭'}
              </button>
              <button onClick={resetScoring} className="btn-secondary px-3 py-1.5 rounded-full text-xs">恢复默认</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput label="评分方案名称" value={scoring.profileName} onChange={(e) => setScoring('profileName', e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="央国企最低年包/万" value={scoring.publicSalaryFloorWan} onChange={(e) => setScoring('publicSalaryFloorWan', e.target.value)} />
              <TextInput label="私企最低年包/万" value={scoring.privateSalaryFloorWan} onChange={(e) => setScoring('privateSalaryFloorWan', e.target.value)} />
            </div>
            {SCORING_FIELDS.map((field) => (
              <TextAreaInput
                key={field.key}
                label={field.label}
                value={scoring[field.key]}
                onChange={(e) => setScoring(field.key, e.target.value)}
                hint={field.hint}
              />
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-theme-border bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">评分权重</h3>
                <p className="text-xs text-offer-muted">权重不要求加起来等于 100，系统会自动归一化。当前总权重：{weightTotal}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {WEIGHT_KEYS.map((key) => (
                <div key={key}>
                  <label className="text-xs text-offer-muted block mb-1">{getDimensionLabel(key)}</label>
                  <input
                    type="number"
                    min="0"
                    value={scoring.weights?.[key] ?? 0}
                    onChange={(e) => setWeight(key, e.target.value)}
                    className="min-h-[38px] w-full rounded-xl border border-theme-border bg-theme-card px-3 py-2 text-sm text-theme-text outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-modern p-5">
          <h2 className="text-white font-semibold mb-4">通知设置</h2>
          <div className="space-y-4">
            {[
              { label: '面试提醒', desc: '面试前 30 分钟推送通知', key: 'notifyInterview' },
              { label: '进度更新', desc: '投递状态变更时通知', key: 'notifyProgress' },
            ].map((t) => (
              <div key={t.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">{t.label}</p>
                  <p className="text-xs text-offer-muted">{t.desc}</p>
                </div>
                <button
                  onClick={() => setForm((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${form[t.key] ? 'bg-offer-primary' : 'bg-slate-200 dark:bg-white/10'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${form[t.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card-modern p-5">
          <h2 className="text-white font-semibold mb-4">AI 模型配置</h2>
          <p className="text-xs text-offer-muted mb-4">配置你的 AI 面试分析模型。支持任何 OpenAI 兼容的 API。配置后会自动生效。</p>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-offer-muted block mb-1">模型提供商</label>
              <select
                value={llmForm.llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
              >
                {Object.entries(LLM_PRESETS).map(([key, v]) => (
                  <option key={key} value={key}>{v.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-offer-muted block mb-1">API Key</label>
              <input
                type="password"
                value={llmForm.llmApiKey}
                onChange={handleLlmChange('llmApiKey')}
                placeholder={llmForm.llmApiKey ? '••••••••••' : '输入你的 API Key'}
                className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text placeholder:text-theme-muted outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div>
              <label className="text-sm text-offer-muted block mb-1">API 地址（Base URL）</label>
              <input
                value={llmForm.llmBaseUrl}
                onChange={handleLlmChange('llmBaseUrl')}
                placeholder="https://api.deepseek.com"
                className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text placeholder:text-theme-muted outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div>
              <label className="text-sm text-offer-muted block mb-1">模型名称</label>
              <input
                value={llmForm.llmModel}
                onChange={handleLlmChange('llmModel')}
                placeholder="deepseek-chat"
                className="min-h-[40px] w-full rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text placeholder:text-theme-muted outline-none transition-all duration-200 focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleLlmSave} className="btn-gradient px-6 py-2.5 rounded-xl text-white font-medium text-sm">保存配置</button>
              <button onClick={handleTestConnection} disabled={testing || !llmForm.llmApiKey}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  testing || !llmForm.llmApiKey
                    ? 'border-theme-border text-offer-muted cursor-not-allowed opacity-50'
                    : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10'
                }`}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              {llmSaved && <span className="text-sm text-emerald-400">配置已保存</span>}
            </div>

            {testResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                {testResult.msg}
              </div>
            )}

            {llmForm.llmProvider === 'custom' && (
              <p className="text-xs text-offer-muted">选择「自定义」后请自行填写 API 地址和模型名称。</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 sticky bottom-4 z-10 rounded-2xl border border-theme-border bg-black/30 p-3 backdrop-blur-xl w-fit">
          <button onClick={handleSave} className="btn-gradient px-6 py-2.5 rounded-xl text-white font-medium text-sm">
            保存设置
          </button>
          {saved && <span className="text-sm text-emerald-400">设置已保存</span>}
        </div>
      </div>
    </div>
  )
}
