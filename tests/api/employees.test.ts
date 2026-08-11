import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => mockSupabase,
}))

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit', () => ({
  currentActor: vi.fn(async () => 'tester@example.com'),
  logAudit: (entry: any) => mockLogAudit(entry),
}))

function chainable(resolveValue: any) {
  const chain: any = {}
  const methods = ['select', 'eq', 'in', 'or', 'order', 'single', 'maybeSingle', 'insert', 'update', 'delete']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: any) => resolve(resolveValue)
  chain[Symbol.toStringTag] = 'Promise'
  return chain
}

describe('GET /api/employees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns employees list', async () => {
    const employees = [
      { id: '1', display_name: 'Alice', email: 'alice@example.com', employment_status: 'active' },
      { id: '2', display_name: 'Bob', email: 'bob@example.com', employment_status: 'active' },
    ]

    const employeeChain = chainable({ data: employees, error: null })
    const deviceChain = chainable({ data: [{ employee_id: '1' }, { employee_id: '1' }], error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'employees') return employeeChain
      if (table === 'devices') return deviceChain
      return chainable({ data: [], error: null })
    })

    const { GET } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost:3000/api/employees')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.employees).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith('employees')
  })

  it('applies status filter', async () => {
    const employeeChain = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(employeeChain)

    const { GET } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost:3000/api/employees?status=active')
    await GET(req)

    expect(employeeChain.eq).toHaveBeenCalledWith('employment_status', 'active')
  })

  it('applies department filter', async () => {
    const employeeChain = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(employeeChain)

    const { GET } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost:3000/api/employees?department=Engineer')
    await GET(req)

    expect(employeeChain.eq).toHaveBeenCalledWith('department', 'Engineer')
  })

  it('applies search filter with sanitization', async () => {
    const employeeChain = chainable({ data: [], error: null })
    mockFrom.mockReturnValue(employeeChain)

    const { GET } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost:3000/api/employees?search=alice%25drop')
    await GET(req)

    expect(employeeChain.or).toHaveBeenCalled()
    const orArg: string = employeeChain.or.mock.calls[0][0]
    // The route sanitizes special chars like % from user input but adds its own ilike wildcards
    // Verify the user's literal % was stripped: "alice%drop" → "alicedrop"
    expect(orArg).toContain('alicedrop')
    expect(orArg).not.toContain('alice%drop')
  })

  it('returns 500 on database error', async () => {
    const employeeChain = chainable({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(employeeChain)

    const { GET } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost:3000/api/employees')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('POST /api/employees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function postRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/employees/route')
    const res = await POST(postRequest({ first_name: 'Alice' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Email is required')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 409 when an employee with the email already exists', async () => {
    const existingChain = chainable({
      data: { id: '1', email: 'alice@example.com', employment_status: 'active' },
      error: null,
    })
    mockFrom.mockReturnValue(existingChain)

    const { POST } = await import('@/app/api/employees/route')
    const res = await POST(postRequest({ email: 'Alice@Example.com' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('already exists')
    expect(existingChain.insert).not.toHaveBeenCalled()
  })

  it('creates an employee with normalized email and entra_id, and audits it', async () => {
    const created = {
      id: 'new-id',
      email: 'carol@example.com',
      entra_id: 'carol@example.com',
      display_name: 'Carol Jones',
      employment_status: 'active',
    }
    const precheckChain = chainable({ data: null, error: null })
    const insertChain = chainable({ data: created, error: null })
    mockFrom
      .mockReturnValueOnce(precheckChain)
      .mockReturnValueOnce(insertChain)

    const { POST } = await import('@/app/api/employees/route')
    const res = await POST(
      postRequest({
        email: '  Carol@Example.com ',
        first_name: 'Carol',
        last_name: 'Jones',
        job_title: '',
      })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.employee.id).toBe('new-id')

    const inserted = insertChain.insert.mock.calls[0][0]
    expect(inserted.email).toBe('carol@example.com')
    expect(inserted.entra_id).toBe('carol@example.com')
    expect(inserted.display_name).toBe('Carol Jones')
    expect(inserted.job_title).toBeNull()
    expect(inserted.employment_status).toBe('active')

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'employee.create',
        entity_type: 'employee',
        entity_id: 'new-id',
        details: expect.objectContaining({ via: 'manual' }),
      })
    )
  })

  it('returns 409 on a unique violation during insert', async () => {
    const precheckChain = chainable({ data: null, error: null })
    const insertChain = chainable({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    mockFrom
      .mockReturnValueOnce(precheckChain)
      .mockReturnValueOnce(insertChain)

    const { POST } = await import('@/app/api/employees/route')
    const res = await POST(postRequest({ email: 'dave@example.com' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('already exists')
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
