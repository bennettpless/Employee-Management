import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'

let cca: ConfidentialClientApplication | null = null

function getConfidentialClient(): ConfidentialClientApplication {
  if (cca) return cca
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const tenantId = process.env.AZURE_TENANT_ID
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Azure AD app credentials are not configured')
  }
  cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })
  return cca
}

export async function getGraphClient() {
  const authResult = await getConfidentialClient().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default']
  })

  if (!authResult?.accessToken) {
    throw new Error('Failed to acquire access token')
  }

  return Client.init({
    authProvider: (done) => {
      done(null, authResult.accessToken)
    }
  })
}

/**
 * Fetch a Graph API endpoint and return the parsed JSON.
 * Accepts relative paths (e.g. `/deviceManagement/managedDevices?$top=100`)
 * or full @odata.nextLink URLs.
 */
export async function graphFetch(urlOrPath: string): Promise<Record<string, unknown>> {
  const client = await getGraphClient()
  const path = urlOrPath.startsWith('https://')
    ? urlOrPath.replace('https://graph.microsoft.com/v1.0', '')
    : urlOrPath
  return client.api(path).get()
}

export async function sendGraphMail(opts: {
  from: string
  to: string[]
  subject: string
  html: string
  attachments?: Array<{ name: string; contentType: string; contentBytes: string }>
}): Promise<void> {
  const from = String(opts.from || '').trim()
  const to = opts.to.map((addr) => String(addr || '').trim()).filter(Boolean)
  if (!from) throw new Error('STOCK_REPORT_EMAIL_FROM is required')
  if (to.length === 0) throw new Error('STOCK_REPORT_EMAIL_TO is required')
  const client = await getGraphClient()
  await client.api(`/users/${encodeURIComponent(from)}/sendMail`).post({
    message: {
      subject: opts.subject,
      body: { contentType: 'HTML', content: opts.html },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
      attachments: (opts.attachments || []).map((file) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.name,
        contentType: file.contentType,
        contentBytes: file.contentBytes,
      })),
    },
    saveToSentItems: true,
  })
}

export async function listAzureDirectoryUsers(): Promise<
  Array<{
    mail: string | null
    userPrincipalName: string | null
    jobTitle: string | null
    officeLocation: string | null
    department: string | null
  }>
> {
  const users: Array<{
    mail: string | null
    userPrincipalName: string | null
    jobTitle: string | null
    officeLocation: string | null
    department: string | null
  }> = []
  let next: string | null =
    '/users?$select=mail,userPrincipalName,jobTitle,officeLocation,department,accountEnabled&$top=999'
  while (next) {
    const page = await graphFetch(next)
    const rows = (page.value as Array<Record<string, unknown>> | undefined) || []
    for (const row of rows) {
      if (row.accountEnabled === false) continue
      users.push({
        mail: row.mail ? String(row.mail) : null,
        userPrincipalName: row.userPrincipalName ? String(row.userPrincipalName) : null,
        jobTitle: row.jobTitle ? String(row.jobTitle) : null,
        officeLocation: row.officeLocation ? String(row.officeLocation) : null,
        department: row.department ? String(row.department) : null,
      })
    }
    next = typeof page['@odata.nextLink'] === 'string' ? String(page['@odata.nextLink']) : null
  }
  return users
}

export interface AzureUser {
  id: string
  userPrincipalName: string
  mail: string
  displayName: string
  givenName: string
  surname: string
  jobTitle: string
  department: string
  officeLocation: string
  businessPhones: string[]
  mobilePhone: string
  accountEnabled: boolean
  employeeHireDate?: string
  createdDateTime?: string
  signInActivity?: {
    lastSignInDateTime?: string
  }
  manager?: {
    id: string
    displayName: string
  }
}
