import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet, EXCEL_COLUMNS } from '@/lib/sharepoint-excel'

export const maxDuration = 120

/**
 * Parse device names from the Excel "PC Names Active / Enrolled" string.
 */
function parseDeviceNames(pcNamesRaw: string): string[] {
  if (!pcNamesRaw || pcNamesRaw.toLowerCase() === 'none') return []
  return pcNamesRaw
    .split(/[,;]/)
    .map(name => {
      let cleaned = name.trim()
      cleaned = cleaned.replace(/\s*\(\d{1,2}\/\d{1,2}\/\d{2,4}\)\s*/g, '').trim()
      return cleaned
    })
    .filter(name => name.length > 0 && name.toLowerCase() !== 'none')
}

export async function POST(_request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const startTime = Date.now()

    // 1. Fetch fresh Excel data directly from SharePoint
    console.log('[assign-from-excel] Downloading fresh Excel data from SharePoint...')
    const excelRows = await readExcelSheet()
    console.log(`[assign-from-excel] Got ${excelRows.length} rows from Excel`)

    // Debug: log first row's keys and email column
    if (excelRows.length > 0) {
      const firstRow = excelRows[0]
      console.log(`[assign-from-excel] Excel columns:`, Object.keys(firstRow).join(', '))
      console.log(`[assign-from-excel] First row email field:`, firstRow[EXCEL_COLUMNS.EMAIL_ADDRESS])
      console.log(`[assign-from-excel] First row PC Names field:`, firstRow[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED])
    }

    // 2. Fetch all employees from DB to match by email
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, email, display_name')

    if (empError) {
      throw new Error(`Failed to fetch employees: ${empError.message}`)
    }

    if (!employees || employees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No employees found in database',
        stats: { matched: 0, unmatched: 0, skipped: 0 },
      })
    }

    // Build email lookup map for matching Excel rows to DB employees
    const employeeByEmail = new Map<string, { id: string; display_name: string | null; email: string }>()
    for (const emp of employees) {
      if (emp.email) {
        employeeByEmail.set(emp.email.toLowerCase(), emp)
      }
    }

    let matched = 0
    let alreadyAssigned = 0
    const unmatchedNames: string[] = []
    const assignments: string[] = []

    // 3. For each Excel row, parse device names and try to match
    for (const row of excelRows) {
      const rawEmail = (row[EXCEL_COLUMNS.EMAIL_ADDRESS]?.toString() || '').trim().toLowerCase()
      if (!rawEmail) continue

      // Handle compound emails (e.g., "a@x.com / b@x.com") — try each one
      const emailCandidates = rawEmail.split(/[\/,;]/).map(e => e.trim()).filter(e => e.includes('@'))
      let emp: { id: string; display_name: string | null; email: string } | undefined
      for (const candidate of emailCandidates) {
        emp = employeeByEmail.get(candidate)
        if (emp) break
      }
      if (!emp) continue

      // Try both possible column names for PC names
      const pcNamesRaw = (
        row[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED] ||
        row['PC Names Active'] ||
        ''
      ).toString()
      const deviceNames = parseDeviceNames(pcNamesRaw)

      if (deviceNames.length === 0) continue

      for (const deviceName of deviceNames) {
        // Match strategy: exact → prefix (FQDN) → serial number (fuzzy)
        let matchedDevices: any[] | null = null
        let matchError: any = null

        // 1. Exact match
        const { data: exactMatch, error: exactErr } = await supabase
          .from('devices')
          .select('id, device_name, employee_id')
          .ilike('device_name', deviceName)
          .is('employee_id', null)
          .limit(1)

        if (exactErr) {
          matchError = exactErr
        } else if (exactMatch && exactMatch.length > 0) {
          matchedDevices = exactMatch
        } else {
          // 2. Prefix match for FQDN names (e.g., "PC-NAME.domain.lan")
          const { data: prefixMatch, error: prefixErr } = await supabase
            .from('devices')
            .select('id, device_name, employee_id')
            .ilike('device_name', `${deviceName}.%`)
            .is('employee_id', null)
            .limit(1)

          if (prefixErr) {
            matchError = prefixErr
          } else if (prefixMatch && prefixMatch.length > 0) {
            matchedDevices = prefixMatch
          } else {
            // 3. Serial number fallback — extract the serial from the device name
            // Skip common prefixes/words that aren't actual serial numbers
            const COMMON_WORDS = new Set(['LAPTOP', 'DESKTOP', 'SPARE', 'OFFICE', 'WORK', 'HOME', 'REMOTE', 'SERVER'])
            const parts = deviceName.split(/[-.]/)
            const serialCandidates = parts.filter(p =>
              /^[A-Za-z0-9]{6,}$/.test(p) &&
              !COMMON_WORDS.has(p.toUpperCase()) &&
              /\d/.test(p) // Must contain at least one digit to be a serial
            )

            if (serialCandidates.length > 0) {
              for (const serial of serialCandidates) {
                const { data: serialMatch, error: serialErr } = await supabase
                  .from('devices')
                  .select('id, device_name, employee_id')
                  .ilike('device_name', `%${serial}%`)
                  .is('employee_id', null)
                  .limit(1)

                if (!serialErr && serialMatch && serialMatch.length > 0) {
                  matchedDevices = serialMatch
                  break
                }
              }
            }
          }
        }

        if (matchError) {
          console.error(`Error matching device "${deviceName}":`, matchError.message)
          continue
        }

        if (!matchedDevices || matchedDevices.length === 0) {
          // Check if already assigned to this employee (exact, prefix, or serial)
          const { data: existingExact } = await supabase
            .from('devices')
            .select('id')
            .ilike('device_name', deviceName)
            .eq('employee_id', emp.id)
            .limit(1)

          const { data: existingPrefix } = await supabase
            .from('devices')
            .select('id')
            .ilike('device_name', `${deviceName}.%`)
            .eq('employee_id', emp.id)
            .limit(1)

          let existingSerial: any[] | null = null
          const COMMON_WORDS2 = new Set(['LAPTOP', 'DESKTOP', 'SPARE', 'OFFICE', 'WORK', 'HOME', 'REMOTE', 'SERVER'])
          const parts = deviceName.split(/[-.]/)
          const serialCandidates = parts.filter(p =>
            /^[A-Za-z0-9]{6,}$/.test(p) &&
            !COMMON_WORDS2.has(p.toUpperCase()) &&
            /\d/.test(p)
          )
          for (const serial of serialCandidates) {
            const { data } = await supabase
              .from('devices')
              .select('id')
              .ilike('device_name', `%${serial}%`)
              .eq('employee_id', emp.id)
              .limit(1)
            if (data && data.length > 0) {
              existingSerial = data
              break
            }
          }

          if ((existingExact && existingExact.length > 0) || (existingPrefix && existingPrefix.length > 0) || (existingSerial && existingSerial.length > 0)) {
            alreadyAssigned++
          } else {
            unmatchedNames.push(`${emp.display_name || emp.email}: ${deviceName}`)
          }
          continue
        }

        const device = matchedDevices[0]

        // 4. Assign the device to this employee
        const { error: updateError } = await supabase
          .from('devices')
          .update({ employee_id: emp.id })
          .eq('id', device.id)

        if (updateError) {
          console.error(`Error assigning device "${device.device_name}" to ${emp.email}:`, updateError.message)
          continue
        }

        // 5. Create assignment history record
        await supabase.from('device_assignments_history').insert({
          device_id: device.id,
          employee_id: emp.id,
          is_current: true,
        })

        matched++
        assignments.push(`${device.device_name} → ${emp.display_name || emp.email}`)
      }
    }

    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log(`[assign-from-excel] Done in ${duration}s: ${matched} matched, ${alreadyAssigned} already assigned, ${unmatchedNames.length} unmatched`)
    if (unmatchedNames.length > 0) {
      console.log(`[assign-from-excel] Unmatched:`, unmatchedNames.slice(0, 20))
    }

    return NextResponse.json({
      success: true,
      stats: {
        matched,
        alreadyAssigned,
        unmatched: unmatchedNames.length,
      },
      duration,
      assignments: assignments.slice(0, 50),
      unmatchedNames: unmatchedNames.slice(0, 50),
    })
  } catch (error: any) {
    console.error('Assign from Excel error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign devices from Excel' },
      { status: 500 }
    )
  }
}
