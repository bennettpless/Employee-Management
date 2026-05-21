import { graphFetch } from './azure-graph'

export interface IntuneManagedDevice {
  id: string
  azureADDeviceId: string | null
  deviceName: string
  serialNumber: string | null
  manufacturer: string | null
  model: string | null
  operatingSystem: string | null
  osVersion: string | null
  lastSyncDateTime: string | null
  userPrincipalName: string | null
  userDisplayName: string | null
  managedDeviceOwnerType: string | null
  enrolledDateTime: string | null
  complianceState: string | null
  managementAgent: string | null
  deviceRegistrationState: string | null
}

const SELECT_FIELDS = [
  'id',
  'azureADDeviceId',
  'deviceName',
  'serialNumber',
  'manufacturer',
  'model',
  'operatingSystem',
  'osVersion',
  'lastSyncDateTime',
  'userPrincipalName',
  'userDisplayName',
  'managedDeviceOwnerType',
  'enrolledDateTime',
  'complianceState',
  'managementAgent',
  'deviceRegistrationState',
].join(',')

/**
 * Fetch all Intune managed devices using Microsoft Graph API.
 * Handles pagination automatically via @odata.nextLink.
 */
export async function getIntuneManagedDevices(): Promise<IntuneManagedDevice[]> {
  const allDevices: IntuneManagedDevice[] = []
  let nextUrl: string | null = `/deviceManagement/managedDevices?$select=${SELECT_FIELDS}&$top=100`

  while (nextUrl) {
    const response = await graphFetch(nextUrl)
    const values = response?.value as IntuneManagedDevice[] | undefined
    if (values) {
      allDevices.push(...values)
    }
    nextUrl = (response?.['@odata.nextLink'] as string) || null
  }

  return allDevices
}
