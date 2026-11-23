
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario TEXT PRIMARY KEY,
  nombre_visible TEXT NOT NULL,
  correo_institucional TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('estudiante', 'revisor')),
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caso (
  id_caso TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  historia_clinica TEXT NOT NULL,
  diagnostico_referencia TEXT NOT NULL,
  dificultad TEXT CHECK (dificultad IN ('baja', 'media', 'alta')),
  origen TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'revisado', 'activo', 'inactivo')),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imagen (
  id_imagen TEXT PRIMARY KEY,
  id_caso TEXT NOT NULL REFERENCES caso(id_caso),
  ruta_archivo TEXT NOT NULL,
  fuente TEXT NOT NULL,
  licencia TEXT NOT NULL,
  licencia_verificada BOOLEAN NOT NULL DEFAULT FALSE,
  desidentificada_verificada BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS revision_caso (
  id_revision TEXT PRIMARY KEY,
  id_caso TEXT NOT NULL REFERENCES caso(id_caso),
  id_revisor TEXT NOT NULL REFERENCES usuario(id_usuario),
  resultado TEXT NOT NULL
    CHECK (resultado IN ('aprobado', 'observado', 'rechazado')),
  comentario TEXT,
  fecha_revision TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sesion (
  id_sesion TEXT PRIMARY KEY,
  id_usuario TEXT NOT NULL REFERENCES usuario(id_usuario),
  id_caso TEXT NOT NULL REFERENCES caso(id_caso),
  estado TEXT NOT NULL
    CHECK (estado IN ('iniciada', 'decision_registrada', 'evaluada', 'evaluacion_fallida')),
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS decision (
  id_decision TEXT PRIMARY KEY,
  id_sesion TEXT NOT NULL UNIQUE REFERENCES sesion(id_sesion),
  diagnostico_estudiante TEXT NOT NULL
    CHECK (length(trim(diagnostico_estudiante)) > 0 AND length(diagnostico_estudiante) <= 200),
  hipotesis_clinica TEXT,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluacion (
  id_evaluacion TEXT PRIMARY KEY,
  id_sesion TEXT NOT NULL UNIQUE REFERENCES sesion(id_sesion),
  resultado TEXT NOT NULL CHECK (resultado IN ('correcto', 'parcial', 'incorrecto')),
  explicacion TEXT NOT NULL,
  evidencias TEXT,
  sugerencias TEXT,
  modelo_ia TEXT NOT NULL,
  version_prompt TEXT NOT NULL,
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS metrica_sesion (
  id_metrica TEXT PRIMARY KEY,
  id_sesion TEXT NOT NULL UNIQUE REFERENCES sesion(id_sesion),
  tiempo_respuesta_ms INTEGER NOT NULL CHECK (tiempo_respuesta_ms >= 0),
  estado_servicio_ia TEXT NOT NULL
    CHECK (estado_servicio_ia IN ('ok', 'tiempo_agotado', 'error')),
  coherencia INTEGER CHECK (coherencia BETWEEN 0 AND 5),
  pertinencia INTEGER CHECK (pertinencia BETWEEN 0 AND 5),
  id_revisor TEXT REFERENCES usuario(id_usuario),
  fecha_revision TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS aviso (
  id_aviso TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('ia', 'educativo')),
  texto TEXT NOT NULL,
  version TEXT NOT NULL,
  vigente BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS aceptacion_aviso (
  id_sesion TEXT NOT NULL REFERENCES sesion(id_sesion),
  id_aviso TEXT NOT NULL REFERENCES aviso(id_aviso),
  fecha_aceptacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_sesion, id_aviso)
);

CREATE INDEX IF NOT EXISTS ix_caso_estado ON caso(estado);
CREATE INDEX IF NOT EXISTS ix_sesion_usuario ON sesion(id_usuario, fecha_inicio);
