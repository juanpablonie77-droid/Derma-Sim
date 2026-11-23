
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '../..');

const csvSeleccion = path.join(
  raiz, 'datasets/HAM10000/seleccion_10_casos.csv'
);

const csvMetadatos = path.join(
  raiz,
  'datasets/HAM10000/metadata/train/ISIC2018_Task3_Training_Supplement.csv'
);

const csvDiagnosticos = path.join(
  raiz,
  'datasets/HAM10000/metadata/train/ISIC2018_Task3_Training_GroundTruth.csv'
);

const imageDir = path.join(
  raiz, 'server/public/imagenes/ham10000'
);

const diagnosticos = {
  MEL: 'MEL - Melanoma',
  NV: 'NV - Nevus melanocítico',
  BCC: 'BCC - Carcinoma basocelular',
  AKIEC: 'AKIEC - Queratosis actínica o carcinoma intraepidérmico',
  BKL: 'BKL - Lesión queratósica benigna',
  DF: 'DF - Dermatofibroma',
  VASC: 'VASC - Lesión vascular'
};

// Lector CSV que admite campos entre comillas.
function leerCsv(ruta) {
  const contenido = fs.readFileSync(ruta, 'utf8')
    .replace(/^\uFEFF/, '');

  const lineas = contenido.split(/\r?\n/).filter(
    linea => linea.trim() !== ''
  );

  function separarLinea(linea) {
    const valores = [];
    let valor = '';
    let entreComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const caracter = linea[i];

      if (caracter === '"') {
        if (entreComillas && linea[i + 1] === '"') {
          valor += '"';
          i++;
        } else {
          entreComillas = !entreComillas;
        }
      } else if (caracter === ',' && !entreComillas) {
        valores.push(valor);
        valor = '';
      } else {
        valor += caracter;
      }
    }

    valores.push(valor);
    return valores;
  }

  const encabezados = separarLinea(lineas.shift());

  return lineas.map(linea => {
    const valores = separarLinea(linea);

    return Object.fromEntries(
      encabezados.map((campo, i) => [
        campo,
        valores[i] ?? ''
      ])
    );
  });
}

// Comprobar archivos.
for (const archivo of [
  csvSeleccion,
  csvMetadatos,
  csvDiagnosticos
]) {
  if (!fs.existsSync(archivo)) {
    throw new Error(`No se encontró el archivo: ${archivo}`);
  }
}

if (!fs.existsSync(imageDir)) {
  throw new Error(`No existe la carpeta de imágenes: ${imageDir}`);
}

// Leer los tres CSV.
const seleccion = leerCsv(csvSeleccion);
const metadatos = leerCsv(csvMetadatos);
const groundTruth = leerCsv(csvDiagnosticos);

const metadataPorImagen = new Map(
  metadatos.map(fila => [fila.image, fila])
);

const diagnosticoPorImagen = new Map(
  groundTruth.map(fila => [fila.image, fila])
);

// Agrupar imágenes por lesión.
const lesiones = new Map();

for (const fila of seleccion) {
  const { lesion_id, diagnostico, imagen } = fila;

  if (!lesion_id || !diagnostico || !imagen) {
    throw new Error('Hay registros incompletos en el CSV de selección.');
  }

  if (!diagnosticos[diagnostico]) {
    throw new Error(`Diagnóstico desconocido: ${diagnostico}`);
  }

  const metadata = metadataPorImagen.get(imagen);
  const ground = diagnosticoPorImagen.get(imagen);

  if (!metadata || !ground) {
    throw new Error(`Faltan metadatos para ${imagen}`);
  }

  // Verificar la etiqueta oficial.
  const etiquetasActivas = Object.entries(ground)
    .filter(([campo, valor]) =>
      diagnosticos[campo] && Number(valor) === 1
    )
    .map(([campo]) => campo);

  if (
    etiquetasActivas.length !== 1 ||
    etiquetasActivas[0] !== diagnostico
  ) {
    throw new Error(
      `El diagnóstico no coincide con GroundTruth: ${imagen}`
    );
  }

  const archivoImagen = `${imagen}.jpg`;

  if (!fs.existsSync(path.join(imageDir, archivoImagen))) {
    throw new Error(`No se encontró la imagen: ${archivoImagen}`);
  }

  if (!lesiones.has(lesion_id)) {
    lesiones.set(lesion_id, {
      id: lesion_id,
      diagnostico,
      localizacion: metadata.localization || '',
      dataset: metadata.dataset || '',
      imagenes: []
    });
  }

  const lesion = lesiones.get(lesion_id);

  if (
    lesion.diagnostico !== diagnostico ||
    lesion.localizacion !== (metadata.localization || '')
  ) {
    throw new Error(`Datos inconsistentes en ${lesion_id}`);
  }

  lesion.imagenes.push(imagen);
}

