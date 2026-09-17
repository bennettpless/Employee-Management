import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin'
import { currentActor, logAudit } from '@/lib/audit'
import { canRemoveAdmin, normalizeEmail, type AppRole } from '@/lib/roles'
import { deleteRole, listRoles, upsertRole } from '@/lib/role-store'

export async function GET() {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }
    const roles = await listRoles()
    return NextResponse.json({
      roles,
      admins: roles.filter((r) => r.role === 'admin'),
      accounting: roles.filter((r) => r.role === 'accounting'),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load roles'
    console.error('Error listing roles:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }
    const body = (await request.json()) as { email?: string; role?: string }
    const role = body.role
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Role must be admin' }, { status: 400 })
    }
    const actor = await currentActor()
    const saved = await upsertRole(String(body.email || ''), role as AppRole, actor)
    await logAudit({
      actor,
      action: 'role.upsert',
      entity_type: 'sync',
      entity_label: saved.email,
      details: { role: saved.role },
    })
    return NextResponse.json({ role: saved })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save role'
    console.error('Error saving role:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }
    const email = normalizeEmail(request.nextUrl.searchParams.get('email'))
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }
    const roles = await listRoles()
    const target = roles.find((r) => r.email === email)
    if (!target) {
      return NextResponse.json({ error: 'Email is not on a role list' }, { status: 404 })
    }
    if (target.role === 'admin') {
      const check = canRemoveAdmin(
        email,
        roles.filter((r) => r.role === 'admin').map((r) => r.email)
      )
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 })
      }
    }
    await deleteRole(email)
    await logAudit({
      actor: await currentActor(),
      action: 'role.delete',
      entity_type: 'sync',
      entity_label: email,
      details: { previous_role: target.role },
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove role'
    console.error('Error removing role:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
