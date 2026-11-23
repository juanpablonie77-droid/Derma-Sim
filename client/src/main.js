
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';

import App from './App.vue';
import './style.css';

import Login from './views/Login.vue';
import Registro from './views/Registro.vue';
import Casos from './views/Casos.vue';
import Visor from './views/Visor.vue';
import Decision from './views/Decision.vue';
import Resultado from './views/Resultado.vue';
import Revisor from './views/Revisor.vue';
import Estudiante from './views/Estudiante.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/casos' },
    { path: '/login', component: Login, meta: { publica: true } },
    { path: '/registro', component: Registro, meta: { publica: true } },
    { path: '/casos', component: Casos },
    { path: '/caso/:id', component: Visor },
    { path: '/sesion/:id/decision', component: Decision },
    { path: '/sesion/:id/resultado', component: Resultado },
    { path: '/revisor', component: Revisor },
    { path: '/estudiante', component: Estudiante },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.publica && !localStorage.getItem('token')) {
    return '/login';
  }

  return true;
});

createApp(App)
  .use(createPinia())
  .use(router)
  .mount('#app');
