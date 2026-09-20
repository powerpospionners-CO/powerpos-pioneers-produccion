import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImpresionService } from './impresion.service';

@UseGuards(JwtAuthGuard)
@Controller('impresion')
export class ImpresionController {
  constructor(private readonly impresionService: ImpresionService) {}

  @Post('comanda')
  imprimirComanda(@Body() pedido: any, @Request() req: any) {
    return this.impresionService.imprimirComanda(pedido, req.user.empresaId);
  }

  @Post('ticket')
  imprimirTicket(@Body() pedido: any, @Request() req: any) {
    return this.impresionService.imprimirRecibo(pedido, req.user.empresaId);
  }

  @Post('abrir-cajon')
  abrirCajon() {
    return this.impresionService.abrirCajon();
  }
}