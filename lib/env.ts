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
] as const

export function validateEnv() {
  const missing = requiredServerVars.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((v) => `  - ${v}`).join('\n')}\n\nSee SETUP_GUIDE.md for configuration instructions.`
    )
  }
}
