// Cadena de responsabilidad: autenticar -> requerirRol -> validar -> limitarUso
import jwt from 'jsonwebtoken';
export const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar';
export function autenticar(req, res, next) {
  const h = req.headers.authorization || '';
  try { req.usuario = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', SECRET); next(); }
  catch { res.status(401).json({ error: 'No autenticado' }); }
}
export const requerirRol = (...roles) => (req, res, next) =>
  roles.includes(req.usuario?.rol) ? next() : res.status(403).json({ error: 'Rol no autorizado' });
export const validar = (esquema) => (req, res, next) => {
  const e = esquema(req.body ?? {});
  return e ? res.status(400).json({ error: e }) : next();
};
const ventanas = new Map();
export const limitarUso = (max = 30, ms = 60000) => (req, res, next) => {
  const k = `${req.path}:${req.usuario?.id ?? req.ip}`, ahora = Date.now();
  const a = (ventanas.get(k) ?? []).filter((t) => ahora - t < ms);
  if (a.length >= max) return res.status(429).json({ error: 'Demasiadas solicitudes, intenta más tarde' });
  a.push(ahora); ventanas.set(k, a); next();
};
