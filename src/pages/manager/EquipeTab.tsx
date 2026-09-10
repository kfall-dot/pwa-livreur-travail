import { useCallback, useEffect, useState } from 'react';
import { authFetch } from './managerApi';

type Chip = 'gestionnaires' | 'livreurs' | 'chantiers';

interface MgrRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  procurementRole?: string | null;
  status: string;
  pending: boolean;
}

interface DriverRow {
  id: string;
  name: string;
  phone: string;
  status: string;
}

interface PointRow {
  id: string;
  name: string;
  chantier: string;
  contact: string;
  phone: string;
  deliveries30d: string;
  status: string;
}

const ROLE_LABELS: Record<string, string> = {
  technical_director: 'Directeur technique',
  controle_gestion: 'Contrôle de gestion',
  purchasing: 'Service achats',
  chef_chantier: 'Chef de chantier',
  daf: 'DAF',
  pdg: 'PDG',
};

const EQ_CSS = `
.eqp{font-family:'Inter',sans-serif;color:#1e293b;max-width:1280px;margin:0 auto}
.eqp :root{--eqnavy:#1e3a5f;--eqmuted:#64748b;--eqborder:#e2e8f0;--eqgreen:#047857;--eqgreenbg:#ecfdf5;--eqamber:#b45309;--eqamberbg:#fffbeb;--eqred:#b91c1c;--eqredbg:#fef2f2;--eqgold:#b7791f}
.eqp .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.eqp h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0}
.eqp .sub{color:#64748b;font-size:13px;margin:4px 0 0}
.eqp .btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;color:#1e3a5f;cursor:pointer}
.eqp .btn-primary{background:#1e3a5f;border-color:#1e3a5f;color:#fff}
.eqp .mini{border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:4px 10px;font-family:inherit;font-size:12px;color:#1e3a5f;cursor:pointer}
.eqp .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.eqp .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
.eqp .kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px}
.eqp .kpi .val{font-size:22px;font-weight:800;color:#1e3a5f}
.eqp .kpi .det{font-size:11px;color:#64748b;margin-top:4px}
.eqp .kpi.warn .val{color:#b45309}
.eqp .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700}
.eqp .pill-green{background:#ecfdf5;color:#047857}
.eqp .pill-amber{background:#fffbeb;color:#b45309}
.eqp .pill-red{background:#fef2f2;color:#b91c1c}
.eqp .pill-gray{background:#f1f5f9;color:#64748b}
.eqp .tabs{display:flex;gap:8px;margin-bottom:12px}
.eqp .chip{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:600;color:#1e3a5f;cursor:pointer}
.eqp .chip.active{background:#fdf3e0;border-color:#ecd9b0;color:#b7791f}
.eqp .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px}
.eqp .card h2{font-size:15px;color:#1e3a5f;margin:0 0 12px}
.eqp .card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.eqp .filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.eqp .filters label{font-size:12px;color:#64748b;display:flex;flex-direction:column;gap:4px}
.eqp .filters select,.eqp .filters input{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#1e3a5f}
.eqp .filters input{min-width:180px}
.eqp table{width:100%;border-collapse:collapse;font-size:12.5px}
.eqp th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;padding:8px 10px;border-bottom:1px solid #e2e8f0}
.eqp td{padding:10px;border-bottom:1px solid #f1f5f9}
.eqp .mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace;font-size:12px}
.eqp .avatar{display:inline-flex;width:28px;height:28px;border-radius:999px;background:#eef3f8;color:#1e3a5f;font-weight:700;font-size:11px;align-items:center;justify-content:center;margin-right:8px}
.eqp .legend{font-size:12px;color:#64748b;margin-top:4px}
.eqp .inline-form{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:12px}
.eqp .inline-form label{font-size:12px;color:#64748b;display:flex;flex-direction:column;gap:4px}
.eqp .inline-form input,.eqp .inline-form select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#1e3a5f}
.eqp .edit-input{font-family:inherit;font-size:12.5px;padding:4px 8px;border:1px solid #ecd9b0;border-radius:6px;color:#1e3a5f;background:#fffdf7}
.eqp .err{color:#b91c1c;font-size:13px;margin:8px 0}
`;

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function firstArray(j: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    for (const k of keys) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    for (const v of Object.values(o)) if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '–';
}

