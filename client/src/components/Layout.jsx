import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { Badge } from './ui.jsx';

const NAV = [
  ['/', 'Dashboard', '▤'],
  ['/companies', 'Companies', '🏢'],
  ['/vehicles', 'Vehicles', '🚐'],
  ['/workers', 'Workers', '👷'],
  ['/invoices', 'Invoices', '📄'],
  ['/invoice-manager', 'Invoice Manager', '📑'],
  ['/payments', 'Payments', '💸'],
  ['/recurring', 'Recurring', '🔁'],
  ['/daily-income', 'Daily Income', '💵'],
  ['/reports', 'Reports', '📊'],
  ['/settings', 'Settings', '⚙️'],
];

export default function Layout({ children }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { activeTenant, tenants, switchTenant, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [reminders, setReminders] = useState({ count: 0, items: [] });
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const searchRef = useRef();

  useEffect(() => {
    api.get('/reminders').then(setReminders).catch(() => {});
  }, [activeTenant]);

  useEffect(() => {
    if (!q.trim()) return setResults(null);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(path) {
    setResults(null);
    setQ('');
    nav(path);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">₣</div>
          <div>
            <div className="brand-name">Finance</div>
            <div className="brand-sub">by Rentonic</div>
          </div>
        </div>
        {NAV.map(([path, label, ico]) => {
          const active = path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(path);
          return (
            <div key={path} className={`nav-item ${active ? 'active' : ''}`} onClick={() => nav(path)}>
              <span className="nav-ico">{ico}</span>
              {label}
            </div>
          );
        })}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="search" ref={searchRef}>
            <span className="mag">⌕</span>
            <input className="input" placeholder="Search plate, company, invoice…" value={q}
              onChange={(e) => setQ(e.target.value)} />
            {results && (
              <div className="search-results">
                {results.companies?.length > 0 && <div className="grp">Companies</div>}
                {results.companies?.map((c) => (
                  <div key={'c' + c.id} className="row" onClick={() => go(`/companies/${c.id}`)}>{c.name} <span className="muted">{c.phone || ''}</span></div>
                ))}
                {results.vehicles?.length > 0 && <div className="grp">Vehicles</div>}
                {results.vehicles?.map((v) => (
                  <div key={'v' + v.id} className="row" onClick={() => go(`/vehicles/${v.id}`)}>{v.plate} · {v.make} {v.model}</div>
                ))}
                {results.invoices?.length > 0 && <div className="grp">Invoices</div>}
                {results.invoices?.map((i) => (
                  <div key={'i' + i.id} className="row" onClick={() => go('/invoices')}>{i.invoice_number || '#' + i.id} · {i.description}</div>
                ))}
                {!results.companies?.length && !results.vehicles?.length && !results.invoices?.length && (
                  <div className="row muted">No matches</div>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <div className="bell" onClick={() => setBellOpen((v) => !v)}>
            🔔{reminders.count > 0 && <span className="badge">{reminders.count}</span>}
            {bellOpen && (
              <div className="bell-menu" onClick={(e) => e.stopPropagation()}>
                {reminders.items.length === 0 && <div className="row muted">Nothing due — all clear.</div>}
                {reminders.items.map((r, i) => (
                  <div key={i} className="row"><Badge tone={r.type === 'overdue' ? 'red' : 'yellow'}>{r.type}</Badge> {r.text}</div>
                ))}
              </div>
            )}
          </div>

          <div className="tenant-switch">
            <div className="tenant-btn" onClick={() => setMenuOpen((v) => !v)}>
              {activeTenant?.name} <Badge tone="blue">{activeTenant?.role}</Badge> ▾
            </div>
            {menuOpen && (
              <div className="tenant-menu" onClick={(e) => e.stopPropagation()}>
                {tenants.map((t) => (
                  <div key={t.id} className="row" onClick={() => { switchTenant(t); setMenuOpen(false); }}>
                    {t.name} <Badge tone="gray">{t.role}</Badge>
                  </div>
                ))}
                <div className="row" style={{ borderTop: '1px solid var(--line)', color: 'var(--red)' }} onClick={logout}>Sign out</div>
              </div>
            )}
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
