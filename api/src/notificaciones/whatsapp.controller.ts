import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  ForbiddenException,
  HttpCode,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { WhatsappService } from './whatsapp.service';

export function firmaValida(
  raw: Buffer | undefined,
  firma: unknown,
  secreto: string | undefined,
) {
  if (
    !raw ||
    !secreto ||
    typeof firma !== 'string' ||
    !/^sha256=[a-f0-9]{64}$/.test(firma)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(firma.slice(7), 'hex'),
    createHmac('sha256', secreto).update(raw).digest(),
  );
}

@Controller('webhooks/whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  verificar(@Query() q: Record<string, unknown>, @Res() res: Response) {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (
      !token ||
      q['hub.mode'] !== 'subscribe' ||
      q['hub.verify_token'] !== token ||
      typeof q['hub.challenge'] !== 'string'
    )
      throw new ForbiddenException('Verificación no válida');
    return res.type('text/plain').status(200).send(q['hub.challenge']);
  }

  @Post()
  @HttpCode(200)
  async recibir(@Req() req: RawBodyRequest<Request>) {
    if (
      !firmaValida(
        req.rawBody,
        req.headers['x-hub-signature-256'],
        process.env.WHATSAPP_APP_SECRET,
      )
    )
      throw new ForbiddenException('Firma no válida');
    if (req.body?.object === 'whatsapp_business_account')
      await this.whatsapp.registrarEstados(req.body);
    return { recibido: true };
  }
}
