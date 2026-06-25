import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { signToken, cookieOptions } from '@/lib/jwt'
import { ensureDemoUser, seedDemoDataForUser } from '@/lib/seedDemoData'

export async function POST(request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 })
    }

    // Auto-create demo user on first login attempt
    if (username === 'user') {
      await ensureDemoUser()
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    // Seed demo data if this is the demo account and data is empty
    let seeded = false
    if (user.username === 'user') {
      const result = await seedDemoDataForUser(user.id)
      seeded = !result.skipped
    }

    const token = await signToken({ userId: user.id, username: user.username })
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      seeded,
    })

    const opts = cookieOptions()
    response.cookies.set(opts.name, token, opts)

    return response
  } catch (error) {
    console.error('Login error:', error.message, error.stack)
    return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 })
  }
}
