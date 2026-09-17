import { NextRequest, NextResponse } from 'next/server'
import { currentActor } from '@/lib/audit'
import { getServiceSupabase } from '@/lib/supabase'
import { removeEmployeeFromProgram } from '@/lib/offboard'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await removeEmployeeFromProgram(
      getServiceSupabase(),
      params.id,
      { actor: await currentActor(), via: 'offboard' }
    )

    if (!result) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${result.label} was removed from the program`,
      devices_returned: result.devicesReturned,
    })
  } catch (error: any) {
    console.error('Error offboarding employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to offboard employee' },
      { status: 500 }
    )
  }
}
