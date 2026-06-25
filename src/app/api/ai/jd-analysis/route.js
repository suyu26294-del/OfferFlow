import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import { callLLMWithRetry } from '@/lib/llm/client'
import { evaluateJob } from '@/lib/jobScoring'
import { rankProjectsForJob } from '@/lib/projectMatching'

function pickLlmConfig(request) {
  const config = {
    apiKey: request.headers.get('x-llm-api-key') || undefined,
    baseUrl: request.headers.get('x-llm-base-url') || undefined,
    model: request.headers.get('x-llm-model') || undefined,
    provider: request.headers.get('x-llm-provider') || undefined,
  }
  return Object.values(config).some(Boolean) ? config : undefined
}

function fallbackAnalysis({ job, settings, projects, resumes }) {
  const scoring = evaluateJob(job, settings || {})
  const projectMatches = rankProjectsForJob(projects, job).slice(0, 6)
  const resumeCandidates = resumes.map((resume) => {
    const text = [resume.name, resume.target, resume.targetJobTypes, resume.coreSkills, resume.jdKeywords, ...(resume.tags || [])].filter(Boolean).join(' ').toLowerCase()
    const jobText = [job.jobTitle, job.jdText, job.notes].filter(Boolean).join(' ').toLowerCase()
    const hits = Array.from(new Set(String(text).split(/[，,、;；\s]+/).filter((kw) => kw && kw.length > 1 && jobText.includes(kw.toLowerCase()))))
    const score = Math.min(100, 45 + hits.length * 8 + (resume.isDefault ? 5 : 0))
    return { resumeId: resume.id, name: resume.name, score, reasons: hits.length ? [`命中关键词：${hits.slice(0, 6).join('、')}`] : ['可作为通用备选，但需要针对 JD 调整'] }
  }).sort((a, b) => b.score - a.score).slice(0, 3)

  return {
    mode: 'local',
    overallScore: scoring.score,
    summary: scoring.level.summary,
    advantages: scoring.reasons.slice(0, 6),
    risks: scoring.risks.slice(0, 6),
    resumeSuggestion: resumeCandidates[0] ? `优先使用「${resumeCandidates[0].name}」，再根据 JD 强化 ${projectMatches[0]?.title || '最匹配项目'}。` : '暂无简历版本，请先在简历舱补充简历。',
    resumeCandidates,
    projectMatches,
    interviewQuestions: [
      '请介绍一个和该岗位最相关的项目，并说明你的个人职责。',
      '项目中最难定位的一次问题是什么，你如何 Debug？',
      '如果把该项目落到真实生产环境，你会如何保证稳定性和可维护性？',
      '该岗位 JD 中最核心的技术点，你在项目里如何体现？',
    ],
    actionPlan: [
      '补全 JD 原文和岗位备注，让评分和 AI 分析更准确。',
      '选择 1 个主推项目 + 1 个支撑项目，准备 2 分钟口述。',
      '把简历版本中的关键词调整到与 JD 高度一致。',
    ],
  }
}

function buildPrompt({ job, settings, projects, resumes, localAnalysis }) {
  const compactProjects = projects.slice(0, 12).map((p) => ({
    id: p.id, title: p.title, role: p.role, period: p.period, techStack: p.techStack,
    scenario: p.scenario, summary: p.summary, highlights: p.highlights, metrics: p.metrics, risks: p.risks,
    content: String(p.content || '').slice(0, 2200), tags: p.tags,
  }))
  const compactResumes = resumes.map((r) => ({
    id: r.id, name: r.name, version: r.version, target: r.target, tags: r.tags,
    scenario: r.scenario, targetJobTypes: r.targetJobTypes, coreSkills: r.coreSkills,
    jdKeywords: r.jdKeywords, deliveryStrategy: r.deliveryStrategy,
  }))

  return {
    system: `你是资深秋招求职顾问和嵌入式/系统软件面试官。请基于岗位 JD、用户简历版本、项目库和本地评分，输出可执行的求职决策分析。必须输出严格 JSON，不要包含任何 Markdown 或解释性前后缀。`,
    user: `请严格输出下面 JSON schema：
{
  "mode": "ai",
  "overallScore": 0-100,
  "summary": "一句话结论",
  "advantages": ["匹配优势"],
  "risks": ["风险点"],
  "resumeSuggestion": "推荐使用哪份简历及如何微调",
  "resumeCandidates": [{"resumeId":"id", "name":"简历名", "score":0-100, "reasons":["理由"]}],
  "projectMatches": [{"projectId":"id", "title":"项目名", "score":0-100, "recommendation":"主推/支撑/谨慎", "reasons":["匹配理由"], "gaps":["需要补强"]}],
  "interviewQuestions": ["预测面试问题"],
  "actionPlan": ["下一步准备动作"]
}

岗位：
${JSON.stringify(job, null, 2)}

用户评分标准：
${JSON.stringify(settings, null, 2)}

本地初步分析：
${JSON.stringify(localAnalysis, null, 2)}

简历版本：
${JSON.stringify(compactResumes, null, 2)}

项目库：
${JSON.stringify(compactProjects, null, 2)}

要求：
1. projectMatches 必须从项目库中选择，不要编造 projectId。
2. resumeCandidates 必须从简历版本中选择，不要编造 resumeId。
3. 输出要偏实用，能指导简历修改、项目选择和面试准备。
4. 如果 JD 信息不足，请明确提醒补充 JD 原文。`,
  }
}

export async function POST(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const body = await request.json()
    const { jobId, job: jobPayload } = body

    let job = jobPayload
    if (jobId) {
      job = await prisma.job.findFirst({ where: { id: jobId, userId: user.id } })
    }
    if (!job) return NextResponse.json({ error: '缺少岗位信息' }, { status: 400 })

    const [dbUser, projects, resumes] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { settings: true } }),
      prisma.projectDoc.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
      prisma.resume.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
    ])

    const settings = dbUser?.settings || {}
    const localAnalysis = fallbackAnalysis({ job, settings, projects, resumes })
    const llmConfig = pickLlmConfig(request)

    try {
      const { system, user: userPrompt } = buildPrompt({ job, settings, projects, resumes, localAnalysis })
      const llm = await callLLMWithRetry({ systemPrompt: system, userPrompt, llmConfig, timeoutMs: 70000 })
      const parsed = JSON.parse(llm.content)
      return NextResponse.json({ analysis: { ...localAnalysis, ...parsed, mode: 'ai' }, metadata: { model: llm.model, analyzedAt: new Date().toISOString() } })
    } catch (err) {
      console.warn('[ai/jd-analysis] falling back to local analysis:', err.message)
      return NextResponse.json({ analysis: localAnalysis, metadata: { model: 'local-fallback', analyzedAt: new Date().toISOString(), warning: err.message } })
    }
  } catch (err) {
    console.error('[ai/jd-analysis]', err)
    return NextResponse.json({ error: 'JD 分析失败，请稍后重试' }, { status: 500 })
  }
}
