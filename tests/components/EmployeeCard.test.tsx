import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmployeeCard from '@/components/EmployeeCard'
import type { Employee } from '@/lib/types'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

function makeEmployee(overrides: Partial<Employee & { devices?: any }> = {}): Employee & { devices?: { count: number }[] } {
  return {
    id: 'emp-1',
    entra_id: 'emp-1',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    display_name: 'Alice Smith',
    job_title: 'Engineer',
    department: 'Operations',
    office_location: 'Atlanta',
    phone_number: '555-1234',
    mobile_phone: null,
    manager_entra_id: null,
    dpt_manager: null,
    employment_status: 'active',
    hire_date: null,
    termination_date: null,
    last_synced_at: '2024-01-01',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    devices: [{ count: 3 }],
    ...overrides,
  }
}

describe('EmployeeCard', () => {
  it('renders employee name', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('renders email address', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders job title', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  it('renders department', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('Operations')).toBeInTheDocument()
  })

  it('renders office location', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('Atlanta')).toBeInTheDocument()
  })

  it('renders phone number', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })

  it('renders device count from count objects', () => {
    render(<EmployeeCard employee={makeEmployee({ devices: [{ count: 5 }] })} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('devices')).toBeInTheDocument()
  })

  it('renders 0 devices when devices array is empty', () => {
    render(<EmployeeCard employee={makeEmployee({ devices: [] })} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('shows active status badge', () => {
    render(<EmployeeCard employee={makeEmployee({ employment_status: 'active' })} />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('shows terminated status badge', () => {
    render(<EmployeeCard employee={makeEmployee({ employment_status: 'terminated' })} />)
    expect(screen.getByText('terminated')).toBeInTheDocument()
  })

  it('shows on_leave status badge', () => {
    render(<EmployeeCard employee={makeEmployee({ employment_status: 'on_leave' })} />)
    expect(screen.getByText('on_leave')).toBeInTheDocument()
  })

  it('falls back to first + last name when display_name is null', () => {
    render(
      <EmployeeCard
        employee={makeEmployee({ display_name: null, first_name: 'Bob', last_name: 'Jones' })}
      />
    )
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('links to employee detail page', () => {
    render(<EmployeeCard employee={makeEmployee()} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/employees/emp-1')
  })

  it('hides optional fields when they are null', () => {
    render(
      <EmployeeCard
        employee={makeEmployee({
          job_title: null,
          department: null,
          office_location: null,
          phone_number: null,
        })}
      />
    )
    expect(screen.queryByText('Engineer')).not.toBeInTheDocument()
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()
    expect(screen.queryByText('Atlanta')).not.toBeInTheDocument()
    expect(screen.queryByText('555-1234')).not.toBeInTheDocument()
  })
})
