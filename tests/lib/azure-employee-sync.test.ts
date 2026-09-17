import { describe, it, expect } from 'vitest'
import {
  diffAzureEmployee,
  mapAzureDepartment,
  proposedAzureOffice,
  profileValuesEqual,
} from '@/lib/azure-employee-sync'

const allowed = ['Charlotte', 'Florida', 'Nashville', 'Remote']

describe('Azure employee profile diffs', () => {
  it('maps Graph office names onto Settings locations', () => {
    expect(proposedAzureOffice('Charlotte Office', allowed)).toBe('Charlotte')
    expect(proposedAzureOffice('Orlando', allowed)).toBe('Florida')
    expect(profileValuesEqual('Engineer', 'engineer')).toBe(true)
  })

  it('maps Azure department names onto the EMS dropdown', () => {
    expect(mapAzureDepartment('Engineering')).toBe('Engineer')
    expect(mapAzureDepartment('BIM')).toBe('Designer')
    expect(mapAzureDepartment('IT')).toBe('Admin')
    expect(mapAzureDepartment('Leadership')).toBe('Leadership')
    expect(mapAzureDepartment('Sales')).toBeNull()
  })

  it('opens a review card when Azure title or office differs', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte',
        currentDepartment: 'Engineer',
        azureJobTitle: 'Project Engineer',
        azureOffice: 'Charlotte Office',
        azureDepartment: 'Engineering',
        allowedLocations: allowed,
      })
    ).toEqual({
      employeeId: '1',
      label: 'Ada',
      currentJobTitle: 'Engineer',
      proposedJobTitle: 'Project Engineer',
      currentOffice: 'Charlotte',
      proposedOffice: 'Charlotte',
      currentDepartment: 'Engineer',
      proposedDepartment: 'Engineer',
      azureJobTitle: 'Project Engineer',
      azureOffice: 'Charlotte',
      azureDepartment: 'Engineer',
    })
  })

  it('opens a review card when only department differs', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'BIM Specialist',
        currentOffice: 'Charlotte',
        currentDepartment: 'Admin',
        azureJobTitle: 'BIM Specialist',
        azureOffice: 'Charlotte Office',
        azureDepartment: 'BIM',
        allowedLocations: allowed,
      })?.proposedDepartment
    ).toBe('Designer')
  })

  it('derives department from a new job title when Azure department is empty', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Receptionist',
        currentOffice: 'Charlotte',
        currentDepartment: 'Admin',
        azureJobTitle: 'Department Manager',
        azureOffice: 'Charlotte',
        azureDepartment: '',
        allowedLocations: allowed,
      })?.proposedDepartment
    ).toBe('Leadership')
  })

  it('does not reopen an office card when EMS already has the mapped office name', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte Office',
        currentDepartment: 'Engineer',
        azureJobTitle: 'Engineer',
        azureOffice: 'Charlotte Office',
        azureDepartment: 'Engineering',
        allowedLocations: allowed,
      })
    ).toBeNull()
  })

  it('does not reopen a card after the same Azure snapshot was reviewed', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte',
        currentDepartment: 'Designer',
        azureJobTitle: 'Project Engineer',
        azureOffice: 'Charlotte Office',
        azureDepartment: 'Engineering',
        ackedJobTitle: 'Project Engineer',
        ackedOffice: 'Charlotte',
        ackedDepartment: 'Engineer',
        allowedLocations: allowed,
      })
    ).toBeNull()
  })

  it('reopens when Azure changes after a previous review', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte',
        currentDepartment: 'Designer',
        azureJobTitle: 'Senior Project Engineer',
        azureOffice: 'Charlotte Office',
        azureDepartment: 'Engineering',
        ackedJobTitle: 'Project Engineer',
        ackedOffice: 'Charlotte',
        ackedDepartment: 'Engineer',
        allowedLocations: allowed,
      })?.proposedJobTitle
    ).toBe('Senior Project Engineer')
  })

  it('still opens an office change when only title was previously reviewed', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte',
        currentDepartment: 'Engineer',
        azureJobTitle: 'Project Engineer',
        azureOffice: 'Nashville',
        azureDepartment: 'Engineering',
        ackedJobTitle: 'Project Engineer',
        ackedOffice: 'Charlotte',
        ackedDepartment: 'Engineer',
        allowedLocations: allowed,
      })
    ).toMatchObject({
      proposedOffice: 'Nashville',
      proposedJobTitle: 'Engineer',
    })
  })

  it('ignores empty Azure fields and matching values', () => {
    expect(
      diffAzureEmployee({
        employeeId: '1',
        label: 'Ada',
        email: 'ada@bennett-pless.com',
        currentJobTitle: 'Engineer',
        currentOffice: 'Charlotte',
        currentDepartment: 'Engineer',
        azureJobTitle: '',
        azureOffice: 'Charlotte Office',
        azureDepartment: '',
        allowedLocations: allowed,
      })
    ).toBeNull()
  })
})
