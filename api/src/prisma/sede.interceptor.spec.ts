import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { firstValueFrom, of } from 'rxjs';
import { PrismaService } from './prisma.service';
import { SedeInterceptor } from './sede.interceptor';

describe('Branch cutover barrier',()=>{
  const handler={handle:()=>of('ok')};
  function contexto(url:string,sse=false){
    const method=()=>undefined;
    if(sse)Reflect.defineMetadata(SSE_METADATA,true,method);
    return {switchToHttp:()=>({getRequest:()=>({method:'GET',url})}),getHandler:()=>method} as unknown as ExecutionContext;
  }
  function prisma(suspendidas=false){
    return {aislamientoActivo:false,estadoAislamiento:jest.fn(async()=>({activo:false,escriturasSuspendidas:suspendidas})),conEscritura:jest.fn(async(_origen:string,trabajo:()=>Promise<unknown>)=>trabajo())};
  }
  it('drains GET handlers as well as writes before the initial copy',async()=>{
    const db=prisma();
    await expect(firstValueFrom(new SedeInterceptor(db as unknown as PrismaService).intercept(contexto('/inventario'),handler))).resolves.toBe('ok');
    expect(db.conEscritura).toHaveBeenCalledTimes(1);
  });
  it('blocks reads during the copy while retaining the health endpoint',async()=>{
    const db=prisma(true),interceptor=new SedeInterceptor(db as unknown as PrismaService);
    await expect(firstValueFrom(interceptor.intercept(contexto('/inventario'),handler))).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(firstValueFrom(interceptor.intercept(contexto('/'),handler))).resolves.toBe('ok');
    expect(db.conEscritura).not.toHaveBeenCalled();
  });
  it('does not retain a permanent cutover lease for an event stream',async()=>{
    const db=prisma();
    await expect(firstValueFrom(new SedeInterceptor(db as unknown as PrismaService).intercept(contexto('/pedidos/eventos',true),handler))).resolves.toBe('ok');
    expect(db.conEscritura).not.toHaveBeenCalled();
  });
});
