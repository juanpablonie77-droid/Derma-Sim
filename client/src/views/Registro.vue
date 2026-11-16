<script setup>
import { ref } from 'vue'; import { useRouter } from 'vue-router'; import { useAuth } from '../stores.js';
const router = useRouter(), auth = useAuth(), f = ref({ nombre: '', correo: '', clave: '', confirmar: '' }), error = ref('');
async function enviar() {
  error.value = '';
  if (f.value.clave !== f.value.confirmar) return (error.value = 'Las contraseñas no coinciden');
  try { await auth.entrar('/auth/registro', f.value); router.push('/casos'); } catch (e) { error.value = e.message; }
}
</script>
<template>
  <section class="auth">
    <div class="hero"><small>LÍNEA ONCO-SIM · USC</small><h1>Crea tu cuenta</h1><p>Solo guardamos tu alias y correo institucional. Nunca datos de pacientes.</p></div>
    <form class="tarjeta" @submit.prevent="enviar">
      <label>Nombre completo<input v-model="f.nombre" /></label>
      <label>Correo electrónico<input v-model="f.correo" type="email" /></label>
      <label>Contraseña (mín. 8 caracteres)<input v-model="f.clave" type="password" /></label>
      <label>Confirmación de contraseña<input v-model="f.confirmar" type="password" /></label>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn">Crear cuenta</button>
      <small><router-link to="/login">Volver al inicio de sesión</router-link></small>
    </form>
  </section>
</template>
