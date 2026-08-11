import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { currentActor, logAudit } from '@/lib/audit'

const EVENT_TYPES = ['repair', 'upgrade', 'note']

async function deviceLabel(supabase: ReturnType<typeof getServiceSupabase>, deviceId: string) {
  const { data } = await supabase
    .from('devices')
    .select('device_name, asset_tag, serial_number')
    .eq('id', deviceId)
    .maybeSingle()
  return data?.device_name || data?.asset_tag || data?.serial_number || deviceId
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const eventType = (body.event_type || '').toString().trim()
    const description = (body.description || '').toString().trim()
    const eventDate = (body.event_date || '').toString().trim()

    if (!EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${EVENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }

    const { data: entry, error } = await supabase
      .from('device_history')
      .insert({
        device_id: params.id,
        event_type: eventType,
        event_date: eventDate || new Date().toISOString().slice(0, 10),
        description,
      })
      .select()
      .single()

    if (error) throw error

    await logAudit({
      actor: await currentActor(),
      action: 'device_history.add',
      entity_type: 'device',
      entity_id: params.id,
      entity_label: await deviceLabel(supabase, params.id),
      details: { event_type: eventType, event_date: entry.event_date, description },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding device history entry:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add history entry' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const entryId = new URL(request.url).searchParams.get('entry_id')
    if (!entryId) {
      return NextResponse.json({ error: 'entry_id is required' }, { status: 400 })
    }

    const { data: entry } = await supabase
      .from('device_history')
      .select('event_type, event_date, description')
      .eq('id', entryId)
      .eq('device_id', params.id)
      .maybeSingle()

    const { error } = await supabase
      .from('device_history')
      .delete()
      .eq('id', entryId)
      .eq('device_id', params.id)

    if (error) throw error

    if (entry) {
      await logAudit({
        actor: await currentActor(),
        action: 'device_history.delete',
        entity_type: 'device',
        entity_id: params.id,
        entity_label: await deviceLabel(supabase, params.id),
        details: entry as Record<string, unknown>,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting device history entry:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete history entry' },
      { status: 500 }
    )
  }
}
