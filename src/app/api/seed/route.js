import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { seedDemoDataForUser } from '@/lib/seedDemoData'

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  if (user.username !== 'user') {
    return NextResponse.json({ message: '非测试账户，跳过种子数据初始化' })
  }

  const result = await seedDemoDataForUser(user.id)
  if (result.skipped) {
    return NextResponse.json({ message: '数据已存在，跳过初始化' })
  }

  return NextResponse.json({ message: 'Mock data seeded' })
}
