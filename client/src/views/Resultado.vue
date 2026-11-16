<script setup>
import { ref, onMounted } from 'vue'; import { useRoute } from 'vue-router'; import { api } from '../api.js'; import Pasos from '../components/Pasos.vue';
const s = ref(null), error = ref('');
onMounted(async () => { try { s.value = await api(`/sesiones/${useRoute().params.id}`); } catch (e) { error.value = e.message; } });
const etiqueta = { correcto: 'Acertó en la hipótesis', parcial: 'Acierto parcial', incorrecto: 'Por revisar' };
</script>
<template>
  <Pasos :paso="4" /><p v-if="error" class="err">{{ error }}</p>
  <template v-if="s?.evaluacion">
    <h1>Una decisión, nuevos aprendizajes</h1><p class="sub">Contrasta tu hipótesis y revisa las claves de este caso educativo. <span v-if="s.tiempoMs">Tiempo de respuesta: {{ (s.tiempoMs / 1000).toFixed(1) }} s</span></p>
    <div class="dos"><section class="panel"><small>Tu decisión</small><h3>{{ s.decision.diagnostico }}</h3><p>{{ s.decision.hipotesis }}</p></section>
      <section class="panel"><small>Diagnóstico de referencia</small><h3>{{ s.diagnosticoReferencia }}</h3><span :class="['tag', s.evaluacion.resultado]">{{ etiqueta[s.evaluacion.resultado] }}</span></section></div>
    <section class="panel"><h3>Retroalimentación del tutor de IA</h3><p>{{ s.evaluacion.explicacion }}</p><p v-if="s.evaluacion.evidencias"><b>Evidencia:</b> {{ s.evaluacion.evidencias }}</p>
      <small>Generado por {{ s.evaluacion.modelo }}. Contenido educativo; no es un diagnóstico clínico.</small></section>
    <div class="acciones"><router-link to="/casos" class="btn">Practicar otro caso →</router-link></div>
  </template>
</template>
