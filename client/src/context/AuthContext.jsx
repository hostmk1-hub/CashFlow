import { createContext, useContext, useEffect, useState } from 'react';
import { api, auth } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate on load if we already hold a token.
  useEffect(() => {
    (async () => {
      if (auth.token) {
        try {
          const list = await api.get('/me/tenants');
          setTenants(list);
          const active = list.find((t) => String(t.id) === String(auth.tenantId));
          if (active) setActiveTenant(active);
          setUser({ restored: true });
        } catch {
          auth.clear();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email, password) {
    const res = await api.post('/login', { email, password });
    auth.token = res.token;
    setUser(res.user);
    setTenants(res.tenants || []);
    if (res.activeTenant) {
      auth.tenantId = String(res.activeTenant.id);
      setActiveTenant(res.activeTenant);
    }
    return res;
  }

  async function signup(payload) {
    const res = await api.post('/signup', payload);
    auth.token = res.token;
    auth.tenantId = String(res.activeTenant.id);
    setUser(res.user);
    setTenants([res.activeTenant]);
    setActiveTenant(res.activeTenant);
    return res;
  }

  async function switchTenant(tenant) {
    const res = await api.post(`/tenants/${tenant.id}/switch`);
    auth.token = res.token;
    auth.tenantId = String(res.tenantId);
    setActiveTenant({ ...tenant, role: res.role });
  }

  function logout() {
    auth.clear();
    setUser(null);
    setTenants([]);
    setActiveTenant(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, tenants, activeTenant, loading, login, signup, switchTenant, logout, setTenants }}
    >
      {children}
    </AuthContext.Provider>
  );
}
