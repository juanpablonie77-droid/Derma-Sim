// Patron State (version por tabla de transiciones) - ciclo de vida de la sesion
import { HttpError } from '../errores.js';
const T = {
  iniciada: { registrarDecision: 'decision_registrada' },
  decision_registrada: { evaluar: 'evaluada', fallarIA: 'evaluacion_fallida' },
  evaluacion_fallida: { reintentar: 'decision_registrada' },
  evaluada: {},
};
export function transicion(estado, evento) {
  const next = T[estado]?.[evento];
  if (!next) {
    const msg = estado === 'iniciada' && evento === 'evaluar' ? 'Primero se registra la decisión' : `Operación no permitida en estado "${estado}"`;
    throw new HttpError(409, msg);
  }
  return next;
}
