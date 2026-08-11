const fs = require('fs')
const d = require('../tmp-duplicate-devices.json')

const rows = []
for (const g of d.serialDupes) {
  for (const x of g.devices) {
    rows.push({
      serial: g.serial,
      count: g.count,
      placeholder: g.looksPlaceholder,
      device_name: x.device_name,
      status: x.status,
      assigned_to: x.assigned_to || '(unassigned)',
      ninja: x.ninja_device_id || '',
      asset_type: x.asset_type || '',
      make_model: x.make_model || '',
      id: x.id,
      notes: x.notes || '',
      created_at: (x.created_at || '').slice(0, 10),
    })
  }
}

const out = {
  summary: {
    total: d.totalDevices,
    emptySerial: d.emptyOrShortSerial,
    serialGroups: d.duplicateSerialGroups,
    serialDevices: d.duplicateSerialDeviceCount,
    placeholderGroups: d.placeholderSerialGroups,
    realGroups: d.realSerialDupGroups,
    nameGroups: d.duplicateNameGroups,
    ninjaGroups: d.duplicateNinjaIdGroups,
    generatedAt: d.generatedAt,
  },
  rows,
  groups: d.serialDupes.map((g) => ({
    serial: g.serial,
    count: g.count,
    placeholder: g.looksPlaceholder,
    devices: g.devices.map((x) => ({
      device_name: x.device_name,
      status: x.status,
      assigned_to: x.assigned_to || '(unassigned)',
      ninja: x.ninja_device_id || '',
      asset_type: x.asset_type || '',
      id: x.id.slice(0, 8),
      notes: x.notes || '',
    })),
  })),
}

fs.writeFileSync('tmp-canvas-data.json', JSON.stringify(out, null, 2))
console.log('wrote tmp-canvas-data.json', rows.length, 'rows')
