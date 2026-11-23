
import { EventEmitter } from 'node:events';
import { randomUUID as uid } from 'node:crypto';
import { db } from '../db.js';
import { transicion } from './estados.js';
import { ErrorIANoDisponible, HttpError } from '../errores.js';

export const eventos = new EventEmitter();

// Ejecuta varias operaciones como una sola transacción PostgreSQL.
async function enTransaccion(callback) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const resultado = await callback(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Guarda las métricas sin interrumpir el flujo principal.
async function guardar(sesionId, ms, estado) {
  try {
    await db.query(`
      INSERT INTO metrica_sesion (
        id_metrica,
        id_sesion,
        tiempo_respuesta_ms,
        estado_servicio_ia
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id_sesion)
      DO UPDATE SET
        tiempo_respuesta_ms = EXCLUDED.tiempo_respuesta_ms,
        estado_servicio_ia = EXCLUDED.estado_servicio_ia
    `, [uid(), sesionId, ms, estado]);
  } catch (error) {
    console.error('[metricas] no se pudo guardar:', error.message);
  }
}

eventos.on('sesion.evaluada', ({ sesionId, tiempoMs }) => {
  guardar(sesionId, tiempoMs, 'ok');
});

eventos.on('sesion.fallida', ({ sesionId, tiempoMs, estado }) => {
  guardar(sesionId, tiempoMs, estado);
});

export class SesionService {
  constructor(tutor) {
    this.tutor = tutor;
  }

  async propia(id, usuario) {
    const resultado = await db.query(
      'SELECT * FROM sesion WHERE id_sesion = $1',
      [id]
    );

    const sesion = resultado.rows[0];

    if (!sesion) {
      throw new HttpError(404, 'Sesión no encontrada');
    }

    if (
      usuario.rol !== 'revisor' &&
      sesion.id_usuario !== usuario.id
    ) {
      throw new HttpError(403, 'Esta sesión no te pertenece');
    }

    return sesion;
  }

  async iniciar(usuario, casoId, avisosAceptados) {
    if (avisosAceptados !== true) {
      throw new HttpError(
        400,
        'Debes aceptar los avisos de uso educativo y de IA'
      );
    }

    const caso = await db.query(`
      SELECT 1
      FROM caso
      WHERE id_caso = $1 AND estado = 'activo'
    `, [casoId]);

    if (!caso.rows.length) {
      throw new HttpError(404, 'El caso no está disponible');
    }

    const id = uid();

    await enTransaccion(async (client) => {
      await client.query(`
        INSERT INTO sesion (
          id_sesion,
          id_usuario,
          id_caso,
          estado
        )
        VALUES ($1, $2, $3, 'iniciada')
      `, [id, usuario.id, casoId]);

      await client.query(`
        INSERT INTO aceptacion_aviso (id_sesion, id_aviso)
        SELECT $1, id_aviso
        FROM aviso
        WHERE vigente = TRUE
      `, [id]);
    });

    return { id };
  }

  async registrarDecision(id, usuario, { diagnostico, hipotesis }) {
    const sesion = await this.propia(id, usuario);
    const nuevoEstado = transicion(sesion.estado, 'registrarDecision');

    await enTransaccion(async (client) => {
      await client.query(`
        INSERT INTO decision (
          id_decision,
          id_sesion,
          diagnostico_estudiante,
          hipotesis_clinica
        )
        VALUES ($1, $2, $3, $4)
      `, [uid(), id, diagnostico.trim(), hipotesis ?? null]);

      await client.query(`
        UPDATE sesion
        SET estado = $1
        WHERE id_sesion = $2
      `, [nuevoEstado, id]);
    });

    return this.detalle(id, usuario);
  }

  async evaluar(id, usuario) {
    const sesion = await this.propia(id, usuario);

    const estadoBase = sesion.estado === 'evaluacion_fallida'
      ? transicion(sesion.estado, 'reintentar')
      : sesion.estado;

    transicion(estadoBase, 'evaluar');

    const resultadoCaso = await db.query(
      'SELECT * FROM caso WHERE id_caso = $1',
      [sesion.id_caso]
    );

    const caso = resultadoCaso.rows[0];

    const resultadoDecision = await db.query(
      'SELECT * FROM decision WHERE id_sesion = $1',
      [id]
    );

    const decision = resultadoDecision.rows[0];

    if (!caso || !decision) {
      throw new HttpError(400, 'No se encontró el caso o la decisión registrada');
    }

    const t0 = Date.now();

    try {
      const evaluacion = await this.tutor.evaluar(caso, {
        diagnostico: decision.diagnostico_estudiante,
        hipotesis: decision.hipotesis_clinica
      });

      await enTransaccion(async (client) => {
        await client.query(`
          INSERT INTO evaluacion (
            id_evaluacion,
            id_sesion,
            resultado,
            explicacion,
            evidencias,
            sugerencias,
            modelo_ia,
            version_prompt
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          uid(),
          id,
          evaluacion.resultado,
          evaluacion.retroalimentacion,
          evaluacion.evidencia,
          '',
          evaluacion.modelo,
          'v1'
        ]);

        await client.query(`
          UPDATE sesion
          SET estado = 'evaluada',
              fecha_fin = CURRENT_TIMESTAMP
          WHERE id_sesion = $1
        `, [id]);
      });

      eventos.emit('sesion.evaluada', {
        sesionId: id,
        tiempoMs: evaluacion.tiempoMs
      });

      return await this.detalle(id, usuario);

    } catch (error) {
      if (!(error instanceof ErrorIANoDisponible)) {
        throw error;
      }

      await db.query(`
        UPDATE sesion
        SET estado = 'evaluacion_fallida'
        WHERE id_sesion = $1
      `, [id]);

      eventos.emit('sesion.fallida', {
        sesionId: id,
        tiempoMs: Date.now() - t0,
        estado: error.estado
      });

      throw new HttpError(
        503,
        'No fue posible obtener la evaluación en este momento. Tu decisión se conservó; intenta de nuevo.'
      );
    }
  }

  async detalle(id, usuario) {
    const sesion = await this.propia(id, usuario);

    const resultadoCaso = await db.query(`
      SELECT
        titulo,
        diagnostico_referencia,
        (
          SELECT ruta_archivo
          FROM imagen
          WHERE id_caso = caso.id_caso
          LIMIT 1
        ) AS imagen
      FROM caso
      WHERE id_caso = $1
    `, [sesion.id_caso]);

    const caso = resultadoCaso.rows[0];

    const resultadoDecision = await db.query(`
      SELECT
        diagnostico_estudiante AS diagnostico,
        hipotesis_clinica AS hipotesis
      FROM decision
      WHERE id_sesion = $1
    `, [id]);

    const resultadoEvaluacion = await db.query(`
      SELECT
        resultado,
        explicacion,
        evidencias,
        sugerencias,
        modelo_ia AS modelo
      FROM evaluacion
      WHERE id_sesion = $1
    `, [id]);

    const resultadoMetrica = await db.query(`
      SELECT tiempo_respuesta_ms
      FROM metrica_sesion
      WHERE id_sesion = $1
    `, [id]);

    const decision = resultadoDecision.rows[0] ?? null;
    const evaluacion = resultadoEvaluacion.rows[0] ?? null;
    const metrica = resultadoMetrica.rows[0] ?? null;

    return {
      id,
      estado: sesion.estado,
      caso: {
        titulo: caso?.titulo,
        imagen: caso?.imagen
      },
      decision,
      evaluacion,
      diagnosticoReferencia: sesion.estado === 'evaluada'
        ? caso?.diagnostico_referencia
        : null,
      tiempoMs: metrica?.tiempo_respuesta_ms ?? null
    };
  }
}
