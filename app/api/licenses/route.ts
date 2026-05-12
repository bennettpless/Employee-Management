import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    
    // Count licenses directly from the employee_software_licenses table
    const { data: licenses, error } = await supabase
      .from('employee_software_licenses')
      .select('software_name')
      .eq('has_license', true)

    if (error) throw error

    const counts: Record<string, number> = {}
    if (licenses) {
      for (const row of licenses) {
        counts[row.software_name] = (counts[row.software_name] || 0) + 1
      }
    }

    const result = Object.entries(counts)
      .map(([software_name, user_count]) => ({ software_name, user_count }))
      .filter(l => l.user_count > 0)
      .sort((a, b) => a.software_name.localeCompare(b.software_name))

    return NextResponse.json({ licenses: result })
  } catch (error: any) {
    console.error('Error fetching licenses:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch licenses' },
      { status: 500 }
    )
  }
}
