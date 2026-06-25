import { NextResponse } from 'next/server'
import { cookieOptions } from '@/lib/jwt'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  const opts = cookieOptions(0)
  response.cookies.set(opts.name, '', opts)
  return response
}
