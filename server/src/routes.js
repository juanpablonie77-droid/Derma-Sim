
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID as uid } from 'node:crypto';
import { db } from './db.js';
import {
  autenticar,
  requerirRol,
  validar,
  limitarUso,
  SECRET
} from './middleware.js';
import { HttpError } from './errores.js';
import { CasoService } from './services/CasoService.js';
import { SesionService } from './services/SesionService.js';
import { fabricaDesdeEntorno } from './tutor/index.js';

const env = process.env;

const tutor = fabricaDesdeEntorno(env).crear({
  retro: env.RETRO,
  claveIA: env.GEMINI_API_KEY || env.IA_API_KEY,
  modelo: env.IA_MODEL || (
    env.GEMINI_API_KEY
      ? 'gemini-3.5-flash-lite'
      : 'claude-sonnet-5-5'
  ),
  timeoutMs: Number(env.IA_TIMEOUT_MS) || 30000
});

const sesiones = new SesionService(tutor);

export const router = Router();

const esCorreo = (s) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s ?? '');

const firmar = (u) =>
  jwt.sign(
    {
      id: u.id_usuario,
      rol: u.rol,
      nombre: u.nombre_visible
    },
    SECRET,
    { expiresIn: '8h' }
  );

const publico = (u) => ({
  id: u.id_usuario,
  nombre: u.nombre_visible,
  rol: u.rol,
  correo: u.correo_institucional
});

// --- Autenticación ---

router.post(
  '/auth/registro',
  limitarUso(10),
  validar((b) =>
    !b.nombre?.trim()
      ? 'El nombre es obligatorio'
      : !esCorreo(b.correo)
        ? 'Correo inválido'
        : (b.clave ?? '').length < 8
          ? 'La clave debe tener al menos 8 caracteres'
          : null
  ),
  async (req, res) => {
    const { nombre, correo, clave } = req.body;

    const correoNormalizado = correo.toLowerCase();

    const existente = await db.query(
      'SELECT 1 FROM usuario WHERE correo_institucional = $1',
      [correoNormalizado]
    );

    if (existente.rows.length) {
      throw new HttpError(409, 'Ese correo ya está registrado');
    }

    const id = uid();

    await db.query(`
      INSERT INTO usuario (
        id_usuario,
        nombre_visible,
        correo_institucional,
        password_hash,
        rol
      )
      VALUES ($1, $2, $3, $4, 'estudiante')
    `, [
      id,
      nombre.trim(),
      correoNormalizado,
      bcrypt.hashSync(clave, 10)
    ]);

    const resultado = await db.query(
      'SELECT * FROM usuario WHERE id_usuario = $1',
      [id]
    );

    const usuario = resultado.rows[0];

    res.status(201).json({
      token: firmar(usuario),
      usuario: publico(usuario)
    });
  }
);

router.post(
  '/auth/login',
  limitarUso(10),
  validar((b) =>
    !b.correo || !b.clave
      ? 'Completa el correo y la clave'
      : null
  ),
  async (req, res) => {
    const resultado = await db.query(
      'SELECT * FROM usuario WHERE correo_institucional = $1',
      [req.body.correo.toLowerCase()]
    );

    const usuario = resultado.rows[0];

    if (
      !usuario ||
      !bcrypt.compareSync(req.body.clave, usuario.password_hash)
    ) {
      return res.status(401).json({
        error: 'El usuario o la clave no es correcta'
      });
    }

    res.json({
      token: firmar(usuario),
      usuario: publico(usuario)
    });
  }
);

router.post(
  '/auth/recuperar',
  limitarUso(5),
  (req, res) => res.json({
    mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu clave.'
  })
);

// --- Avisos ---

router.get('/avisos', async (req, res) => {
  const resultado = await db.query(`
    SELECT tipo, texto
    FROM aviso
    WHERE vigente = TRUE
  `);

  res.json(resultado.rows);
});

// --- Casos ---
router.put(
  '/revisor/imagenes/:id/verificacion',
  autenticar,
  requerirRol('revisor'),
  validar((b) =>
    typeof b.licencia_verificada !== 'boolean' ||
    typeof b.desidentificada_verificada !== 'boolean'
      ? 'Debes enviar ambas verificaciones como valores booleanos'
      : null
  ),
  async (req, res) => {
    const resultado = await db.query(`
      UPDATE imagen
      SET
        licencia_verificada = $1,
        desidentificada_verificada = $2
      WHERE id_imagen = $3
      RETURNING id_imagen
    `, [
      req.body.licencia_verificada,
      req.body.desidentificada_verificada,
      req.params.id
    ]);

    if (!resultado.rowCount) {
      throw new HttpError(404, 'Imagen no encontrada');
    }

    res.json({
      mensaje: 'Verificación de imagen actualizada correctamente'
    });
  }
);
// --- Revisión clínica de casos ---

