import { Client } from 'pg'

// usage: node scripts/db-migrate-data.mjs <source-url> <target-url>
// Copie les données de source → cible (schémas supposés identiques côté migrations).
// - ne copie que les colonnes présentes dans les DEUX bases (tolérant aux dérives)
// - ordre topologique des FK (parents avant enfants)
// - TRUNCATE ... CASCADE de toutes les tables cibles avant insertion
// - recalibrage des séquences (max id) en fin de copie
const [srcUrl, dstUrl] = [process.argv[2], process.argv[3]].map((u) => (u ?? '').trim())
if (!srcUrl || !dstUrl) {
  console.log('usage: node scripts/db-migrate-data.mjs postgresql://src postgresql://dst')
  process.exit(1)
}
const ssl = { rejectUnauthorized: false }
// Doublon de téléphone hérité de prod : drv-11c38e6b… (jamais connecté, 0 session)
// partage +2250700430402 avec drv-demo-2 (37 sessions — le compte réellement utilisé).
// On réécrit le téléphone du doublon pour satisfaire drivers_phone_key sans toucher
// au compte actif.
const PHONE_FIXES = { 'drv-11c38e6b-decc-4bd5-a13d-e57d83d7a5a7': '+2250700430499' }
const src = new Client({ connectionString: srcUrl, connectionTimeoutMillis: 20000, ssl })
const dst = new Client({ connectionString: dstUrl, connectionTimeoutMillis: 20000, ssl })

const q = async (c, sql) => (await c.query(sql)).rows

