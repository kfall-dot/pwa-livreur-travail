const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// 1. CATALOGUE TAB — Ajout bouton "Nouveau chantier" + gestion chantiers
// ═══════════════════════════════════════════════════════════════

let catalogue = fs.readFileSync('src/pages/manager/CatalogueTab.tsx', 'utf8');

// Ajouter l'import pour les sites si pas déjà présent
if (!catalogue.includes("fetchSites")) {
  catalogue = catalogue.replace(
    "import { fetchProducts, fetchUnits, fetchSuppliers } from '../managerApi';",
    "import { fetchProducts, fetchUnits, fetchSuppliers, fetchSites, createSite, updateSite } from '../managerApi';"
  );
}

// Ajouter les states pour les sites après les states existants
const stateInsert = `
  const [sites, setSites] = useState<any[]>([]);
  const [qS, setQS] = useState('');
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);
  const [siteForm, setSiteForm] = useState({ name: '', address: '', company_id: '' });
  const [loadingSites, setLoadingSites] = useState(false);
`;

catalogue = catalogue.replace(
  "const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);",
  "const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);" + stateInsert
);

// Ajouter la fonction de chargement des sites
const loadSitesFn = `
  const loadSites = useCallback(async () => {
    setLoadingSites(true);
    try {
      const res = await fetchSites();
      setSites(res.sites || []);
    } catch {
      setToast({ msg: 'Erreur chargement chantiers', ok: false });
    } finally {
      setLoadingSites(false);
    }
  }, []);
`;

catalogue = catalogue.replace(
  "const loadProducts = useCallback(async () => {",
  loadSitesFn + "  const loadProducts = useCallback(async () => {"
);

// Ajouter l'appel loadSites dans useEffect
catalogue = catalogue.replace(
  "loadProducts();",
  "loadProducts();\n    loadSites();"
);

fs.writeFileSync('src/pages/manager/CatalogueTab.tsx', catalogue);
console.log('CATALOGUE PART1 OK');
