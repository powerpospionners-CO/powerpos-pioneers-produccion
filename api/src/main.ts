import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';
import { directorioUploads } from './storage/uploads';
import { verificarUploads } from './storage/verificar-uploads';
import { archivosRespaldo } from './storage/hostinger-uploads-manifest';
import { origenPermitido } from './seguridad/origenes';
import { validarDespliegue } from './seguridad/despliegue';

async function bootstrap() {
  const proxies = validarDespliegue(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  if (proxies.length) app.set('trust proxy', proxies);

  app.enableCors({
    origin: (origen, callback) => callback(null, origenPermitido(origen, process.env.NODE_ENV !== 'production')),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-PowerPOS-Desktop'],
  });

  const uploadsPath = directorioUploads();
  // multer no crea el directorio de destino por sí solo: en un servidor nuevo
  // (sin subidas previas) la primera carga de logo fallaría sin esto.
  fs.mkdirSync(path.join(uploadsPath, 'logos'), { recursive: true });
  fs.mkdirSync(path.join(uploadsPath, 'anuncios'), { recursive: true });
  fs.mkdirSync(path.join(uploadsPath, 'productos'), { recursive: true });
  fs.mkdirSync(path.join(uploadsPath, 'catalogo'), { recursive: true });
  if (process.env.VERIFICAR_RESPALDO_UPLOADS === 'true') {
    if (process.env.BACKGROUND_JOBS_ENABLED !== 'false') throw new Error('La verificación del respaldo requiere modo de ensayo');
    console.log('Respaldo de imágenes:', await verificarUploads(uploadsPath, archivosRespaldo, process.env.RESTAURAR_IMAGENES_MIGRACION === 'true'));
  }
  console.log('Sirviendo archivos estáticos desde:', uploadsPath);

  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
