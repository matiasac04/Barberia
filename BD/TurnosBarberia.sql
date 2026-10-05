CREATE DATABASE TurnosBarberia;

USE TurnosBarberia;


CREATE TABLE Profesional (
    idProfesional INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    telefono VARCHAR(20),
    activo BIT DEFAULT 1
);

CREATE TABLE Cliente (
    idCliente INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    telefono VARCHAR(20),
    password VARCHAR(255)
);

CREATE TABLE Administrador (
    idAdmin INT IDENTITY(1,1) PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    nombre VARCHAR(100),
    apellido VARCHAR(100),
    email VARCHAR(150)
);

CREATE TABLE Servicio (
    idServicio INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100),
    precio DECIMAL(10, 2),
    duracion_minutos INT
);

CREATE TABLE HorarioLaboral (
    idHorario INT IDENTITY(1,1) PRIMARY KEY,
    idProfesional INT REFERENCES Profesional(idProfesional),
    diaSemana INT,
    horaEntrada TIME(0),
    horaSalida TIME(0)
);

-- Turno.horaFin es una columna calculada: se deriva de la hora de inicio + la
-- duración real, así que nunca puede quedar desincronizada con el servicio.
-- OJO con el estado: los valores que usa la app son 'Confirmado' (default),
-- 'Completado', 'NoSePresento' y 'Cancelado'. 'Cancelado' NO borra la fila:
-- libera el slot y deja el turno en el historial.
CREATE TABLE Turno (
    idTurno INT IDENTITY(1,1) PRIMARY KEY,
    idProfesional INT REFERENCES Profesional(idProfesional),
    idCliente INT REFERENCES Cliente(idCliente),
    idServicio INT REFERENCES Servicio(idServicio),
    fecha DATE,
    horaInicio TIME(0),
    duracionReal INT,
    horaFin AS DATEADD(minute, duracionReal, horaInicio),
    precioTotal DECIMAL(10, 2),
    telefono VARCHAR(20),
    estado VARCHAR(20) DEFAULT 'Confirmado'
);

-- BloqueoHorario: bloqueo puntual del admin. hora = NULL significa "día
-- completo bloqueado" (ver getDateBlockedSlots en el frontend).
CREATE TABLE BloqueoHorario (
    idBloqueo      INT IDENTITY(1,1) PRIMARY KEY,
    idProfesional  INT REFERENCES Profesional(idProfesional),
    fecha          DATE,
    hora           VARCHAR(5)
);

-- ── Índices recomendados ──────────────────────────────
-- El backend valida la ocupación de un slot y recién después inserta, dentro
-- de una transacción SERIALIZABLE, así que la doble reserva ya está cubierta a
-- nivel aplicación. Este índice la cubre TAMBIÉN a nivel base (defensa en
-- profundidad) y además acelera las consultas de disponibilidad, que son las
-- que más pegan a la base.
--
-- Antes de crearlo, revisá que no haya turnos duplicados (si los hay, el
-- CREATE falla y hay que resolverlos antes):
--   SELECT idProfesional, fecha, horaInicio, COUNT(*) AS n
--   FROM Turno WHERE estado <> 'Cancelado'
--   GROUP BY idProfesional, fecha, horaInicio HAVING COUNT(*) > 1;
--
-- CREATE UNIQUE INDEX UX_Turno_Slot ON Turno (idProfesional, fecha, horaInicio)
--   WHERE estado <> 'Cancelado';
-- CREATE INDEX IX_Turno_Cliente ON Turno (idCliente, fecha);
-- CREATE INDEX IX_HorarioProfesional ON HorarioLaboral (idProfesional, diaSemana);
-- CREATE INDEX IX_BloqueoProfesional ON BloqueoHorario (idProfesional, fecha);