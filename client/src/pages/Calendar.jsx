import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Badge } from '../components/ui.jsx';

const KIND_TONE = { payable: 'yellow', receivable: 'green', recurring: 'blue' };

export default function Calendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState(null);

  useEffect(() => { setEvents(null); api.get(`/calendar?month=${month}`).then(setEvents).catch(() => setEvents([])); }, [month]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7; // Mon-first
  const byDay = {};
  (events || []).forEach((e) => {
    const day = Number(e.date?.slice(8, 10));
    (byDay[day] = byDay[day] || []).push(e);
  });

  function shift(delta) {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(d.toISOString().slice(0, 7));
  }

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Calendar</div>
        <div className="toolbar">
          <button className="btn ghost sm" onClick={() => shift(-1)}>← Prev</button>
          <b style={{ minWidth: 120, textAlign: 'center' }}>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
          <button className="btn ghost sm" onClick={() => shift(1)}>Next →</button>
        </div>
      </div>

      {!events ? <Spinner /> : (
        <div className="card pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="muted" style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>{d}</div>
            ))}
            {cells.map((day, i) => (
              <div key={i} style={{ minHeight: 92, border: '1px solid var(--line)', borderRadius: 8, padding: 6, background: day ? '#fff' : 'transparent' }}>
                {day && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{day}</div>}
                {(byDay[day] || []).slice(0, 3).map((e, j) => (
                  <div key={j} title={`${e.description} · ${mkd(e.amount)}`} style={{ marginTop: 3 }}>
                    <Badge tone={KIND_TONE[e.kind] || 'gray'}>{(e.description || '').slice(0, 14)}</Badge>
                  </div>
                ))}
                {(byDay[day]?.length > 3) && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>+{byDay[day].length - 3} more</div>}
              </div>
            ))}
          </div>
          <div className="chip-row" style={{ marginTop: 14 }}>
            <Badge tone="yellow">payable (lease/expense)</Badge>
            <Badge tone="green">receivable (client invoice)</Badge>
            <Badge tone="blue">recurring</Badge>
          </div>
        </div>
      )}
    </>
  );
}
