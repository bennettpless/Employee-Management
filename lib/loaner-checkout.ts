export const DEFAULT_LOANER_DAYS = 14

type QueryClient = { from: (table: string) => any }

export interface EmployeeSnapshot {
  name: string | null
  email: string | null
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDateOnly(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function defaultLoanerDueDate(from: Date = new Date()): string {
  const d = new Date(from.getTime())
  d.setDate(d.getDate() + DEFAULT_LOANER_DAYS)
  return isoDateOnly(d)
}

export function isLoanerOverdue(
  dueDate: string | null | undefined,
  assigned: boolean,
  asOf: Date = new Date()
): boolean {
  if (!assigned || !dueDate) return false
  return dueDate < isoDateOnly(asOf)
}

export function employeeSnapshotFrom(
  employee:
    | {
        display_name?: string | null
        first_name?: string | null
        last_name?: string | null
        email?: string | null
      }
    | null
    | undefined
): EmployeeSnapshot {
  if (!employee) return { name: null, email: null }
  const name =
    employee.display_name ||
    `${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
    employee.email ||
    null
  return { name, email: employee.email || null }
}

export async function fetchEmployeeSnapshot(
  supabase: QueryClient,
  employeeId: string | null | undefined
): Promise<EmployeeSnapshot> {
  if (!employeeId) return { name: null, email: null }
  const { data } = await supabase
    .from('employees')
    .select('display_name, first_name, last_name, email')
    .eq('id', employeeId)
    .maybeSingle()
  return employeeSnapshotFrom(data)
}

export async function closeOpenLoanerCheckouts(
  supabase: QueryClient,
  deviceId: string,
  returnedAt: string = new Date().toISOString()
) {
  return supabase
    .from('loaner_checkouts')
    .update({ returned_at: returnedAt })
    .eq('device_id', deviceId)
    .is('returned_at', null)
}

export async function openLoanerCheckout(
  supabase: QueryClient,
  opts: {
    deviceId: string
    employeeId: string | null
    snapshot: EmployeeSnapshot
    dueDate: string | null
    checkedOutAt?: string
  }
) {
  const checkedOutAt = opts.checkedOutAt || new Date().toISOString()
  await closeOpenLoanerCheckouts(supabase, opts.deviceId, checkedOutAt)
  return supabase.from('loaner_checkouts').insert({
    device_id: opts.deviceId,
    employee_id: opts.employeeId,
    employee_name: opts.snapshot.name,
    employee_email: opts.snapshot.email,
    checked_out_at: checkedOutAt,
    due_date: opts.dueDate,
  })
}

/**
 * Keep `devices.loaner_*` fields and `loaner_checkouts` in sync with the
 * current assignment. Returns extra columns to write onto the device row.
 */
export function loanerFieldsForAssignment(opts: {
  isLoaner: boolean
  nextEmployeeId: string | null | undefined
  dueDate?: string | null
  existingCheckedOutAt?: string | null
  assigneeChanging: boolean
  becomingLoaner: boolean
}): {
  loaner_due_date: string | null
  loaner_checked_out_at: string | null
  shouldOpenCheckout: boolean
  shouldCloseCheckout: boolean
} {
  const assigned = Boolean(opts.nextEmployeeId)
  if (!opts.isLoaner || !assigned) {
    return {
      loaner_due_date: null,
      loaner_checked_out_at: null,
      shouldOpenCheckout: false,
      shouldCloseCheckout: true,
    }
  }

  const startingNewCheckout =
    opts.assigneeChanging || opts.becomingLoaner || !opts.existingCheckedOutAt

  return {
    loaner_due_date: opts.dueDate || defaultLoanerDueDate(),
    loaner_checked_out_at: startingNewCheckout
      ? new Date().toISOString()
      : opts.existingCheckedOutAt || new Date().toISOString(),
    shouldOpenCheckout: startingNewCheckout,
    shouldCloseCheckout: false,
  }
}

export async function applyLoanerOnAssign(
  supabase: QueryClient,
  opts: {
    deviceId: string
    isLoaner: boolean
    employeeId: string
    snapshot: EmployeeSnapshot
    dueDate?: string | null
  }
) {
  if (!opts.isLoaner) return
  const fields = loanerFieldsForAssignment({
    isLoaner: true,
    nextEmployeeId: opts.employeeId,
    dueDate: opts.dueDate ?? null,
    existingCheckedOutAt: null,
    assigneeChanging: true,
    becomingLoaner: false,
  })
  await supabase
    .from('devices')
    .update({
      loaner_due_date: fields.loaner_due_date,
      loaner_checked_out_at: fields.loaner_checked_out_at,
    })
    .eq('id', opts.deviceId)
  await openLoanerCheckout(supabase, {
    deviceId: opts.deviceId,
    employeeId: opts.employeeId,
    snapshot: opts.snapshot,
    dueDate: fields.loaner_due_date,
    checkedOutAt: fields.loaner_checked_out_at || undefined,
  })
}

export async function applyLoanerOnReturn(
  supabase: QueryClient,
  deviceId: string,
  returnedAt: string = new Date().toISOString()
) {
  await closeOpenLoanerCheckouts(supabase, deviceId, returnedAt)
  await supabase
    .from('devices')
    .update({ loaner_due_date: null, loaner_checked_out_at: null })
    .eq('id', deviceId)
}
