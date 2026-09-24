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