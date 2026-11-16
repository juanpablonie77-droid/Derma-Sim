import { randomUUID as uid } from 'node:crypto';
import { db } from '../db.js';
import { HttpError } from '../errores.js';

export const CasoService = {
  listar: () => db.prepare(`SELECT c.id_caso id, c.titulo, c.dificultad, (SELECT ruta_archivo FROM imagen WHERE id_caso=c.id_caso LIMIT 1) imagen
    FROM caso c WHERE c.estado='activo' ORDER BY c.fecha_creacion`).all(),
  obtener(id) {
    const c = db.prepare("SELECT id_caso id, titulo, historia_clinica, dificultad FROM caso WHERE id_caso=? AND estado='activo'").get(id);
    if (!c) throw new HttpError(404, 'El caso no está disponible');
    c.imagenes = db.prepare('SELECT ruta_archivo ruta FROM imagen WHERE id_caso=?').all(id);
    return c; // nunca expone diagnostico_referencia antes de evaluar
  },
  // Regla de gobierno: un caso solo pasa a "activo" con referencia, licencia, desidentificacion y revision aprobada
  activar(id) {
    const c = db.prepare('SELECT * FROM caso WHERE id_caso=?').get(id);
    if (!c) throw new HttpError(404, 'Caso no encontrado');
    const imgs = db.prepare('SELECT * FROM imagen WHERE id_caso=?').all(id);
    const faltan = [];
    if (!c.diagnostico_referencia?.trim()) faltan.push('diagnóstico de referencia');
    if (!imgs.length) faltan.push('imagen');
    if (imgs.some((i) => !i.licencia_verificada)) faltan.push('licencia verificada');
    if (imgs.some((i) => !i.desidentificada_verificada)) faltan.push('desidentificación verificada');
    if (!db.prepare("SELECT 1 FROM revision_caso WHERE id_caso=? AND resultado='aprobado'").get(id)) faltan.push('revisión clínica aprobada');
    if (faltan.length) throw new HttpError(422, `No se puede activar el caso. Falta: ${faltan.join(', ')}`);
    db.prepare("UPDATE caso SET estado='activo' WHERE id_caso=?").run(id);
    return { id, estado: 'activo' };
  },
  resumenMetricas() {
    const r = db.prepare(`SELECT COUNT(*) sesiones, AVG(tiempo_respuesta_ms) promedio_ms, MAX(tiempo_respuesta_ms) maximo_ms,
      SUM(tiempo_respuesta_ms<=10000) en_10s, SUM(coherencia>=3 AND pertinencia>=3) coherentes, COUNT(coherencia) calificadas,
      SUM(estado_servicio_ia<>'ok') fallidas FROM metrica_sesion`).get();
    return { ...r, meta_80: r.calificadas ? (100 * r.coherentes) / r.calificadas : null }; // umbral >=3 de 5: por confirmar con el revisor
  },
};
