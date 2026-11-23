
<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const casos = ref([]);
const casoSeleccionado = ref(null);
const resultado = ref('');
const comentario = ref('');
const cargando = ref(false);
const error = ref('');
const mensaje = ref('');

const imagenesVerificadas = () => {
  return (
    casoSeleccionado.value?.imagenes?.length > 0 &&
    casoSeleccionado.value.imagenes.every(
      (imagen) =>
        imagen.licencia_verificada === true &&
        imagen.desidentificada_verificada === true
    )
  );
};

async function cargarCasos() {
  cargando.value = true;
  error.value = '';

  try {
    casos.value = await api('/revisor/casos');
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

async function abrirCaso(id) {
  error.value = '';
  mensaje.value = '';

  try {
    casoSeleccionado.value = await api(`/revisor/casos/${id}`);
    resultado.value = '';
    comentario.value = '';
  } catch (e) {
    error.value = e.message;
  }
}

async function guardarVerificacion(imagen) {
  error.value = '';
  mensaje.value = '';

  try {
    const respuesta = await api(
      `/revisor/imagenes/${imagen.id}/verificacion`,
      {
        method: 'PUT',
        body: {
          licencia_verificada: imagen.licencia_verificada,
          desidentificada_verificada:
            imagen.desidentificada_verificada
        }
      }
    );

    mensaje.value = respuesta.mensaje;
  } catch (e) {
    error.value = e.message;
  }
}

async function registrarRevision() {
  if (!casoSeleccionado.value) return;

  if (!resultado.value) {
    error.value = 'Debes seleccionar un resultado de revisión.';
    return;
  }

  if (resultado.value === 'aprobado' && !imagenesVerificadas()) {
    error.value =
      'No puedes aprobar el caso: todas las imágenes deben tener la licencia y la desidentificación verificadas.';
    return;
  }

  cargando.value = true;
  error.value = '';
  mensaje.value = '';

  try {
    const respuesta = await api(
      `/revisor/casos/${casoSeleccionado.value.id}/revision`,
      {
        method: 'POST',
        body: {
          resultado: resultado.value,
          comentario: comentario.value
        }
      }
    );

    mensaje.value = respuesta.mensaje;
    casoSeleccionado.value = null;

    await cargarCasos();
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

async function activarCaso() {
  if (!casoSeleccionado.value) return;

  error.value = '';
  mensaje.value = '';
  cargando.value = true;

  try {
    const respuesta = await api(
      `/casos/${casoSeleccionado.value.id}/activar`,
      {
        method: 'POST'
      }
    );

    mensaje.value =
      respuesta.mensaje ||
      'Caso activado correctamente. Ya está disponible para los estudiantes.';

    casoSeleccionado.value = null;

    await cargarCasos();
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarCasos);
</script>

<template>
  <main class="revisor">
    <h1>Panel de revisión clínica</h1>

    <p class="sub">
      Revisión de casos dermatológicos HAM10000.
    </p>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="mensaje" class="mensaje">{{ mensaje }}</p>

    <section v-if="!casoSeleccionado">
      <h2>Casos pendientes</h2>

      <p v-if="cargando">Cargando casos...</p>

      <div v-else-if="casos.length" class="grid">
        <article
          v-for="caso in casos"
          :key="caso.id"
          class="card"
        >
          <h3>{{ caso.titulo }}</h3>

          <p>
            Imágenes: {{ caso.total_imagenes }}
          </p>

          <p>
            Estado: {{ caso.estado }}
          </p>

          <button
            class="btn"
            @click="abrirCaso(caso.id)"
          >
            Revisar caso →
          </button>
        </article>
      </div>

      <p v-else>No hay casos pendientes de revisión.</p>
    </section>

    <section v-else class="detalle-revisor">
      <button
        class="btn sec"
        @click="casoSeleccionado = null"
      >
        ← Volver a casos
      </button>

      <h2>{{ casoSeleccionado.titulo }}</h2>

      <div class="panel">
        <h3>Historia clínica disponible</h3>
        <p>{{ casoSeleccionado.historia_clinica }}</p>

        <h3>Diagnóstico de referencia</h3>
        <p>{{ casoSeleccionado.diagnostico_referencia }}</p>

        <h3>Origen</h3>
        <p>{{ casoSeleccionado.origen }}</p>

        <p>
          <strong>Estado:</strong>
          {{ casoSeleccionado.estado }}
        </p>
      </div>

      <h3>Imágenes dermatoscópicas</h3>

      <div class="imagenes-revisor">
        <article
          v-for="imagen in casoSeleccionado.imagenes"
          :key="imagen.id"
          class="panel"
        >
          <img
            :src="imagen.ruta"
            :alt="`Imagen ${imagen.id}`"
            class="grande"
          />

          <p>
            <strong>Fuente:</strong>
            {{ imagen.fuente }}
          </p>

          <p>
            <strong>Licencia:</strong>
            {{ imagen.licencia }}
          </p>

          <p>
            Licencia verificada:
            {{ imagen.licencia_verificada ? 'Sí' : 'Pendiente' }}
          </p>

          <p>
            Desidentificación verificada:
            {{ imagen.desidentificada_verificada ? 'Sí' : 'Pendiente' }}
          </p>

          <div class="verificaciones">
            <label>
              <input
                type="checkbox"
                v-model="imagen.licencia_verificada"
              />
              Confirmo que la licencia fue verificada
            </label>

            <label>
              <input
                type="checkbox"
                v-model="imagen.desidentificada_verificada"
              />
              Confirmo que la desidentificación fue verificada
            </label>

            <button
              class="btn"
              :disabled="cargando"
              @click="guardarVerificacion(imagen)"
            >
              Guardar verificaciones
            </button>
          </div>
        </article>
      </div>

      <div class="panel" v-if="casoSeleccionado.estado !== 'revisado'">
        <h3>Decisión clínica</h3>

        <label for="resultado">
          Resultado de revisión
        </label>

        <select id="resultado" v-model="resultado">
          <option value="" disabled>
            Selecciona un resultado
          </option>
          <option value="aprobado">Aprobado</option>
          <option value="observado">Observado</option>
          <option value="rechazado">Rechazado</option>
        </select>

        <label for="comentario">
          Comentario del revisor
        </label>

        <textarea
          id="comentario"
          v-model="comentario"
          maxlength="2000"
          rows="4"
          placeholder="Escribe las observaciones clínicas..."
        ></textarea>

        <button
          class="btn"
          :disabled="cargando"
          @click="registrarRevision"
        >
          {{ cargando ? 'Guardando...' : 'Guardar revisión' }}
        </button>
      </div>

      <div
        v-if="casoSeleccionado.estado === 'revisado'"
        class="panel activacion"
      >
        <h3>Activación del caso</h3>

        <p>
          Este caso ya pasó por el proceso de revisión.
          Puedes solicitar su activación.
        </p>

        <p v-if="!imagenesVerificadas()" class="advertencia">
          Hay imágenes pendientes de verificación.
        </p>

        <button
          class="btn activar"
          :disabled="cargando"
          @click="activarCaso"
        >
          {{ cargando ? 'Activando...' : 'Activar caso para estudiantes' }}
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.revisor {
  max-width: 1100px;
  margin: 30px auto;
  padding: 20px;
}

.detalle-revisor {
  display: grid;
  gap: 20px;
}

.imagenes-revisor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.imagenes-revisor img {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border-radius: 12px;
}

.panel {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 12px;
}

.verificaciones {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.verificaciones label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detalle-revisor textarea,
.detalle-revisor select {
  display: block;
  width: 100%;
  margin: 10px 0 20px;
  padding: 12px;
  border-radius: 8px;
}

.btn {
  padding: 11px 18px;
  border: none;
  border-radius: 8px;
  background: #174c75;
  color: white;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sec {
  background: #555;
}

.activacion {
  border-color: #2e8b57;
}

.activar {
  background: #21834a;
}

.mensaje {
  color: green;
  margin: 15px 0;
}

.err {
  color: #c62828;
  margin: 15px 0;
}

.advertencia {
  color: #b45309;
}

.sub {
  color: #666;
}
</style>
