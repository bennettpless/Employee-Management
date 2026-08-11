import { describe, it, expect } from 'vitest'
import {
  DEPARTMENTS,
  departmentForEmployee,
  departmentFromTitle,
  officeNameToLocation,
} from '@/lib/devices'

describe('DEPARTMENTS', () => {
  it('exports the five canonical departments in alphabetical order', () => {
    expect(DEPARTMENTS).toEqual([
      'Admin',
      'BPL',
      'Designer',
      'Engineer',
      'Leadership',
    ])
  })
})

describe('departmentFromTitle', () => {
  describe('Leadership rule (runs before Engineer/Designer)', () => {
    it('matches "Director"', () => {
      expect(departmentFromTitle('Director of Operations')).toBe('Leadership')
    })

    it('matches "Vice President"', () => {
      expect(departmentFromTitle('Vice President')).toBe('Leadership')
      expect(departmentFromTitle('Executive Vice President')).toBe('Leadership')
    })

    it('matches "VP" as an abbreviation', () => {
      expect(departmentFromTitle('VP of Engineering')).toBe('Leadership')
      expect(departmentFromTitle('Senior VP')).toBe('Leadership')
    })

    it('matches "President"', () => {
      expect(departmentFromTitle('President')).toBe('Leadership')
    })

    it('matches "Executive"', () => {
      expect(departmentFromTitle('Chief Executive Officer')).toBe('Leadership')
    })

    it('matches "Department Manager" (multi-word)', () => {
      expect(departmentFromTitle('Department Manager')).toBe('Leadership')
      expect(departmentFromTitle('Structural Department Manager')).toBe('Leadership')
    })

    it('does NOT match a plain "Manager" (only Department Manager)', () => {
      expect(departmentFromTitle('Marketing Manager')).toBe('Admin')
      expect(departmentFromTitle('Project Manager')).toBe('Admin')
    })

    it('Leadership wins over Engineer when both keywords appear', () => {
      expect(departmentFromTitle('VP of Engineering')).toBe('Leadership')
      expect(departmentFromTitle('Director of Engineering')).toBe('Leadership')
    })

    it('Leadership wins over BIM when both keywords appear', () => {
      expect(departmentFromTitle('Director of BIM')).toBe('Leadership')
    })
  })

  describe('Engineer rule', () => {
    it('matches any title containing "engineer" (case-insensitive)', () => {
      expect(departmentFromTitle('Structural Engineer')).toBe('Engineer')
      expect(departmentFromTitle('Design Engineer')).toBe('Engineer')
      expect(departmentFromTitle('Senior Software Engineer')).toBe('Engineer')
      expect(departmentFromTitle('engineer')).toBe('Engineer')
      expect(departmentFromTitle('ENGINEER I')).toBe('Engineer')
    })
  })

  describe('Designer rule', () => {
    it('matches "BIM" as a whole word', () => {
      expect(departmentFromTitle('BIM Modeler')).toBe('Designer')
      expect(departmentFromTitle('Senior BIM Designer')).toBe('Designer')
      expect(departmentFromTitle('bim technician')).toBe('Designer')
    })

    it('does NOT match "BIM" as a substring inside another word', () => {
      // No real-world example but the anchor prevents accidental matches.
      expect(departmentFromTitle('BIMBLE')).toBe('Admin')
    })
  })

  describe('Admin fallback', () => {
    it('returns Admin for any title that does not match the other rules', () => {
      expect(departmentFromTitle('Receptionist')).toBe('Admin')
      expect(departmentFromTitle('Accountant')).toBe('Admin')
      expect(departmentFromTitle('IT Support Specialist')).toBe('Admin')
      expect(departmentFromTitle('HR Coordinator')).toBe('Admin')
      expect(departmentFromTitle('Marketing Coordinator')).toBe('Admin')
    })

    it('returns Admin for empty / null / undefined titles', () => {
      expect(departmentFromTitle('')).toBe('Admin')
      expect(departmentFromTitle(null)).toBe('Admin')
      expect(departmentFromTitle(undefined)).toBe('Admin')
      expect(departmentFromTitle('   ')).toBe('Admin')
    })
  })
})

describe('departmentForEmployee', () => {
  it('routes any @bpl-enclosure.com address to BPL, ignoring title', () => {
    expect(departmentForEmployee('someone@bpl-enclosure.com', 'Vice President')).toBe('BPL')
    expect(departmentForEmployee('EMP@BPL-ENCLOSURE.COM', 'Engineer')).toBe('BPL')
    expect(departmentForEmployee('receptionist@bpl-enclosure.com', null)).toBe('BPL')
  })

  it('falls back to the title-based rule for non-BPL emails', () => {
    expect(departmentForEmployee('alice@bennett-pless.com', 'VP of Operations')).toBe('Leadership')
    expect(departmentForEmployee('bob@bennett-pless.com', 'Structural Engineer')).toBe('Engineer')
    expect(departmentForEmployee('carol@bennett-pless.com', 'BIM Modeler')).toBe('Designer')
    expect(departmentForEmployee('dave@bennett-pless.com', 'Receptionist')).toBe('Admin')
  })

  it('returns Admin when email is null and title is null', () => {
    expect(departmentForEmployee(null, null)).toBe('Admin')
    expect(departmentForEmployee(undefined, undefined)).toBe('Admin')
    expect(departmentForEmployee('', '')).toBe('Admin')
  })

  it('always returns one of the five canonical departments', () => {
    const samples: Array<[string | null, string | null]> = [
      ['x@bpl-enclosure.com', 'anything'],
      ['a@example.com', 'Executive Director'],
      ['a@example.com', 'Design Engineer'],
      ['a@example.com', 'BIM Coordinator'],
      ['a@example.com', 'Receptionist'],
      [null, null],
    ]
    for (const [email, title] of samples) {
      const dept = departmentForEmployee(email, title)
      expect(DEPARTMENTS).toContain(dept)
    }
  })
})

describe('officeNameToLocation (regression cover — unchanged in Phase 21)', () => {
  it('strips a trailing " Office" suffix', () => {
    expect(officeNameToLocation('Charlotte Office')).toBe('Charlotte')
    expect(officeNameToLocation('Nashville Office')).toBe('Nashville')
  })

  it('groups Orlando/Sarasota under Florida', () => {
    expect(officeNameToLocation('Orlando')).toBe('Florida')
    expect(officeNameToLocation('Sarasota Office')).toBe('Florida')
  })
})
