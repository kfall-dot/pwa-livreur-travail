/**
 * Rattrapage des liens BC ↔ tournée et chantier ↔ point du catalogue (pilote BTP).
 *
 * Deux liens sont écrits par l'application depuis des correctifs successifs ; les
 * lignes créées avant ces correctifs ne les portent pas :
 *
 * 1. `tours.purchase_order_id` (lien inverse, ajouté avec « conformité BC »).
 *    Le filtre « Chantier » de la page Livraisons
 *    (`GET /dashboard/deliveries?siteId=`) le lit en priorité. Une tournée qui n'a
 *    que `purchase_orders.tour_id` est invisible : le menu « Chantier » annonce des
 *    BC émis mais la liste reste vide (constat pilote : RESIDENCE 35EME, 2 BC).
 * 2. `sites.supermarket_id` — relie un chantier importé (`site-xlsx-<slug>`) à son
 *    point du catalogue (`sm-xlsx-<slug>`) : fiche chantier du catalogue et repli du
 *    filtre « Chantier ».
 *
 * Idempotent : ne remplit que les liens manquants (aucune donnée écrasée).
 *
 * Usage :
 *   node --env-file=.env.development node_modules/tsx/dist/cli.mjs scripts/backfill-bc-tour-links.ts [--dry-run]
 */
import { getPool } from '../server/db/index.js'

const dryRun = process.argv.includes('--dry-run')
const pool = getPool()

/** Tournées à rattacher à leur BC (`purchase_orders.tour_id` → lien inverse). */
const TOURS_A_RELIER = `
  select t.id as tour_id, linked.po_id, linked.reference
    from tours t
    join (
      select distinct on (po.tour_id) po.tour_id, po.id as po_id, po.reference
        from purchase_orders po
       where po.tour_id is not null
       order by po.tour_id, po.created_at
    ) linked on linked.tour_id = t.id
   where t.purchase_order_id is null
   order by t.date, t.id
`

/** Chantiers importés à relier à leur point du catalogue. */
const CHANTIERS_A_RELIER = `
  select s.id as site_id, s.name, replace(s.id, 'site-xlsx-', 'sm-xlsx-') as supermarket_id
    from sites s
   where s.supermarket_id is null
     and s.id like 'site-xlsx-%'
     and exists (
       select 1 from supermarkets sm
        where sm.id = replace(s.id, 'site-xlsx-', 'sm-xlsx-')
          and sm.company_id = s.company_id
     )
   order by s.name
`

async function main() {
  const tours = await pool.query(TOURS_A_RELIER)
  const chantiers = await pool.query(CHANTIERS_A_RELIER)
  console.log(`Lien inverse tournée → BC manquant : ${tours.rows.length}`)
  if (tours.rows.length > 0) console.table(tours.rows)
  console.log(`Lien chantier → point du catalogue manquant : ${chantiers.rows.length}`)
  if (chantiers.rows.length > 0) console.table(chantiers.rows.slice(0, 10))

  if (dryRun) {
    console.log('\n--dry-run : aucune écriture.')
    return
  }
  if (tours.rows.length === 0 && chantiers.rows.length === 0) {
    console.log('\nRien à faire : les liens sont déjà en place.')
    return
  }

  const updatedTours = await pool.query(`
    update tours t
       set purchase_order_id = linked.po_id
      from (
        select distinct on (po.tour_id) po.tour_id, po.id as po_id
          from purchase_orders po
         where po.tour_id is not null
         order by po.tour_id, po.created_at
      ) linked
     where linked.tour_id = t.id
       and t.purchase_order_id is null
  `)
  const updatedSites = await pool.query(`
    update sites s
       set supermarket_id = replace(s.id, 'site-xlsx-', 'sm-xlsx-')
     where s.supermarket_id is null
       and s.id like 'site-xlsx-%'
       and exists (
         select 1 from supermarkets sm
          where sm.id = replace(s.id, 'site-xlsx-', 'sm-xlsx-')
            and sm.company_id = s.company_id
       )
  `)
  console.log(`\nTournées rattachées à leur BC : ${updatedTours.rowCount ?? 0}`)
  console.log(`Chantiers reliés à leur point du catalogue : ${updatedSites.rowCount ?? 0}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERREUR', err)
    process.exit(1)
  })
