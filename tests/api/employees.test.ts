import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => mockSupabase,
}))

function chainable(resolveValue: any) {
  const chain: any = {}
  const methods = ['select', 'eq', 'in', 'or', 'order', 'single', 'insert', 'update', 'delete']
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
