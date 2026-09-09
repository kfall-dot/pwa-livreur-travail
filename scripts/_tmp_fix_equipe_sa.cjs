const fs = require('fs')
const p = 'src/pages/manager/EquipeTab.tsx'
let s = fs.readFileSync(p, 'utf8')
const startMarker = "      const [rm, ri, rd, rp] = await Promise.all(["
const midAnchor = "status: 'invited', pending: true,"
const i = s.indexOf(startMarker)
const mi = s.indexOf(midAnchor, i)
if (i < 0 || mi < 0) { console.error('ANCHOR_NOT_FOUND', i, mi); process.exit(1) }
const j = s.indexOf('}));', mi) + '}));'.length
if (j < 0) { console.error('END_NOT_FOUND'); process.exit(1) }
const newBlock = String.raw`      const rmP = isAdmin ? authFetch('/dashboard/managers') : Promise.resolve(null)
      const riP = isAdmin ? authFetch('/dashboard/managers/invites') : Promise.resolve(null)
      const [rm, ri] = await Promise.all([rmP, riP])
      const [rd, rp] = await Promise.all([
        authFetch('/dashboard/drivers'),
        authFetch('/dashboard/supermarkets'),
      ])
      for (const r of [rm, ri, rd, rp]) {
        if (!r) continue
        if (handleAuth(r.status)) { setLoading(false); return; }
      }
      const mgrs: MgrRow[] = rm ? firstArray(await rm.json(), 'managers').map((m) => ({
        id: str(m.id), name: str(m.name || m.full_name || m.email || 'Membre'),
        email: str(m.email), phone: str(m.phone), role: str(m.role),
        status: str(m.status || 'active'), pending: false,
      })) : []
      const invs: MgrRow[] = ri ? firstArray(await ri.json(), 'invites').map((i) => ({
        id: str(i.id), name: str(i.name || i.email || 'Invité'), email: str(i.email),
        phone: str(i.phone), role: str(i.role || 'chef_chantier'), status: 'invited', pending: true,
      })) : []
`
s = s.slice(0, i) + newBlock + s.slice(j)
fs.writeFileSync(p, s)
console.log('PATCH_OK blockBytes=' + newBlock.length)