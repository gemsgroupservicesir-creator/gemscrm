import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(projectRoot, 'dist');
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
app.use(express.static(distDirectory));
app.use((request, response, next) => {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || !request.accepts('html')) {
    return next();
  }
  response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`GEMS site listening on port ${port}`);
});
