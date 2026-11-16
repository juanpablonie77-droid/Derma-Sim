import { defineStore } from 'pinia';
import { api } from './api.js';
export const useAuth = defineStore('auth', {
  state: () => ({ usuario: JSON.parse(localStorage.getItem('usuario') || 'null') }),
  actions: {
    async entrar(ruta, body) {
      const { token, usuario } = await api(ruta, { method: 'POST', body });
      localStorage.setItem('token', token); localStorage.setItem('usuario', JSON.stringify(usuario)); this.usuario = usuario;
    },
    salir() { localStorage.removeItem('token'); localStorage.removeItem('usuario'); this.usuario = null; },
  },
});
