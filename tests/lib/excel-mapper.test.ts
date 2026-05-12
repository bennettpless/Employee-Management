import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/azure-graph', () => ({
  getGraphClient: vi.fn(),
  default: undefined,
}))

import { mapExcelRowToEmployee, mapEmployeeToExcelRow } from '@/lib/excel-mapper'
import { EXCEL_COLUMNS, ExcelRow } from '@/lib/sharepoint-excel'

function buildRow(overrides: Partial<Record<string, any>> = {}): ExcelRow {
  return {
    [EXCEL_COLUMNS.FIRST_NAME]: 'Jane',
    [EXCEL_COLUMNS.LAST_NAME]: 'Doe',
    [EXCEL_COLUMNS.FIRST_LAST]: 'Jane Doe',
    [EXCEL_COLUMNS.EMAIL_ADDRESS]: 'jane.doe@example.com',
    [EXCEL_COLUMNS.TITLE]: 'Engineer',
    [EXCEL_COLUMNS.DEPARTMENT]: 'Operations',
    [EXCEL_COLUMNS.OFFICE_LOCATION]: 'Atlanta',
    [EXCEL_COLUMNS.PHONE_NUMBER]: '555-1234',
    [EXCEL_COLUMNS.USERNAME]: 'jdoe',
    [EXCEL_COLUMNS.NICK_NAME]: 'JD',
    [EXCEL_COLUMNS.BRANCH_NAME]: 'Bennett & Pless Inc',
    [EXCEL_COLUMNS.TYPE]: 'FT',
    [EXCEL_COLUMNS.SUPERVISOR]: 'John Smith',
    [EXCEL_COLUMNS.DPT_MANAGER]: 'Alice Mgr',
    [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: '',
    [EXCEL_COLUMNS.PC_TYPE]: '',
    [EXCEL_COLUMNS.ENROLLED_IN_INTUNE]: 'Yes',
    [EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS]: 'No',
    [EXCEL_COLUMNS.OFFICE_365_MFA]: 'Yes',
    ...overrides,
  }
}

describe('mapExcelRowToEmployee', () => {
  it('maps all basic fields correctly', () => {
    const result = mapExcelRowToEmployee(buildRow())

    expect(result.email).toBe('jane.doe@example.com')
    expect(result.first_name).toBe('Jane')
    expect(result.last_name).toBe('Doe')
    expect(result.display_name).toBe('Jane Doe')
    expect(result.job_title).toBe('Engineer')
    expect(result.department).toBe('Operations')
    expect(result.office_location).toBe('Atlanta')
    expect(result.phone_number).toBe('555-1234')
    expect(result.username).toBe('jdoe')
    expect(result.nick_name).toBe('JD')
    expect(result.branch_name).toBe('Bennett & Pless Inc')
    expect(result.type).toBe('FT')
    expect(result.supervisor).toBe('John Smith')
    expect(result.dpt_manager).toBe('Alice Mgr')
    expect(result.employment_status).toBe('active')
  })

  it('lowercases and trims email', () => {
    const result = mapExcelRowToEmployee(
      buildRow({ [EXCEL_COLUMNS.EMAIL_ADDRESS]: '  Jane.DOE@Example.COM  ' })
    )
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('falls back to first + last for display_name when FIRST_LAST is empty', () => {
    const result = mapExcelRowToEmployee(
      buildRow({ [EXCEL_COLUMNS.FIRST_LAST]: '' })
    )
    expect(result.display_name).toBe('Jane Doe')
  })

  it('returns null for empty optional fields', () => {
    const result = mapExcelRowToEmployee(
      buildRow({
        [EXCEL_COLUMNS.TITLE]: '',
        [EXCEL_COLUMNS.DEPARTMENT]: '',
        [EXCEL_COLUMNS.OFFICE_LOCATION]: '',
        [EXCEL_COLUMNS.PHONE_NUMBER]: '',
      })
    )
    expect(result.job_title).toBeNull()
    expect(result.department).toBeNull()
    expect(result.office_location).toBeNull()
    expect(result.phone_number).toBeNull()
  })

  it('handles completely empty/null row gracefully', () => {
    const result = mapExcelRowToEmployee({})
    expect(result.email).toBe('')
    expect(result.first_name).toBeNull()
    expect(result.last_name).toBeNull()
    expect(result.devices).toEqual([])
    expect(result.softwareLicenses).toEqual([])
    expect(result.employment_status).toBe('active')
  })

  describe('device parsing', () => {
    it('parses a single device name', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'DESKTOP-ABC',
          [EXCEL_COLUMNS.PC_TYPE]: 'Laptop',
        })
      )
      expect(result.devices).toEqual([
        { device_name: 'DESKTOP-ABC', device_type: 'Laptop' },
      ])
    })

    it('parses comma-separated device names with matching types', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'PC-001, PC-002',
          [EXCEL_COLUMNS.PC_TYPE]: 'Desktop, Laptop',
        })
      )
      expect(result.devices).toEqual([
        { device_name: 'PC-001', device_type: 'Desktop' },
        { device_name: 'PC-002', device_type: 'Laptop' },
      ])
    })

    it('applies single PC type to all devices', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'PC-001, PC-002, PC-003',
          [EXCEL_COLUMNS.PC_TYPE]: 'Laptop',
        })
      )
      expect(result.devices).toHaveLength(3)
      expect(result.devices.every((d: any) => d.device_type === 'Laptop')).toBe(true)
    })

    it('removes dates in parentheses from device names', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'DESKTOP-XYZ (1/11/11), LAPTOP-ABC (12/5/2023)',
          [EXCEL_COLUMNS.PC_TYPE]: 'Desktop, Laptop',
        })
      )
      expect(result.devices).toEqual([
        { device_name: 'DESKTOP-XYZ', device_type: 'Desktop' },
        { device_name: 'LAPTOP-ABC', device_type: 'Laptop' },
      ])
    })

    it('handles semicolon-separated device names', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'PC-001; PC-002',
          [EXCEL_COLUMNS.PC_TYPE]: 'Desktop; Laptop',
        })
      )
      expect(result.devices).toHaveLength(2)
      expect(result.devices[0].device_name).toBe('PC-001')
      expect(result.devices[1].device_name).toBe('PC-002')
    })

    it('returns null device_type when no types are provided', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'DESKTOP-XYZ',
          [EXCEL_COLUMNS.PC_TYPE]: '',
        })
      )
      expect(result.devices).toEqual([
        { device_name: 'DESKTOP-XYZ', device_type: null },
      ])
    })

    it('returns empty devices for blank PC names', () => {
      const result = mapExcelRowToEmployee(buildRow())
      expect(result.devices).toEqual([])
    })
  })

  describe('software license detection', () => {
    it('detects "Yes" as a license', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.AUTOCAD]: 'Yes' })
      )
      expect(result.softwareLicenses).toContainEqual({
        software_name: EXCEL_COLUMNS.AUTOCAD,
        has_license: true,
      })
    })

    it('detects "Y" as a license', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.BIM]: 'Y' })
      )
      expect(result.softwareLicenses).toContainEqual({
        software_name: EXCEL_COLUMNS.BIM,
        has_license: true,
      })
    })

    it('detects boolean true as a license', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.HILTI]: true })
      )
      expect(result.softwareLicenses).toContainEqual({
        software_name: EXCEL_COLUMNS.HILTI,
        has_license: true,
      })
    })

    it('detects "1" and numeric 1 as licenses', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.RISA]: '1',
          [EXCEL_COLUMNS.LUCID]: 1,
        })
      )
      expect(result.softwareLicenses).toContainEqual({
        software_name: EXCEL_COLUMNS.RISA,
        has_license: true,
      })
      expect(result.softwareLicenses).toContainEqual({
        software_name: EXCEL_COLUMNS.LUCID,
        has_license: true,
      })
    })

    it('ignores empty, null, and "No" values', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.AUTOCAD]: '',
          [EXCEL_COLUMNS.BIM]: null,
          [EXCEL_COLUMNS.HILTI]: 'No',
        })
      )
      const names = result.softwareLicenses.map((l: any) => l.software_name)
      expect(names).not.toContain(EXCEL_COLUMNS.AUTOCAD)
      expect(names).not.toContain(EXCEL_COLUMNS.BIM)
      expect(names).not.toContain(EXCEL_COLUMNS.HILTI)
    })

    it('detects multiple licenses at once', () => {
      const result = mapExcelRowToEmployee(
        buildRow({
          [EXCEL_COLUMNS.AUTOCAD]: 'Yes',
          [EXCEL_COLUMNS.ETABS]: 'Yes',
          [EXCEL_COLUMNS.BENTLEY]: 'Y',
        })
      )
      expect(result.softwareLicenses).toHaveLength(3)
    })
  })

  describe('boolean flags', () => {
    it('maps "Yes" to true for enrolled_in_intune', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.ENROLLED_IN_INTUNE]: 'Yes' })
      )
      expect(result.enrolled_in_intune).toBe(true)
    })

    it('maps "No" to false', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS]: 'No' })
      )
      expect(result.ninja_end_user_remote_access).toBe(false)
    })

    it('maps empty/null to false', () => {
      const result = mapExcelRowToEmployee(
        buildRow({ [EXCEL_COLUMNS.OFFICE_365_MFA]: '' })
      )
      expect(result.office_365_mfa).toBe(false)
    })
  })

  it('stores all original row data in excel_data', () => {
    const row = buildRow({ customField: 'customValue' })
    const result = mapExcelRowToEmployee(row)
    expect(result.excel_data).toHaveProperty('customField', 'customValue')
    expect(result.excel_data[EXCEL_COLUMNS.FIRST_NAME]).toBe('Jane')
  })
})

