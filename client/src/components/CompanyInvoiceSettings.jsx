import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Field, Spinner } from './ui.jsx';

const EMPTY = {
  name: '', address: '', phone: '', email: '', website: '', taxNumber: '',
  vatEnabled: false, vatRate: 18, bankAccounts: [],
  signatureLabels: { received: 'Примил', invoicedBy: 'Фактурирал', director: 'Директор' },
  footerNote1: '', footerNote2: '', logoUrl: null,
};

/**
 * Company profile that feeds every generated invoice (ФАКТУРА): header details,
 * ДДВ default, bank accounts, signature labels, footer text and logo. Loads and
 * saves via /settings/company. Rendered both in Settings and (as a modal) from
 * the Invoice Manager.
 */
export default function CompanyInvoiceSettings({ canManage = true, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.get('/settings/company').then((d) => setF({ ...EMPTY, ...d })).catch((e) => setMsg(e.message)); }, []);
  if (!f) return <Spinner />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setSig = (k) => (e) => setF({ ...f, signatureLabels: { ...f.signatureLabels, [k]: e.target.value } });
  const setBank = (i, k, v) => setF({ ...f, bankAccounts: f.bankAccounts.map((b, j) => (j === i ? { ...b, [k]: v } : b)) });
  const addBank = () => setF({ ...f, bankAccounts: [...(f.bankAccounts || []), { bankName: '', accountNo: '' }] });
  const rmBank = (i) => setF({ ...f, bankAccounts: f.bankAccounts.filter((_, j) => j !== i) });

  async function save() {
    setBusy(true); setMsg('');
    try {
      const banks = (f.bankAccounts || []).filter((b) => b.accountNo?.trim());
      await api.put('/settings/company', {
        name: f.name, address: f.address, phone: f.phone, email: f.email, website: f.website,
        taxNumber: f.taxNumber, vatEnabled: !!f.vatEnabled, vatRate: Number(f.vatRate) || 0,
        bankAccounts: banks, signatureLabels: f.signatureLabels,
        footerNote1: f.footerNote1, footerNote2: f.footerNote2,
      });
      setMsg('Saved ✓');
      onSaved?.();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function uploadLogo(file) {
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const d = await api.upload('/settings/company/logo', fd);
      setF((prev) => ({ ...prev, logoUrl: d.logoUrl }));
      setMsg('Logo updated ✓');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      {msg && <div className="preview-box" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="row2">
        <Field label="Company name (Име на компанија)"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Даночен број (tax/VAT number)"><input className="input" value={f.taxNumber} onChange={set('taxNumber')} /></Field>
      </div>
      <Field label="Address (Адреса)"><input className="input" value={f.address} onChange={set('address')} /></Field>
      <div className="row2">
        <Field label="Phone (Тел)"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Email (Е-маил)"><input className="input" value={f.email} onChange={set('email')} /></Field>
      </div>
      <Field label="Website (Веб)"><input className="input" value={f.website} onChange={set('website')} /></Field>

      <div className="field">
        <label>Logo</label>
        <div className="toolbar" style={{ alignItems: 'center' }}>
          {f.logoUrl
            ? <img src={f.logoUrl} alt="logo" style={{ height: 44, borderRadius: 6, background: '#fff', padding: 2, border: '1px solid var(--line)' }} />
            : <span className="muted">No logo yet</span>}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
            {f.logoUrl ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={!canManage || busy} onChange={(e) => uploadLogo(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div className="field">
        <label>ДДВ (VAT)</label>
        <div className="toolbar" style={{ alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!f.vatEnabled} onChange={(e) => setF({ ...f, vatEnabled: e.target.checked })} /> Charge ДДВ on invoices
          </label>
          <input className="input" style={{ maxWidth: 90 }} type="number" value={f.vatRate} onChange={set('vatRate')} disabled={!f.vatEnabled} />
          <span className="muted">% default rate</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>When off, the ДДВ column always renders 0 — matching the sample.</div>
      </div>

      <div className="field">
        <label>Bank accounts (Жиро сметки)</label>
        {(f.bankAccounts || []).map((b, i) => (
          <div key={i} className="toolbar" style={{ marginBottom: 6 }}>
            <input className="input" placeholder="Account no. (Жиро сметка)" value={b.accountNo || ''} onChange={(e) => setBank(i, 'accountNo', e.target.value)} />
            <input className="input" placeholder="Bank name" value={b.bankName || ''} onChange={(e) => setBank(i, 'bankName', e.target.value)} />
            <button className="btn ghost sm" onClick={() => rmBank(i)}>✕</button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={addBank}>+ Add bank account</button>
      </div>

      <div className="field">
        <label>Signature labels</label>
        <div className="row3">
          <input className="input" value={f.signatureLabels.received} onChange={setSig('received')} />
          <input className="input" value={f.signatureLabels.invoicedBy} onChange={setSig('invoicedBy')} />
          <input className="input" value={f.signatureLabels.director} onChange={setSig('director')} />
        </div>
      </div>

      <div className="row2">
        <Field label="Footer line 1 (disclaimer)"><input className="input" value={f.footerNote1} onChange={set('footerNote1')} /></Field>
        <Field label="Footer line 2 (disclaimer)"><input className="input" value={f.footerNote2} onChange={set('footerNote2')} /></Field>
      </div>

      <button className="btn" disabled={!canManage || busy} onClick={save}>{busy ? 'Saving…' : 'Save company details'}</button>
    </div>
  );
}
