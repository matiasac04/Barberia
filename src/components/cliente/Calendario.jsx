// ── Calendario mensual para elegir fecha de turno ─────
import { useState } from 'react';
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const toLocalIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function Calendario({ getFreeCount, maxDate, minDate, onSelectDate, selectedDate, totalSlots }) {
  // ── Estado y cálculo del mes visible ──────────────
  const [view, setView] = useState(() => { const a = new Date(`${selectedDate}T00:00:00`); return new Date(a.getFullYear(), a.getMonth(), 1); });
  const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
  const leadingBlanks = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(view.getFullYear(), view.getMonth() + 1, 0);
  const min = new Date(`${minDate}T00:00:00`);
  const max = new Date(`${maxDate}T00:00:00`);
  const todayIso = toLocalIso(new Date());
  const shiftMonth = (o) => setView(new Date(view.getFullYear(), view.getMonth() + o, 1));
  const dayCells = [
    ...Array.from({ length: leadingBlanks }, (_, i) => ({ day: null, key: `b-${i}` })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, key: `d-${i + 1}` })),
  ];
  // ── Render del calendario ─────────────────────────
  return (
    <div className="calendar-shell">
      <div className="calendar-head">
        <button type="button" className="calendar-nav" aria-label="Mes anterior" disabled={monthStart <= min} onClick={() => shiftMonth(-1)}>‹</button>
        <strong>{MONTHS[view.getMonth()]} {view.getFullYear()}</strong>
        <button type="button" className="calendar-nav" aria-label="Mes siguiente" disabled={monthEnd >= max} onClick={() => shiftMonth(1)}>›</button>
      </div>
      <div className="calendar-weekdays">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="calendar-grid">
        {dayCells.map(({ day, key }) => {
          if (day === null) return <span key={key} className="calendar-day empty" />;
          const date = new Date(view.getFullYear(), view.getMonth(), day);
          const dateIso = toLocalIso(date);
          const inRange = date >= min && date <= max;
          const freeCount = inRange ? getFreeCount(dateIso) : null;
          const isClosed = freeCount === null;
          const isSelected = dateIso === selectedDate;
          const isToday = dateIso === todayIso;
          const label = !inRange ? '' : isClosed ? 'Cerrado' : freeCount === 0 ? 'Lleno' : freeCount === totalSlots ? 'Libre' : `${freeCount} libres`;
          const cls = ['calendar-day'];
          if (!inRange) cls.push('off');
          if (isClosed) cls.push('closed');
          if (freeCount === 0) cls.push('full');
          if (isToday) cls.push('today');
          if (isSelected) cls.push('selected');
          return (
            <button key={key} type="button" className={cls.join(' ')} disabled={!inRange} aria-pressed={isSelected} onClick={() => { if (inRange) onSelectDate(dateIso); }}>
              <span className="calendar-daynum">{day}</span><small>{label}</small>
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span><i className="lg-free" />Libre</span>
        <span><i className="lg-partial" />Parcial</span>
        <span><i className="lg-full" />Lleno</span>
        <span><i className="lg-closed" />Cerrado</span>
      </div>
    </div>
  );
}
export default Calendario;
