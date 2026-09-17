import { describe, it, expect } from 'vitest'
import {
  buildEmsMatchIndex,
  compactDeviceName,
  matchNinjaAgainstEms,
  namesLikelyMatch,
  normalizeSerial,
} from '@/lib/ninja-inventory'

const ems = [
  {
    id: 'a',
    ninja_device_id: '100',
    serial_number: 'ABC12345',
    device_name: 'BPL-5XBKPK4',
  },
  {
    id: 'b',
    ninja_device_id: null,
    serial_number: 'XYZ99999',
    device_name: 'CHAR-LAPTOP',
  },
]

describe('normalizeSerial', () => {
  it('lowercases and requires 4+ characters', () => {
    expect(normalizeSerial(' ABC123 ')).toBe('abc123')
    expect(normalizeSerial('ab')).toBeNull()
  })
})

describe('namesLikelyMatch', () => {
  it('matches hyphenated hostnames against compacted EMS names', () => {
    expect(namesLikelyMatch('BPL-5XBKPK4', 'BPL5XBKPK4')).toBe(true)
    expect(namesLikelyMatch('BPL-5XBKPK4.bennett-pless.com', 'BPL-5XBKPK4')).toBe(true)
    expect(compactDeviceName('BPL-5XBKPK4')).toBe('bpl5xbkpk4')
  })
})

describe('matchNinjaAgainstEms', () => {
  const index = buildEmsMatchIndex(ems)

  it('matches by ninja_device_id first', () => {
    const match = matchNinjaAgainstEms({ id: 100, systemName: 'OTHER', serialNumber: 'NOPE' }, index)
    expect(match.kind).toBe('already_in_ems')
    if (match.kind === 'already_in_ems') expect(match.reason).toBe('ninja_device_id')
  })

  it('matches by serial when ninja id is new', () => {
    const match = matchNinjaAgainstEms(
      { id: 200, systemName: 'NEWPC', system: { serialNumber: 'xyz99999' } },
      index
    )
    expect(match.kind).toBe('already_in_ems')
    if (match.kind === 'already_in_ems') {
      expect(match.reason).toBe('serial')
      expect(match.ems.id).toBe('b')
    }
  })

  it('flags hostname-only hits as possible duplicates', () => {
    const match = matchNinjaAgainstEms(
      { id: 300, systemName: 'BPL-5XBKPK4', system: { serialNumber: 'DIFFERENTSERIAL' } },
      index
    )
    expect(match.kind).toBe('possible_duplicate')
    if (match.kind === 'possible_duplicate') expect(match.ems.id).toBe('a')
  })

  it('treats no id/serial/name hit as unique', () => {
    const match = matchNinjaAgainstEms(
      { id: 400, systemName: 'BRAND-NEW-PC', system: { serialNumber: 'FRESH1111' } },
      index
    )
    expect(match.kind).toBe('unique')
  })
})
