'use client'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import ModalHeader from './ModalHeader'
import GlowCard from './GlowCard'

const emptyForm = {
  title: '',
  role: '',
  period: '',
  techStack: '',
  scenario: '',
  summary: '',
  content: '',
  highlights: [],
  challenges: [],
  metrics: [],
  risks: [],
  interviewQas: [],
  tags: [],
  fileName: '',
  fileType: '',
  sourceType: 'manual',
}

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : (value || '')
}

function textToList(value) {
  return String(value || '').split(/[\n；;]+/).map((v) => v.trim()).filter(Boolean)
}

function normalizeProject(form) {
  return {
    ...form,
    highlights: textToList(form.highlightsText),
    challenges: textToList(form.challengesText),
    metrics: textToList(form.metricsText),
    risks: textToList(form.risksText),
    tags: String(form.tagsText || '').split(/[，,、;；\n\t]+/).map((v) => v.trim()).filter(Boolean),
    interviewQas: textToList(form.qaText).map((item) => {
      const [question, ...answerParts] = item.split(/[:：]/)
      return { question: question?.trim() || item, answer: answerParts.join('：').trim() }
    }),
  }
}

function toForm(project) {
  const source = project ? { ...emptyForm, ...project } : { ...emptyForm }
  return {
    ...source,
    highlightsText: listToText(source.highlights),
    challengesText: listToText(source.challenges),
    metricsText: listToText(source.metrics),
    risksText: listToText(source.risks),
    tagsText: listToText(source.tags).replace(/\n/g, ', '),
    qaText: Array.isArray(source.interviewQas) ? source.interviewQas.map((qa) => `${qa.question || ''}${qa.answer ? `：${qa.answer}` : ''}`).join('\n') : '',
  }
}

export default function ProjectDocModal({ open, project, onClose }) {
  const { addToast, addProjectDoc, updateProjectDoc } = useApp()
  const [form, setForm] = useState(() => toForm(project))
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(toForm(project))
  }, [open, project])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const filled = useMemo(() => {
    const count = ['summary', 'content', 'techStack', 'metricsText', 'risksText', 'qaText'].filter((k) => String(form[k] || '').trim()).length
    return Math.round((count / 6) * 100)
  }, [form])

  const importFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const data = new FormData()
      data.append('file', file)
      const res = await fetch('/api/project-docs/import', { method: 'POST', body: data })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || '解析失败')
      setForm((prev) => ({
        ...prev,
        title: prev.title || result.title,
        content: result.content,
        fileName: result.fileName,
        fileType: result.fileType,
        sourceType: result.sourceType || 'upload',
      }))
      addToast('项目文档已解析，请补充职责、技术栈和量化指标', 'success')
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (saving) return
    if (!form.title.trim()) { addToast('请输入项目名称', 'error'); return }
    setSaving(true)
    const payload = normalizeProject(form)
    try {
      if (project) await updateProjectDoc(project.id, payload)
      else await addProjectDoc(payload)
      addToast(project ? '项目已更新' : '项目已加入项目库', 'success')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm modal-overlay" onClick={onClose}>
      <div className="modal-panel border w-full max-w-4xl mx-4 max-h-[90vh] min-h-0 flex flex-col shadow-2xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
        <GlowCard style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }} className="rounded-[22px] w-full max-w-full min-w-0 flex flex-col flex-1">
          <div className="bg-white/90 backdrop-blur-xl dark:bg-transparent dark:backdrop-filter-none rounded-[22px] w-full max-w-full min-w-0 flex flex-col flex-1 min-h-0">
            <ModalHeader title={project ? '编辑项目材料' : '新增项目材料'} onClose={onClose} />
            <div className="flex-1 overflow-y-auto p-5 pt-6 pb-7 space-y-5">
              <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">项目完整度 {filled}%</p>
                  <p className="text-xs text-offer-muted mt-1">建议至少补齐：背景/职责、技术栈、核心实现、指标、风险点、面试问答。</p>
                </div>
                <label className="btn-secondary cursor-pointer text-sm px-4 py-2 rounded-xl">
                  {importing ? '解析中...' : '上传/解析项目文档'}
                  <input type="file" accept=".docx,.txt,.md,.json,.csv,text/*" className="hidden" onChange={importFile} disabled={importing} />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="项目名称 *"><input value={form.title} onChange={set('title')} placeholder="例如：MediaStream 嵌入式 Linux 音视频低延迟系统" className="input-light" /></Field>
                <Field label="个人职责"><input value={form.role} onChange={set('role')} placeholder="例如：负责采集链路、线程模型与低延迟优化" className="input-light" /></Field>
                <Field label="项目时间"><input value={form.period} onChange={set('period')} placeholder="2026.01 - 2026.03" className="input-light" /></Field>
                <Field label="项目类型/场景"><input value={form.scenario} onChange={set('scenario')} placeholder="嵌入式 Linux / BSP / RTOS / AI部署" className="input-light" /></Field>
              </div>

              <Field label="技术栈关键词"><input value={form.techStack} onChange={set('techStack')} placeholder="V4L2, ALSA, H.264, RTSP, 多线程队列, 环形缓冲" className="input-light" /></Field>
              <Field label="项目一句话摘要"><textarea rows={2} value={form.summary} onChange={set('summary')} placeholder="用 1-2 句话说明项目解决了什么问题、你做了什么、结果如何。" className="textarea-light" /></Field>
              <Field label="项目正文 / 技术实现 / Debug 记录"><textarea rows={8} value={form.content} onChange={set('content')} placeholder="可以粘贴完整项目文档，后续 AI 会基于这里和 JD 做项目匹配。" className="textarea-light" /></Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="核心亮点（每行一条）"><textarea rows={4} value={form.highlightsText} onChange={set('highlightsText')} className="textarea-light" /></Field>
                <Field label="技术难点/挑战（每行一条）"><textarea rows={4} value={form.challengesText} onChange={set('challengesText')} className="textarea-light" /></Field>
                <Field label="量化指标（每行一条）"><textarea rows={4} value={form.metricsText} onChange={set('metricsText')} placeholder="例如：端到端延迟控制在 300ms 内；72h 稳定运行" className="textarea-light" /></Field>
                <Field label="面试风险点（每行一条）"><textarea rows={4} value={form.risksText} onChange={set('risksText')} placeholder="例如：视频编码是否真实实现；性能数据如何复测" className="textarea-light" /></Field>
              </div>

              <Field label="项目面试问答（每行：问题：回答）"><textarea rows={4} value={form.qaText} onChange={set('qaText')} className="textarea-light" /></Field>
              <Field label="标签"><input value={form.tagsText} onChange={set('tagsText')} placeholder="嵌入式, Linux, 驱动, 音视频" className="input-light" /></Field>
              {form.fileName && <p className="text-xs text-offer-muted">已关联来源文件：{form.fileName}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-theme-border px-5 py-4">
              <button onClick={onClose} className="btn-secondary px-4 py-2 rounded-xl text-sm">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-gradient px-5 py-2 rounded-xl text-sm text-white disabled:opacity-50">{saving ? '保存中...' : '保存项目'}</button>
            </div>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-offer-muted block mb-1.5">{label}</span>{children}</label>
}
