<script setup>
import { ref, onMounted } from 'vue'; import { useRoute, useRouter } from 'vue-router'; import { api } from '../api.js'; import Pasos from '../components/Pasos.vue';
const route = useRoute(), router = useRouter(), id = route.params.id;
const sesion = ref(null), f = ref({ diagnostico: '', hipotesis: '' }), fase = ref('form'), error = ref(''), errores = ref({});
onMounted(async () => {
  sesion.value = await api(`/sesiones/${id}`);
  if (sesion.value.estado === 'evaluada') router.replace(`/sesion/${id}/resultado`);
  if (sesion.value.decision) f.value = { diagnostico: sesion.value.decision.diagnostico, hipotesis: sesion.value.decision.hipotesis ?? '' };
});
async function enviar() {
  error.value = ''; errores.value = {};
  if (!f.value.diagnostico.trim()) errores.value.diagnostico = 'Demasiado corto: escribe tu hipótesis diagnóstica';
  if (!f.value.hipotesis.trim()) errores.value.hipotesis = 'Justifica tu decisión con los hallazgos que observaste';
  if (Object.keys(errores.value).length) return;
  fase.value = 'evaluando';
  try {
    if (sesion.value.estado === 'iniciada') { await api(`/sesiones/${id}/decision`, { method: 'POST', body: f.value }); sesion.value.estado = 'decision_registrada'; }
    await api(`/sesiones/${id}/evaluar`, { method: 'POST' });
    router.push(`/sesion/${id}/resultado`);
  } catch (e) { error.value = e.message; fase.value = 'form'; }
}
</script>
<template>
  <Pasos :paso="fase === 'evaluando' ? 4 : 3" />
  <section v-if="fase === 'evaluando'" class="panel centro"><h2>El tutor de IA está evaluando tu decisión…</h2><div class="barra"><i /></div><p class="sub">Esperar unos segundos. La respuesta es orientación educativa, no una opinión médica.</p></section>
  <template v-else-if="sesion">
    <h1>¿Cuál es tu diagnóstico?</h1><p class="sub">{{ sesion.caso.titulo }} · Propón una hipótesis y explica qué hallazgos la sustentan.</p>
    <div class="dos"><form class="panel" @submit.prevent="enviar">
      <p v-if="error" class="err">{{ error }}</p>
      <label>Diagnóstico propuesto<input v-model="f.diagnostico" :class="{ malo: errores.diagnostico }" maxlength="200" /><small class="err">{{ errores.diagnostico }}</small></label>
      <label>Justifica tu decisión (hallazgos que observas)<textarea v-model="f.hipotesis" rows="5" :class="{ malo: errores.hipotesis }" /><small class="err">{{ errores.hipotesis }}</small></label>
      <div class="acciones"><router-link :to="`/caso/${route.params.id}`" class="btn sec" @click.prevent="router.back()">Volver al caso</router-link><button class="btn">{{ sesion.estado === 'evaluacion_fallida' ? 'Reintentar' : 'Enviar al tutor →' }}</button></div></form>
    <aside class="panel"><img :src="sesion.caso.imagen" class="grande" /></aside></div>
  </template>
</template>
