<script setup>defineProps({ paso: Number }); const p = ['Caso clínico', 'Explorar caso', 'Tu decisión', 'Retroalimentación'];</script>
<template><ol class="pasos"><li v-for="(n, i) in p" :key="n" :class="{ act: i + 1 === paso, ok: i + 1 < paso }"><span>{{ i + 1 }}</span>{{ n }}</li></ol></template>
