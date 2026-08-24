import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { seedDefaultCompanyUnits } from './queries.js'
import { upsertDocumentTemplate } from './procurementQueries.js'
import {
  BTP_CATALOG_SITES_FROM_BC_REGISTER,
  BTP_CATALOG_SUPPLIERS_FROM_BC_REGISTER,
  uniqueBtpCatalogSlug,
} from '../../shared/btpCatalogFromBcRegister.js'
import {
  BTP_PILOT_COMPANY_ID,
  companies,
  drivers,
  managers,
  sites,
  suppliers,
  supermarkets,
} from './schema.js'

/**
 * IDs stables pour E2E BTP — ne pas modifier sans mettre à jour les tests.
 */
export const BTP_DEMO = {
  COMPANY_ID: BTP_PILOT_COMPANY_ID,
  SITE_ID: 'site-btp-pilote-1',
  SUPPLIER_CIMENT_ID: 'sup-btp-ciment',
  SUPPLIER_FER_ID: 'sup-btp-fer',
  MANAGER_DT_ID: 'mgr-btp-dt',
  MANAGER_DAF_ID: 'mgr-btp-daf',
  MANAGER_SA_ID: 'mgr-btp-sa',
  MANAGER_PDG_ID: 'mgr-btp-pdg',
  MANAGER_CDG_ID: 'mgr-btp-cdg',
  DRIVER_ID: 'drv-btp-1',
  DRIVER_PHONE: '+2250700998877',
  WHATSAPP_GROUP_ID: 'wa-grp-btp-chantier-1',
  TEMPLATE_BC_ID: 'tpl-btp-bc-1',
  TEMPLATE_BT_ID: 'tpl-btp-bt-1',
  DT_EMAIL: 'dt@btp-pilote.ci',
  DAF_EMAIL: 'daf@btp-pilote.ci',
  SA_EMAIL: 'sa@btp-pilote.ci',
  PDG_EMAIL: 'pdg@btp-pilote.ci',
  CDG_EMAIL: 'cdg@btp-pilote.ci',
} as const

