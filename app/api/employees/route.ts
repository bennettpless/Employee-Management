import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { currentActor, logAudit } from '@/lib/audit'

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

/**
 * Manual employee create — the exception path for people who bypass the
 * onboarding workbook (e.g. staff absorbed via a merger). The normal path
 * is still the onboarding sync; rows created here use the same shape
 * (entra_id = email) so a later sync matches them instead of duplicating.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const optionalFields = [
      'first_name', 'last_name', 'display_name', 'job_title', 'department',
      'office_location', 'phone_number', 'extension', 'username',
    ]
    const employeeData: Record<string, any> = {
      entra_id: email,
      email,
      employment_status: 'active',
    }
    for (const field of optionalFields) {
      const value = typeof body[field] === 'string' ? body[field].trim() : ''
      employeeData[field] = value || null
    }

    if (!employeeData.display_name) {
      employeeData.display_name =
        `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim() ||
        null
    }

    const { data: existing } = await supabase
      .from('employees')
      .select('id, email, employment_status')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.employment_status === 'active'
              ? 'An employee with this email already exists'
              : `An employee with this email already exists (status: ${existing.employment_status})`,
        },
        { status: 409 }
      )
    }

    const { data: employee, error: insertError } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single()

    if (insertError) {
      // Unique violation (e.g. concurrent insert) → same 409 as the pre-check
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'An employee with this email already exists' },
          { status: 409 }
        )
      }
      throw insertError
    }

    await logAudit({
      actor: await currentActor(),
      action: 'employee.create',
      entity_type: 'employee',
      entity_id: employee.id,
      entity_label: employee.display_name || employee.email,
      details: { email, via: 'manual' },
    })

    return NextResponse.json({ success: true, employee }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create employee' },
      { status: 500 }
    )
  }
}
