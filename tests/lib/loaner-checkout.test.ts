import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LOANER_DAYS,
  defaultLoanerDueDate,
  isoDateOnly,
  isLoanerOverdue,
  loanerFieldsForAssignment,
} from '@/lib/loaner-checkout'
import { sanitizeDeviceBody } from '@/lib/devices'

describe('isoDateOnly / defaultLoanerDueDate', () => {
  it('formats a local calendar date as YYYY-MM-DD', () => {
    expect(isoDateOnly(new Date(2026, 7, 25))).toBe('2026-08-25')
  })

  it(`defaults due date to ${DEFAULT_LOANER_DAYS} days out`, () => {
    expect(defaultLoanerDueDate(new Date(2026, 7, 25))).toBe('2026-09-08')
  })
})

describe('isLoanerOverdue', () => {
  const asOf = new Date(2026, 7, 25)

  it('is overdue only when assigned and the due date is before today', () => {
    expect(isLoanerOverdue('2026-08-24', true, asOf)).toBe(true)
    expect(isLoanerOverdue('2026-08-25', true, asOf)).toBe(false)
    expect(isLoanerOverdue('2026-08-24', false, asOf)).toBe(false)
    expect(isLoanerOverdue(null, true, asOf)).toBe(false)
  })
})

describe('loanerFieldsForAssignment', () => {
  it('clears checkout fields when unassigned or not a loaner', () => {
    expect(
      loanerFieldsForAssignment({
        isLoaner: true,
        nextEmployeeId: null,
        dueDate: '2026-09-01',
        existingCheckedOutAt: '2026-08-01T00:00:00.000Z',
        assigneeChanging: true,
        becomingLoaner: false,
      })
    ).toMatchObject({
      loaner_due_date: null,
      loaner_checked_out_at: null,
      shouldOpenCheckout: false,
      shouldCloseCheckout: true,
    })
  })

  it('opens a checkout and fills a default due date when assigning a loaner', () => {
    const fields = loanerFieldsForAssignment({
      isLoaner: true,
      nextEmployeeId: 'emp-1',
      dueDate: null,
      existingCheckedOutAt: null,
      assigneeChanging: true,
      becomingLoaner: false,
    })
    expect(fields.shouldOpenCheckout).toBe(true)
    expect(fields.shouldCloseCheckout).toBe(false)
    expect(fields.loaner_due_date).toBe(defaultLoanerDueDate())
    expect(fields.loaner_checked_out_at).toBeTruthy()
  })
})

describe('sanitizeDeviceBody loaner checkout', () => {
  it('allows loaner_due_date and empty string becomes null', () => {
    expect(sanitizeDeviceBody({ loaner_due_date: '2026-09-01' }).loaner_due_date).toBe(
      '2026-09-01'
    )
    expect(sanitizeDeviceBody({ loaner_due_date: '' }).loaner_due_date).toBeNull()
  })
})