describe('mapEmployeeToExcelRow', () => {
  const baseEmployee = {
    first_name: 'Jane',
    last_name: 'Doe',
    display_name: 'Jane Doe',
    email: 'jane@example.com',
    nick_name: 'JD',
    username: 'jdoe',
    phone_number: '555-1234',
    extension: '42',
    branch_name: 'Bennett & Pless Inc',
    office_location: 'Atlanta',
    type: 'FT',
    job_title: 'Engineer',
    department: 'Operations',
    supervisor: 'John Smith',
    dpt_manager: 'Alice Mgr',
    enrolled_in_intune: true,
    ninja_end_user_remote_access: false,
    office_365_mfa: true,
    duplicate_user_email: '',
    devices: [] as any[],
    software_licenses: [] as any[],
    excel_data: null as any,
  }

  it('maps basic fields to Excel columns', () => {
    const row = mapEmployeeToExcelRow(baseEmployee)
    expect(row[EXCEL_COLUMNS.FIRST_NAME]).toBe('Jane')
    expect(row[EXCEL_COLUMNS.LAST_NAME]).toBe('Doe')
    expect(row[EXCEL_COLUMNS.FIRST_LAST]).toBe('Jane Doe')
    expect(row[EXCEL_COLUMNS.EMAIL_ADDRESS]).toBe('jane@example.com')
    expect(row[EXCEL_COLUMNS.TITLE]).toBe('Engineer')
    expect(row[EXCEL_COLUMNS.DEPARTMENT]).toBe('Operations')
  })

  it('formats LAST_FIRST correctly', () => {
    const row = mapEmployeeToExcelRow(baseEmployee)
    expect(row[EXCEL_COLUMNS.LAST_FIRST]).toBe('Doe, Jane')
  })

  it('handles missing first or last name in LAST_FIRST', () => {
    const row = mapEmployeeToExcelRow({ ...baseEmployee, first_name: null })
    expect(row[EXCEL_COLUMNS.LAST_FIRST]).toBe('Doe')
  })

  it('maps boolean flags to Yes/No strings', () => {
    const row = mapEmployeeToExcelRow(baseEmployee)
    expect(row[EXCEL_COLUMNS.ENROLLED_IN_INTUNE]).toBe('Yes')
    expect(row[EXCEL_COLUMNS.NINJA_END_USER_REMOTE_ACCESS]).toBe('No')
    expect(row[EXCEL_COLUMNS.OFFICE_365_MFA]).toBe('Yes')
  })

  it('maps devices to comma-separated PC names and types', () => {
    const row = mapEmployeeToExcelRow({
      ...baseEmployee,
      devices: [
        { device_name: 'PC-001', device_type: 'Desktop' },
        { device_name: 'PC-002', device_type: 'Laptop' },
      ],
    })
    expect(row[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]).toBe('PC-001, PC-002')
    expect(row[EXCEL_COLUMNS.PC_TYPE]).toBe('Desktop, Laptop')
  })

  it('maps software_licenses to Yes/No columns', () => {
    const row = mapEmployeeToExcelRow({
      ...baseEmployee,
      software_licenses: [
        { software_name: EXCEL_COLUMNS.AUTOCAD, has_license: true },
        { software_name: EXCEL_COLUMNS.BIM, has_license: false },
      ],
    })
    expect(row[EXCEL_COLUMNS.AUTOCAD]).toBe('Yes')
    expect(row[EXCEL_COLUMNS.BIM]).toBe('No')
  })

  it('preserves Employee ID from excel_data', () => {
    const row = mapEmployeeToExcelRow({
      ...baseEmployee,
      excel_data: { [EXCEL_COLUMNS.EMPLOYEE_ID]: 42 },
    })
    expect(row[EXCEL_COLUMNS.EMPLOYEE_ID]).toBe(42)
  })

  it('handles null/empty employee gracefully', () => {
    const row = mapEmployeeToExcelRow({
      first_name: null,
      last_name: null,
      display_name: null,
      email: null,
    })
    expect(row[EXCEL_COLUMNS.FIRST_NAME]).toBe('')
    expect(row[EXCEL_COLUMNS.LAST_NAME]).toBe('')
    expect(row[EXCEL_COLUMNS.EMAIL_ADDRESS]).toBe('')
  })
})

