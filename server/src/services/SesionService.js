// Patron Facade: coordina casos, sesiones, tutor y metricas. Patron Observer: eventos de sesion.
import { EventEmitter } from 'node:events';
import { randomUUID as uid } from 'node:crypto';
import { db } from '../db.js';
import { transicion } from './estados.js';
import { ErrorIANoDisponible, HttpError } from '../errores.js';

export const eventos = new EventEmitter();
const upsert = db.prepare(`INSERT INTO metrica_sesion(id_metrica,id_sesion,tiempo_respuesta_ms,estado_servicio_ia) VALUES(?,?,?,?)
  ON CONFLICT(id_sesion) DO UPDATE SET tiempo_respuesta_ms=excluded.tiempo_respuesta_ms, estado_servicio_ia=excluded.estado_servicio_ia`);
const guardar = (id, ms, estado) => { try { upsert.run(uid(), id, ms, estado); } catch (e) { console.error('[metricas] no se pudo guardar:', e.message); } };
eventos.on('sesion.evaluada', ({ sesionId, tiempoMs }) => guardar(sesionId, tiempoMs, 'ok'));
eventos.on('sesion.fallida', ({ sesionId, tiempoMs, estado }) => guardar(sesionId, tiempoMs, estado));

export class SesionService {
  constructor(tutor) { this.tutor = tutor; }

  propia(id, u) {
    const s = db.prepare('SELECT * FROM sesion WHERE id_sesion=?').get(id);
    if (!s) throw new HttpError(404, 'Sesión no encontrada');
    if (u.rol !== 'revisor' && s.id_usuario !== u.id) throw new HttpError(403, 'Esta sesión no te pertenece');
    return s;
  }
  iniciar(u, casoId, avisosAceptados) {
    if (avisosAceptados !== true) throw new HttpError(400, 'Debes aceptar los avisos de uso educativo y de IA');
    if (!db.prepare("SELECT 1 FROM caso WHERE id_caso=? AND estado='activo'").get(casoId)) throw new HttpError(404, 'El caso no está disponible');
    const id = uid();
    db.transaction(() => {
      db.prepare("INSERT INTO sesion(id_sesion,id_usuario,id_caso,estado) VALUES(?,?,?,'iniciada')").run(id, u.id, casoId);
      for (const a of db.prepare('SELECT id_aviso FROM aviso WHERE vigente=1').all())
        db.prepare('INSERT INTO aceptacion_aviso(id_sesion,id_aviso) VALUES(?,?)').run(id, a.id_aviso);
    })();
    return { id };
  }
  registrarDecision(id, u, { diagnostico, hipotesis }) {
    const s = this.propia(id, u);
    const nuevo = transicion(s.estado, 'registrarDecision');
    db.transaction(() => {
      db.prepare('INSERT INTO decision(id_decision,id_sesion,diagnostico_estudiante,hipotesis_clinica) VALUES(?,?,?,?)').run(uid(), id, diagnostico.trim(), hipotesis ?? null);
      db.prepare('UPDATE sesion SET estado=? WHERE id_sesion=?').run(nuevo, id);
    })();
    return this.detalle(id, u);
  }
  async evaluar(id, u) {
    const s = this.propia(id, u);
    const base = s.estado === 'evaluacion_fallida' ? transicion(s.estado, 'reintentar') : s.estado;
    transicion(base, 'evaluar'); // valida que haya decision registrada
    const caso = db.prepare('SELECT * FROM caso WHERE id_caso=?').get(s.id_caso);
    const d = db.prepare('SELECT * FROM decision WHERE id_sesion=?').get(id);
    const t0 = Date.now();
    try {
      const r = await this.tutor.evaluar(caso, { diagnostico: d.diagnostico_estudiante, hipotesis: d.hipotesis_clinica });
      db.transaction(() => {
        db.prepare('INSERT INTO evaluacion(id_evaluacion,id_sesion,resultado,explicacion,evidencias,sugerencias,modelo_ia,version_prompt) VALUES(?,?,?,?,?,?,?,?)')
          .run(uid(), id, r.resultado, r.retroalimentacion, r.evidencia, '', r.modelo, 'v1');
        db.prepare("UPDATE sesion SET estado='evaluada', fecha_fin=CURRENT_TIMESTAMP WHERE id_sesion=?").run(id);
      })();
      eventos.emit('sesion.evaluada', { sesionId: id, tiempoMs: r.tiempoMs });
      return this.detalle(id, u);
    } catch (e) {
      if (!(e instanceof ErrorIANoDisponible)) throw e;
      db.prepare("UPDATE sesion SET estado='evaluacion_fallida' WHERE id_sesion=?").run(id); // la decision se conserva
      eventos.emit('sesion.fallida', { sesionId: id, tiempoMs: Date.now() - t0, estado: e.estado });
      throw new HttpError(503, 'No fue posible obtener la evaluación en este momento. Tu decisión se conservó; intenta de nuevo.');
    }
  }
  detalle(id, u) {
    const s = this.propia(id, u);
    const caso = db.prepare('SELECT titulo, diagnostico_referencia, (SELECT ruta_archivo FROM imagen WHERE id_caso=caso.id_caso LIMIT 1) imagen FROM caso WHERE id_caso=?').get(s.id_caso);
    const decision = db.prepare('SELECT diagnostico_estudiante diagnostico, hipotesis_clinica hipotesis FROM decision WHERE id_sesion=?').get(id) ?? null;
    const ev = db.prepare('SELECT resultado, explicacion, evidencias, sugerencias, modelo_ia modelo FROM evaluacion WHERE id_sesion=?').get(id) ?? null;
    const m = db.prepare('SELECT tiempo_respuesta_ms FROM metrica_sesion WHERE id_sesion=?').get(id);
    return { id, estado: s.estado, caso: { titulo: caso.titulo, imagen: caso.imagen }, decision, evaluacion: ev,
      diagnosticoReferencia: s.estado === 'evaluada' ? caso.diagnostico_referencia : null, tiempoMs: m?.tiempo_respuesta_ms ?? null };
  }
}
