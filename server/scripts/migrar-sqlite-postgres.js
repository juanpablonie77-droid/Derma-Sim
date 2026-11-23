
import 'dotenv/config';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;

const sqlite = new Database(
  process.env.DB_FILE || 'dermasim.db',
  { readonly: true, fileMustExist: true }
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined
});



// Campos que SQLite almacena como 0/1 y PostgreSQL como booleanos.
const booleanos = {
  imagen: ['licencia_verificada', 'desidentificada_verificada'],
  aviso: ['vigente']
};

let client;

try {
  console.log('Leyendo datos de SQLite...');

  const datos = {};
  const nombresTablas = [
    'usuario',
    'caso',
    'imagen',
    'revision_caso',
    'sesion',
    'decision',
    'evaluacion',
    'metrica_sesion',
    'aviso',
    'aceptacion_aviso'
  ];

  for (const tabla of nombresTablas) {
    datos[tabla] = sqlite
      .prepare(`SELECT * FROM "${tabla}"`)
      .all();
  }

  client = await pool.connect();

  console.log('Conectado a PostgreSQL.');

  await client.query('BEGIN');

  // Evita duplicar registros si el script se ejecuta nuevamente.
  for (const tabla of nombresTablas) {
    const resultado = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${tabla}"`
    );

    if (resultado.rows[0].total > 0) {
      throw new Error(
        `La tabla ${tabla} ya contiene datos. Se cancela la migración para evitar duplicados.`
      );
    }
  }

  let totalMigrados = 0;

  for (const tabla of nombresTablas) {
    const filas = datos[tabla];

    if (filas.length === 0) {
      console.log(`${tabla}: 0 registros`);
      continue;
    }

    for (const fila of filas) {
      const columnas = Object.keys(fila);

      const valores = columnas.map((columna) => {
        const valor = fila[columna];

        if (
          booleanos[tabla]?.includes(columna)
        ) {
          return valor === null ? null : Boolean(valor);
        }

        return valor;
      });

      const nombresColumnas = columnas
        .map((columna) => `"${columna}"`)
        .join(', ');

      const parametros = valores
        .map((_, i) => `$${i + 1}`)
        .join(', ');

      await client.query(
        `INSERT INTO "${tabla}" (${nombresColumnas})
         VALUES (${parametros})`,
        valores
      );

      totalMigrados++;
    }

    console.log(`${tabla}: ${filas.length} registros migrados`);
  }

  // Comprobar que las cantidades coinciden antes de confirmar.
  for (const tabla of nombresTablas) {
    const resultado = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${tabla}"`
    );

    if (resultado.rows[0].total !== datos[tabla].length) {
      throw new Error(
        `La cantidad de registros de ${tabla} no coincide.`
      );
    }
  }

  await client.query('COMMIT');

  console.log('--------------------------------');
  console.log('MIGRACIÓN EXITOSA');
  console.log('Total de registros:', totalMigrados);
  console.log('SQLite permanece intacta.');

} catch (error) {
  if (client) {
    await client.query('ROLLBACK').catch(() => {});
  }

  console.error('ERROR EN LA MIGRACIÓN:', error.message);
  process.exitCode = 1;

} finally {
  sqlite.close();

  if (client) client.release();

  await pool.end();
}
