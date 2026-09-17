import { describe, it, expect } from 'vitest'
import {
  draftsForPendingOnly,
  mergeSyncReviewItems,
  remainingSyncReviewItems,
  REVIEW_KIND_LABELS,
  type SyncReviewDraft,
  type SyncReviewItem,
} from '@/lib/sync-review'

function item(id: string, kind: SyncReviewItem['kind'] = 'ninja_new'): SyncReviewItem {
  return { kind, id, label: id }
}

describe('sync review leftovers', () => {
  it('labels ninja_new as an unassigned device, not a hire', () => {
    expect(REVIEW_KIND_LABELS.ninja_new).toBe('Unassigned Ninja PC')
  })

  it('labels Azure title/office cards', () => {
    expect(REVIEW_KIND_LABELS.employee_updated).toBe('Azure title / office / dept')
  })

  it('keeps unfinished cards after confirmed ones are dropped', () => {
    const items = [item('a', 'employee_onboarded'), item('b'), item('c')]
    expect(remainingSyncReviewItems(items, ['a']).map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('puts a new sync ahead of leftover unfinished cards and de-dupes by id', () => {
    const incoming = [item('new-1'), item('b')]
    const pending = [item('b'), item('old-1')]
    expect(mergeSyncReviewItems(incoming, pending).map((i) => i.id)).toEqual([
      'new-1',
      'b',
      'old-1',
    ])
  })

  it('does not revive leftover Azure profile cards after they were confirmed', () => {
    const incoming: SyncReviewItem[] = []
    const pending = [item('emp-1', 'employee_updated'), item('dev-1', 'ninja_new')]
    expect(mergeSyncReviewItems(incoming, pending).map((i) => i.id)).toEqual(['dev-1'])
  })

  it('keeps drafts only for leftover cards, not for items the new sync just returned', () => {
    const drafts: Record<string, SyncReviewDraft> = {
      'old-1': {
        asset_type: 'laptop',
        status: 'in_stock',
        department: '',
        location: '',
        is_loaner: false,
        lot_id: '',
        skip_lot: true,
        charge_office: '',
        pending_device_id: '',
        employee_id: '',
        job_title: '',
        office_location: '',
      },
      'new-1': {
        asset_type: 'desktop',
        status: 'active',
        department: '',
        location: '',
        is_loaner: false,
        lot_id: 'lot-1',
        skip_lot: false,
        charge_office: '',
        pending_device_id: '',
        employee_id: '',
        job_title: '',
        office_location: '',
      },
    }
    expect(Object.keys(draftsForPendingOnly(['new-1'], drafts))).toEqual(['old-1'])
  })
})
