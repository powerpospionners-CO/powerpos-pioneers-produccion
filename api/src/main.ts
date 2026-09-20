import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const uploadsPath = path.join(process.cwd(), 'uploads');
  // multer no crea el directorio de destino por sí solo: en un servidor nuevo
  // (sin subidas previas) la primera carga de logo fallaría sin esto.
  fs.mkdirSync(path.join(uploadsPath, 'logos'), { recursive: true });
  console.log('Sirviendo archivos estáticos desde:', uploadsPath);

  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();