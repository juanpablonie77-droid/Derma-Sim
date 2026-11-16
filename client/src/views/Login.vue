<script setup>
import { ref } from 'vue'; import { useRouter } from 'vue-router'; import { useAuth } from '../stores.js';
const router = useRouter(), auth = useAuth(), f = ref({ correo: '', clave: '' }), error = ref('');
async function enviar() { error.value = ''; try { await auth.entrar('/auth/login', f.value); router.push('/casos'); } catch (e) { error.value = e.message; } }
</script>
<template>
  <section class="auth">
    <div class="hero"><small>LÍNEA ONCO-SIM · USC</small><h1>Entrena tu mirada. Fortalece tu razonamiento.</h1><p>Practica con casos dermatológicos, formula hipótesis y recibe retroalimentación educativa de un tutor de IA.</p></div>
    <form class="tarjeta" @submit.prevent="enviar">
      <h2>Bienvenido a Derma-Sim</h2>
      <label>Correo electrónico<input v-model="f.correo" type="email" placeholder="nombre@usc.edu.co" /></label>
      <label>Contraseña<input v-model="f.clave" type="password" /></label>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn">Iniciar sesión</button>
      <small>¿No tienes cuenta? <router-link to="/registro">Crear cuenta</router-link></small>
    </form>
  </section>
</template>