try {
  await src.connect()
  await dst.connect()

  const tables = (await q(src, "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).map((r) => r.table_name)
  console.log(`TABLES=${tables.length}`)
  if (tables.length === 0) process.exit(1)

  // Colonnes communes par table (+ détection identité / défaut nextval)
  const colInfo = {}
  for (const t of tables) {
    const [sCols, dCols] = await Promise.all([
      q(src, `select column_name, is_nullable, is_identity, column_default from information_schema.columns where table_schema='public' and table_name='${t}' order by ordinal_position`),
      q(dst, `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='${t}'`),
    ])
    const dSet = new Set(dCols.map((r) => r.column_name))
    const dType = new Map(dCols.map((r) => [r.column_name, r.data_type]))
    const common = sCols.filter((c) => dSet.has(c.column_name))
    if (common.length === 0) {
      console.log(`SKIP ${t} (aucune colonne commune)`)
      continue
    }
    colInfo[t] = {
      cols: common.map((r) => r.column_name),
      nullable: new Set(common.filter((r) => r.is_nullable === 'YES').map((r) => r.column_name)),
      identity: common.some((r) => r.is_identity === 'YES'),
      serial: common.some((r) => (r.column_default ?? '').startsWith('nextval')),
      // Colonnes json/jsonb côté cible : une chaîne vide '' (texte source) est un JSON invalide.
      jsonCols: new Set(common.filter((r) => ['json', 'jsonb'].includes(dType.get(r.column_name) ?? '')).map((r) => r.column_name)),
    }
  }

  // Colonnes FK (mono-colonne) + clés primaires — pour gérer les cycles de FK.
  const fkCols = (await q(src, `select conrelid::regclass::text child, confrelid::regclass::text parent, (select a.attname from pg_attribute a where a.attrelid=conrelid and a.attnum=any(conkey) limit 1) col from pg_constraint where contype='f' and connamespace='public'::regnamespace`)).filter((r) => r.col)
  const pks = {}
  for (const r of await q(src, `select conrelid::regclass::text tbl, a.attname pk from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='p' and c.connamespace='public'::regnamespace`)) {
    pks[r.tbl] = r.pk
  }
  // Dépendances FK (parents avant enfants) — nécessaire avant la détection de cycles.
  const deps = new Map(tables.map((t) => [t, new Set()]))
  const fk = await q(src, `select distinct conrelid::regclass::text child, confrelid::regclass::text parent from pg_constraint where contype='f' and connamespace='public'::regnamespace`)
  for (const { child, parent } of fk) {
    if (child !== parent && deps.has(child) && deps.has(parent)) deps.get(child).add(parent)
  }

  // Tables impliquées dans un cycle (accessibles depuis elles-mêmes).
  const cyclic = new Set()
  const reach = (from, target, seen) => {
    for (const p of deps.get(from)) {
      if (p === target) return true
      if (!seen.has(p)) { seen.add(p); if (reach(p, target, seen)) return true }
    }
    return false
  }
  for (const t of tables) if (reach(t, t, new Set())) cyclic.add(t)
  if (cyclic.size > 0) console.log(`CYCLIC_TABLES=${[...cyclic].join(',')}`)

  // Colonnes FK reliant deux tables du même cycle : annulées à l'insertion
  // (passe 1) puis restaurées depuis la source après copie complète (passe 2).
  const cyclicFks = []
  for (const { child, parent, col } of fkCols) {
    if (!cyclic.has(child) || !cyclic.has(parent)) continue
    if (colInfo[child]?.nullable.has(col)) cyclicFks.push({ table: child, col })
    else console.log(`WARN FK cyclique NOT NULL non gérée : ${child}.${col} → ${parent}`)
  }
  if (cyclicFks.length > 0) console.log(`CYCLIC_FKS=${cyclicFks.map((f) => `${f.table}.${f.col}`).join(',')}`)
  const order = []
  const state = new Map(tables.map((t) => [t, 'new']))
  const visit = (t) => {
    if (state.get(t) === 'done') return
    if (state.get(t) === 'visiting') return // cycle : on insère quand même
    state.set(t, 'visiting')
    for (const p of deps.get(t)) visit(p)
    state.set(t, 'done')
    order.push(t)
  }
  for (const t of tables) visit(t)

  // Nettoyage cible (TRUNCATE ... CASCADE ignorerait l'ordre mais coupe toutes les FK)
  const truncList = tables.map((t) => `"${t}"`).join(', ')
  await dst.query(`truncate table ${truncList} restart identity cascade`)
  console.log('TARGET_TRUNCATED')

  let copied = 0
  for (const t of order) {
    const info = colInfo[t]
    if (!info) continue
    const sel = await src.query(`select ${info.cols.map((c) => `"${c}"`).join(', ')} from "${t}"`)
    if (sel.rows.length === 0) {
      console.log(`OK ${t}=0`)
      continue
    }
    const ident = info.identity ? ' overriding system value' : ''
    const colList = info.cols.map((c) => `"${c}"`).join(', ')
    const ph = info.cols.map((_, i) => `$${i + 1}`).join(', ')
    const stmt = `insert into "${t}" (${colList})${ident} values (${ph})`
    const fixIdx = t === 'drivers' ? info.cols.indexOf('phone') : -1
    const cycCols = new Set(cyclicFks.filter((f) => f.table === t).map((f) => f.col))
    const BATCH = 200
    for (let i = 0; i < sel.rows.length; i += BATCH) {
      await dst.query('begin')
      try {
        for (const row of sel.rows.slice(i, i + BATCH)) {
          // Passe 1 : FK internes au cycle annulées ; chaînes vides → null sur colonnes json.
          // Un tableau JS serait sérialisé en littéral Postgres {…} par node-pg →
          // JSON.stringify explicite pour toute valeur objet destinée à json/jsonb.
          const vals = info.cols.map((c) => {
            let v = cycCols.has(c) ? null : row[c]
            if (info.jsonCols.has(c)) {
              if (v === '') v = null
              else if (v != null && typeof v === 'object') v = JSON.stringify(v)
            }
            return v
          })
          if (fixIdx >= 0 && PHONE_FIXES[row.id]) {
            vals[fixIdx] = PHONE_FIXES[row.id]
            console.log(`PHONE_FIX ${row.id} → ${vals[fixIdx]}`)
          }
          await dst.query(stmt, vals)
        }
        await dst.query('commit')
      } catch (e) {
        await dst.query('rollback')
        throw new Error(`${t}: ${e.message.split('\n')[0]}`)
      }
    }
    copied += sel.rows.length
    console.log(`OK ${t}=${sel.rows.length}`)
  }

  // Passe 2 : restauration des FK de cycle depuis la source.
  for (const { table, col } of cyclicFks) {
    const pk = pks[table]
    if (!pk) continue
    const rows2 = await q(src, `select "${pk}" pk, "${col}" v from "${table}" where "${col}" is not null`)
    await dst.query('begin')
    try {
      for (const r of rows2) {
        await dst.query(`update "${table}" set "${col}" = $1 where "${pk}" = $2`, [r.v, r.pk])
      }
      await dst.query('commit')
      console.log(`FK_RESTORE ${table}.${col} (${rows2.length})`)
    } catch (e) {
      await dst.query('rollback')
      throw new Error(`FK restore ${table}.${col}: ${e.message.split('\n')[0]}`)
    }
  }

  console.log(`COPIED_TOTAL=${copied}`)

  // Recalibrage des séquences (serial) sur le max de la colonne liée
  const seqs = await q(dst, `select sequencename from pg_sequences where schemaname='public'`)
  for (const { sequencename } of seqs) {
    try {
      const own = await q(dst, `select quote_ident(c.relname) tbl, quote_ident(a.attname) col from pg_class s2 join pg_depend d on d.objid=s2.oid join pg_class c on c.oid=d.refobjid join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid where s2.relname='${sequencename}' and d.deptype='a' limit 1`)
      if (own.length === 0) continue
      const { tbl, col } = own[0]
      await dst.query(`select setval('${sequencename}', coalesce((select max("${own[0].col}") from "${own[0].tbl}"), 1))`)
    } catch { /* séquence sans propriétaire : ignorée */ }
  }
  console.log('SEQUENCES_RESET')
  console.log('MIGRATION_OK')
} catch (e) {
  console.log('MIGRATION_FAIL ' + e.message.split('\n')[0].slice(0, 200))
  process.exitCode = 1
} finally {
  try { await src.end() } catch {}
  try { await dst.end() } catch {}
}