const casos = [...lesiones.values()];

if (casos.length !== 10) {
  throw new Error(
    `Se esperaban 10 lesiones y se encontraron ${casos.length}`
  );
}

if (seleccion.length !== 18) {
  throw new Error(
    `Se esperaban 18 imágenes y se encontraron ${seleccion.length}`
  );
}

// Mostrar resumen antes de importar.
console.log('\nDERMA-SIM - HAM10000');
console.log('Lesiones:', casos.length);
console.log('Imágenes:', seleccion.length);

for (const caso of casos) {
  console.log(
    `${caso.id} | ${caso.diagnostico} | ` +
    `${caso.localizacion} | ${caso.imagenes.length} imágenes`
  );
}

// Conectar a PostgreSQL y ejecutar una transacción.
const client = await db.connect();

try {
  await client.query('BEGIN');

  const idsCasos = casos.map(caso => caso.id);
  const idsImagenes = seleccion.map(fila => fila.imagen);

  const existentes = await client.query(
    'SELECT id_caso FROM caso WHERE id_caso = ANY($1::text[])',
    [idsCasos]
  );

  if (existentes.rows.length > 0) {
    throw new Error(
      'Algunos casos ya existen en la base de datos. ' +
      'No se modificó ningún registro.'
    );
  }

  const imagenesExistentes = await client.query(
    'SELECT id_imagen FROM imagen WHERE id_imagen = ANY($1::text[])',
    [idsImagenes]
  );

  if (imagenesExistentes.rows.length > 0) {
    throw new Error(
      'Algunas imágenes ya existen en la base de datos.'
    );
  }

  for (const caso of casos) {
    const nombreDiagnostico = diagnosticos[caso.diagnostico];

    const historia = [
      'Registro educativo basado en el conjunto HAM10000.',
      `Localización anatómica registrada: ${
        caso.localizacion || 'No especificada'
      }.`,
      `Procedencia del registro: ${caso.dataset || 'No especificada'}.`,
      'El conjunto consultado no proporciona una historia clínica completa.',
      'Edad, sexo, síntomas y antecedentes: no disponibles en los metadatos consultados.'
    ].join(' ');

    await client.query(`
      INSERT INTO caso (
        id_caso,
        titulo,
        historia_clinica,
        diagnostico_referencia,
        dificultad,
        origen,
        estado
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'borrador')
    `, [
      caso.id,
      `Caso dermatológico ${caso.id}`,
      historia,
      nombreDiagnostico,
      null,
      `HAM10000 / ISIC 2018 Training Set / ${caso.id}`
    ]);

    for (const imagen of caso.imagenes) {
      await client.query(`
        INSERT INTO imagen (
          id_imagen,
          id_caso,
          ruta_archivo,
          fuente,
          licencia,
          licencia_verificada,
          desidentificada_verificada
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
      `, [
        imagen,
        caso.id,
        `/imagenes/ham10000/${imagen}.jpg`,
        'HAM10000 / ISIC 2018',
        'CC BY-NC 4.0 - pendiente de verificación de atribución y condiciones de uso'
      ]);
    }
  }

  await client.query('COMMIT');

  console.log('\n¡IMPORTACIÓN COMPLETADA!');
  console.log('Casos importados:', casos.length);
  console.log('Imágenes importadas:', seleccion.length);
  console.log('Estado de todos los casos: borrador');

} catch (error) {
  await client.query('ROLLBACK');
  console.error('\nIMPORTACIÓN CANCELADA:', error.message);
  process.exitCode = 1;

} finally {
  client.release();
  await db.end();
}
