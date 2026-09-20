import { Body, Controller, Post, Request, Sse, UseGuards } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImpresionService } from './impresion.service';
import { ImpresionEventosService } from './impresion-eventos.service';
import { AgenteImpresionGuard } from './agente-impresion.guard';

@UseGuards(JwtAuthGuard)
@Controller('impresion')
export class ImpresionController {
  constructor(
    private readonly impresionService: ImpresionService,
    private readonly eventos: ImpresionEventosService,
  ) {}

  @Post('comanda')
  imprimirComanda(@Body() pedido: any, @Request() req: any) {
    return this.impresionService.imprimirComanda(pedido, req.user.empresaId);
  }

  @Post('ticket')
  imprimirTicket(@Body() pedido: any, @Request() req: any) {
    return this.impresionService.imprimirRecibo(pedido, req.user.empresaId);
  }

  @Post('abrir-cajon')
  abrirCajon(@Request() req: any) {
    return this.impresionService.abrirCajon(req.user.empresaId);
  }
}

// Canal aparte para el agente de impresión: no usa sesión de usuario (JWT de
// 8h), sino un token propio por empresa que no expira (ver AgenteImpresionGuard).
@Controller('impresion')
export class ImpresionAgenteController {
  constructor(private readonly eventos: ImpresionEventosService) {}

  @Sse('stream')
  @UseGuards(AgenteImpresionGuard)
  stream(@Request() req: any): Observable<MessageEvent> {
    return this.eventos.paraEmpresa(req.empresaId).pipe(map((trabajo) => ({ data: trabajo }) as MessageEvent));
  }

  @Post('confirmar')
  @UseGuards(AgenteImpresionGuard)
  confirmar(@Body() body: { id: string; ok: boolean; motivo?: string }) {
    this.eventos.confirmar(body.id, body.ok, body.motivo);
    return { recibido: true };
  }
}
