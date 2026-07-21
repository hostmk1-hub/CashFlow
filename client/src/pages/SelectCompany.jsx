import { useAuth } from '../context/AuthContext.jsx';
import { Badge } from '../components/ui.jsx';

export default function SelectCompany() {
  const { tenants, switchTenant, logout } = useAuth();
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="brand-lockup">
          <div className="brand-mark">₣</div>
          <div>
            <div className="brand-name">Select a company</div>
            <div className="brand-sub">You belong to {tenants.length} companies</div>
          </div>
        </div>
        <div className="grid" style={{ gap: 8 }}>
          {tenants.map((t) => (
            <div key={t.id} className="tenant-btn" style={{ justifyContent: 'space-between' }} onClick={() => switchTenant(t)}>
              <span>{t.name}</span>
              <Badge tone="blue">{t.role}</Badge>
            </div>
          ))}
        </div>
        <button className="btn ghost block" style={{ marginTop: 16 }} onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
