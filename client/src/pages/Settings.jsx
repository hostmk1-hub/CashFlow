import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Spinner, Badge } from '../components/ui.jsx';

export default function Settings() {
  const { activeTenant } = useAuth();
  const [settings, setSettings] = useState(null);
  const [team, setTeam] = useState([]);
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiKeyPaid, setGeminiKeyPaid] = useState('');
  const [eurRate, setEurRate] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'staff' });
  const [inviteLink, setInviteLink] = useState('');
  const [msg, setMsg] = useState('');
  const [backup, setBackup] = useState(null);
  const [recurring, setRecurring] = useState(null);
  const [letterhead, setLetterhead] = useState({ company_name: '', company_address: '', company_phone: '' });
  const [rentalsystKey, setRentalsystKey] = useState('');
  const [models, setModels] = useState(null); // { ok, models: [] }
  const canManage = ['owner', 'admin'].includes(activeTenant?.role);
  const EXPENSE_CATEGORIES = ['Leasing', 'Insurance', 'Repairs', 'Service', 'Tires', 'Other'];
  const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  const load = () => {
    api.get('/settings').then((s) => {
      setSettings(s);
      setEurRate(s.default_eur_rate || '61.8');
      setLetterhead({ company_name: s.company_name || '', company_address: s.company_address || '', company_phone: s.company_phone || '' });
    });
    api.get('/settings/backup/status').then(setBackup).catch(() => {});
    api.get('/recurring/status').then(setRecurring).catch(() => {});
    if (canManage) api.get(`/tenants/${activeTenant.id}/users`).then(setTeam).catch(() => {});
  };
  useEffect(() => { load(); loadModels(); }, []);

  async function loadModels() {
    try { setModels(await api.get('/settings/gemini/models')); } catch { setModels({ ok: false, models: [] }); }
  }

  async function backupNow() {
    setMsg('Running backup…');
    try { const r = await api.post('/settings/backup/run'); setMsg(r.ok ? `Backup written: ${r.file}` : `Backup failed: ${r.error}`); load(); }
    catch (e) { setMsg(e.message); }
  }

  async function saveSetting(key, value) {
    setMsg('');
    try { await api.put('/settings', { key, value }); setMsg('Saved ✓'); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function testGemini() {
    setMsg('Testing…');
    try {
      const r = await api.post('/settings/gemini/test');
      if (r.ok) { setMsg(r.message || `Connection OK (${r.model})`); loadModels(); return; }
      // Key works but the model is wrong → offer to apply the suggested one.
      if (r.keyValid && r.suggestedModel) {
        setMsg(`${r.message} — applying “${r.suggestedModel}”…`);
        await saveSetting('gemini_model', r.suggestedModel);
        await loadModels();
        setMsg(`Model switched to “${r.suggestedModel}”. Test again to confirm.`);
        return;
      }
      setMsg(r.message || `Failed: status ${r.status}`);
    } catch (e) { setMsg(e.message); }
  }
  async function sendInvite() {
    setMsg('');
    try { const r = await api.post(`/tenants/${activeTenant.id}/invites`, invite); setInviteLink(window.location.origin + r.acceptUrl); load(); }
    catch (e) { setMsg(e.message); }
  }

  if (!settings) return <Spinner />;

  return (
    <>
      <div className="page-head"><div className="page-title">Settings</div></div>
      {msg && <div className="preview-box" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card pad">
          <h3 className="card-title">AI Integration (Gemini)</h3>
          <Field label="Free-tier API key (tried first)">
            <input className="input" type="password" placeholder={settings.gemini_api_key || 'not set'} value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
          </Field>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <button className="btn" disabled={!canManage || !geminiKey} onClick={() => { saveSetting('gemini_api_key', geminiKey); setGeminiKey(''); }}>Update free key</button>
            <button className="btn ghost" disabled={!canManage} onClick={testGemini}>Test Connection</button>
          </div>
          <Field label="Paid API key (fallback — used only if the free key fails)">
            <input className="input" type="password" placeholder={settings.gemini_api_key_paid || 'not set'} value={geminiKeyPaid} onChange={(e) => setGeminiKeyPaid(e.target.value)} />
          </Field>
          <div className="toolbar">
            <button className="btn" disabled={!canManage || !geminiKeyPaid} onClick={() => { saveSetting('gemini_api_key_paid', geminiKeyPaid); setGeminiKeyPaid(''); }}>Update paid key</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Scans use the free key first; the paid key is only used when the free one hits its quota/rate limit.</div>
          <Field label="Model (for scanning invoices & autofill)">
            {(() => {
              const current = settings.gemini_model || 'gemini-2.5-flash';
              const fetched = (models?.models || []).map((m) => m.name);
              const opts = fetched.length ? fetched : FALLBACK_MODELS;
              const list = opts.includes(current) ? opts : [current, ...opts];
              return (
                <div className="toolbar">
                  <select className="select" value={current} disabled={!canManage} onChange={(e) => saveSetting('gemini_model', e.target.value)}>
                    {list.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="btn ghost sm" onClick={loadModels} title="Fetch models available for this API key">↻</button>
                </div>
              );
            })()}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {models == null ? 'Loading models…'
                : models.ok ? `${models.models.length} model(s) available for your API key`
                : models.reason === 'no-key' ? 'Add & save an API key, then ↻ to load your available models (showing common models for now).'
                : 'Could not fetch models — showing common models. Check the key with Test Connection.'}
            </div>
          </Field>
        </div>

        <div className="card pad">
          <h3 className="card-title">Financial defaults</h3>
          <Field label="Default EUR → MKD rate">
            <input className="input" type="number" value={eurRate} onChange={(e) => setEurRate(e.target.value)} />
          </Field>
          <button className="btn" disabled={!canManage} onClick={() => saveSetting('default_eur_rate', String(eurRate))}>Save rate</button>
          <Field label="Client invoice number format" >
            <input className="input" defaultValue={settings.invoice_number_format || 'INV-{year}-{seq}'} onBlur={(e) => canManage && saveSetting('invoice_number_format', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
        <div className="card pad">
          <h3 className="card-title">Company letterhead (PDF invoices)</h3>
          <Field label="Company name"><input className="input" value={letterhead.company_name} onChange={(e) => setLetterhead({ ...letterhead, company_name: e.target.value })} /></Field>
          <Field label="Address"><input className="input" value={letterhead.company_address} onChange={(e) => setLetterhead({ ...letterhead, company_address: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={letterhead.company_phone} onChange={(e) => setLetterhead({ ...letterhead, company_phone: e.target.value })} /></Field>
          <button className="btn" disabled={!canManage} onClick={async () => { for (const k of ['company_name', 'company_address', 'company_phone']) await saveSetting(k, letterhead[k]); }}>Save letterhead</button>
        </div>

        <div className="card pad">
          <h3 className="card-title">Backups & integrations</h3>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Last backup: <b>{backup?.last ? new Date(backup.last.at).toLocaleString() : 'never'}</b>
            {backup?.last && <div className="muted">{backup.last.file}</div>}
            <div className="muted">Off-site (R2): {backup?.r2Enabled ? '✅ enabled' : '— not configured'}</div>
            <div className="muted">Verified restore: {backup?.verification ? (backup.verification.verified ? '✅ passed' : '❌ FAILED') : '— pending next run'}</div>
            <div className="muted">Email alerts (SMTP): {backup?.smtpEnabled ? '✅ enabled' : '— not configured'}</div>
          </div>
          <div className="toolbar">
            <button className="btn ghost" disabled={!canManage} onClick={backupNow}>Backup Now (pg_dump)</button>
            <button className="btn ghost" disabled={!canManage} onClick={async () => { setMsg('Sending test email…'); try { const r = await api.post('/settings/email/test'); setMsg(r.sent ? 'Test email sent ✓' : `Email not sent: ${r.reason}`); } catch (e) { setMsg(e.message); } }}>Send test email</button>
          </div>
          <div style={{ fontSize: 13, marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <b>Recurring engine</b>
            <div className="muted">Last run: {recurring?.lastRun ? new Date(recurring.lastRun).toLocaleDateString() : 'never'} · Next run: {recurring?.nextRun ? new Date(recurring.nextRun).toLocaleString() : '—'}</div>
            <div className="muted">Active templates: {recurring?.activeTemplates ?? '—'}</div>
          </div>
          <Field label="RENTALsyst API key" >
            <input className="input" type="password" placeholder={settings.rentalsyst_api_key || 'not set'} value={rentalsystKey} onChange={(e) => setRentalsystKey(e.target.value)} />
          </Field>
          <div className="toolbar">
            <button className="btn" disabled={!canManage || !rentalsystKey} onClick={() => saveSetting('rentalsyst_api_key', rentalsystKey)}>Save key</button>
            <button className="btn ghost" disabled title="Integration point — wire to RENTALsyst API">Sync Now</button>
          </div>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <h3 className="card-title">Expense categories</h3>
        <p className="muted" style={{ marginTop: -6 }}>Deliberately fixed to keep expense tracking simple (fuel/fines stay in RENTALsyst).</p>
        <div className="chip-row">{EXPENSE_CATEGORIES.map((c) => <Badge key={c} tone="gray">{c}</Badge>)}</div>
      </div>

      {canManage && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <h3 className="card-title">Team</h3>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>{team.map((u) => (
                <tr key={u.id}><td>{u.name || '—'}</td><td className="muted">{u.email}</td><td><Badge tone="blue">{u.role}</Badge></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="toolbar" style={{ marginTop: 14 }}>
            <input className="input" style={{ maxWidth: 240 }} placeholder="invite email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <select className="select" style={{ width: 130 }} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {['staff', 'manager', 'admin', 'owner'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="btn" onClick={sendInvite}>Invite</button>
          </div>
          {inviteLink && <div className="preview-box" style={{ marginTop: 10 }}>Invite link (copy & share): <code>{inviteLink}</code></div>}
        </div>
      )}
    </>
  );
}
