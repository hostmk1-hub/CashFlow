import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getTheme, toggleTheme } from '../lib/theme.js';
import { Badge } from './ui.jsx';
import * as Ic from './icons.jsx';

const ROLE_RANK = { staff: 1, manager: 2, admin: 3, owner: 4 };

const NAV = [
  ['Overview', [
    ['/', 'Dashboard', Ic.Grid],
    ['/calendar', 'Calendar', Ic.Calendar],
    ['/reports', 'Reports', Ic.Chart],
  ]],
  ['Operations', [
    ['/companies', 'Companies', Ic.Building],
    ['/vehicles', 'Vehicles', Ic.Truck],
    ['/workers', 'Workers', Ic.Users],
  ]],
  ['Money', [
    ['/invoices', 'Invoices', Ic.FileText],
    ['/invoice-manager', 'Invoice Manager', Ic.FileCheck],
    ['/payments', 'Payments', Ic.CreditCard],
    ['/recurring', 'Recurring', Ic.Repeat],
    ['/daily-income', 'Daily Income', Ic.Wallet],
  ]],
];

export default function Layout({ children }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { activeTenant, tenants, switchTenant, logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [reminders, setReminders] = useState({ count: 0, items: [] });
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [theme, setTheme] = useState(getTheme());
  const [fabOpen, setFabOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile drawer

  // close the mobile drawer whenever the route changes
  useEffect(() => { setNavOpen(false); }, [loc.pathname]);

  useEffect(() => { api.get('/reminders').then(setReminders).catch(() => {}); }, [activeTenant]);
  useEffect(() => {
    if (!q.trim()) return setResults(null);
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path) => { setResults(null); setQ(''); nav(path); };
  const initials = (activeTenant?.name || 'F').slice(0, 2).toUpperCase();

  return (
    <div className="shell" onClick={() => { setMenuOpen(false); setBellOpen(false); setUserOpen(false); setFabOpen(false); }}>
      {navOpen && <div className="sidebar-backdrop" onClick={(e) => { e.stopPropagation(); setNavOpen(false); }} />}
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="brand-lockup">
          <div className="brand-mark"><Ic.Bolt width={20} height={20} /></div>
          <div>
            <div className="brand-name">Finance</div>
            <div className="brand-sub">by Rentonic</div>
          </div>
        </div>

        <nav style={{ overflowY: 'auto', flex: '0 1 auto' }}>
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="nav-group-label">{group}</div>
              {items.map(([path, label, Icon]) => {
                const active = path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(path);
                return (
                  <div key={path} className={`nav-item ${active ? 'active' : ''}`} onClick={() => nav(path)}>
                    <Icon /> {label}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="nav-group-label">System</div>
          {(ROLE_RANK[activeTenant?.role] || 0) >= 2 && (
            <div className={`nav-item ${loc.pathname.startsWith('/audit') ? 'active' : ''}`} onClick={() => nav('/audit')}>
              <Ic.Receipt /> Audit Log
            </div>
          )}
          <div className={`nav-item ${loc.pathname.startsWith('/settings') ? 'active' : ''}`} onClick={() => nav('/settings')}>
            <Ic.Settings /> Settings
          </div>
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip" onClick={(e) => { e.stopPropagation(); setUserOpen((v) => !v); }} style={{ position: 'relative' }}>
            <div className="avatar">{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Account'}</div>
              <div className="muted" style={{ fontSize: 11, textTransform: 'capitalize' }}>{activeTenant?.role}</div>
            </div>
            <Ic.ChevronDown width={16} height={16} className="muted" />
            {userOpen && (
              <div className="pop" style={{ bottom: 48, top: 'auto', right: 0, left: 0 }} onClick={(e) => e.stopPropagation()}>
                <div className="row" onClick={() => { const t = toggleTheme(); setTheme(t); }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{theme === 'dark' ? <Ic.Sun width={16} height={16} /> : <Ic.Moon width={16} height={16} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </div>
                <div className="row" onClick={() => nav('/settings')}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Settings width={16} height={16} /> Settings</span></div>
                <div className="sep" />
                <div className="row" style={{ color: 'var(--neg)' }} onClick={logout}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Logout width={16} height={16} /> Sign out</span></div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn hamburger" title="Menu" onClick={() => setNavOpen((v) => !v)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <div className="search">
            <span className="mag"><Ic.Search width={17} height={17} /></span>
            <input className="input" placeholder="Search plate, company, invoice…" value={q} onChange={(e) => setQ(e.target.value)} />
            {results && (
              <div className="search-results">
                {results.companies?.length > 0 && <div className="grp">Companies</div>}
                {results.companies?.map((c) => <div key={'c' + c.id} className="row" onClick={() => go(`/companies/${c.id}`)}><Ic.Building width={15} height={15} className="muted" />{c.name}</div>)}
                {results.vehicles?.length > 0 && <div className="grp">Vehicles</div>}
                {results.vehicles?.map((v) => <div key={'v' + v.id} className="row" onClick={() => go(`/vehicles/${v.id}`)}><Ic.Truck width={15} height={15} className="muted" />{v.plate} · {v.make} {v.model}</div>)}
                {results.invoices?.length > 0 && <div className="grp">Invoices</div>}
                {results.invoices?.map((i) => <div key={'i' + i.id} className="row" onClick={() => go('/invoices')}><Ic.FileText width={15} height={15} className="muted" />{i.invoice_number || '#' + i.id} · {i.description}</div>)}
                {!results.companies?.length && !results.vehicles?.length && !results.invoices?.length && <div className="row muted">No matches</div>}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <button className="icon-btn theme-toggle" title="Toggle theme" onClick={() => { const t = toggleTheme(); setTheme(t); }}>
            {theme === 'dark' ? <Ic.Sun /> : <Ic.Moon />}
          </button>

          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={() => setBellOpen((v) => !v)}>
              <Ic.Bell />{reminders.count > 0 && <span className="dot">{reminders.count}</span>}
            </button>
            {bellOpen && (
              <div className="bell-menu" onClick={(e) => e.stopPropagation()}>
                <div className="head">Reminders</div>
                {reminders.items.length === 0 && <div className="row muted">Nothing due — all clear.</div>}
                {reminders.items.map((r, i) => (
                  <div key={i} className="row"><Badge tone={r.type === 'overdue' ? 'red' : 'yellow'}>{r.type}</Badge> <span>{r.text}</span></div>
                ))}
              </div>
            )}
          </div>

          <div className="tenant-switch">
            <div className="tenant-btn" onClick={() => setMenuOpen((v) => !v)}>
              <div className="avatar" style={{ width: 26, height: 26, borderRadius: 8, fontSize: 11 }}>{initials}</div>
              <span className="tenant-name" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTenant?.name}</span>
              <Ic.ChevronDown width={16} height={16} className="muted" />
            </div>
            {menuOpen && (
              <div className="pop" onClick={(e) => e.stopPropagation()}>
                <div className="nav-group-label" style={{ padding: '4px 8px' }}>Switch company</div>
                {tenants.map((t) => (
                  <div key={t.id} className="row" onClick={() => { switchTenant(t); setMenuOpen(false); }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div className="avatar" style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10 }}>{t.name.slice(0, 2).toUpperCase()}</div>
                      {t.name}
                    </span>
                    {String(t.id) === String(activeTenant?.id) && <Ic.Check width={16} height={16} style={{ color: 'var(--pos)' }} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      {fabOpen && (
        <div className="pop" style={{ position: 'fixed', right: 26, bottom: 92, top: 'auto', zIndex: 41 }} onClick={(e) => e.stopPropagation()}>
          <div className="row" onClick={() => { setFabOpen(false); nav('/invoices'); }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Plus width={15} height={15} /> Add Expense</span></div>
          <div className="row" onClick={() => { setFabOpen(false); nav('/invoices'); }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Scan width={15} height={15} /> Scan Invoice</span></div>
          <div className="row" onClick={() => { setFabOpen(false); nav('/daily-income'); }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.Wallet width={15} height={15} /> Daily Income</span></div>
          <div className="row" onClick={() => { setFabOpen(false); nav('/invoice-manager'); }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.FileCheck width={15} height={15} /> Client Invoice</span></div>
        </div>
      )}
      <button className="fab" onClick={(e) => { e.stopPropagation(); setFabOpen((v) => !v); }} title="Quick add"><Ic.Plus /></button>
    </div>
  );
}
