import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet, addExcelRow, updateExcelRow, deleteExcelRow } from '@/lib/sharepoint-excel'
import { mapEmployeeToExcelRow } from '@/lib/excel-mapper'

/**
 * Add a new employee to Excel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeId } = body

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Fetch employee with all related data
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Fetch devices
    const { data: devices } = await supabase
      .from('devices')
      .select('*')
      .eq('employee_id', employeeId)

    employee.devices = devices || []

    // Fetch software licenses
    const { data: softwareLicenses } = await supabase
      .from('employee_software_licenses')
      .select('*')
      .eq('employee_id', employeeId)

    employee.software_licenses = softwareLicenses || []

    // Map to Excel row
    const excelRow = mapEmployeeToExcelRow(employee)

    // Add to Excel
    await addExcelRow(excelRow)

    return NextResponse.json({ success: true, message: 'Employee added to Excel' })
  } catch (error: any) {
    console.error('Error adding employee to Excel:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add employee to Excel' },
      { status: 500 }
    )
  }
}

/**
 * Update an employee in Excel
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeId } = body

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Fetch employee with all related data
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Fetch devices
    const { data: devices } = await supabase
      .from('devices')
      .select('*')
      .eq('employee_id', employeeId)

    employee.devices = devices || []

    // Fetch software licenses
    const { data: softwareLicenses } = await supabase
      .from('employee_software_licenses')
      .select('*')
      .eq('employee_id', employeeId)

    employee.software_licenses = softwareLicenses || []

    // Find the row in Excel by reading the sheet and matching email
    const excelRows = await readExcelSheet()
    const rowIndex = excelRows.findIndex(
      row => row['Email Address']?.toString().toLowerCase() === employee.email?.toLowerCase()
    )

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Employee not found in Excel' },
        { status: 404 }
      )
    }

    // Map to Excel row
    const excelRow = mapEmployeeToExcelRow(employee)

    // Update in Excel (rowIndex + 2 because: +1 for header row, +1 for 1-based indexing)
    await updateExcelRow(rowIndex + 2, excelRow)

    return NextResponse.json({ success: true, message: 'Employee updated in Excel' })
  } catch (error: any) {
    console.error('Error updating employee in Excel:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update employee in Excel' },
      { status: 500 }
    )
  }
}

/**
 * Remove an employee from Excel
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')

    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Fetch employee to get email for matching
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('email')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Find the row in Excel
    const excelRows = await readExcelSheet()
    const rowIndex = excelRows.findIndex(
      row => row['Email Address']?.toString().toLowerCase() === employee.email?.toLowerCase()
    )

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Employee not found in Excel' },
        { status: 404 }
      )
    }

    // Delete from Excel (rowIndex + 2 because: +1 for header row, +1 for 1-based indexing)
    await deleteExcelRow(rowIndex + 2)

    return NextResponse.json({ success: true, message: 'Employee removed from Excel' })
  } catch (error: any) {
    console.error('Error removing employee from Excel:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove employee from Excel' },
      { status: 500 }
    )
  }
}

