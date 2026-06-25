export const DEFAULT_SCORING_CONFIG = {
  enabled: true,
  profileName: 'Lio 求职决策评分',
  preferredCities: '天津, 济南',
  acceptableCities: '北京, 西安, 青岛, 烟台, 德州',
  targetKeywords: '嵌入式, 嵌入式Linux, C/C++, C++, Linux, BSP, 驱动, RTOS, FreeRTOS, STM32, ARM, 固件, 系统软件, 通信, CAN, UART, I2C, SPI, DMA, PCIe, 以太网, BMC, BIOS',
  strongKeywords: '嵌入式Linux, BSP, 驱动开发, Linux驱动, FreeRTOS, STM32H743, ARM, CAN, I2C, SPI, UART, DMA, PCIe, 以太网, Bring-up, 板级调试, BMC, BIOS',
  avoidKeywords: '销售, 运营, 客服, 纯前端, 低代码, 外包, 长期出差, 长驻现场, 996, 007, 大小周, 高强度加班, 末位淘汰',
  preferredOrgKeywords: '央企, 国企, 国资, 研究院, 事业单位, 交通, 铁路, 中车, 中铁, 中国移动, 中国联通, 中国电信, 中国电科, 航天, 航空, 兵器, 军工, 电网, 国家',
  privateOrgKeywords: '互联网, 字节, 阿里, 腾讯, 美团, 京东, 拼多多, 华为, 小米, 大疆, 蔚来, 理想, 小鹏, 民企, 私企, startup, 创业',
  publicSalaryFloorWan: 15,
  privateSalaryFloorWan: 25,
  weights: {
    city: 18,
    org: 18,
    salary: 16,
    role: 24,
    workLife: 14,
    status: 10,
  },
}

export function normalizeScoringConfig(settings = {}) {
  const incoming = settings.jobScoring || {}
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...incoming,
    weights: {
      ...DEFAULT_SCORING_CONFIG.weights,
      ...(incoming.weights || {}),
    },
  }
}

export function splitKeywords(value) {
  if (!value) return []
  return String(value)
    .split(/[，,、;；\n\t]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function toText(job = {}) {
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
  ].filter(Boolean).join(' ').toLowerCase()
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)))
}

function matchKeywords(text, keywords) {
  const normalized = normalizeText(text)
  return unique(keywords.filter((keyword) => normalized.includes(keyword.toLowerCase())))
}