router.get(
  '/revisor/casos',
  autenticar,
  requerirRol('revisor'),
  async (req, res) => {
    res.json(await CasoService.listarParaRevision());
  }
);

router.get(
  '/revisor/casos/:id',
  autenticar,
  requerirRol('revisor'),
  async (req, res) => {
    res.json(await CasoService.obtenerParaRevision(req.params.id));
  }
);

router.post(
  '/revisor/casos/:id/revision',
  autenticar,
  requerirRol('revisor'),
  validar((b) =>
    !['aprobado', 'observado', 'rechazado'].includes(b.resultado)
      ? 'Selecciona un resultado válido'
      : typeof b.comentario !== 'undefined' &&
        (typeof b.comentario !== 'string' || b.comentario.length > 2000)
        ? 'El comentario debe ser texto de máximo 2000 caracteres'
        : null
  ),
  async (req, res) => {
    res.json(
      await CasoService.registrarRevision(
        req.params.id,
        req.usuario.id,
        req.body.resultado,
        req.body.comentario || ''
      )
    );
  }
);

router.get('/casos', autenticar, async (req, res) => {
  res.json(await CasoService.listar());
});

router.get('/casos/:id', autenticar, async (req, res) => {
  res.json(await CasoService.obtener(req.params.id));
});

router.get('/estudiante/casos', autenticar, requerirRol('estudiante'), async (req, res) => {
  res.json(await CasoService.listar());
});

router.get('/estudiante/casos/:id', autenticar, requerirRol('estudiante'), async (req, res) => {
  res.json(await CasoService.obtener(req.params.id));
});
router.post(
  '/casos/:id/activar',
  autenticar,
  requerirRol('revisor'),
  async (req, res) => {
    res.json(await CasoService.activar(req.params.id));
  }
);

// --- Sesiones ---

router.post(
  '/sesiones',
  autenticar,
  requerirRol('estudiante'),
  validar((b) =>
    !b.casoId ? 'casoId es obligatorio' : null
  ),
  limitarUso(),
  async (req, res) => {
    res.status(201).json(
      await sesiones.iniciar(
        req.usuario,
        req.body.casoId,
        req.body.avisosAceptados
      )
    );
  }
);

router.get(
  '/sesiones/:id',
  autenticar,
  async (req, res) => {
    res.json(
      await sesiones.detalle(req.params.id, req.usuario)
    );
  }
);

router.post(
  '/sesiones/:id/decision',
  autenticar,
  requerirRol('estudiante'),
  validar((b) =>
    !b.diagnostico?.trim()
      ? 'Escribe tu diagnóstico propuesto'
      : b.diagnostico.length > 200
        ? 'El diagnóstico supera los 200 caracteres'
        : null
  ),
  limitarUso(),
  async (req, res) => {
    res.json(
      await sesiones.registrarDecision(
        req.params.id,
        req.usuario,
        req.body
      )
    );
  }
);

router.post(
  '/sesiones/:id/evaluar',
  autenticar,
  requerirRol('estudiante'),
  limitarUso(10),
  async (req, res) => {
    res.json(
      await sesiones.evaluar(req.params.id, req.usuario)
    );
  }
);

// --- Revisor clínico: calificación y métricas ---

router.put(
  '/sesiones/:id/metricas',
  autenticar,
  requerirRol('revisor'),
  validar((b) =>
    [b.coherencia, b.pertinencia].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 5
    )
      ? null
      : 'Coherencia y pertinencia deben ser enteros de 0 a 5'
  ),
  async (req, res) => {
    const resultado = await db.query(`
      UPDATE metrica_sesion
      SET
        coherencia = $1,
        pertinencia = $2,
        id_revisor = $3,
        fecha_revision = CURRENT_TIMESTAMP
      WHERE id_sesion = $4
    `, [
      req.body.coherencia,
      req.body.pertinencia,
      req.usuario.id,
      req.params.id
    ]);

    if (!resultado.rowCount) {
      throw new HttpError(
        404,
        'La sesión aún no tiene métricas registradas'
      );
    }

    res.json({ ok: true });
  }
);

router.get(
  '/metricas/resumen',
  autenticar,
  requerirRol('revisor'),
  async (req, res) => {
    res.json(await CasoService.resumenMetricas());
  }
);
