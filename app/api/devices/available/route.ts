import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * GET /api/devices/available?search=...&include_assigned=false
 * Returns devices available for assignment (from NinjaOne sync).
 * Used by the DevicePicker component.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    
    const search = searchParams.get('search') || ''
    const includeAssigned = searchParams.get('include_assigned') === 'true'
    
    let query = supabase
      .from('devices')
      .select('id, device_name, device_type, manufacturer, model, serial_number, os_name, is_in_ninja, employee_id')
      .eq('is_in_ninja', true)
      .order('device_name', { ascending: true })
      .limit(50)
    
    if (!includeAssigned) {
      query = query.is('employee_id', null)
    }
    
    if (search.trim()) {
      const term = search.trim().replace(/[%_\\().,]/g, '')
      if (term) {
        query = query.or(`device_name.ilike.%${term}%,serial_number.ilike.%${term}%,model.ilike.%${term}%`)
      }
    }
    
    const { data: devices, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({ devices: devices || [] })
  } catch (error: any) {
    console.error('Error fetching available devices:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch available devices' },
      { status: 500 }
    )
  }
}
