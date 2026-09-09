// Probe DB : chantier Anader + ses livraisons
import { readFileSync } from 'node:fs';
import { Pool } from '@neondatabase/serverless';

const env = readFileSync('/Users/falletkone/projects/pwa-livreur-travail/.env.development', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) { console.error('NO DATABASE_URL'); process.exit(1); }
let url = m[1].trim().replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

const q = async (label, sql, params = []) => {
  try {
    const r = await pool.query(sql, params);
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(r.rows, null, 1));
  } catch (e) { console.log(`\n=== ${label} ERREUR ===`, e.message); }
};

await q('sites Anader', `SELECT id, name, company_id, active FROM sites WHERE name ILIKE '%anader%'`);
await q('toutes les sociétés qui ont un site anader-like', `SELECT DISTINCT company_id FROM sites WHERE name ILIKE '%anad%'`);
await q('livraisons anader (join sites)', `
  SELECT d.id, d.status, d.declaration_outcome, d.delivery_date, s.name AS site, s.company_id
  FROM deliveries d JOIN sites s ON s.id = d.site_id
  WHERE s.name ILIKE '%anad%' ORDER BY d.delivery_date DESC LIMIT 6`);
await q('supermarkets (company btp-pilote) contient anader ?', `
  SELECT id, name, active, company_id FROM sites
  WHERE company_id = 'co-btp-pilote' AND name ILIKE '%anad%'`);
await pool.end();
console.log('\nPROBE_DONE');
