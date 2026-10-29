import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

function prepareDatabaseUrl(): string | undefined {
  const bundled = path.join(process.cwd(), 'db', 'custom.db')

  // Vercel deployment (read-only filesystem except /tmp)
  if (process.env.VERCEL === '1') {
    if (fs.existsSync(bundled)) {
      const tmpDb = '/tmp/worldrisk.db'
      try {
        if (!fs.existsSync(tmpDb)) fs.copyFileSync(bundled, tmpDb)
        return `file:${tmpDb}`
      } catch {
        // fallback
      }
    }
  }

  // If DATABASE_URL is explicitly set
  const envUrl = process.env.DATABASE_URL
  if (envUrl?.startsWith('file:')) {
    const rawPath = envUrl.slice(5) // strip 'file:'
    // 1. If absolute path and exists, use directly
    if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) {
      return envUrl
    }
    // 2. If relative to process.cwd() (e.g. db/custom.db)
    const fromCwd = path.resolve(process.cwd(), rawPath)
    if (fs.existsSync(fromCwd)) {
      return `file:${fromCwd}`
    }
    // 3. If relative to prisma directory (e.g. file:../db/custom.db)
    const fromPrisma = path.resolve(process.cwd(), 'prisma', rawPath)
    if (fs.existsSync(fromPrisma)) {
      return `file:${fromPrisma}`
    }
  }

  // Fallback: use local bundled database if it exists
  if (fs.existsSync(bundled)) {
    return `file:${bundled}`
  }

  return envUrl
}

const resolvedUrl = prepareDatabaseUrl()
if (resolvedUrl) process.env.DATABASE_URL = resolvedUrl

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: resolvedUrl ? { db: { url: resolvedUrl } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db