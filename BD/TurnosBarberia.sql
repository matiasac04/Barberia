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
    estado VARCHAR(20) DEFAULT 'Confirmado',
);

CREATE TABLE BloqueoHorario (
    idBloqueo      INT IDENTITY(1,1) PRIMARY KEY,
    idProfesional  INT REFERENCES Profesional(idProfesional),
    fecha          DATE,
    hora           VARCHAR(5),
);

--SPU

--REGISTRO

create procedure spu_registro

@nombre VARCHAR(100),
@apellido VARCHAR(100),
@email VARCHAR(150),
@telefono VARCHAR(20)=null,
@password VARCHAR(255)
as
insert into Cliente (nombre, apellido, email, telefono, password)
values (@nombre,@apellido,@email,@telefono,@password)


--LOGIN

CREATE PROCEDURE spu_login
    @email NVARCHAR(150),
    @password NVARCHAR(255)
AS
BEGIN
    SELECT idCliente, email
    FROM Cliente
    WHERE email = @email AND password = @password;
END

--VER DISPONIBLES

CREATE PROCEDURE spu_turnos_disponibles
    @idProfesional INT,
    @fecha DATE
AS
BEGIN

    -- 1. Averiguamos qué día de la semana es la fecha dada (1 = Domingo, 2 = Lunes, ..., 7 = Sábado)
    -- Nota: DATEPART(dw, @fecha) depende de la configuración del servidor, pero habitualmente mapea el día de la semana.
    DECLARE @diaSemana INT;
    SET @diaSemana = DATEPART(dw, @fecha);

    -- CONSULTA 1: Traemos el horario de entrada y salida del profesional para ese día específico
    SELECT horaEntrada, horaSalida
    FROM HorarioLaboral
    WHERE idProfesional = @idProfesional AND diaSemana = @diaSemana;

    -- CONSULTA 2: Traemos las horas de los turnos que YA ESTÁN RESERVADOS ese día y que NO estén cancelados
    SELECT horaInicio
    FROM Turno
    WHERE idProfesional = @idProfesional 
      AND fecha = @fecha 
      AND estado != 'Cancelado'; 
END
GO

--RESERVAR TURNO

CREATE PROCEDURE spu_reservar_turno
    @idProfesional INT,
    @idCliente INT,
    @idServicio INT,
    @fecha DATE,
    @horaInicio TIME
AS
BEGIN

    INSERT INTO Turno (idProfesional, idCliente, idServicio, fecha, horaInicio, estado)
    VALUES (@idProfesional, @idCliente, @idServicio, @fecha, @horaInicio, 'Pendiente');
    END


--Mis turnos
CREATE PROCEDURE spu_mis_turnos
    @idCliente INT
AS
BEGIN

    SELECT 
        T.idTurno,
        T.fecha,
        T.horaInicio,
        T.estado,
        P.nombre AS nombreProfesional,
        P.apellido AS apellidoProfesional,
        S.nombre AS nombreServicio,
        S.precio AS precioServicio
    FROM Turno T
    INNER JOIN Profesional P ON T.idProfesional = P.idProfesional
    INNER JOIN Servicio S ON T.idServicio = S.idServicio
    WHERE T.idCliente = @idCliente
    ORDER BY T.fecha DESC, T.horaInicio DESC;
END
