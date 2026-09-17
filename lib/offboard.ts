import { closeCurrentAssignments } from '@/lib/devices'
import { closeOpenLoanerCheckouts } from '@/lib/loaner-checkout'
import { logAudit } from '@/lib/audit'

type QueryClient = { from: (table: string) => any }

export interface OffboardResult {
  employeeId: string
  email: string | null
  label: string
  devicesReturned: number
}

/**
 * Fully remove an employee from EMS: return their devices to stock, close
 * assignment + loaner checkout rows, then hard-delete the employee record.
 */
export async function removeEmployeeFromProgram(
  supabase: QueryClient,
  employeeId: string,
  opts?: {
    actor?: string
    via?: string
    terminationDate?: string | null
    skipAudit?: boolean
  }
): Promise<OffboardResult | null> {
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select('id, email, display_name, first_name, last_name')
    .eq('id', employeeId)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (!employee) return null

  const label =
    employee.display_name ||
    `${employee.first_name || ''} ${employee.last_name || ''}`.trim() ||
    employee.email

  const { data: employeeDevices, error: devicesError } = await supabase
    .from('devices')
    .select('id, device_name, is_loaner')
    .eq('employee_id', employeeId)

  if (devicesError) throw devicesError

  const now = new Date().toISOString()
  const devices = employeeDevices || []

  if (devices.length > 0) {
    // Snapshot names onto assignment history before the employee row vanishes.
    await supabase
      .from('device_assignments_history')
      .update({
        employee_name: label,
        employee_email: employee.email,
      })
      .eq('employee_id', employeeId)
      .is('employee_name', null)

    for (const d of devices) {
      await closeCurrentAssignments(supabase, d.id, now)
      await closeOpenLoanerCheckouts(supabase, d.id, now)
    }

    const { error: unassignError } = await supabase
      .from('devices')
      .update({
        employee_id: null,
        status: 'in_stock',
        loaner_due_date: null,
        loaner_checked_out_at: null,
      })
      .in(
        'id',
        devices.map((d: { id: string }) => d.id)
      )

    if (unassignError) throw unassignError
  }

  const { error: deleteError } = await supabase
    .from('employees')
    .delete()
    .eq('id', employeeId)

  if (deleteError) throw deleteError

  if (!opts?.skipAudit) {
    await logAudit({
      actor: opts?.actor || 'unknown',
      action: 'employee.offboard',
      entity_type: 'employee',
      entity_id: employee.id,
      entity_label: label,
      details: {
        email: employee.email,
        devices_returned: devices.length,
        removed: true,
        ...(opts?.via ? { via: opts.via } : {}),
        ...(opts?.terminationDate ? { termination_date: opts.terminationDate } : {}),
      },
    })
  }

  return {
    employeeId: employee.id,
    email: employee.email,
    label,
    devicesReturned: devices.length,
  }
}
