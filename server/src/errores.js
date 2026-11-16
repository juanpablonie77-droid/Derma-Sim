export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export class ErrorIANoDisponible extends Error {
  constructor(message = 'Servicio de IA no disponible', estado = 'error') { super(message); this.estado = estado; }
}
