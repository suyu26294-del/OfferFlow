'use client'
import { memo, useMemo, useState } from 'react'
import { useApp } from '../store/AppContext'
import ProjectDocModal from '../components/ProjectDocModal'
import ConfirmDialog from '../components/ConfirmDialog'
import { rankProjectsForJob, buildProjectInterviewTips } from '../lib/projectMatching'
import { llmHeadersFromStorage } from '../lib/clientLlmConfig'

function scoreClass(score) {
  if (score >= 82) return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
  if (score >= 68) return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300'
  if (score >= 55) return 'border-amber-400/30 bg-amber-500/10 text-amber-300'
  return 'border-red-400/30 bg-red-500/10 text-red-300'
}

const ProjectCard = memo(function ProjectCard({ project, match, selected, onSelect, onEdit, onDelete }) {
  const tips = match ? buildProjectInterviewTips(project, {}).slice(0, 2) : []
  return (
    <div onClick={() => onSelect(project)} className={`card-modern card-hover cursor-pointer overflow-hidden ${selected ? 'ring-1 ring-purple-400/70' : ''}`}>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{project.title}</h3>
            <p className="text-xs text-offer-muted mt-1">{project.role || '未填写职责'} {project.period ? `· ${project.period}` : ''}</p>
          </div>
          {match && <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${scoreClass(match.score)}`}>{match.score}</span>}
        </div>

        <p className="text-sm text-offer-muted leading-6 line-clamp-3">{project.summary || project.content || '暂无摘要，建议补充项目背景、职责、技术实现和结果。'}</p>

        <div className="flex flex-wrap gap-1.5">
          {(project.tags || []).slice(0, 6).map((tag) => <span key={tag} className="text-[10px] rounded-full bg-white/[0.05] border border-white/10 px-2 py-0.5 text-white/60">{tag}</span>)}
          {project.techStack && String(project.techStack).split(/[，,、;；\s]+/).filter(Boolean).slice(0, 5).map((tag) => <span key={tag} className="text-[10px] rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-purple-300">{tag}</span>)}
        </div>

        {match && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">{match.recommendation}</p>
              <p className="text-[11px] text-offer-muted">命中 {match.keywordHits?.length || 0} 个关键词</p>
            </div>
            <ul className="space-y-1">
              {(match.reasons || []).slice(0, 2).map((r, idx) => <li key={idx} className="text-xs text-white/65 leading-relaxed">• {r}</li>)}
              {tips.map((tip, idx) => <li key={`tip-${idx}`} className="text-xs text-cyan-200/75 leading-relaxed">• {tip}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="亮点" value={(project.highlights || []).length} />
          <MiniStat label="指标" value={(project.metrics || []).length} />
          <MiniStat label="问答" value={(project.interviewQas || []).length} />
        </div>
      </div>
      <div className="flex border-t border-white/[0.06] px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <ActionBtn label="编辑" onClick={() => onEdit(project)} />
        <ActionBtn label="删除" danger onClick={() => onDelete(project)} />
      </div>
    </div>
  )
})

export default function Projects() {
  const { projectDocs, jobs, addToast, deleteProjectDoc } = useApp()
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('全部')
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id || '')
  const [selectedProject, setSelectedProject] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState(null)
  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) || jobs[0] || null, [jobs, selectedJobId])

  const tags = useMemo(() => {
    const set = new Set()
    projectDocs.forEach((p) => (p.tags || []).forEach((tag) => set.add(tag)))
    return ['全部', ...Array.from(set)]
  }, [projectDocs])

  const ranked = useMemo(() => selectedJob ? rankProjectsForJob(projectDocs, selectedJob) : [], [projectDocs, selectedJob])
  const matchMap = useMemo(() => Object.fromEntries(ranked.map((m) => [m.projectId, m])), [ranked])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projectDocs.filter((p) => {
      if (activeTag !== '全部' && !(p.tags || []).includes(activeTag)) return false
      if (!q) return true
      const text = [p.title, p.role, p.techStack, p.summary, p.content, ...(p.tags || [])].join(' ').toLowerCase()
      return text.includes(q)
    }).sort((a, b) => (matchMap[b.id]?.score || 0) - (matchMap[a.id]?.score || 0))
  }, [projectDocs, activeTag, search, matchMap])

  const handleAiMatch = async () => {
    if (!selectedJob) { addToast('请先选择岗位', 'error'); return }
    if (aiLoading) return
    setAiLoading(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/ai/jd-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...llmHeadersFromStorage() },
        body: JSON.stringify({ jobId: selectedJob.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI 匹配失败')
      setAiResult(data.analysis)
      addToast(data.analysis.mode === 'ai' ? 'AI 项目匹配完成' : '已生成本地项目匹配结果', 'success')
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingProject) return
    const ok = await deleteProjectDoc(deletingProject.id)
    if (ok !== false) addToast('项目已删除', 'success')
    setDeletingProject(null)
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">项目库</h1>
          <p className="text-sm text-gray-400 dark:text-white/45 mt-1">沉淀项目深挖材料，并针对岗位自动匹配主推项目</p>
        </div>
        <button onClick={() => { setEditingProject(null); setModalOpen(true) }} className="btn-gradient px-4 py-2.5 text-sm">
          新增项目
        </button>
      </div>

      <div className="card-modern p-5 mb-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_auto] gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索项目、技术栈、正文..." className="min-h-[40px] rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20" />
          <select value={selectedJob?.id || ''} onChange={(e) => setSelectedJobId(e.target.value)} className="min-h-[40px] rounded-xl border border-theme-border bg-theme-card px-4 py-2.5 text-sm text-theme-text outline-none focus:border-purple-400/70 focus:ring-2 focus:ring-purple-500/20">
            {jobs.length === 0 && <option value="">暂无岗位</option>}
            {jobs.map((job) => <option key={job.id} value={job.id}>{job.companyName} · {job.jobTitle}</option>)}
          </select>
          <button onClick={handleAiMatch} disabled={aiLoading || !selectedJob} className="btn-secondary px-4 py-2.5 text-sm whitespace-nowrap disabled:opacity-50">
            {aiLoading ? 'AI 匹配中...' : 'AI 匹配项目'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => <button key={tag} onClick={() => setActiveTag(tag)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${activeTag === tag ? 'border-purple-400/60 bg-purple-600/25 text-white' : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'}`}>{tag}</button>)}
        </div>
      </div>

      {aiResult && (
        <div className="card-modern p-5 mb-5 border-purple-400/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-purple-300/80 mb-1">AI JD 分析 / 项目匹配</p>
              <h2 className="text-xl font-semibold text-white">{selectedJob?.companyName} · {selectedJob?.jobTitle}</h2>
              <p className="text-sm text-offer-muted mt-1">{aiResult.summary}</p>
            </div>
            <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-4 py-2 text-lg font-bold text-purple-200">{aiResult.overallScore || '-'} 分</span>
          </div>
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <InfoList title="项目推荐" items={(aiResult.projectMatches || []).slice(0, 4).map((m) => `${m.title}：${m.score}分，${m.recommendation}`)} />
            <InfoList title="简历建议" items={[aiResult.resumeSuggestion, ...(aiResult.resumeCandidates || []).map((r) => `${r.name}：${r.score}分`)].filter(Boolean)} />
            <InfoList title="准备动作" items={aiResult.actionPlan || []} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((project) => <ProjectCard key={project.id} project={project} match={matchMap[project.id]} selected={selectedProject?.id === project.id} onSelect={setSelectedProject} onEdit={(p) => { setEditingProject(p); setModalOpen(true) }} onDelete={setDeletingProject} />)}
          {filtered.length === 0 && <div className="card-modern py-16 text-center text-sm text-offer-muted md:col-span-2">暂无项目材料，点击“新增项目”或上传项目文档。</div>}
        </div>

        <aside className="card-modern p-5 h-fit lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold text-white mb-2">项目深挖预览</h2>
          {selectedProject ? <ProjectPreview project={selectedProject} match={matchMap[selectedProject.id]} /> : <p className="text-sm text-offer-muted leading-6">选择左侧项目后，这里会显示技术亮点、指标、风险和面试准备要点。</p>}
        </aside>
      </div>

      <ProjectDocModal open={modalOpen} project={editingProject} onClose={() => { setModalOpen(false); setEditingProject(null) }} />
      <ConfirmDialog open={!!deletingProject} title="确认删除项目" message="确定删除这个项目材料吗？此操作不可恢复。" onConfirm={confirmDelete} onCancel={() => setDeletingProject(null)} />
    </div>
  )
}

