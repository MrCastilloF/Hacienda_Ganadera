import 'reflect-metadata';
import { bootstrap } from './bootstrap';

bootstrap().catch((error) => {
  console.error('No se pudo iniciar la API:', error);
  process.exit(1);
});
