import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID as uid } from 'node:crypto';
import { db } from './db.js';
import { autenticar, requerirRol, validar, limitarUso, SECRET } from './middleware.js';
import { HttpError } from './errores.js';
import { CasoService } from './services/CasoService.js';
import { SesionService } from './services/SesionService.js';
import { fabricaDesdeEntorno } from './tutor/index.js';

const env = process.env;
const tutor = fabricaDesdeEntorno(env).crear({ retro: env.RETRO, claveIA: env.IA_API_KEY, modelo: env.IA_MODEL || 'claude-sonnet-5-5', timeoutMs: Number(env.IA_TIMEOUT_MS) || 30000 });
const sesiones = new SesionService(tutor);
export const router = Router();

const esCorreo = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s ?? '');
const firmar = (u) => jwt.sign({ id: u.id_usuario, rol: u.rol, nombre: u.nombre_visible }, SECRET, { expiresIn: '8h' });
const publico = (u) => ({ id: u.id_usuario, nombre: u.nombre_visible, rol: u.rol, correo: u.correo_institucional });

// --- Autenticacion (sin datos de pacientes; solo alias y correo) ---
router.post('/auth/registro', limitarUso(10), validar((b) =>
  !b.nombre?.trim() ? 'El nombre es obligatorio' : !esCorreo(b.correo) ? 'Correo inválido' : (b.clave ?? '').length < 8 ? 'La clave debe tener al menos 8 caracteres' : null),
(req, res) => {
  const { nombre, correo, clave } = req.body;
  if (db.prepare('SELECT 1 FROM usuario WHERE correo_institucional=?').get(correo.toLowerCase())) throw new HttpError(409, 'Ese correo ya está registrado');
  const id = uid();
  db.prepare("INSERT INTO usuario(id_usuario,nombre_visible,correo_institucional,password_hash,rol) VALUES(?,?,?,?,'estudiante')").run(id, nombre.trim(), correo.toLowerCase(), bcrypt.hashSync(clave, 10));
  const u = db.prepare('SELECT * FROM usuario WHERE id_usuario=?').get(id);
  res.status(201).json({ token: firmar(u), usuario: publico(u) });
});
router.post('/auth/login', limitarUso(10), validar((b) => (!b.correo || !b.clave ? 'Completa el correo y la clave' : null)), (req, res) => {
  const u = db.prepare('SELECT * FROM usuario WHERE correo_institucional=?').get(req.body.correo.toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.clave, u.password_hash)) return res.status(401).json({ error: 'El usuario o la clave no es correcta' });
  res.json({ token: firmar(u), usuario: publico(u) });
});
router.post('/auth/recuperar', limitarUso(5), (req, res) => res.json({ mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu clave.' })); // envío de correo pendiente

router.get('/avisos', (req, res) => res.json(db.prepare('SELECT tipo, texto FROM aviso WHERE vigente=1').all()));

// --- Casos ---
router.get('/casos', autenticar, (req, res) => res.json(CasoService.listar()));
router.get('/casos/:id', autenticar, (req, res) => res.json(CasoService.obtener(req.params.id)));
router.post('/casos/:id/activar', autenticar, requerirRol('revisor'), (req, res) => res.json(CasoService.activar(req.params.id)));

// --- Sesiones: autenticar -> requerirRol -> validar -> limitarUso -> controlador ---
router.post('/sesiones', autenticar, requerirRol('estudiante'), validar((b) => (!b.casoId ? 'casoId es obligatorio' : null)), limitarUso(),
  (req, res) => res.status(201).json(sesiones.iniciar(req.usuario, req.body.casoId, req.body.avisosAceptados)));
router.get('/sesiones/:id', autenticar, (req, res) => res.json(sesiones.detalle(req.params.id, req.usuario)));
router.post('/sesiones/:id/decision', autenticar, requerirRol('estudiante'),
  validar((b) => (!b.diagnostico?.trim() ? 'Escribe tu diagnóstico propuesto' : b.diagnostico.length > 200 ? 'El diagnóstico supera los 200 caracteres' : null)), limitarUso(),
  (req, res) => res.json(sesiones.registrarDecision(req.params.id, req.usuario, req.body)));
router.post('/sesiones/:id/evaluar', autenticar, requerirRol('estudiante'), limitarUso(10), async (req, res) => res.json(await sesiones.evaluar(req.params.id, req.usuario)));

// --- Revisor clinico: calificacion y metricas ---
router.put('/sesiones/:id/metricas', autenticar, requerirRol('revisor'),
  validar((b) => [b.coherencia, b.pertinencia].every((n) => Number.isInteger(n) && n >= 0 && n <= 5) ? null : 'Coherencia y pertinencia deben ser enteros de 0 a 5'),
  (req, res) => {
    const r = db.prepare('UPDATE metrica_sesion SET coherencia=?, pertinencia=?, id_revisor=?, fecha_revision=CURRENT_TIMESTAMP WHERE id_sesion=?')
      .run(req.body.coherencia, req.body.pertinencia, req.usuario.id, req.params.id);
    if (!r.changes) throw new HttpError(404, 'La sesión aún no tiene métricas registradas');
    res.json({ ok: true });
  });
router.get('/metricas/resumen', autenticar, requerirRol('revisor'), (req, res) => res.json(CasoService.resumenMetricas()));
