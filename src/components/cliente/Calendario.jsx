// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   aIsoLocal()            → L34
//   Calendario()           → L39
//   cambiarMes()           → L60
//   render (JSX)           → L68
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// CALENDARIO MENSUAL (selector de fecha para reservar)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Muestra un grid mensual para que el cliente elija el día del turno.
// Calcula qué días están dentro del rango [minDate, maxDate] (hoy → +30),
// pinta el estado por color/etiqueta (libre/parcial/lleno/cerrado) según
// cuántos horarios libres tiene ese día (getFreeCount) y evita seleccionar
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
// Lleno (0), Cerrado (null = domingo/lunes o sin horarios)
import { useState } from 'react';
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// aIsoLocal: convierte Date a 'YYYY-MM-DD' sin problemas de TZ (usa componentes locales)
const aIsoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Componente controlado: no tiene lógica de negocio, solo pinta el grid
// mensual y avisa al padre (via onSelectDate) qué día eligió el usuario.
// getFreeCount es una función que el padre pasa para contar horarios libres
// de cada día; totalSlots es el máximo posible (para saber si está lleno).
function Calendario({ getFreeCount, maxDate, minDate, onSelectDate, selectedDate, totalSlots }) {
  // ── Estado y cálculo del mes visible ──────────────
  // vista = Date del 1er día del mes que se está mostrando; inicia en el
  // mes de la fecha ya seleccionada (o en el mes actual si no hay).
  const [vista, setVista] = useState(() => { const a = new Date(`${selectedDate}T00:00:00`); return new Date(a.getFullYear(), a.getMonth(), 1); });
  // monthStart / monthEnd: primer y último día del mes visible; se usan para
  // deshabilitar los botones ‹ › cuando no hay mes adentro del rango.
  const monthStart = new Date(vista.getFullYear(), vista.getMonth(), 1);
  // leadingBlanks: celdas vacías al inicio para alinear el 1er día del mes
  // con la columna correcta (Lun=0 ... Dom=6; getDay() devuelve Dom=0, por
  // eso el (+6)%7 lo corre a Lun=0).
  const leadingBlanks = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(vista.getFullYear(), vista.getMonth() + 1, 0).getDate();
  const monthEnd = new Date(vista.getFullYear(), vista.getMonth() + 1, 0);
  // min / max: límites duros del rango de reserva (hoy y +30 días).
  // Se convierten a Date para comparar con los días del grid.
  const min = new Date(`${minDate}T00:00:00`);
  const max = new Date(`${maxDate}T00:00:00`);
  // hoyIso: string 'YYYY-MM-DD' de hoy, para marcar la celda de "hoy".
  const hoyIso = aIsoLocal(new Date());
  // cambiarMes: navega al mes anterior/siguiente (o/-1).
  const cambiarMes = (o) => setVista(new Date(vista.getFullYear(), vista.getMonth() + o, 1));
  // dayCells: array de celdas a renderizar = celdas vacías (blanks) +
  // una por cada día del mes. Cada celda tiene { day, key }.
  const dayCells = [
    ...Array.from({ length: leadingBlanks }, (_, i) => ({ day: null, key: `b-${i}` })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, key: `d-${i + 1}` })),
  ];
  // ── Render del calendario ─────────────────────────
  return (
    <div className="calendar-shell">
      {/* Cabecera con nombre del mes/año y flechas de navegación.
          ‹ se deshabilita si el mes visible es anterior al mínimo permitido;
          › se deshabilita si el mes visible es posterior al máximo. */}
      <div className="calendar-head">
        <button type="button" className="calendar-nav" aria-label="Mes anterior" disabled={monthStart <= min} onClick={() => cambiarMes(-1)}>‹</button>
        <strong>{MESES[vista.getMonth()]} {vista.getFullYear()}</strong>
        <button type="button" className="calendar-nav" aria-label="Mes siguiente" disabled={monthEnd >= max} onClick={() => cambiarMes(1)}>›</button>
      </div>
      {/* Fila de nombres de días (Lun a Dom). */}
      <div className="calendar-weekdays">{DIAS_SEMANA.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="calendar-grid">
        {dayCells.map(({ day, key }) => {
          // Celda vacía del principio del mes (para alinear columnas).
          if (day === null) return <span key={key} className="calendar-day empty" />;
          const date = new Date(vista.getFullYear(), vista.getMonth(), day);
          const dateIso = aIsoLocal(date);
          // inRange: true si el día cae dentro de [minDate, maxDate] (hoy a
          // +30). Fuera de rango el día va deshabilitado y sin información.
          const inRange = date >= min && date <= max;
          // freeCount: horarios libres de ese día; solo se consulta si está
          // en rango (evita llamadas innecesarias a getFreeCount).
          const freeCount = inRange ? getFreeCount(dateIso) : null;
          // isClosed: freeCount === null significa domingo/lunes (cerrado).
          const isClosed = freeCount === null;
          const isSelected = dateIso === selectedDate;
          const isToday = dateIso === hoyIso;
          // label: texto pequeño bajo el número del día. Fuera de rango no
          // muestra nada; cerrado dice "Cerrado"; lleno "Lleno"; si tiene
          // todos libres "Libre"; si tiene algunos "N libres".
          const label = !inRange ? '' : isClosed ? 'Cerrado' : freeCount === 0 ? 'Lleno' : freeCount === totalSlots ? 'Libre' : `${freeCount} libres`;
          // cls: se acumulan las clases CSS según el estado del día para
          // colorearlo (off=cerrado, full=lleno, today=hoy, selected=elegido).
          const cls = ['calendar-day'];
          if (!inRange) cls.push('off');
          if (isClosed) cls.push('closed');
          if (freeCount === 0) cls.push('full');
          if (isToday) cls.push('today');
          if (isSelected) cls.push('selected');
          return (
            // disabled={!inRange} evita elegir días fuera del rango de
            // reserva; el click solo llama onSelectDate si está en rango.
            <button key={key} type="button" className={cls.join(' ')} disabled={!inRange} aria-pressed={isSelected} onClick={() => { if (inRange) onSelectDate(dateIso); }}>
              <span className="calendar-daynum">{day}</span><small>{label}</small>
            </button>
          );
        })}
      </div>
      {/* Leyenda de colores para que el cliente entienda los estados. */}
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