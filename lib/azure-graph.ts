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

export async function getAllUsers(): Promise<AzureUser[]> {
  const client = await getGraphClient()
  
  const users: AzureUser[] = []
  let nextLink: string | undefined = undefined

  do {
    const response: any = nextLink
      ? await client.api(nextLink).get()
      : await client
          .api('/users')
          .select([
            'id',
            'userPrincipalName',
            'mail',
            'displayName',
            'givenName',
            'surname',
            'jobTitle',
            'department',
            'officeLocation',
            'businessPhones',
            'mobilePhone',
            'accountEnabled',
            'employeeHireDate',
            'createdDateTime',
            'signInActivity'
          ])
          .expand('manager($select=id,displayName)')
          .top(999)
          .get()

    users.push(...response.value)
    nextLink = response['@odata.nextLink']
  } while (nextLink)

  return users
}

export async function getUserManager(userId: string) {
  const client = await getGraphClient()
  
  try {
    const manager = await client
      .api(`/users/${userId}/manager`)
      .select(['id', 'displayName'])
      .get()
    return manager
  } catch (error) {
    // User might not have a manager
    return null
  }
}

export async function getUserPhoto(userId: string): Promise<string | null> {
  const client = await getGraphClient()
  
  try {
    const photo = await client
      .api(`/users/${userId}/photo/$value`)
      .get()
    
    // Convert blob to base64
    const buffer = Buffer.from(photo)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch (error) {
    return null
  }
}

export interface AzureDevice {
  id: string
  displayName: string
  deviceId: string
  operatingSystem: string
  operatingSystemVersion: string
  isManaged: boolean
  registeredDateTime?: string
  approximateLastSignInDateTime?: string
}

export async function getUserDevices(userId: string): Promise<AzureDevice[]> {
  const client = await getGraphClient()
  
  try {
    // Get registered devices for the user
    const devices: AzureDevice[] = []
    let nextLink: string | undefined = undefined

    do {
      const response: any = nextLink
        ? await client.api(nextLink).get()
        : await client
            .api(`/users/${userId}/registeredDevices`)
            .select(['id', 'displayName', 'deviceId', 'operatingSystem', 'operatingSystemVersion', 'isManaged', 'registeredDateTime', 'approximateLastSignInDateTime'])
            .top(999)
            .get()

      devices.push(...response.value)
      nextLink = response['@odata.nextLink']
    } while (nextLink)

    return devices
  } catch (error) {
    // User might not have devices or endpoint might fail
    console.error(`Error fetching devices for user ${userId}:`, error)
    return []
  }
}

export async function getAllUsersWithDevices(): Promise<Map<string, AzureDevice[]>> {
  const client = await getGraphClient()
  const userDeviceMap = new Map<string, AzureDevice[]>()
  
  // Get all users
  const users = await getAllUsers()
  
  // Fetch devices for each user (limit concurrency to avoid rate limits)
  const BATCH_SIZE = 10
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (user) => {
        try {
          const devices = await getUserDevices(user.id)
          if (devices.length > 0) {
            userDeviceMap.set(user.id, devices)
          }
        } catch (error) {
          console.error(`Error fetching devices for user ${user.id}:`, error)
        }
      })
    )
  }
  
  return userDeviceMap
}

