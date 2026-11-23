<script setup>
import { useRouter } from 'vue-router';
import { useAuth } from './stores.js';
const auth = useAuth(), router = useRouter();
const salir = () => { auth.salir(); router.push('/login'); };
</script>
<template>
  <header class="top">
    <router-link to="/casos" class="marca"><b>Derma-Sim</b> · Línea ONCO-SIM · USC</router-link>
    <div v-if="auth.usuario" class="usr">

  <router-link
    v-if="auth.usuario.rol === 'revisor'"
    to="/revisor"
    class="btn"
  >
    Panel de revisión
  </router-link>

  <span>{{ auth.usuario.nombre }}</span>

  <button class="btn sec" @click="salir">
    Cerrar sesión
  </button>

</div>
  </header>
  <div class="aviso">Aplicativo con fines exclusivamente educativos. No sustituye el criterio clínico ni emite diagnósticos reales.</div>
  <main><router-view /></main>
  <footer>USC · Formación en razonamiento clínico dermatológico · Casos ficticios o de fuentes públicas desidentificadas</footer>
</template>
