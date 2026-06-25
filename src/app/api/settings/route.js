import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { settings: true },
  })

  return NextResponse.json(record?.settings || null)
}

export async function PUT(request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const body = await request.json()
  const settings = body?.settings || body || {}

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { settings },
    select: { settings: true },
  })

  return NextResponse.json({ settings: updated.settings })
}
