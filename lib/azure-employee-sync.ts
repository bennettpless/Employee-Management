import {
  DEPARTMENTS,
  departmentForEmployee,
  officeNameToLocation,
  type Department,
} from '@/lib/devices'

export function normalizeProfileValue(value: unknown): string {
  return String(value ?? '').trim()
}

export function profileValuesEqual(a: unknown, b: unknown): boolean {
  return normalizeProfileValue(a).toLowerCase() === normalizeProfileValue(b).toLowerCase()
}

/** True when Azure has a value that is neither what EMS has nor what was last reviewed. */
export function isAzureProfileFieldNew(
  azureValue: string | null | undefined,
  currentValue: string | null | undefined,
  ackedValue: string | null | undefined
): boolean {
  const azure = normalizeProfileValue(azureValue)
  if (!azure) return false
  if (profileValuesEqual(azure, currentValue)) return false
  if (profileValuesEqual(azure, ackedValue)) return false
  return true
}

export function proposedAzureOffice(
  azureOffice: string | null | undefined,
  allowedLocations: string[]
): string | null {
  const raw = normalizeProfileValue(azureOffice)
  if (!raw) return null
  const mapped = officeNameToLocation(raw)
  if (allowedLocations.includes(mapped)) return mapped
  if (allowedLocations.includes(raw)) return raw
  return mapped || raw
}

/** Map an Azure AD department string onto EMS Admin / BPL / Designer / Engineer / Leadership. */
export function mapAzureDepartment(azureDepartment: string | null | undefined): Department | null {
  const raw = normalizeProfileValue(azureDepartment)
  if (!raw) return null
  const lower = raw.toLowerCase()
  const exact = DEPARTMENTS.find((dept) => dept.toLowerCase() === lower)
  if (exact) return exact
  if (/bpl|enclosure/i.test(raw)) return 'BPL'
  if (/engineer/i.test(raw)) return 'Engineer'
  if (/\bbim\b|design/i.test(raw)) return 'Designer'
  if (/leader|executive|director/i.test(raw)) return 'Leadership'
  if (/admin|it\b|accounting|hr\b|finance|reception/i.test(raw)) return 'Admin'
  return null
}

export interface AzureEmployeeDiff {
  employeeId: string
  label: string
  currentJobTitle: string | null
  proposedJobTitle: string | null
  currentOffice: string | null
  proposedOffice: string | null
  currentDepartment: string | null
  proposedDepartment: string | null
  azureJobTitle: string | null
  azureOffice: string | null
  azureDepartment: string | null
}

export function diffAzureEmployee(opts: {
  employeeId: string
  label: string
  email?: string | null
  currentJobTitle?: string | null
  currentOffice?: string | null
  currentDepartment?: string | null
  azureJobTitle?: string | null
  azureOffice?: string | null
  azureDepartment?: string | null
  ackedJobTitle?: string | null
  ackedOffice?: string | null
  ackedDepartment?: string | null
  allowedLocations: string[]
}): AzureEmployeeDiff | null {
  const proposedTitle = normalizeProfileValue(opts.azureJobTitle) || null
  const proposedOffice = proposedAzureOffice(opts.azureOffice, opts.allowedLocations)
  const currentOfficeMapped =
    proposedAzureOffice(opts.currentOffice, opts.allowedLocations) ||
    (normalizeProfileValue(opts.currentOffice)
      ? officeNameToLocation(normalizeProfileValue(opts.currentOffice))
      : null)
  const ackedOfficeMapped =
    proposedAzureOffice(opts.ackedOffice, opts.allowedLocations) || opts.ackedOffice || null
  const titleChanged = isAzureProfileFieldNew(
    proposedTitle,
    opts.currentJobTitle,
    opts.ackedJobTitle
  )
  const officeChanged = isAzureProfileFieldNew(
    proposedOffice,
    currentOfficeMapped || opts.currentOffice,
    ackedOfficeMapped
  )

  const mappedAzureDept = String(opts.email ?? '').toLowerCase().endsWith('@bpl-enclosure.com')
    ? 'BPL'
    : mapAzureDepartment(opts.azureDepartment)
  const derivedDept = departmentForEmployee(
    opts.email,
    proposedTitle || opts.currentJobTitle
  )
  const azureDepartment = mappedAzureDept || (titleChanged ? derivedDept : null) || null
  const proposedDepartment = azureDepartment || opts.currentDepartment || null
  const departmentChanged = isAzureProfileFieldNew(
    azureDepartment,
    opts.currentDepartment,
    opts.ackedDepartment
  )

  if (!titleChanged && !officeChanged && !departmentChanged) return null
  return {
    employeeId: opts.employeeId,
    label: opts.label,
    currentJobTitle: opts.currentJobTitle || null,
    proposedJobTitle: titleChanged ? proposedTitle : opts.currentJobTitle || proposedTitle,
    currentOffice: opts.currentOffice || null,
    proposedOffice: officeChanged ? proposedOffice : opts.currentOffice || proposedOffice,
    currentDepartment: opts.currentDepartment || null,
    proposedDepartment: departmentChanged
      ? proposedDepartment
      : opts.currentDepartment || proposedDepartment,
    azureJobTitle: proposedTitle,
    azureOffice: proposedOffice,
    azureDepartment,
  }
}

export function azureUserEmailKey(user: {
  mail?: string | null
  userPrincipalName?: string | null
}): string {
  return normalizeProfileValue(user.mail || user.userPrincipalName).toLowerCase()
}
