// Pruebas unitarias alineadas con la Matriz de Pruebas Unitarias (CP006 a CP016, CP022, CP023)
import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptBuilder, TutorIAAdapter, ClienteSimulado, RetroExplicable, RetroBreve, TutorFactorySimulado, TutorMetricasDecorator } from '../src/tutor/index.js';
import { transicion } from '../src/services/estados.js';

const caso = { historia_clinica: 'Lesión en espalda', diagnostico_referencia: 'Sospecha de melanoma' };

test('PromptBuilder incluye las cuatro partes', () => {
  const p = new PromptBuilder().conCaso(caso).conDecision({ diagnostico: 'Melanoma' }).conReferencia('Sospecha de melanoma').conInstrucciones('X').build();
  for (const t of ['Caso:', 'Decisión del estudiante: Melanoma', 'Diagnóstico de referencia: Sospecha de melanoma', 'X']) assert.match(p, new RegExp(t));
});
test('PromptBuilder sin referencia lanza error', () => {
  assert.throws(() => new PromptBuilder().conCaso(caso).build(), /Falta el diagnóstico de referencia/);
});
test('Adapter convierte al formato interno', async () => {
  const a = new TutorIAAdapter({ cliente: new ClienteSimulado(), estrategia: new RetroExplicable() });
  const r = await a.evaluar(caso, { diagnostico: 'Sospecha de melanoma' });
  assert.equal(r.resultado, 'correcto'); assert.ok(r.retroalimentacion && r.evidencia);
});
test('Veredicto parcial e incorrecto', async () => {
  const a = new TutorIAAdapter({ cliente: new ClienteSimulado(), estrategia: new RetroBreve() });
  assert.equal((await a.evaluar(caso, { diagnostico: 'melanoma' })).resultado, 'parcial');
  assert.equal((await a.evaluar(caso, { diagnostico: 'psoriasis' })).resultado, 'incorrecto');
});
test('Estrategias incluyen la referencia (explicable) o piden tres frases (breve)', () => {
  assert.match(new RetroExplicable().armarInstrucciones({ caso }), /Sospecha de melanoma/);
  assert.match(new RetroBreve().armarInstrucciones(), /tres frases/);
});
test('Fábrica simulada crea un tutor que funciona sin conexión y mide el tiempo', async () => {
  const tutor = new TutorFactorySimulado().crear({});
  assert.ok(tutor instanceof TutorMetricasDecorator);
  assert.ok((await tutor.evaluar(caso, { diagnostico: 'x' })).tiempoMs >= 0);
});
test('State: transiciones válidas y reintento tras fallo de IA', () => {
  assert.equal(transicion('iniciada', 'registrarDecision'), 'decision_registrada');
  assert.equal(transicion('decision_registrada', 'evaluar'), 'evaluada');
  assert.equal(transicion('decision_registrada', 'fallarIA'), 'evaluacion_fallida');
  assert.equal(transicion('evaluacion_fallida', 'reintentar'), 'decision_registrada');
});
test('State: evaluar sin decisión y doble evaluación se rechazan', () => {
  assert.throws(() => transicion('iniciada', 'evaluar'), /Primero se registra la decisión/);
  assert.throws(() => transicion('evaluada', 'evaluar'), /no permitida/);
});
