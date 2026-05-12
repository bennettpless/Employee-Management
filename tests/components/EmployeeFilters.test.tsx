import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeeFilters from '@/components/EmployeeFilters'

function getSelectByLabel(labelText: string) {
  const label = screen.getByText(labelText)
  const container = label.parentElement!
  return within(container).getByRole('combobox')
}

describe('EmployeeFilters', () => {
  it('renders search input', () => {
    render(<EmployeeFilters onFilterChange={vi.fn()} />)
    expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument()
  })

  it('renders Filters toggle button', () => {
    render(<EmployeeFilters onFilterChange={vi.fn()} />)
    expect(screen.getByText('Filters')).toBeInTheDocument()
  })

  it('calls onFilterChange with initial empty state', async () => {
    const onFilterChange = vi.fn()
    render(<EmployeeFilters onFilterChange={onFilterChange} />)

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({
        search: '',
        status: '',
        department: '',
        office: '',
        branch: '',
      })
    })
  })

  it('emits updated search on typing', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    render(<EmployeeFilters onFilterChange={onFilterChange} />)

    const input = screen.getByPlaceholderText(/search by name or email/i)
    await user.type(input, 'Alice')

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0]
      expect(lastCall.search).toBe('Alice')
    })
  })

  it('shows filter dropdowns when Filters button is clicked', async () => {
    const user = userEvent.setup()
    render(<EmployeeFilters onFilterChange={vi.fn()} />)

    expect(screen.queryByText('Employment Status')).not.toBeInTheDocument()

    await user.click(screen.getByText('Filters'))

    expect(screen.getByText('Employment Status')).toBeInTheDocument()
    expect(screen.getByText('Department')).toBeInTheDocument()
    expect(screen.getByText('Office Location')).toBeInTheDocument()
    expect(screen.getByText('Branch Name')).toBeInTheDocument()
  })

  it('emits status filter change', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    render(<EmployeeFilters onFilterChange={onFilterChange} />)

    await user.click(screen.getByText('Filters'))

    const statusSelect = getSelectByLabel('Employment Status')
    await user.selectOptions(statusSelect, 'active')

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0]
      expect(lastCall.status).toBe('active')
    })
  })

  it('shows Clear button when a dropdown filter is active', async () => {
    const user = userEvent.setup()
    render(<EmployeeFilters onFilterChange={vi.fn()} />)

    expect(screen.queryByText('Clear')).not.toBeInTheDocument()

    await user.click(screen.getByText('Filters'))
    const statusSelect = getSelectByLabel('Employment Status')
    await user.selectOptions(statusSelect, 'terminated')

    await waitFor(() => {
      expect(screen.getByText('Clear')).toBeInTheDocument()
    })
  })

  it('resets all filters when Clear button is clicked', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    render(<EmployeeFilters onFilterChange={onFilterChange} />)

    await user.click(screen.getByText('Filters'))
    const statusSelect = getSelectByLabel('Employment Status')
    await user.selectOptions(statusSelect, 'active')

    await waitFor(() => {
      expect(screen.getByText('Clear')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Clear'))

    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0]
      expect(lastCall.status).toBe('')
      expect(lastCall.department).toBe('')
      expect(lastCall.office).toBe('')
      expect(lastCall.branch).toBe('')
      expect(lastCall.search).toBe('')
    })
  })

  it('shows active filter count badge', async () => {
    const user = userEvent.setup()
    render(<EmployeeFilters onFilterChange={vi.fn()} />)

    await user.click(screen.getByText('Filters'))

    const statusSelect = getSelectByLabel('Employment Status')
    await user.selectOptions(statusSelect, 'active')

    const deptSelect = getSelectByLabel('Department')
    await user.selectOptions(deptSelect, 'Engineer')

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })
})