function clampScore(score) {
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function parseSalaryWan(salaryRange) {
  const text = String(salaryRange || '').replace(/\s+/g, '')
  if (!text) return null

  const yearly = text.match(/(\d+(?:\.\d+)?)\s*[万wW]/)
  if (yearly) return Number(yearly[1])

  const monthlyMatches = [...text.matchAll(/(\d+(?:\.\d+)?)(?:k|K|千)/g)].map((m) => Number(m[1]))
  if (monthlyMatches.length) {
    const avgMonthlyK = monthlyMatches.reduce((sum, value) => sum + value, 0) / monthlyMatches.length
    const monthsMatch = text.match(/[x×*](\d{1,2})|([1-2]?\d)薪/)
    const months = monthsMatch ? Number(monthsMatch[1] || monthsMatch[2]) : 12
    return (avgMonthlyK * months) / 10
  }

  const plainRange = text.match(/(\d+(?:\.\d+)?)[-~—至](\d+(?:\.\d+)?)/)
  if (plainRange) {
    const avg = (Number(plainRange[1]) + Number(plainRange[2])) / 2
    return avg > 1000 ? avg / 10000 : avg
  }

  return null
}

function inferOrgType(job, config) {
  const text = toText(job)
  const publicHits = matchKeywords(text, splitKeywords(config.preferredOrgKeywords))
  const privateHits = matchKeywords(text, splitKeywords(config.privateOrgKeywords))

  if (publicHits.length > 0) return { type: 'public', label: '央国企/稳定单位倾向', hits: publicHits }
  if (privateHits.length > 0) return { type: 'private', label: '私企/互联网倾向', hits: privateHits }
  return { type: 'unknown', label: '单位性质未知', hits: [] }
}

function scoreCity(job, config) {
  const city = normalizeText(job.city)
  const preferred = splitKeywords(config.preferredCities)
  const acceptable = splitKeywords(config.acceptableCities)
  const preferredHits = matchKeywords(city, preferred)
  const acceptableHits = matchKeywords(city, acceptable)

  if (!city) return { score: 55, hits: [], reasons: ['城市未填写，暂按中性分处理'] }
  if (preferredHits.length) return { score: 100, hits: preferredHits, reasons: [`命中优先城市：${preferredHits.join('、')}`] }
  if (acceptableHits.length) return { score: 78, hits: acceptableHits, reasons: [`属于可接受城市：${acceptableHits.join('、')}`] }
  return { score: 42, hits: [], reasons: ['城市不在当前优先/可接受列表中'] }
}

function scoreOrg(job, config) {
  const org = inferOrgType(job, config)
  if (org.type === 'public') return { score: 96, hits: org.hits, reasons: [`单位信息命中稳定偏好：${org.hits.join('、')}`], orgType: org }
  if (org.type === 'private') return { score: 68, hits: org.hits, reasons: [`识别为私企/互联网倾向：${org.hits.join('、')}`], orgType: org }
  return { score: 60, hits: [], reasons: ['单位性质信息不足，建议在备注或 JD 中补充央企/国企/私企等关键词'], orgType: org }
}

function scoreSalary(job, config, orgType) {
  const annualWan = parseSalaryWan(job.salaryRange)
  const floor = orgType?.type === 'public' ? Number(config.publicSalaryFloorWan) : Number(config.privateSalaryFloorWan)
  const targetFloor = Number.isFinite(floor) && floor > 0 ? floor : 20

  if (!annualWan) {
    return { score: 58, annualWan: null, floor: targetFloor, reasons: ['薪资未填写或无法解析，暂按中性偏低分处理'] }
  }

  const ratio = annualWan / targetFloor
  let score = 0
  if (ratio >= 1.25) score = 100
  else if (ratio >= 1) score = 88
  else if (ratio >= 0.85) score = 72
  else if (ratio >= 0.7) score = 52
  else score = 35

  return {
    score,
    annualWan: Number(annualWan.toFixed(1)),
    floor: targetFloor,
    reasons: [`估算年包约 ${annualWan.toFixed(1)} 万，对比当前红线 ${targetFloor} 万`],
  }
}

function scoreRole(job, config) {
  const text = toText(job)
  const targetHits = matchKeywords(text, splitKeywords(config.targetKeywords))
  const strongHits = matchKeywords(text, splitKeywords(config.strongKeywords))

  const score = clampScore(45 + targetHits.length * 7 + strongHits.length * 8)
  const reasons = []
  if (strongHits.length) reasons.push(`强匹配技术关键词：${strongHits.slice(0, 8).join('、')}`)
  if (targetHits.length && !strongHits.length) reasons.push(`匹配目标方向关键词：${targetHits.slice(0, 8).join('、')}`)
  if (!targetHits.length && !strongHits.length) reasons.push('JD/岗位名称暂未命中目标技术关键词')

  return { score, hits: unique([...strongHits, ...targetHits]), reasons }
}

function scoreWorkLife(job, config) {
  const text = toText(job)
  const avoidHits = matchKeywords(text, splitKeywords(config.avoidKeywords))
  const remoteText = normalizeText(job.workMode)
  let score = 82
  const reasons = []

  if (avoidHits.length) {
    score -= Math.min(55, avoidHits.length * 18)
    reasons.push(`命中风险关键词：${avoidHits.join('、')}`)
  }

  if (remoteText.includes('remote') || remoteText.includes('hybrid') || remoteText.includes('弹性')) {
    score += 8
    reasons.push('工作模式相对灵活')
  }

  if (!avoidHits.length) reasons.push('暂未发现明显加班/出差/外包等风险词')

  return { score: clampScore(score), hits: avoidHits, reasons }
}

function scoreStatus(job) {
  const map = {
    'Offer': 96,
    '终面中': 88,
    '三面中': 82,
    '二面中': 76,
    '一面中': 70,
    'OA / 笔试': 62,
    '已投递': 56,
    '准备投递': 70,
    '感兴趣': 64,
    '已结束': 18,
  }
  const score = map[job.status] ?? 55
  return { score, reasons: [`当前流程状态：${job.status || '未填写'}`] }
}

export function evaluateJob(job = {}, settings = {}) {
  const config = normalizeScoringConfig(settings)
  const city = scoreCity(job, config)
  const org = scoreOrg(job, config)
  const salary = scoreSalary(job, config, org.orgType)
  const role = scoreRole(job, config)
  const workLife = scoreWorkLife(job, config)
  const status = scoreStatus(job)

  const dimensions = { city, org, salary, role, workLife, status }
  const weights = config.weights || DEFAULT_SCORING_CONFIG.weights
  const totalWeight = Object.entries(weights).reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0) || 1
  const total = Object.entries(dimensions).reduce((sum, [key, value]) => {
    const weight = Math.max(0, Number(weights[key]) || 0)
    return sum + value.score * weight
  }, 0)

  const score = clampScore(total / totalWeight)
  const level = getScoreLevel(score)
  const reasons = buildReasonList(dimensions)
  const risks = buildRiskList(dimensions, job)
  const suggestions = buildSuggestionList(dimensions, job)

  return {
    score,
    level,
    dimensions,
    reasons,
    risks,
    suggestions,
    config,
  }
}

