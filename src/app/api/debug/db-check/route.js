import { NextResponse } from 'next/server'
import net from 'net'
import dns from 'dns'
import prisma from '@/lib/prisma'

async function tcpCheck(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeout)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.connect(port, host)
  })
}

async function dnsResolve(host) {
  return new Promise((resolve) => {
    dns.resolve4(host, (err, addresses) => {
      if (err) { dns.resolve6(host, (err6, addrs6) => {
        resolve(err6 ? null : addrs6)
      }) } else { resolve(addresses) }
    })
  })
}

export async function GET() {
  const host = 'db.dxnepuixvkrwugbrxqqk.supabase.co'
  const results = {}

  // 1. Environment variables
  results.envVars = {
    DATABASE_URL: (process.env.DATABASE_URL || '').replace(/\/\/(.*?):(.*?)@/, '//$1:***'),
    DIRECT_URL: (process.env.DIRECT_URL || '').replace(/\/\/(.*?):(.*?)@/, '//$1:***'),
    NODE_ENV: process.env.NODE_ENV,
  }

  // 2. DNS resolution
  results.dns = { host }
  const ips = await dnsResolve(host)
  if (ips) { results.dns.ok = true; results.dns.ips = ips }
  else { results.dns.ok = false; results.dns.error = 'DNS resolution failed' }

  // 3. TCP port check
  results.tcp = {}
  for (const port of [5432, 6543, 443]) {
    results.tcp[port] = await tcpCheck(host, port)
  }

  // 4. HTTP check
  try {
    const r = await fetch(`https://${host}`, { signal: AbortSignal.timeout(5000) })
    results.http = { ok: true, status: r.status }
  } catch (e) {
    results.http = { ok: false, error: e.message }
  }

  // 5. Prisma connection attempt
  try {
    const start = Date.now()
    await prisma.$connect()
    results.prismaConnectMs = Date.now() - start
    const info = await prisma.$queryRaw`SELECT version(), current_database(), now()`
    results.dbInfo = info
    const userCount = await prisma.user.count()
    results.userCount = userCount
    await prisma.$disconnect()
    results.status = 'ok'
  } catch (e) {
    results.status = 'error'
    results.prismaError = {
      name: e.name,
      message: e.message,
    }
  }

  return NextResponse.json(results)
}
