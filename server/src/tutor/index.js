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

// Integración directa con Gemini Developer API (sin SDK ni dependencia adicional).
export class ClienteGemini {
  constructor({ clave, modelo = 'gemini-3.5-flash-lite', timeoutMs = 30000 }) {
    Object.assign(this, { clave, modelo, timeoutMs });
  }
  get nombre() { return this.modelo; }
  async completar(prompt) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.clave },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Eres un tutor de dermatología para estudiantes. Uso exclusivamente educativo: no diagnosticas pacientes reales ni sustituyes a profesionales. Evalúa únicamente el caso educativo proporcionado. Responde solo un objeto JSON válido con las propiedades veredicto (correcto, parcial o incorrecto), texto y evidencia (cadenas de texto).' }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 700 }
        })
      });
      if (!r.ok) {
        const estado = r.status === 429 ? 'limite' : r.status === 401 || r.status === 403 ? 'configuracion' : 'error';
        throw new ErrorIANoDisponible(`Gemini respondió HTTP ${r.status}`, estado);
      }
      const data = await r.json();
      const texto = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('').trim();
      if (!texto) throw new ErrorIANoDisponible('Gemini no devolvió contenido', 'respuesta_vacia');
      const resultado = JSON.parse(texto);
      if (!['correcto', 'parcial', 'incorrecto'].includes(resultado.veredicto) || typeof resultado.texto !== 'string') {
        throw new ErrorIANoDisponible('Gemini devolvió un formato inesperado', 'respuesta_invalida');
      }
      return resultado;
    } catch (e) {
      if (e instanceof ErrorIANoDisponible) throw e;
      throw new ErrorIANoDisponible(e.message, e.name === 'TimeoutError' ? 'tiempo_agotado' : 'error');
    }
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
export class TutorFactoryGemini extends TutorFactory {
  crearCliente(c) { return new ClienteGemini({ clave: c.claveIA, modelo: c.modelo || 'gemini-3.5-flash-lite', timeoutMs: c.timeoutMs }); }
}
export class TutorFactorySimulado extends TutorFactory { crearCliente() { return new ClienteSimulado(); } }

export const fabricaDesdeEntorno = (env) => {
  if (env.GEMINI_API_KEY && env.IA_PROVIDER !== 'anthropic') return new TutorFactoryGemini();
  if (env.IA_API_KEY) return new TutorFactoryReal();
  return new TutorFactorySimulado();
};
