<script setup>
import { ref, onMounted } from 'vue'; import { useRoute, useRouter } from 'vue-router'; import { api } from '../api.js'; import Pasos from '../components/Pasos.vue';
const route = useRoute(), router = useRouter(), caso = ref(null), ok = ref(false), error = ref('');
onMounted(async () => { try { caso.value = await api(`/casos/${route.params.id}`); } catch (e) { error.value = e.message; } });
async function seguir() {
  try { const { id } = await api('/sesiones', { method: 'POST', body: { casoId: caso.value.id, avisosAceptados: ok.value } }); router.push(`/sesion/${id}/decision`); }
  catch (e) { error.value = e.message; }
}
</script>
<template>
  <Pasos :paso="2" />
  <p v-if="error" class="err">{{ error }} <router-link to="/casos">Volver a los casos</router-link></p>
  <template v-if="caso">
    <h1>{{ caso.titulo }}</h1><p class="sub">Observa e interpreta la imagen antes de registrar tu hipótesis.</p>
    <div class="dos"><section class="panel"><h3>Historia clínica</h3><p>{{ caso.historia_clinica }}</p></section>
      <section class="panel"><h3>Imagen dermatoscópica</h3><img v-for="i in caso.imagenes" :key="i.ruta" :src="i.ruta" class="grande" /></section></div>
    <label class="check"><input type="checkbox" v-model="ok" /> Entiendo que este aplicativo es solo educativo y que la retroalimentación la genera un tutor de IA.</label>
    <div class="acciones"><router-link to="/casos" class="btn sec">Volver a casos</router-link><button class="btn" :disabled="!ok" @click="seguir">Registrar mi decisión diagnóstica →</button></div>
  </template>
</template>
