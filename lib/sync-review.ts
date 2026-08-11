/**
 * Shared shapes for the post-onboarding sync review modal (Phase 24).
 */

export type SyncReviewKind =
  | 'device_created'
  | 'device_assigned'
  | 'device_returned'
  | 'ninja_new'
  | 'employee_onboarded'
  | 'employee_offboarded'

export interface SyncReviewItem {
  kind: SyncReviewKind
  id: string
  label: string
  asset_type?: string | null
  status?: string | null
  department?: string | null
  location?: string | null
  employee_name?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
}

export interface SyncReviewPayload {
  items: SyncReviewItem[]
}

export interface OnboardingSyncResult {
  success: boolean
  processed?: { onboarding: string[]; offboarding: string[] }
  stats?: {
    onboarded?: number
    updated?: number
    devicesAssigned?: number
    devicesCreated?: number
    devicesPending?: number
    offboarded?: number
    devicesReturned?: number
    ninjaNew?: number
  }
  review?: SyncReviewPayload
  errors?: string[]
  duration?: number
  error?: string
}

export const DEVICE_REVIEW_KINDS: SyncReviewKind[] = [
  'device_created',
  'device_assigned',
  'device_returned',
  'ninja_new',
]

export const EMPLOYEE_REVIEW_KINDS: SyncReviewKind[] = [
  'employee_onboarded',
  'employee_offboarded',
]

export function isDeviceReviewKind(kind: SyncReviewKind): boolean {
  return DEVICE_REVIEW_KINDS.includes(kind)
}

export const REVIEW_KIND_LABELS: Record<SyncReviewKind, string> = {
  device_created: 'Created & assigned',
  device_assigned: 'Assigned',
  device_returned: 'Returned to stock',
  ninja_new: 'New from NinjaOne',
  employee_onboarded: 'Onboarded',
  employee_offboarded: 'Offboarded',
}