export default function EquipeTab({
  handleAuth,
  isAdmin,
  canInviteManagers = true,
  initialChip = 'gestionnaires',
}: {
  handleAuth: (s: number) => boolean;
  isAdmin?: boolean;
  canInviteManagers?: boolean;
  currentManagerId?: string | null;
  initialChip?: Chip;
  onGoToChantiers?: () => void;
}) {
  const [chip, setChip] = useState<Chip>(initialChip);
  const [managers, setManagers] = useState<MgrRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState({ name: '', email: '', phone: '', role: 'chef_chantier', procurementRole: '' });
  const [drv, setDrv] = useState({ name: '', phone: '', pin: '1234' });
  const [qG, setQG] = useState('');
  const [stG, setStG] = useState('Tous');
  const [qD, setQD] = useState('');
  const [stD, setStD] = useState('Tous');
  // Edit modals state
  const [editModal, setEditModal] = useState<null | 'mgr' | 'drv' | 'point'>(null);
  const [editingMgr, setEditingMgr] = useState<MgrRow | null>(null);
  const [editingDrv, setEditingDrv] = useState<DriverRow | null>(null);
  const [editingPoint, setEditingPoint] = useState<PointRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rmP = isAdmin ? authFetch('/dashboard/managers') : Promise.resolve(null)
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
        procurementRole: m.procurementRole ?? m.procurement_role ?? null,
        status: str(m.status || 'active'), pending: false,
      })) : []
      const invs: MgrRow[] = ri ? firstArray(await ri.json(), 'invites').map((i) => ({
        id: str(i.id), name: str(i.name || i.email || 'Invité'), email: str(i.email),
        phone: str(i.phone), role: str(i.role || 'chef_chantier'), status: 'invited', pending: true,
      })) : []

      const drs: DriverRow[] = firstArray(await rd.json(), 'drivers').map((d) => ({
        id: str(d.id), name: str(d.name || d.phone), phone: str(d.phone), status: str(d.status || 'active'),
      }));
      const pts: PointRow[] = firstArray(await rp.json(), 'supermarkets', 'points').map((p) => ({
        id: str(p.id), name: str(p.name), chantier: str(p.site_name || p.chantier || p.site),
        contact: str(p.contact_name || p.contact), phone: str(p.phone),
        deliveries30d: str(p.deliveries_30d ?? p.deliveries ?? ''), status: str(p.status || 'active'),
      }));
      setManagers([...mgrs, ...invs]);
      setDrivers(drs);
      setPoints(pts);
    } catch {
      setError('Impossible de charger les données de l\u2019équipe.');
    }
    setLoading(false);
  }, [handleAuth]);

  useEffect(() => { void load(); }, [load]);

  const [inviteOk, setInviteOk] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [savingI, setSavingI] = useState(false);
  const [savingD, setSavingD] = useState(false);
  const [okD, setOkD] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteOk(''); setInviteUrl(''); setSavingI(true);
    try {
      const res = await authFetch('/dashboard/managers/invite', { method: 'POST', body: JSON.stringify(invite) });
      const j = (await res.json()) as { ok?: boolean; message?: string; inviteUrl?: string };
      if (!res.ok) throw new Error(j.message || 'Erreur');
      setInvite({ name: '', email: '', phone: '', role: 'chef_chantier', procurementRole: '' });
      if (j.inviteUrl) setInviteUrl(j.inviteUrl);
      setInviteOk('Invitation créée. Si l\u2019e-mail n\u2019arrive pas, le lien est affiché ci-dessous.');
      await load();
    } catch (err) {
      setInviteOk(err instanceof Error ? err.message : 'Erreur');
    }
    setSavingI(false);
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setOkD(''); setSavingD(true);
    try {
      const res = await authFetch('/dashboard/drivers', { method: 'POST', body: JSON.stringify(drv) });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) throw new Error(j.message || 'Erreur');
      setDrv({ name: '', phone: '', pin: '1234' });
      setOkD('Livreur créé.');
      await load();
    } catch (err) {
      setOkD(err instanceof Error ? err.message : 'Erreur');
    }
    setSavingD(false);
  };

  const toggleDriver = async (id: string, active: boolean) => {
    await authFetch(`/dashboard/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: active ? 'suspended' : 'active' }) });
    await load();
  };

  const roleLabel = (r: string) => ROLE_LABELS[r] ?? (r === 'invited' ? 'Invitation en attente' : r || '—');

  const mgrs = managers.filter((m) => (stG === 'Tous' ? true : stG === 'En attente' ? m.pending : !m.pending && m.status === 'active'))
    .filter((m) => (qG ? (m.name + m.email + m.phone).toLowerCase().includes(qG.toLowerCase()) : true));
  const drs = drivers.filter((d) => (stD === 'Tous' ? true : stD === 'Actif' ? d.status === 'active' : d.status !== 'active'))
    .filter((d) => (qD ? (d.name + d.phone).toLowerCase().includes(qD.toLowerCase()) : true));
  const activeDrivers = drivers.filter((d) => d.status === 'active').length;
  const activeSites = points.filter((p) => p.status === 'active').length;

  const goto = (c: Chip) => {
    setChip(c);
    document.getElementById(`eq-${c}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="eqp">
      <style>{EQ_CSS}</style>
      <div className="topbar">
        <div>
          <h1>Équipe</h1>
          <p className="sub">Gestionnaires, livreurs et chantiers rattachés à votre compagnie.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>{loading ? '…' : '⟳ Actualiser'}</button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lbl">Gestionnaires actifs</div><div className="val">{managers.filter((m) => !m.pending && m.status === 'active').length}</div><div className="det">{managers.filter((m) => m.pending).length} invitation(s) en attente</div></div>
        <div className="kpi"><div className="lbl">Livreurs actifs</div><div className="val">{activeDrivers}</div><div className="det">{drivers.length} compte(s) au total</div></div>
        <div className="kpi warn"><div className="lbl">Livreurs inactifs</div><div className="val">{drivers.length - activeDrivers}</div><div className="det">À réactiver si nécessaire</div></div>
        <div className="kpi"><div className="lbl">Chantiers</div><div className="val">{activeSites}</div><div className="det">{points.length} rattachement(s) au total</div></div>
      </div>

      <div className="tabs">
        {(['gestionnaires', 'livreurs'] as Chip[]).map((c) => (
          <button key={c} type="button" className={`chip${chip === c ? ' active' : ''}`} onClick={() => goto(c)}>
            {c === 'gestionnaires' ? 'Gestionnaires' : 'Livreurs'}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}

      <div className="card" id="eq-gestionnaires">
        <div className="card-head">
          <h2>Gestionnaires</h2>
          <span className="sub">{mgrs.length} compte(s)</span>
        </div>
        <div className="filters">
          <label>Statut
            <select value={stG} onChange={(e) => setStG(e.target.value)}>
              <option>Tous</option>
              <option>Actifs</option>
              <option>En attente</option>
            </select>
          </label>
          <label>Recherche
            <input type="text" placeholder="Nom, e-mail ou téléphone…" value={qG} onChange={(e) => setQG(e.target.value)} />
          </label>
        </div>
        {canInviteManagers && (
          <form onSubmit={(e) => void handleInvite(e)} className="filters" style={{ alignItems: 'flex-end' }}>
            <label>Nom *<input type="text" required value={invite.name} data-testid="mgr-invite-name" onChange={(e) => setInvite((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>E-mail *<input type="email" required autoComplete="off" value={invite.email} data-testid="mgr-invite-email" onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} /></label>
            <label>Rôle (optionnel)
              <select value={invite.role} data-testid="mgr-invite-role" onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value }))}>
                <option value="chef_chantier">Chef de chantier</option>
                <option value="technical_director">Directeur technique (DT)</option>
                <option value="site_controller">Conducteur de travaux</option>
                <option value="purchasing">Service achats</option>
                <option value="controle_gestion">Contrôle de gestion</option>
                <option value="daf">DAF</option>
                <option value="pdg">PDG</option>
              </select>
            </label>
            <label>Espace de travail *
              <select required value={invite.procurementRole} data-testid="mgr-invite-procurement-role" onChange={(e) => setInvite((p) => ({ ...p, procurementRole: e.target.value }))}>
                <option value="">-- Choisir un rôle --</option>
                <option value="technical_director">Directeur technique (DT)</option>
                <option value="site_controller">Conducteur de travaux (SA)</option>
                <option value="purchasing">Service achats</option>
                <option value="controle_gestion">Contrôle de gestion (CdG)</option>
                <option value="daf">DAF</option>
                <option value="pdg">PDG</option>
                <option value="site_manager">Chef de chantier (CdC)</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={savingI} data-testid="mgr-invite-send">{savingI ? 'Envoi…' : 'Envoyer l\u2019invitation'}</button>
          </form>
        )}
        {canInviteManagers && inviteOk && <p style={{ margin: '0 0 10px', fontSize: 13, color: '#047857' }}>{inviteOk}</p>}
        {canInviteManagers && inviteUrl && <p style={{ margin: '0 0 10px', fontSize: 12, wordBreak: 'break-all' }}>Lien : {inviteUrl}</p>}
        <table>
          <thead><tr><th>Membre</th><th>Téléphone</th><th>Rôle</th><th>Statut</th><th aria-hidden="true"></th></tr></thead>
          <tbody>
            {mgrs.map((m) => (
              <tr key={m.id}>
                <td><div className="cat-col"><div className="cat-img">{initials(m.name)}</div><div className="cat-info"><span className="nm">{m.name}</span><span className="sm">{m.email || '—'}</span></div></div></td>
                <td className="mono">{m.phone || '—'}</td>
                <td>{roleLabel(m.role)}</td>
                <td>{m.pending ? <span className="pill pill-amber">En attente</span> : m.status === 'active' ? <span className="pill pill-green">Actif</span> : <span className="pill pill-gray">Inactif</span>}</td>
                <td style={{ textAlign: 'right' }}>{!m.pending && <button type="button" className="mini" onClick={() => { setEditingMgr(m); setEditModal('mgr'); }}>Modifier</button>}</td>
              </tr>
            ))}
            {mgrs.length === 0 && <tr><td colSpan={5} className="sm">Aucun gestionnaire.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" id="eq-livreurs">
        <div className="card-head">
          <h2>Livreurs</h2>
          <span className="sub">{drs.length} livreur(s)</span>
        </div>
        <form onSubmit={(e) => void handleAddDriver(e)} className="filters" style={{ alignItems: 'flex-end' }}>
          <label>Nom *<input type="text" required value={drv.name} data-testid="mgr-create-driver-name" onChange={(e) => setDrv((p) => ({ ...p, name: e.target.value }))} /></label>
          <label>Téléphone *<input type="tel" required value={drv.phone} data-testid="mgr-create-driver-phone" onChange={(e) => setDrv((p) => ({ ...p, phone: e.target.value }))} /></label>
          <label>PIN (4 chiffres)<input type="text" maxLength={4} value={drv.pin} onChange={(e) => setDrv((p) => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))} /></label>
          <button type="submit" className="btn btn-primary" disabled={savingD} data-testid="mgr-create-driver">{savingD ? 'Création…' : '+ Ajouter un livreur'}</button>
        </form>
        {okD && <p style={{ margin: '0 0 10px', fontSize: 13, color: okD === 'Livreur créé.' ? '#047857' : '#b91c1c' }}>{okD}</p>}
        <div className="filters">
          <label>Statut
            <select value={stD} onChange={(e) => setStD(e.target.value)}>
              <option>Tous</option><option>Actif</option><option>Inactif</option>
            </select>
          </label>
          <label>Recherche<input type="text" placeholder="Nom ou téléphone…" value={qD} onChange={(e) => setQD(e.target.value)} /></label>
        </div>
        <table>
          <thead><tr><th>Membre</th><th>Téléphone</th><th>Statut</th><th aria-hidden="true"></th></tr></thead>
          <tbody>
            {drs.map((d) => (
              <tr key={d.id}>
                <td><div className="cat-col"><div className="cat-img">{initials(d.name)}</div><div className="cat-info"><span className="nm">{d.name}</span></div></div></td>
                <td className="mono">{d.phone || '—'}</td>
                <td>{d.status === 'active' ? <span className="pill pill-green">Actif</span> : <span className="pill pill-gray">Inactif</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="mini" onClick={() => { setEditingDrv(d); setEditModal('drv'); }} style={{ marginRight: 4 }}>Modifier</button>
                  {d.status === 'active'
                    ? <button type="button" className="mini" onClick={() => void toggleDriver(d.id, true)}>Désactiver</button>
                    : <button type="button" className="mini" onClick={() => void toggleDriver(d.id, false)}>Réactiver</button>}
                </td>
              </tr>
            ))}
            {drs.length === 0 && <tr><td colSpan={4} className="sm">Aucun livreur.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="legend">● Les gestionnaires rejoignent l'équipe par invitation (e-mail / lien) — le livreur reçoit un PIN à 4 chiffres. ● Le bouton « Désactiver » suspend l'accès d'un livreur sans supprimer son historique.</p>

      {editModal === 'mgr' && editingMgr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1e3a5f' }}>Modifier le gestionnaire</h3>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Nom
              <input type="text" value={editingMgr.name} onChange={(e) => setEditingMgr({ ...editingMgr, name: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Téléphone
              <input type="text" value={editingMgr.phone || ''} onChange={(e) => setEditingMgr({ ...editingMgr, phone: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, color: '#64748b' }}>Rôle
              <select value={editingMgr.role} onChange={(e) => setEditingMgr({ ...editingMgr, role: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }}>
                <option value="chef_chantier">Chef de chantier</option>
                <option value="technical_director">Directeur technique (DT)</option>
                <option value="site_controller">Conducteur de travaux</option>
                <option value="purchasing">Service achats</option>
                <option value="controle_gestion">Contrôle de gestion</option>
                <option value="daf">DAF</option>
                <option value="pdg">PDG</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, color: '#64748b' }}>Espace de travail
              <select value={editingMgr.procurementRole ?? ''} onChange={(e) => setEditingMgr({ ...editingMgr, procurementRole: e.target.value || null })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }}>
                <option value="">-- Aucun --</option>
                <option value="technical_director">Directeur technique (DT)</option>
                <option value="site_controller">Conducteur de travaux (SA)</option>
                <option value="purchasing">Service achats</option>
                <option value="controle_gestion">Contrôle de gestion (CdG)</option>
                <option value="daf">DAF</option>
                <option value="pdg">PDG</option>
                <option value="site_manager">Chef de chantier (CdC)</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditModal(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={savingEdit} onClick={async () => { setSavingEdit(true); try { await authFetch(`/dashboard/managers/${editingMgr.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingMgr.name, phone: editingMgr.phone || null, role: editingMgr.role, procurementRole: editingMgr.procurementRole || null }) }); setEditModal(null); void load(); } finally { setSavingEdit(false); } }}>{savingEdit ? 'Sauvegarde…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {editModal === 'drv' && editingDrv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1e3a5f' }}>Modifier le livreur</h3>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Nom
              <input type="text" value={editingDrv.name} onChange={(e) => setEditingDrv({ ...editingDrv, name: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, color: '#64748b' }}>Téléphone
              <input type="text" value={editingDrv.phone || ''} onChange={(e) => setEditingDrv({ ...editingDrv, phone: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditModal(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={savingEdit} onClick={async () => { setSavingEdit(true); try { await authFetch(`/dashboard/drivers/${editingDrv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingDrv.name, phone: editingDrv.phone || null }) }); setEditModal(null); void load(); } finally { setSavingEdit(false); } }}>{savingEdit ? 'Sauvegarde…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {editModal === 'point' && editingPoint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1e3a5f' }}>Modifier le point de livraison</h3>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Nom
              <input type="text" value={editingPoint.name || ''} onChange={(e) => setEditingPoint({ ...editingPoint, name: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Chantier
              <input type="text" value={editingPoint.chantier || ''} onChange={(e) => setEditingPoint({ ...editingPoint, chantier: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, color: '#64748b' }}>Contact
              <input type="text" value={editingPoint.contact || ''} onChange={(e) => setEditingPoint({ ...editingPoint, contact: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 16, fontSize: 12, color: '#64748b' }}>Téléphone
              <input type="text" value={editingPoint.phone || ''} onChange={(e) => setEditingPoint({ ...editingPoint, phone: e.target.value })} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditModal(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" disabled={savingEdit} onClick={async () => { setSavingEdit(true); try { await authFetch(`/dashboard/supermarkets/${editingPoint.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editingPoint.name || null, chantier: editingPoint.chantier || null, contact: editingPoint.contact || null, phone: editingPoint.phone || null }) }); setEditModal(null); void load(); } finally { setSavingEdit(false); } }}>{savingEdit ? 'Sauvegarde…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/*__SUITE3__*/
