import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Field } from '../components/ui.jsx';

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', companyName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await signup(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-lockup">
          <div className="brand-mark">₣</div>
          <div>
            <div className="brand-name">Finance</div>
            <div className="brand-sub">by Rentonic</div>
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {mode === 'signup' && (
          <>
            <Field label="Your name">
              <input className="input" value={form.name} onChange={set('name')} placeholder="Jane Doe" />
            </Field>
            <Field label="Company name">
              <input className="input" value={form.companyName} onChange={set('companyName')} placeholder="DriveRent" required />
            </Field>
          </>
        )}
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" required />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
        </Field>

        <button className="btn block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <p className="center muted" style={{ marginTop: 16 }}>
          {mode === 'login' ? (
            <>New here? <a onClick={() => setMode('signup')} style={{ color: 'var(--brand)', cursor: 'pointer' }}>Create a company</a></>
          ) : (
            <>Already have an account? <a onClick={() => setMode('login')} style={{ color: 'var(--brand)', cursor: 'pointer' }}>Sign in</a></>
          )}
        </p>
        {mode === 'login' && (
          <p className="center muted" style={{ fontSize: 12, marginTop: 4 }}>
            Demo: owner@driverent.mk / password123
          </p>
        )}
      </form>
    </div>
  );
}
