import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Spinner, Badge } from '../components/ui.jsx';

export default function Settings() {
  const { activeTenant } = useAuth();
  const [settings, setSettings] = useState(null);
  const [team, setTeam] = useState([]);
  const [geminiKey, setGeminiKey] = useState('');
  const [eurRate, setEurRate] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'staff' });
  const [inviteLink, setInviteLink] = useState('');
  const [msg, setMsg] = useState('');
  const canManage = ['owner', 'admin'].includes(activeTenant?.role);

  const load = () => {
    api.get('/settings').then((s) => { setSettings(s); setEurRate(s.default_eur_rate || '61.8'); });
    if (canManage) api.get(`/tenants/${activeTenant.id}/users`).then(setTeam).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function saveSetting(key, value) {
    setMsg('');
    try { await api.put('/settings', { key, value }); setMsg('Saved ✓'); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function testGemini() {
    setMsg('Testing…');
    try { const r = await api.post('/settings/gemini/test'); setMsg(r.ok ? `Connection OK (${r.model})` : `Failed: status ${r.status}`); }
    catch (e) { setMsg(e.message); }
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
          <Field label="API key (encrypted at rest)">
            <input className="input" type="password" placeholder={settings.gemini_api_key || 'not set'} value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
          </Field>
          <div className="toolbar">
            <button className="btn" disabled={!canManage || !geminiKey} onClick={() => saveSetting('gemini_api_key', geminiKey)}>Update Key</button>
            <button className="btn ghost" disabled={!canManage} onClick={testGemini}>Test Connection</button>
          </div>
          <Field label="Model" ><input className="input" defaultValue={settings.gemini_model || 'gemini-2.5-flash'} onBlur={(e) => canManage && saveSetting('gemini_model', e.target.value)} /></Field>
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
