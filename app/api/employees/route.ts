import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    
    const status = searchParams.get('status')
    const department = searchParams.get('department')
    const office = searchParams.get('office')
    const search = searchParams.get('search')

    let query = supabase
      .from('employees')
      .select('*')

    if (status) {
      query = query.eq('employment_status', status)
    }

    if (department) {
      query = query.eq('department', department)
    }

    if (office) {
      query = query.eq('office_location', office)
    }

    if (search) {
      const sanitized = search.replace(/[%_\\().,]/g, '')
      if (sanitized) {
        query = query.or(`display_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`)
      }
    }

    const { data: employees, error } = await query.order('display_name', { ascending: true })

    if (error) {
      throw error
    }

    if (employees && employees.length > 0) {
      const employeeIds = employees.map((emp: any) => emp.id)
      const { data: deviceRows } = await supabase
        .from('devices')
        .select('employee_id')
        .in('employee_id', employeeIds)

      const countsByEmployee = new Map<string, number>()
      if (deviceRows) {
        for (const row of deviceRows) {
          countsByEmployee.set(row.employee_id, (countsByEmployee.get(row.employee_id) || 0) + 1)
        }
      }

      employees.forEach((emp: any) => {
        emp.devices = [{ count: countsByEmployee.get(emp.id) || 0 }]
      })
    }

    return NextResponse.json({ employees: employees || [] })
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}
