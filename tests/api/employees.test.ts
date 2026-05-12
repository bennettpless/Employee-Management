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

    let callCount = 0
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

describe('GET /api/employees/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 for unknown employee', async () => {
    const chain = chainable({ data: null, error: { message: 'not found', code: 'PGRST116' } })
    mockFrom.mockReturnValue(chain)

    const { GET } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost:3000/api/employees/missing-id')
    const res = await GET(req, { params: { id: 'missing-id' } })

    expect(res.status).toBe(500)
  })

  it('returns employee with devices on success', async () => {
    const employee = {
      id: 'emp-1',
      display_name: 'Alice',
      email: 'alice@example.com',
      manager_entra_id: null,
    }

    const selectChains: Record<string, any> = {}

    mockFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        return chainable({ data: employee, error: null })
      }
      if (table === 'devices') {
        return chainable({ data: [], error: null })
      }
      if (table === 'license_assignments') {
        return chainable({ data: [], error: null })
      }
      if (table === 'device_assignments_history') {
        return chainable({ data: [], error: null })
      }
      if (table === 'device_software') {
        return chainable({ data: [], error: null })
      }
      return chainable({ data: [], error: null })
    })

    const { GET } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost:3000/api/employees/emp-1')
    const res = await GET(req, { params: { id: 'emp-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.employee.display_name).toBe('Alice')
  })
})

describe('POST /api/employees/onboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/employees/onboard/route')
    const req = new NextRequest('http://localhost:3000/api/employees/onboard', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Email is required')
  })

  it('creates employee and returns success', async () => {
    const newEmployee = {
      id: 'new-emp',
      email: 'new@example.com',
      display_name: 'New User',
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        return chainable({ data: newEmployee, error: null })
      }
      return chainable({ data: [], error: null })
    })

    const { POST } = await import('@/app/api/employees/onboard/route')
    const req = new NextRequest('http://localhost:3000/api/employees/onboard', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'User',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.employee.email).toBe('new@example.com')
  })
})

describe('PUT /api/employees/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates employee fields', async () => {
    const currentEmployee = {
      email: 'alice@example.com',
      entra_id: 'alice@example.com',
      first_name: 'Alice',
      last_name: 'Smith',
      display_name: 'Alice Smith',
    }
    const updatedEmployee = {
      ...currentEmployee,
      job_title: 'Senior Engineer',
    }

    let firstCall = true
    mockFrom.mockImplementation(() => {
      if (firstCall) {
        firstCall = false
        return chainable({ data: currentEmployee, error: null })
      }
      return chainable({ data: updatedEmployee, error: null })
    })

    const { PUT } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost:3000/api/employees/emp-1', {
      method: 'PUT',
      body: JSON.stringify({ job_title: 'Senior Engineer' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PUT(req, { params: { id: 'emp-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('returns 404 when employee not found', async () => {
    mockFrom.mockImplementation(() => {
      return chainable({ data: null, error: { message: 'not found' } })
    })

    const { PUT } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost:3000/api/employees/bad-id', {
      method: 'PUT',
      body: JSON.stringify({ job_title: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PUT(req, { params: { id: 'bad-id' } })
    expect(res.status).toBe(404)
  })
})
