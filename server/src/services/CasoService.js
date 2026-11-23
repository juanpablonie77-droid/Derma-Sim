
import { db } from '../db.js';
import { HttpError } from '../errores.js';
import { randomUUID } from 'node:crypto';

export const CasoService = {

  // CASOS DISPONIBLES PARA ESTUDIANTES
  async listar() {
    const resultado = await db.query(`
      SELECT
        c.id_caso AS id,
        c.titulo,
        c.dificultad,
        (
          SELECT ruta_archivo
          FROM imagen
          WHERE id_caso = c.id_caso
          LIMIT 1
        ) AS imagen
      FROM caso c
      WHERE c.estado = 'activo'
      ORDER BY c.fecha_creacion
    `);

    return resultado.rows;
  },

  // DETALLE DE UN CASO PARA ESTUDIANTES
  async obtener(id) {
    const resultado = await db.query(`
      SELECT
        id_caso AS id,
        titulo,
        historia_clinica,
        dificultad
      FROM caso
      WHERE id_caso = $1 AND estado = 'activo'
    `, [id]);

    const caso = resultado.rows[0];

    if (!caso) {
      throw new HttpError(404, 'El caso no está disponible');
    }

    const imagenes = await db.query(
      'SELECT ruta_archivo AS ruta FROM imagen WHERE id_caso = $1',
      [id]
    );

    caso.imagenes = imagenes.rows;

    // Nunca expone el diagnóstico de referencia al estudiante.
    return caso;
  },

  // LISTAR CASOS PENDIENTES PARA EL REVISOR
  async listarParaRevision() {
    const resultado = await db.query(`
      SELECT
        c.id_caso AS id,
        c.titulo,
        c.historia_clinica,
        c.diagnostico_referencia,
        c.dificultad,
        c.origen,
        c.estado,
        c.fecha_creacion,
        COUNT(i.id_imagen)::int AS total_imagenes,
        COALESCE(BOOL_AND(i.licencia_verificada), FALSE)
          AS licencia_verificada,
        COALESCE(BOOL_AND(i.desidentificada_verificada), FALSE)
          AS desidentificada_verificada
      FROM caso c
      LEFT JOIN imagen i ON i.id_caso = c.id_caso
      WHERE c.estado IN ('borrador', 'revisado')
      GROUP BY c.id_caso
      ORDER BY c.fecha_creacion
    `);

    return resultado.rows;
  },

  // DETALLE COMPLETO PARA EL REVISOR
  async obtenerParaRevision(id) {
    const resultado = await db.query(`
      SELECT
        id_caso AS id,
        titulo,
        historia_clinica,
        diagnostico_referencia,
        dificultad,
        origen,
        estado
      FROM caso
      WHERE id_caso = $1
        AND estado IN ('borrador', 'revisado')
    `, [id]);

    const caso = resultado.rows[0];

    if (!caso) {
      throw new HttpError(404, 'Caso no encontrado para revisión');
    }

    const imagenes = await db.query(`
      SELECT
        id_imagen AS id,
        ruta_archivo AS ruta,
        fuente,
        licencia,
        licencia_verificada,
        desidentificada_verificada
      FROM imagen
      WHERE id_caso = $1
    `, [id]);

    caso.imagenes = imagenes.rows;

    return caso;
  },

  // REGISTRAR REVISIÓN CLÍNICA
  async registrarRevision(id, idRevisor, resultado, comentario = '') {
    const permitidos = ['aprobado', 'observado', 'rechazado'];

    if (!permitidos.includes(resultado)) {
      throw new HttpError(400, 'Resultado de revisión no válido');
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const caso = await client.query(`
        SELECT id_caso
        FROM caso
        WHERE id_caso = $1
          AND estado IN ('borrador', 'revisado')
        FOR UPDATE
      `, [id]);

      if (!caso.rows.length) {
        throw new HttpError(404, 'Caso no encontrado para revisión');
      }
        if (resultado === 'aprobado') {
  const verificaciones = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE licencia_verificada = TRUE
          AND desidentificada_verificada = TRUE
      )::int AS verificadas
    FROM imagen
    WHERE id_caso = $1
  `, [id]);

  const { total, verificadas } = verificaciones.rows[0];

  if (total === 0 || total !== verificadas) {
    throw new HttpError(
      422,
      'No se puede aprobar: todas las imágenes deben tener licencia y desidentificación verificadas'
    );
  }
}
      await client.query(`
        INSERT INTO revision_caso (
          id_revision,
          id_caso,
          id_revisor,
          resultado,
          comentario
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        randomUUID(),
        id,
        idRevisor,
        resultado,
        comentario.trim() || null
      ]);

      await client.query(`
        UPDATE caso
        SET estado = 'revisado'
        WHERE id_caso = $1
      `, [id]);

      await client.query('COMMIT');

      return {
        id,
        resultado,
        mensaje: 'Revisión registrada correctamente'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ACTIVAR UN CASO DESPUÉS DE TODAS LAS VERIFICACIONES
  async activar(id) {
    const resultado = await db.query(
      'SELECT * FROM caso WHERE id_caso = $1',
      [id]
    );

    const caso = resultado.rows[0];

    if (!caso) {
      throw new HttpError(404, 'Caso no encontrado');
    }
    
    if (caso.estado !== 'revisado') {
  throw new HttpError(
    422,
    'El caso debe haber pasado por revisión antes de activarse'
  );
}
    const resultadoImagenes = await db.query(
      'SELECT * FROM imagen WHERE id_caso = $1',
      [id]
    );

    const imagenes = resultadoImagenes.rows;
    const faltan = [];

    if (!caso.diagnostico_referencia?.trim()) {
      faltan.push('diagnóstico de referencia');
    }

    if (!imagenes.length) {
      faltan.push('imagen');
    }

    if (imagenes.some((i) => !i.licencia_verificada)) {
      faltan.push('licencia verificada');
    }

    if (imagenes.some((i) => !i.desidentificada_verificada)) {
      faltan.push('desidentificación verificada');
    }

    const revision = await db.query(`
  SELECT resultado
  FROM revision_caso
  WHERE id_caso = $1
  ORDER BY fecha_revision DESC
  LIMIT 1
`, [id]);

    if (
  !revision.rows.length ||
  revision.rows[0].resultado !== 'aprobado'
) {
  faltan.push('última revisión clínica aprobada');
}

    if (faltan.length) {
      throw new HttpError(
        422,
        `No se puede activar el caso. Falta: ${faltan.join(', ')}`
      );
    }

    await db.query(
      "UPDATE caso SET estado = 'activo' WHERE id_caso = $1",
      [id]
    );

    return { id, estado: 'activo' };
  },

  // RESUMEN DE MÉTRICAS
  async resumenMetricas() {
    const resultado = await db.query(`
      SELECT
        COUNT(*)::int AS sesiones,
        AVG(tiempo_respuesta_ms)::float AS promedio_ms,
        MAX(tiempo_respuesta_ms)::int AS maximo_ms,
        COUNT(*) FILTER (
          WHERE tiempo_respuesta_ms <= 10000
        )::int AS en_10s,
        COUNT(*) FILTER (
          WHERE coherencia >= 3 AND pertinencia >= 3
        )::int AS coherentes,
        COUNT(coherencia)::int AS calificadas,
        COUNT(*) FILTER (
          WHERE estado_servicio_ia <> 'ok'
        )::int AS fallidas
      FROM metrica_sesion
    `);

    const r = resultado.rows[0];

    return {
      ...r,
      meta_80: r.calificadas
        ? (100 * r.coherentes) / r.calificadas
        : null
    };
  }

};
