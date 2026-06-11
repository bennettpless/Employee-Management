const requiredServerVars = [
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
  'NEXTAUTH_SECRET',
  'IT_RESPONSE_AGENT_URL',
  'IT_RESPONSE_AGENT_API_KEY',
] as const

const optionalServerVars = [
  'NINJA_REGION',
  'NEXTAUTH_URL',
  // Phase 17: Auvik integration is optional. When all three are set, the
  // network sync becomes available; otherwise the entire feature stays hidden
  // (cards on /sync, /settings, and /network are all gated on
  // isAuvikConfigured()). AUVIK_API_BASE_URL is an escape hatch in case the
  // tenant uses a region-host pattern instead of the default subdomain pattern.
  'AUVIK_API_USER',
  'AUVIK_API_KEY',
  'AUVIK_TENANT_DOMAIN',
  'AUVIK_API_BASE_URL',
] as const

export function validateEnv() {
  const missing = requiredServerVars.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join('\n')}\n\nSee SETUP_GUIDE.md for configuration instructions.`
    )
  }
}

/**
 * Returns true when all three required Auvik env vars are set. Used to gate
 * UI cards (sync page, settings page, network page button) and the
 * `/api/network/sync/auvik` route. The optional `AUVIK_API_BASE_URL` is not
 * required — only the three credential vars are.
 */
export function isAuvikConfigured(): boolean {
  return Boolean(
    process.env.AUVIK_API_USER &&
      process.env.AUVIK_API_KEY &&
      process.env.AUVIK_TENANT_DOMAIN
  )
}
