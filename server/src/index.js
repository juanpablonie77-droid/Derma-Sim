import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { router } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/imagenes', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/imagenes')));
app.use('/api', router);
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Derma-Sim API en http://localhost:${port}`));