const BC_TEMPLATE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>BC {{reference}}</title>
<style>body{font-family:Arial,sans-serif;margin:2rem;color:#1a1a1a}h1{color:#1565c0}
table{border-collapse:collapse;width:100%;margin-top:1rem}th,td{border:1px solid #ddd;padding:8px}</style></head>
<body><h1>Bon de commande {{reference}}</h1>
<p><strong>Chantier :</strong> {{siteName}} — {{siteAddress}}</p>
<p><strong>Fournisseur :</strong> {{supplierName}}</p>
<p><strong>Montant TTC :</strong> {{amountFcfa}} FCFA</p>
<table><thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>Obs.</th></tr></thead>
<tbody>{{linesRows}}</tbody></table>
<p><em>TraceO BTP — {{createdAt}}</em></p></body></html>`

const BT_TEMPLATE = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>BT {{reference}}</title>
<style>body{font-family:Arial,sans-serif;margin:2rem}h1{color:#c62828}</style></head>
<body><h1>Bon de trésorerie {{reference}}</h1>
<p><strong>Chantier :</strong> {{siteName}}</p>
<p><strong>Montant :</strong> {{amountFcfa}} FCFA</p>
<p><strong>Devis joints :</strong> {{quotationList}}</p>
<p><em>TraceO BTP — {{createdAt}}</em></p></body></html>`

function envOr(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback
}

export function btpPilotLoginEmails(): string[] {
  return [
    envOr('BTP_DT_EMAIL', BTP_DEMO.DT_EMAIL).toLowerCase(),
    envOr('BTP_DAF_EMAIL', BTP_DEMO.DAF_EMAIL).toLowerCase(),
    envOr('BTP_SA_EMAIL', BTP_DEMO.SA_EMAIL).toLowerCase(),
    envOr('BTP_PDG_EMAIL', BTP_DEMO.PDG_EMAIL).toLowerCase(),
    envOr('BTP_CDG_EMAIL', BTP_DEMO.CDG_EMAIL).toLowerCase(),
  ]
}

export function isBtpPilotLoginEmail(email: string): boolean {
  return btpPilotLoginEmails().includes(email.trim().toLowerCase())
}

export async function seedBtpPilotData(): Promise<{
  companyId: string
  siteId: string
  managersSeeded: number
  suppliersSeeded: number
}> {
  const rounds =
    process.env.ALLOW_WIPE_USERS === 'true' || process.env.ALLOW_WIPE_USERS === '1' ? 4 : 10
  const passwordHash = await bcrypt.hash(process.env.MANAGER_PASSWORD ?? 'admin1234', rounds)
  const pinHash = await bcrypt.hash(process.env.DRIVER_PIN ?? '1234', rounds)

  await db
    .insert(companies)
    .values({
      id: BTP_DEMO.COMPANY_ID,
      name: 'BTP Pilote TraceO',
      slug: 'btp-pilote',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: companies.id,
      set: {
        name: 'BTP Pilote TraceO',
        slug: 'btp-pilote',
        status: 'active',
      },
    })

  await seedDefaultCompanyUnits(BTP_DEMO.COMPANY_ID)

  const managerRows = [
    {
      id: BTP_DEMO.MANAGER_DT_ID,
      email: envOr('BTP_DT_EMAIL', BTP_DEMO.DT_EMAIL),
      name: 'Kouamé DT',
      procurementRole: 'technical_director' as const,
      role: 'admin' as const,
    },
    {
      id: BTP_DEMO.MANAGER_DAF_ID,
      email: envOr('BTP_DAF_EMAIL', BTP_DEMO.DAF_EMAIL),
      name: 'Aya DAF',
      procurementRole: 'daf' as const,
      role: 'manager' as const,
    },
    {
      id: BTP_DEMO.MANAGER_SA_ID,
      email: envOr('BTP_SA_EMAIL', BTP_DEMO.SA_EMAIL),
      name: 'Mamadou SA',
      procurementRole: 'purchasing' as const,
      role: 'manager' as const,
    },
    {
      id: BTP_DEMO.MANAGER_PDG_ID,
      email: envOr('BTP_PDG_EMAIL', BTP_DEMO.PDG_EMAIL),
      name: 'Diabaté PDG',
      procurementRole: 'pdg' as const,
      role: 'admin' as const,
    },
    {
      id: BTP_DEMO.MANAGER_CDG_ID,
      email: envOr('BTP_CDG_EMAIL', BTP_DEMO.CDG_EMAIL),
      name: 'Fatou CdG',
      procurementRole: 'controle_gestion' as const,
      role: 'manager' as const,
    },
  ]

  for (const m of managerRows) {
    await db
      .insert(managers)
      .values({
        id: m.id,
        companyId: BTP_DEMO.COMPANY_ID,
        email: m.email,
        passwordHash,
        name: m.name,
        role: m.role,
        procurementRole: m.procurementRole,
      })
      .onConflictDoUpdate({
        target: managers.id,
        set: {
          companyId: BTP_DEMO.COMPANY_ID,
          email: m.email,
          passwordHash,
          name: m.name,
          role: m.role,
          procurementRole: m.procurementRole,
        },
      })
  }

  await db
    .insert(sites)
    .values({
      id: BTP_DEMO.SITE_ID,
      companyId: BTP_DEMO.COMPANY_ID,
      name: 'Résidence Cocody — Tour A',
      address: 'Boulevard Latrille, Cocody, Abidjan',
      lat: '5.3600000',
      lng: '-3.9870000',
      managerId: BTP_DEMO.MANAGER_DT_ID,
      whatsappGroupId: BTP_DEMO.WHATSAPP_GROUP_ID,
      active: true,
    })
    .onConflictDoUpdate({
      target: sites.id,
      set: {
        companyId: BTP_DEMO.COMPANY_ID,
        name: 'Résidence Cocody — Tour A',
        address: 'Boulevard Latrille, Cocody, Abidjan',
        whatsappGroupId: BTP_DEMO.WHATSAPP_GROUP_ID,
        managerId: BTP_DEMO.MANAGER_DT_ID,
        active: true,
      },
    })

  await db
    .insert(supermarkets)
    .values({
      id: 'sm-btp-cocody',
      companyId: BTP_DEMO.COMPANY_ID,
      name: 'Résidence Cocody — Tour A',
      address: 'Boulevard Latrille, Cocody, Abidjan',
      contactPhone: '+2250701888001',
      contactName: 'Chef chantier',
      lat: '5.3600000',
      lng: '-3.9870000',
      active: true,
    })
    .onConflictDoUpdate({
      target: supermarkets.id,
      set: {
        companyId: BTP_DEMO.COMPANY_ID,
        name: 'Résidence Cocody — Tour A',
        address: 'Boulevard Latrille, Cocody, Abidjan',
        contactPhone: '+2250701888001',
        active: true,
      },
    })

  await db
    .update(sites)
    .set({ supermarketId: 'sm-btp-cocody' })
    .where(eq(sites.id, BTP_DEMO.SITE_ID))

  const supplierRows = [
    {
      id: BTP_DEMO.SUPPLIER_CIMENT_ID,
      name: 'CimIvoire Distribution',
      contactPhone: '+2252722244556',
      contactEmail: 'commandes@cimivoire.ci',
      address: 'Zone industrielle, Yopougon',
      hasAccount: true,
    },
    {
      id: BTP_DEMO.SUPPLIER_FER_ID,
      name: 'Fer & Acier Abidjan',
      contactPhone: '+2252722334455',
      contactEmail: 'ventes@fer-acier.ci',
      address: 'Marcory, Abidjan',
      hasAccount: false,
    },
  ]

  for (const s of supplierRows) {
    await db
      .insert(suppliers)
      .values({
        id: s.id,
        companyId: BTP_DEMO.COMPANY_ID,
        name: s.name,
        contactPhone: s.contactPhone,
        contactEmail: s.contactEmail,
        address: s.address,
        hasAccount: s.hasAccount,
        active: true,
      })
      .onConflictDoUpdate({
        target: suppliers.id,
        set: {
          companyId: BTP_DEMO.COMPANY_ID,
          name: s.name,
          contactPhone: s.contactPhone,
          contactEmail: s.contactEmail,
          address: s.address,
          hasAccount: s.hasAccount,
          active: true,
        },
      })
  }

  const catalogAddress = 'Côte d’Ivoire — à préciser'
  const siteSlugs = new Set<string>()
  const catalogSites = BTP_CATALOG_SITES_FROM_BC_REGISTER.map((name) => {
    const slug = uniqueBtpCatalogSlug(name, siteSlugs)
    return { slug, name }
  })
  if (catalogSites.length > 0) {
    await db
      .insert(sites)
      .values(
        catalogSites.map((s) => ({
          id: `site-xlsx-${s.slug}`,
          companyId: BTP_DEMO.COMPANY_ID,
          name: s.name,
          address: catalogAddress,
          lat: '5.3600000',
          lng: '-4.0083000',
          managerId: BTP_DEMO.MANAGER_DT_ID,
          active: true,
        })),
      )
      .onConflictDoNothing()
    await db
      .insert(supermarkets)
      .values(
        catalogSites.map((s) => ({
          id: `sm-xlsx-${s.slug}`,
          companyId: BTP_DEMO.COMPANY_ID,
          name: s.name,
          address: catalogAddress,
          contactPhone: '+2250700000000',
          contactName: 'Chef chantier',
          contactEmail: 'chantier@btp-pilote.ci',
          lat: '5.3600000',
          lng: '-4.0083000',
          siteType: 'prive' as const,
          active: true,
        })),
      )
      .onConflictDoNothing()
  }

  const supplierSlugs = new Set<string>()
  const catalogSuppliers = BTP_CATALOG_SUPPLIERS_FROM_BC_REGISTER.map((name) => ({
    slug: uniqueBtpCatalogSlug(name, supplierSlugs),
    name,
  }))
  if (catalogSuppliers.length > 0) {
    await db
      .insert(suppliers)
      .values(
        catalogSuppliers.map((s) => ({
          id: `sup-xlsx-${s.slug}`,
          companyId: BTP_DEMO.COMPANY_ID,
          name: s.name,
          hasAccount: false,
          family: 'materiaux',
          notes: 'Import POINTS FOURNISSEURS DES BC',
          active: true,
        })),
      )
      .onConflictDoNothing()
  }

  await db
    .insert(drivers)
    .values({
      id: BTP_DEMO.DRIVER_ID,
      companyId: BTP_DEMO.COMPANY_ID,
      phone: envOr('BTP_DRIVER_PHONE', BTP_DEMO.DRIVER_PHONE),
      pinHash,
      name: 'Livreur BTP Pilote',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: drivers.id,
      set: {
        companyId: BTP_DEMO.COMPANY_ID,
        name: 'Livreur BTP Pilote',
        status: 'active',
        pinHash,
      },
    })

  await upsertDocumentTemplate({
    id: BTP_DEMO.TEMPLATE_BC_ID,
    companyId: BTP_DEMO.COMPANY_ID,
    docType: 'bc',
    name: 'BC standard BTP',
    htmlTemplate: BC_TEMPLATE,
  })

  await upsertDocumentTemplate({
    id: BTP_DEMO.TEMPLATE_BT_ID,
    companyId: BTP_DEMO.COMPANY_ID,
    docType: 'bt',
    name: 'BT standard BTP',
    htmlTemplate: BT_TEMPLATE,
  })

  return {
    companyId: BTP_DEMO.COMPANY_ID,
    siteId: BTP_DEMO.SITE_ID,
    managersSeeded: managerRows.length,
    suppliersSeeded: 2 + catalogSuppliers.length,
  }
}
