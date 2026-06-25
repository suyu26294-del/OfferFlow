import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resumes = await prisma.resume.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(resumes)
}

export async function POST(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json()
  const { id, name, version, updatedAt, target, language, format, fileSize, tags, versionNote, fileUrl, isDefault, fileName, mimeType, hasFile } = body

  const resume = await prisma.resume.create({
    data: {
      id: id || undefined,
      userId: user.id,
      name: name || '',
      version: version || '',
      updatedAt: updatedAt || '',
      target: target || '',
      language: language || '',
      format: format || '',
      fileSize: fileSize || '',
      tags: tags || [],
      versionNote: versionNote || '',
      fileUrl: fileUrl || '',
      isDefault: isDefault || false,
      fileName: fileName || '',
      mimeType: mimeType || '',
      hasFile: hasFile || false,
    },
  })

  return NextResponse.json({ resume }, { status: 201 })
}

export async function PUT(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json()
  const { id, ...data } = body

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.resume.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: '无权修改此记录' }, { status: 403 })
  }

  const resume = await prisma.resume.update({
    where: { id },
    data,
  })

  return NextResponse.json({ resume })
}

export async function DELETE(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.resume.findUnique({ where: { id } })
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: '无权删除此记录' }, { status: 403 })
  }

  await prisma.resume.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
