import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const { data: device, error } = await supabase
      .from('devices')
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      throw error
    }

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }

    // Get device assignment history (current and previous users)
    const { data: assignmentHistory } = await supabase
      .from('device_assignments_history')
      .select(`
        id,
        employee:employees(
          id,
          display_name,
          email,
          first_name,
          last_name
        ),
        assignment_date,
        unassignment_date,
        registered_date,
        is_current
      `)
      .eq('device_id', device.id)
      .order('assignment_date', { ascending: false })
    
    // Separate current and previous assignments
    const currentAssignments = (assignmentHistory || []).filter((a: any) => a.is_current && a.employee)
    const previousAssignments = (assignmentHistory || []).filter((a: any) => !a.is_current && a.employee)
    
    // Sort previous assignments by unassignment_date (most recent first)
    previousAssignments.sort((a: any, b: any) => {
      const dateA = a.unassignment_date ? new Date(a.unassignment_date).getTime() : 0
      const dateB = b.unassignment_date ? new Date(b.unassignment_date).getTime() : 0
      return dateB - dateA
    })

    return NextResponse.json({ 
      device: {
        ...device,
        current_users: currentAssignments.map((a: any) => ({
          employee: a.employee,
          assignment_date: a.assignment_date,
          registered_date: a.registered_date
        })),
        previous_users: previousAssignments.map((a: any) => ({
          employee: a.employee,
          assignment_date: a.assignment_date,
          unassignment_date: a.unassignment_date,
          registered_date: a.registered_date
        }))
      }
    })
  } catch (error: any) {
    console.error('Error fetching device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch device' },
      { status: 500 }
    )
  }
}

