import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

function toArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  return String(value).split(/[，,、;；\n\t]+/).map((v) => v.trim()).filter(Boolean)
}

function normalizeBody(body = {}) {
  return {
    title: body.title || '',
    role: body.role || '',
    period: body.period || '',
    techStack: body.techStack || '',
    scenario: body.scenario || '',
    summary: body.summary || '',
    content: body.content || '',
    highlights: toArray(body.highlights),
    challenges: toArray(body.challenges),
    metrics: toArray(body.metrics),
    risks: toArray(body.risks),
    interviewQas: Array.isArray(body.interviewQas) ? body.interviewQas : [],
    tags: toArray(body.tags),
    fileName: body.fileName || '',
    fileType: body.fileType || '',
    sourceType: body.sourceType || 'manual',
  }
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectDocs = await prisma.projectDoc.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(projectDocs)
}

export async function POST(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json()
  const data = normalizeBody(body)
  if (!data.title.trim()) return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 })

  const projectDoc = await prisma.projectDoc.create({
    data: { id: body.id || undefined, userId: user.id, ...data },
  })

  return NextResponse.json({ projectDoc }, { status: 201 })
}

export async function PUT(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.projectDoc.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: '无权修改此记录' }, { status: 403 })

  const projectDoc = await prisma.projectDoc.update({
    where: { id },
    data: normalizeBody(body),
  })

  return NextResponse.json({ projectDoc })
}

export async function DELETE(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.projectDoc.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) return NextResponse.json({ error: '无权删除此记录' }, { status: 403 })

  await prisma.projectDoc.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
