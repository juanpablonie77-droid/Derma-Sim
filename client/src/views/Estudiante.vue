
<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const casos = ref([]);
const cargando = ref(false);
const error = ref('');

async function cargarCasos() {
  cargando.value = true;
  error.value = '';

  try {
    const respuesta = await api('/estudiante/casos');

    casos.value = Array.isArray(respuesta)
      ? respuesta
      : respuesta.casos || [];
  } catch (e) {
    error.value = e.message || 'No fue posible cargar los casos clínicos.';
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarCasos);
</script>

<template>
  <main class="estudiante">
    <header class="encabezado">
      <h1>Catálogo de casos clínicos</h1>
      <p>
        Explora los casos dermatológicos disponibles para tu aprendizaje.
      </p>
    </header>

    <p v-if="cargando" class="estado">
      Cargando casos clínicos...
    </p>

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <section v-if="!cargando && !error">
      <p v-if="casos.length === 0" class="vacio">
        No hay casos disponibles por el momento.
      </p>

      <div v-else class="casos">
        <article
          v-for="caso in casos"
          :key="caso.id"
          class="caso"
        >
          <h2>{{ caso.titulo || caso.id }}</h2>

          <p v-if="caso.descripcion">
            {{ caso.descripcion }}
          </p>

          <p v-if="caso.dificultad" class="dificultad">
            Dificultad: {{ caso.dificultad }}
          </p>

          <p class="codigo">
            Código: {{ caso.id }}
          </p>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.estudiante {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.encabezado {
  margin-bottom: 28px;
}

.encabezado h1 {
  margin-bottom: 8px;
}

.encabezado p {
  color: #666;
}

.casos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 24px;
}

.caso {
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: white;
}

.caso h2 {
  margin-top: 0;
}

.dificultad {
  font-weight: 600;
}

.codigo {
  color: #777;
  font-size: 13px;
}

.estado,
.vacio {
  color: #666;
}

.error {
  color: #c62828;
  padding: 12px;
  border-radius: 8px;
  background: #ffebee;
}
</style>
