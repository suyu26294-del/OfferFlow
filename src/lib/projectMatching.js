export function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean)
  if (!value) return []
  return String(value)
    .split(/[，,、;；\n\t]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function normalize(value) {
  return String(value || '').toLowerCase()
}

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)))
}

export function projectToSearchText(project = {}) {
  return [
    project.title,
    project.role,
    project.period,
    project.techStack,
    project.scenario,
    project.summary,
    project.content,
    ...(project.tags || []),
    ...(project.highlights || []),
    ...(project.challenges || []),
    ...(project.metrics || []),
    ...(project.risks || []),
    ...(project.interviewQas || []).flatMap((qa) => [qa.question, qa.answer]),
  ].filter(Boolean).join(' ')
}

export function jobToSearchText(job = {}) {
  return [
    job.companyName,
    job.jobTitle,
    job.city,
    job.salaryRange,
    job.workMode,
    job.channel,
    job.priority,
    job.jdText,
    job.notes,
    job.nextAction,
  ].filter(Boolean).join(' ')
}

const BASE_TECH_KEYWORDS = [
  '嵌入式', 'linux', '驱动', 'bsp', 'rtos', 'freertos', 'stm32', 'arm', 'c++', 'c语言', 'python',
  'uart', 'i2c', 'spi', 'can', 'dma', 'pcie', '以太网', 'bootloader', 'kernel', 'v4l2', 'alsa',
  'ffmpeg', 'h.264', 'rtsp', 'ai', 'yolo', '模型部署', 'ascend', 'acl', 'dvpp', 'qt', '数据库',
]

export function extractKeywordsFromText(text, extraKeywords = []) {
  const normalized = normalize(text)
  const keywordPool = uniq([
    ...BASE_TECH_KEYWORDS,
    ...splitList(extraKeywords),
    ...(String(text || '').match(/[A-Za-z][A-Za-z0-9+#./-]{1,24}/g) || []),
    ...(String(text || '').match(/[\u4e00-\u9fa5]{2,10}/g) || []),
  ])

  return uniq(keywordPool.filter((keyword) => normalized.includes(normalize(keyword))))
    .slice(0, 80)
}

export function scoreProjectForJob(project, job, options = {}) {
  const jobText = jobToSearchText(job)
  const projectText = projectToSearchText(project)
  const jobKeywords = extractKeywordsFromText(jobText, options.extraKeywords)
  const projectKeywords = extractKeywordsFromText(projectText, options.extraKeywords)
  const projectNorm = normalize(projectText)
  const jobNorm = normalize(jobText)

  const keywordHits = uniq(jobKeywords.filter((kw) => projectNorm.includes(normalize(kw))))
  const reverseHits = uniq(projectKeywords.filter((kw) => jobNorm.includes(normalize(kw)))).slice(0, 12)
  const titleHit = normalize(project.title).split(/[\s/|｜：:-]+/).some((part) => part && jobNorm.includes(part))

  let score = 38
  score += Math.min(42, keywordHits.length * 6)
  score += Math.min(10, reverseHits.length * 2)
  if (titleHit) score += 6
  if (project.summary && project.summary.length > 40) score += 4
  if ((project.metrics || []).length > 0) score += 4
  if ((project.interviewQas || []).length > 0) score += 3

  score = Math.max(0, Math.min(100, Math.round(score)))

  const reasons = []
  if (keywordHits.length) reasons.push(`命中 JD/岗位关键词：${keywordHits.slice(0, 8).join('、')}`)
  if ((project.metrics || []).length) reasons.push('项目包含可量化指标，适合简历和面试展开')
  if ((project.interviewQas || []).length) reasons.push('项目已沉淀面试问答，便于快速准备')
  if (!reasons.length) reasons.push('关键词命中较少，需要补充项目与岗位的连接表达')

  const gaps = []
  if (!project.content || project.content.length < 80) gaps.push('项目正文偏少，建议补充技术架构、难点和 Debug 记录')
  if (!(project.metrics || []).length) gaps.push('缺少量化指标，简历表达说服力不足')
  if (!(project.risks || []).length) gaps.push('缺少面试风险点，容易被追问时准备不足')

  return {
    projectId: project.id,
    title: project.title,
    score,
    keywordHits,
    reverseHits,
    reasons,
    gaps,
    recommendation: score >= 82 ? '主推项目' : score >= 68 ? '可作为支撑项目' : score >= 55 ? '谨慎使用，需改写表达' : '暂不优先推荐',
  }
}

export function rankProjectsForJob(projects = [], job = {}, options = {}) {
  return projects
    .map((project) => scoreProjectForJob(project, job, options))
    .sort((a, b) => b.score - a.score)
}

export function buildProjectInterviewTips(project, job) {
  const match = scoreProjectForJob(project, job)
  const tips = [
    `先用 20 秒说明项目背景与个人职责，再把 ${match.keywordHits.slice(0, 3).join('、') || '核心技术'} 和岗位 JD 对齐。`,
    '准备 1 个架构图口述、1 个性能/稳定性指标、1 个真实 Debug 案例。',
    '主动说明边界：哪些是自己独立完成，哪些是团队协作或参考方案。',
  ]
  return tips
}