export function getScoreLevel(score) {
  if (score >= 85) return { label: '强烈推荐', tone: 'emerald', summary: '匹配度很高，建议优先投递/推进' }
  if (score >= 72) return { label: '推荐关注', tone: 'cyan', summary: '整体匹配较好，可以重点准备' }
  if (score >= 60) return { label: '谨慎评估', tone: 'amber', summary: '有匹配点，但需要核实风险' }
  return { label: '不建议优先', tone: 'red', summary: '当前匹配度偏低，建议降低优先级' }
}

function buildReasonList(dimensions) {
  return unique([
    ...dimensions.city.reasons,
    ...dimensions.org.reasons,
    ...dimensions.salary.reasons,
    ...dimensions.role.reasons,
  ]).slice(0, 6)
}

function buildRiskList(dimensions, job) {
  const risks = []
  if (dimensions.city.score < 60) risks.push('城市与当前求职偏好不匹配')
  if (dimensions.salary.score < 60) risks.push('薪资可能低于当前红线或信息不足')
  if (dimensions.role.score < 60) risks.push('技术方向匹配度不高，需要确认 JD 核心职责')
  if (dimensions.workLife.hits.length) risks.push(`工作强度/稳定性风险：${dimensions.workLife.hits.join('、')}`)
  if (!job.jdText) risks.push('JD 原文未填写，评分依据不足')
  if (!job.salaryRange) risks.push('薪资范围未填写，建议补充后重算')
  return unique(risks).slice(0, 6)
}

function buildSuggestionList(dimensions, job) {
  const suggestions = []
  if (!job.jdText) suggestions.push('补充 JD 原文后，岗位方向和风险判断会更准确')
  if (!job.salaryRange) suggestions.push('补充薪资范围，便于判断是否达到央国企/私企红线')
  if (dimensions.role.score >= 75) suggestions.push('准备简历时优先突出命中的技术关键词和相关项目经历')
  if (dimensions.org.orgType.type === 'public') suggestions.push('按央国企风格准备材料：稳定性、责任心、规范流程、文档与测试意识')
  if (dimensions.org.orgType.type === 'private') suggestions.push('按私企技术面准备：项目深挖、性能指标、调试定位、代码实现细节')
  if (dimensions.workLife.hits.length) suggestions.push('面试或沟通阶段重点确认加班、出差、外包属性和团队稳定性')
  if (job.status === '准备投递' || job.status === '感兴趣') suggestions.push('建议在投递前关联最匹配的简历版本，并写清下一步行动')
  return unique(suggestions).slice(0, 6)
}

export function getScoreBadgeClass(tone) {
  const map = {
    emerald: 'border-emerald-500/30 bg-emerald-500/[0.14] text-emerald-300',
    cyan: 'border-cyan-500/30 bg-cyan-500/[0.14] text-cyan-300',
    amber: 'border-amber-500/30 bg-amber-500/[0.14] text-amber-300',
    red: 'border-red-500/30 bg-red-500/[0.14] text-red-300',
  }
  return map[tone] || map.amber
}

export function getDimensionLabel(key) {
  const labels = {
    city: '城市',
    org: '单位性质',
    salary: '薪资',
    role: '岗位匹配',
    workLife: '强度/稳定',
    status: '流程状态',
  }
  return labels[key] || key
}
