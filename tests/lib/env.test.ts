import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateEnv } from '@/lib/env'

describe('validateEnv', () => {
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'SHAREPOINT_SITE_PATH',
    'SHAREPOINT_FILE_PATH',
    'NINJA_CLIENT_ID',
    'NINJA_CLIENT_SECRET',
  ]

  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of requiredVars) {
      process.env[key] = `test-value-${key}`
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('does not throw when all required vars are present', () => {
    expect(() => validateEnv()).not.toThrow()
  })

  it('throws when a single required var is missing', () => {
    delete process.env.NINJA_CLIENT_SECRET
    expect(() => validateEnv()).toThrow('Missing required environment variables')
    expect(() => validateEnv()).toThrow('NINJA_CLIENT_SECRET')
  })

  it('throws listing all missing vars', () => {
    delete process.env.AZURE_CLIENT_ID
    delete process.env.AZURE_CLIENT_SECRET
    try {
      validateEnv()
      expect.fail('should have thrown')
    } catch (e: any) {
      expect(e.message).toContain('AZURE_CLIENT_ID')
      expect(e.message).toContain('AZURE_CLIENT_SECRET')
    }
  })

  it('throws when all required vars are missing', () => {
    for (const key of requiredVars) {
      delete process.env[key]
    }
    expect(() => validateEnv()).toThrow('Missing required environment variables')
  })

  it('includes setup guide reference in error message', () => {
    delete process.env.NINJA_CLIENT_ID
    expect(() => validateEnv()).toThrow('SETUP_GUIDE.md')
  })
})
