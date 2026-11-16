<script setup>
import { ref, onMounted } from 'vue'; import { api } from '../api.js'; import Pasos from '../components/Pasos.vue';
const casos = ref([]), error = ref('');
onMounted(async () => { try { casos.value = await api('/casos'); } catch (e) { error.value = e.message; } });
</script>
<template>
  <Pasos :paso="1" />
  <h1>Selecciona un caso clínico</h1><p class="sub">Explora la imagen, formula tu hipótesis y contrástala con la orientación de un tutor de IA.</p>
  <p v-if="error" class="err">{{ error }}</p>
  <div class="grid">
    <article v-for="c in casos" :key="c.id" class="card">
      <img :src="c.imagen" :alt="c.titulo" /><span :class="['tag', c.dificultad]">{{ c.dificultad }}</span>
      <h3>{{ c.titulo }}</h3><router-link :to="`/caso/${c.id}`" class="btn">Iniciar caso →</router-link>
    </article>
  </div>
</template>
