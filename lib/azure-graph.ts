import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
  }
}

const cca = new ConfidentialClientApplication(msalConfig)

export async function getGraphClient() {
  const authResult = await cca.acquireTokenByClientCredential({
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
