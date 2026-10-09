// ═══════════════════════════════════════════════════════════════════
// DATOS SEMILLA — respaldo para arrancar la app
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// La fuente de verdad de esta app es la BASE DE DATOS (SQL Server), no este
// archivo. Ojo: los catálogos (profesionales, servicios) NO están acá a
// propósito — si el admin agrega un servicio, tiene que aparecer sin tocar
// código. Solo se guarda acá el dato que no viene de ninguna tabla: el
// HORARIO FIJO DE RESPALDO.
//
// QUÉ ES UN "RESPALDO": cuando un profesional NO tiene horario cargado en la
// tabla HorarioLaboral (o la tabla está vacía porque el admin todavía no
// la configuró), la app necesita igual una lista de horarios para pintar el
// calendario. Si no, el turnero saldría sin ningún horario y nadie podría
// reservar. horariosFijos cumple esa función.
//
// DÓNDE SE USA: App.jsx y Horarios.jsx lo pasan como 4º parámetro a
// horariosDeLaSemana(), que hace: "si hay filas en HorarioLaboral para ese
// profesional y ese día, uso esas; si no hay, uso estos horariosFijos".
//
// CÓMO SE USA EL ALMUERZO: no aparece ningún horario entre las 12:30 y las 15:00
// porque esa franja NO está en la lista. El break no necesita código extra:
// simplemente no hay horarios en ese rango.
export const horariosFijos = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '15:00', '15:30', '16:00', '16:30', '17:00']