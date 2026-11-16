# Derma-Sim

Simulador clínico de casos dermatológicos con agente tutor de IA · Línea ONCO-SIM · Universidad Santiago de Cali (USC), Ingeniería de Sistemas.

> **Uso exclusivamente educativo.** No sustituye el criterio clínico ni emite diagnósticos reales. No usa datos de pacientes reales.

## Qué hace
El estudiante inicia sesión, elige un caso (historia clínica + imagen dermatoscópica), registra su decisión diagnóstica y recibe evaluación y retroalimentación explicable de un tutor de IA. Cada sesión guarda su tiempo de respuesta; el revisor clínico califica coherencia y pertinencia (meta: 80 %).

## Arquitectura (cliente-servidor en capas)
| Capa | Carpeta | Tecnología |
|---|---|---|
| Presentación | `client/` | Vue 3, Pinia, Vue Router, Vite |
| API y lógica de negocio | `server/src/` | Node.js + Express 5, JWT |
| Datos | `server/src/db.js` | SQLite (desarrollo); esquema compatible con PostgreSQL |
| Agente tutor de IA (desacoplado) | `server/src/tutor/` | Adapter hacia un servicio de IA existente |

Patrones de diseño aplicados (ver `docs/`): Adapter, Factory Method, Strategy, Decorator y Builder (`tutor/index.js`); Facade y Observer (`services/SesionService.js`); State (`services/estados.js`, versión por tabla de transiciones); Chain of Responsibility (`middleware.js`).

## Cómo ejecutarlo
```bash
# 1. API
cd server && cp .env.example .env && npm install && npm start     # http://localhost:3000
# 2. Cliente (otra terminal)
cd client && npm install && npm run dev                            # http://localhost:5173
# 3. Pruebas unitarias
cd server && npm test
```
Sin `IA_API_KEY` el servidor usa un **tutor simulado**. Para usar el servicio real, define `IA_API_KEY` e `IA_MODEL` en `server/.env` (la clave nunca va al repositorio).

Usuarios de demostración (solo desarrollo): `estudiante@usc.edu.co` y `revisor@usc.edu.co`, clave `Demo1234`.

## API principal
`POST /api/auth/registro|login` · `GET /api/casos` · `GET /api/casos/:id` · `POST /api/sesiones` · `POST /api/sesiones/:id/decision` · `POST /api/sesiones/:id/evaluar` · `GET /api/sesiones/:id` · `POST /api/casos/:id/activar` (revisor) · `PUT /api/sesiones/:id/metricas` (revisor) · `GET /api/metricas/resumen` (revisor)

## Pendiente
- Reemplazar los 3 casos ficticios de `db.js` por el banco de **10 casos reales** (HAM10000 o docente) con licencia y desidentificación verificadas y revisión clínica (E2).
- Pantallas del Figma aún sin implementar: recuperación de contraseña, perfil y panel del estudiante, y vista del revisor.
- Envío de correo en recuperación de contraseña; política de bloqueo por intentos fallidos; escala de coherencia/pertinencia (hoy 0 a 5).
- Confirmar motor de base de datos (SQLite/PostgreSQL) en la revisión del diseño.

## Documentación
`docs/` contiene el acta, planes, SRS, arquitectura, informe de patrones y la matriz de pruebas unitarias.

## Equipo
Cristian Orlando Lasso Mulato · Jhon Steven Buitrago Quitiaquez · Harold Alexis Idrobo Puertocarrero · Jacobo Restrepo Cadavid · Juan Pablo Nieto Cobo
