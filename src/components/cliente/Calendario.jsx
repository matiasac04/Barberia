// ═══════════════════════════════════════════════════════════════════
// CALENDARIO MENSUAL (selector de fecha para reservar)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Muestra un grid mensual para que el cliente elija el día del turno.
// Calcula qué días están dentro del rango [minDate, maxDate] (hoy → +30),
// pinta el estado por color/etiqueta (libre/parcial/lleno/cerrado) según
// cuántos slots libres tiene ese día (getFreeCount) y evita seleccionar
// domingos/lunes o fuera de rango.
//
// FLUJO:
// 1. Recibe selectedDate ('YYYY-MM-DD'), minDate, maxDate, totalSlots y getFreeCount(ds)
// 2. vista = primer día del mes visible (inicializa con selectedDate)
// 3. Calcula leadingBlanks (para alinear con día de semana Lun–Dom)
// 4. Genera celdas (vacías + días del mes)
// 5. Por cada día: calcula si está en rango, pide freeCount, decide clase/etiqueta
// 6. Al click: valida inRange y llama onSelectDate(dateIso)
//
// Etiquetas: Libre (freeCount==totalSlots), Parcial (0<freeCount<totalSlots),
// Lleno (0), Cerrado (null = domingo/lunes o sin slots)
import { useState } from 'react';
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// aIsoLocal: convierte Date a 'YYYY-MM-DD' sin problemas de TZ (usa componentes locales)
const aIsoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function Calendario({ getFreeCount, maxDate, minDate, onSelectDate, selectedDate, totalSlots }) {
  // ── Estado y cálculo del mes visible ──────────────
  // vista = Date del 1er día del mes que se está mostrando
  const [vista, setVista] = useState(() => { const a = new Date(`${selectedDate}T00:00:00`); return new Date(a.getFullYear(), a.getMonth(), 1); });
  const monthStart = new Date(vista.getFullYear(), vista.getMonth(), 1);
  const leadingBlanks = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(vista.getFullYear(), vista.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(vista.getFullYear(), vista.getMonth() + 1, 0);
  const min = new Date(`${minDate}T00:00:00`);
  const max = new Date(`${maxDate}T00:00:00`);
  const hoyIso = aIsoLocal(new Date());
  const cambiarMes = (o) => setVista(new Date(vista.getFullYear(), vista.getMonth() + o, 1));
  const dayCells = [
    ...Array.from({ length: leadingBlanks }, (_, i) => ({ day: null, key: `b-${i}` })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, key: `d-${i + 1}` })),
  ];
  // ── Render del calendario ─────────────────────────
  return (
    <div className="calendar-shell">
      <div className="calendar-head">
        <button type="button" className="calendar-nav" aria-label="Mes anterior" disabled={monthStart <= min} onClick={() => cambiarMes(-1)}>‹</button>
        <strong>{MESES[vista.getMonth()]} {vista.getFullYear()}</strong>
        <button type="button" className="calendar-nav" aria-label="Mes siguiente" disabled={monthEnd >= max} onClick={() => cambiarMes(1)}>›</button>
      </div>
      <div className="calendar-weekdays">{DIAS_SEMANA.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="calendar-grid">
        {dayCells.map(({ day, key }) => {
          if (day === null) return <span key={key} className="calendar-day empty" />;
          const date = new Date(vista.getFullYear(), vista.getMonth(), day);
          const dateIso = aIsoLocal(date);
          const inRange = date >= min && date <= max;
          const freeCount = inRange ? getFreeCount(dateIso) : null;
          const isClosed = freeCount === null;
          const isSelected = dateIso === selectedDate;
          const isToday = dateIso === hoyIso;
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