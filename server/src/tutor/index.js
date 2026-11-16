// Subsistema del tutor de IA: Adapter, Factory Method, Strategy, Decorator y Builder
import { ErrorIANoDisponible } from '../errores.js';

export class PromptBuilder {
  constructor() { this.partes = []; this.tieneReferencia = false; }
  conCaso(c) { this.partes.push(`Caso: ${c.historia_clinica}`); return this; }
  conDecision(d) { this.partes.push(`Decisión del estudiante: ${d.diagnostico}`); return this; }
  conReferencia(dx) { this.partes.push(`Diagnóstico de referencia: ${dx}`); this.tieneReferencia = true; return this; }
  conInstrucciones(t) { this.partes.push(t); return this; }
  build() {
    if (!this.tieneReferencia) throw new Error('Falta el diagnóstico de referencia');
    return this.partes.join('\n');
  }
}

export class RetroExplicable {
  armarInstrucciones({ caso }) {
    return `Evalúa la decisión frente a "${caso.diagnostico_referencia}" y explica la evidencia visual y clínica. Uso exclusivamente educativo.`;
  }
}
export class RetroBreve { armarInstrucciones() { return 'Indica en tres frases si acertó y cuál fue la pista principal.'; } }

export class ClienteSimulado {
  nombre = 'tutor-simulado';
  async completar(prompt) {
    const d = (prompt.match(/Decisión del estudiante: (.*)/)?.[1] ?? '').trim().toLowerCase();
    const r = (prompt.match(/Diagnóstico de referencia: (.*)/)?.[1] ?? '').trim();
    const rl = r.toLowerCase();
    const veredicto = d === rl ? 'correcto' : d && (rl.includes(d) || d.includes(rl)) ? 'parcial' : 'incorrecto';
    return { veredicto, texto: `[Respuesta simulada] El diagnóstico de referencia es "${r}". Tu hipótesis fue "${d}".`, evidencia: 'Evidencia simulada: asimetría, bordes y variación de color.' };
  }
}

export class ClienteHTTP {
  constructor({ url = 'https://api.anthropic.com/v1/messages', clave, modelo, timeoutMs = 30000 }) { Object.assign(this, { url, clave, modelo, timeoutMs }); }
  get nombre() { return this.modelo; }
  async completar(prompt) {
    try {
      const r = await fetch(this.url, {
        method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'content-type': 'application/json', 'x-api-key': this.clave, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: this.modelo, max_tokens: 1000,
          system: 'Eres un tutor de dermatología para estudiantes. Uso exclusivamente educativo; no emites diagnósticos clínicos. Responde SOLO con JSON: {"veredicto":"correcto|parcial|incorrecto","texto":"...","evidencia":"..."}',
          messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) throw new ErrorIANoDisponible(`HTTP ${r.status}`);
      const data = await r.json();
      const txt = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/```json|```/g, '').trim();
      return JSON.parse(txt);
    } catch (e) {
      if (e instanceof ErrorIANoDisponible) throw e;
      throw new ErrorIANoDisponible(e.message, e.name === 'TimeoutError' ? 'tiempo_agotado' : 'error');
    }
  }
}

export class TutorIAAdapter {
  constructor({ cliente, estrategia }) { this.cliente = cliente; this.estrategia = estrategia; }
  async evaluar(caso, decision) {
    const prompt = new PromptBuilder().conCaso(caso).conDecision(decision).conReferencia(caso.diagnostico_referencia)
      .conInstrucciones(this.estrategia.armarInstrucciones({ caso })).build();
    const r = await this.cliente.completar(prompt);
    if (!r?.veredicto || !r?.texto) throw new ErrorIANoDisponible('Respuesta incompleta del tutor');
    return { resultado: r.veredicto, retroalimentacion: r.texto, evidencia: r.evidencia ?? '', modelo: this.cliente.nombre };
  }
}

export class TutorMetricasDecorator {
  constructor(interno) { this.interno = interno; }
  async evaluar(caso, decision) {
    const t0 = Date.now();
    const r = await this.interno.evaluar(caso, decision);
    r.tiempoMs = Date.now() - t0;
    return r;
  }
}

export class TutorFactory {
  crearCliente() { throw new Error('Lo define cada fábrica concreta'); }
  crear(config = {}) {
    const estrategia = config.retro === 'breve' ? new RetroBreve() : new RetroExplicable();
    return new TutorMetricasDecorator(new TutorIAAdapter({ cliente: this.crearCliente(config), estrategia }));
  }
}
export class TutorFactoryReal extends TutorFactory {
  crearCliente(c) { return new ClienteHTTP({ clave: c.claveIA, modelo: c.modelo, timeoutMs: c.timeoutMs }); }
}
export class TutorFactorySimulado extends TutorFactory { crearCliente() { return new ClienteSimulado(); } }
export const fabricaDesdeEntorno = (env) => (env.IA_API_KEY ? new TutorFactoryReal() : new TutorFactorySimulado());
