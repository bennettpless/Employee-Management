/**
 * Shared shapes for the post-onboarding sync review modal (Phase 24).
 */

export type SyncReviewKind =
  | 'device_created'
  | 'device_assigned'
  | 'device_returned'
  | 'device_pending'
  | 'ninja_new'
  | 'employee_onboarded'
  | 'employee_offboarded'
  | 'employee_updated'

export interface SyncReviewStockLot {
  determined: boolean
  status: 'unique' | 'none' | 'ambiguous'
  allocation_id: string | null
  selected_lot_id: string | null
  candidates: Array<{
    id: string
    item_id: string
    purchase_date: string
    qty_in_stock: number
    unit_cost: number
    asset_type: string
    manufacturer: string | null
    model: string | null
  }>
}

export interface SyncReviewItem {
  kind: SyncReviewKind
  id: string
  label: string
  asset_type?: string | null
  status?: string | null
  department?: string | null
  location?: string | null
  is_loaner?: boolean | null
  not_from_stock?: boolean | null
  employee_name?: string | null
  employee_id?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  stock_lot?: SyncReviewStockLot | null
  job_title?: string | null
  proposed_job_title?: string | null
  office_location?: string | null
  proposed_office_location?: string | null
  proposed_department?: string | null
  azure_job_title?: string | null
  azure_office_location?: string | null
  azure_department?: string | null
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
    azureUpdated?: number
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
  'device_pending',
  'ninja_new',
]

export const EMPLOYEE_REVIEW_KINDS: SyncReviewKind[] = [
  'employee_onboarded',
  'employee_offboarded',
  'employee_updated',
]

export function isDeviceReviewKind(kind: SyncReviewKind): boolean {
  return DEVICE_REVIEW_KINDS.includes(kind)
}

export const REVIEW_KIND_LABELS: Record<SyncReviewKind, string> = {
  device_created: 'Created & assigned',
  device_assigned: 'Assigned',
  device_returned: 'Returned to stock',
  device_pending: 'Needs a stock PC',
  ninja_new: 'Unassigned Ninja PC',
  employee_onboarded: 'Onboarded',
  employee_offboarded: 'Offboarded',
  employee_updated: 'Azure title / office / dept',
}

export const LOT_REVIEW_KINDS: SyncReviewKind[] = [
  'device_created',
  'device_assigned',
  'device_pending',
  'ninja_new',
]

export function isLotReviewKind(kind: SyncReviewKind): boolean {
  return LOT_REVIEW_KINDS.includes(kind)
}

/** Drafts for unfinished review cards (client-only; persisted in localStorage). */
export interface SyncReviewDraft {
  asset_type: string
  status: string
  department: string
  location: string
  is_loaner: boolean
  lot_id: string
  skip_lot: boolean
  charge_office: string
  pending_device_id: string
  employee_id: string
  job_title: string
  office_location: string
}

export interface PendingSyncReview {
  items: SyncReviewItem[]
  drafts: Record<string, SyncReviewDraft>
  savedAt: string
}

export const SYNC_REVIEW_STORAGE_KEY = 'ems-sync-review-pending'

export function remainingSyncReviewItems(
  items: SyncReviewItem[],
  confirmedIds: Iterable<string>
): SyncReviewItem[] {
  const confirmed = new Set(confirmedIds)
  return items.filter((item) => !confirmed.has(item.id))
}

/** New sync items first; leftover unfinished cards keep their place after. */
export function mergeSyncReviewItems(
  incoming: SyncReviewItem[],
  pending: SyncReviewItem[]
): SyncReviewItem[] {
  const seen = new Set<string>()
  const out: SyncReviewItem[] = []
  // A new Azure pass is the source of truth for title/office/dept cards.
  // Leftover employee_updated rows from Finish later would otherwise reappear
  // after Confirm even when EMS already matches Azure.
  const pendingKept = pending.filter((item) => item.kind !== 'employee_updated')
  for (const item of [...incoming, ...pendingKept]) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function draftsForPendingOnly(
  incomingIds: Iterable<string>,
  drafts: Record<string, SyncReviewDraft> | undefined
): Record<string, SyncReviewDraft> {
  if (!drafts) return {}
  const incoming = new Set(incomingIds)
  const kept: Record<string, SyncReviewDraft> = {}
  for (const [id, draft] of Object.entries(drafts)) {
    if (!incoming.has(id)) kept[id] = draft
  }
  return kept
}

export function loadPendingSyncReview(): PendingSyncReview | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SYNC_REVIEW_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingSyncReview>
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null
    return {
      items: parsed.items,
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function savePendingSyncReview(pending: PendingSyncReview | null): void {
  if (typeof window === 'undefined') return
  if (!pending || pending.items.length === 0) {
    window.localStorage.removeItem(SYNC_REVIEW_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(SYNC_REVIEW_STORAGE_KEY, JSON.stringify(pending))
}