describe('round-trip mapping', () => {
  it('preserves core data through Excel → Employee → Excel', () => {
    const originalRow = buildRow({
      [EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]: 'PC-001, PC-002',
      [EXCEL_COLUMNS.PC_TYPE]: 'Desktop, Laptop',
      [EXCEL_COLUMNS.AUTOCAD]: 'Yes',
      [EXCEL_COLUMNS.BIM]: 'Yes',
    })

    const employee = mapExcelRowToEmployee(originalRow)

    const employeeForExcel = {
      ...employee,
      software_licenses: employee.softwareLicenses,
    }
    const roundTripped = mapEmployeeToExcelRow(employeeForExcel)

    expect(roundTripped[EXCEL_COLUMNS.FIRST_NAME]).toBe('Jane')
    expect(roundTripped[EXCEL_COLUMNS.LAST_NAME]).toBe('Doe')
    expect(roundTripped[EXCEL_COLUMNS.EMAIL_ADDRESS]).toBe('jane.doe@example.com')
    expect(roundTripped[EXCEL_COLUMNS.DEPARTMENT]).toBe('Operations')
    expect(roundTripped[EXCEL_COLUMNS.PC_NAMES_ACTIVE_ENROLLED]).toBe('PC-001, PC-002')
    expect(roundTripped[EXCEL_COLUMNS.PC_TYPE]).toBe('Desktop, Laptop')
  })
})
