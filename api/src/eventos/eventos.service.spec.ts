import { EventosService } from './eventos.service';
import { ImpresionEventosService } from '../impresion/impresion-eventos.service';
import { contextoSede } from '../prisma/sede-context';
import { EventoSistema } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrabajoImpresion } from '../impresion/impresion-eventos.service';

// Almacén compartido: dos servicios independientes compiten por el mismo trabajo.
function almacen() {
  const filas: EventoSistema[] = [];
  const coincide = (
    fila: EventoSistema,
    where: Record<string, unknown>,
  ): boolean =>
    Object.entries(where).every(([campo, valor]) => {
      const actual = (fila as unknown as Record<string, unknown>)[campo];
      if (valor && typeof valor === 'object') {
        if ('gt' in valor)
          return (
            actual instanceof Date &&
            valor.gt instanceof Date &&
            actual > valor.gt
          );
        if ('notIn' in valor)
          return Array.isArray(valor.notIn) && !valor.notIn.includes(actual);
        if ('not' in valor) return actual !== valor.not;
        if ('equals' in valor) return actual === null;
      }
      return actual === valor;
    });
  const tabla = {
    create: jest.fn(
      ({
        data,
      }: {
        data: Pick<
          EventoSistema,
          'empresaId' | 'sucursalId' | 'canal' | 'datos' | 'venceEn'
        > &
          Partial<EventoSistema>;
      }) => {
        const fila: EventoSistema = {
          id: `evento-${filas.length}`,
          reclamadoEn: null,
          confirmacion: null,
          creadoEn: new Date(),
          ...data,
        };
        filas.push(fila);
        return Promise.resolve(fila);
      },
    ),
    findMany: jest.fn(
      ({ where, take }: { where: Record<string, unknown>; take: number }) =>
        Promise.resolve(
          filas
            .filter((f) => coincide(f, where))
            .slice(0, take)
            .map((f) => ({ ...f })),
        ),
    ),
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(filas.find((f) => coincide(f, where))),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<EventoSistema>;
      }) => {
        const seleccion = filas.filter((f) => coincide(f, where));
        seleccion.forEach((f) => Object.assign(f, data));
        return Promise.resolve({ count: seleccion.length });
      },
    ),
  };
  return {
    db: { eventoSistema: tabla } as unknown as PrismaService,
    filas,
    tabla,
  };
}

describe('Canal persistente compartido', () => {
  const original = process.env.EVENTOS_COMPARTIDOS;
  beforeEach(() => {
    process.env.EVENTOS_COMPARTIDOS = 'true';
    jest.useFakeTimers();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.EVENTOS_COMPARTIDOS;
    else process.env.EVENTOS_COMPARTIDOS = original;
    jest.useRealTimers();
  });
  it('dos agentes y dos procesos entregan una sola vez y confirman en otro proceso', async () => {
    const { db, filas } = almacen();
    const a = new ImpresionEventosService(new EventosService(db));
    const b = new ImpresionEventosService(new EventosService(db));
    const trabajos: TrabajoImpresion[] = [];
    const consumir = (trabajo: TrabajoImpresion) => {
      trabajos.push(trabajo);
      void b.confirmar(trabajo.id, true, undefined, 1);
    };
    const s1 = a.paraEmpresa(1).subscribe(consumir),
      s2 = b.paraEmpresa(1).subscribe(consumir);
    try {
      const resultado = a.enviarYEsperar(
        1,
        'TICKET',
        Buffer.from('hola'),
        2000,
      );
      await jest.advanceTimersByTimeAsync(1000);
      await expect(resultado).resolves.toMatchObject({ ok: true });
      expect(trabajos).toHaveLength(1);
      expect(filas[0].reclamadoEn).toBeInstanceOf(Date);
      expect(filas[0].confirmacion).toEqual({ ok: true });
    } finally {
      s1.unsubscribe();
      s2.unsubscribe();
    }
    expect(jest.getTimerCount()).toBe(0);
  });
  it('no reentrega un trabajo reclamado al reiniciar el consumidor', async () => {
    const { db } = almacen(),
      canal = new EventosService(db);
    await canal.publicar(1, 'IMPRESION', { id: 'uno' }, 10000, 'uno');
    const recibidos: unknown[] = [];
    const primero = canal
      .escuchar(1, 'IMPRESION', true)
      .subscribe((e) => recibidos.push(e));
    await jest.advanceTimersByTimeAsync(1);
    primero.unsubscribe();
    const nuevo = new EventosService(db)
      .escuchar(1, 'IMPRESION', true)
      .subscribe((e) => recibidos.push(e));
    try {
      await jest.advanceTimersByTimeAsync(1000);
      expect(recibidos).toHaveLength(1);
    } finally {
      nuevo.unsubscribe();
    }
  });
  it('no permite entregar ni confirmar trabajos de otra empresa o sede', async () => {
    const { db, filas } = almacen(),
      canal = new EventosService(db);
    const scope = { empresaId: 1, sucursalId: 4, cliente: db };
    await contextoSede.run(scope, () =>
      canal.publicar(1, 'IMPRESION', { id: 'uno' }, 10000, 'uno'),
    );
    filas[0].reclamadoEn = new Date();
    await contextoSede.run({ ...scope, sucursalId: 5 }, () =>
      canal.confirmar(1, 'uno', { ok: true }),
    );
    await contextoSede
      .run(scope, () => canal.confirmar(2, 'uno', { ok: true }))
      .catch(() => undefined);
    expect(filas[0].confirmacion).toBeNull();
    expect(() =>
      contextoSede.run(scope, () => canal.escuchar(2, 'IMPRESION', true)),
    ).toThrow('fuera de la empresa');
  });
  it('vence trabajos sin agente y no los imprime al reconectar', async () => {
    const { db } = almacen(),
      canal = new EventosService(db);
    const emisor = new ImpresionEventosService(canal);
    const resultado = emisor.enviarYEsperar(
      1,
      'TICKET',
      Buffer.from('hola'),
      200,
    );
    await jest.advanceTimersByTimeAsync(201);
    await expect(resultado).resolves.toMatchObject({ ok: false });
    const recibidos: unknown[] = [],
      sub = canal
        .escuchar(1, 'IMPRESION', true)
        .subscribe((e) => recibidos.push(e));
    try {
      await jest.advanceTimersByTimeAsync(500);
      expect(recibidos).toHaveLength(0);
    } finally {
      sub.unsubscribe();
    }
  });
});