function ProjectPreview({ project, match }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">{project.title}</p>
        <p className="text-xs text-offer-muted mt-1">{project.techStack || '未填写技术栈'}</p>
      </div>
      {match && <div className={`rounded-2xl border p-3 ${scoreClass(match.score)}`}><p className="text-sm font-semibold">岗位匹配度 {match.score}</p><p className="text-xs mt-1 opacity-80">{match.recommendation}</p></div>}
      <InfoList title="核心亮点" items={project.highlights || []} />
      <InfoList title="量化指标" items={project.metrics || []} />
      <InfoList title="风险点" items={project.risks || []} />
      <InfoList title="匹配理由" items={match?.reasons || []} />
    </div>
  )
}

function InfoList({ title, items }) {
  const list = (items || []).filter(Boolean)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs font-semibold text-white/70 mb-2">{title}</p>
      {list.length ? <ul className="space-y-1.5">{list.slice(0, 6).map((item, idx) => <li key={idx} className="text-xs leading-relaxed text-white/60">• {item}</li>)}</ul> : <p className="text-xs text-offer-muted">暂无</p>}
    </div>
  )
}

function MiniStat({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2"><p className="text-[10px] text-offer-muted">{label}</p><p className="text-sm font-semibold text-white">{value}</p></div>
}

function ActionBtn({ label, onClick, danger }) {
  return <button onClick={onClick} className={`flex-1 rounded-lg py-2 text-xs transition-colors ${danger ? 'text-red-300 hover:bg-red-500/10' : 'text-offer-muted hover:bg-white/[0.05] hover:text-white'}`}>{label}</button>
}
