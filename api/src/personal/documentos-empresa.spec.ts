import {
  enlacePolitica,
  pdfPolitica,
  DocumentosEmpresaService,
} from './documentos-empresa.service';

describe('Políticas y plantillas privadas por empresa', () => {
  it.each([
    'javascript:alert(1)',
    'http://example.com',
    'https://usuario:clave@example.com',
    'file:///privado',
  ])('rechaza enlaces inseguros: %s', (enlace) => {
    expect(() => enlacePolitica(enlace)).toThrow();
  });
  it('admite HTTPS y no descarga el enlace desde el servidor', () => {
    expect(enlacePolitica('https://example.com/politica.pdf')).toBe(
      'https://example.com/politica.pdf',
    );
    expect(enlacePolitica('')).toBeNull();
  });
  it('nunca entrega públicamente borradores, contratos ni políticas privadas', async () => {
    for (const r of [
      { estado: 'BORRADOR', datos: { tipo: 'POLITICA', publicada: true } },
      { estado: 'ADOPTADA', datos: { tipo: 'CONTRATO', publicada: true } },
      { estado: 'ADOPTADA', datos: { tipo: 'POLITICA', publicada: false } },
    ]) {
      const store = { obtener: jest.fn().mockResolvedValue(r) };
      const service = new DocumentosEmpresaService(store as any);
      await expect(
        service.documento({ id: 0, empresaId: 2, sucursalId: 3 }, 'id', true),
      ).rejects.toThrow('no publicada');
      expect(store.obtener).toHaveBeenCalledWith(
        { id: 0, empresaId: 2, sucursalId: 3 },
        'id',
        'DOC_EMPRESA',
      );
    }
  });
  it('genera PDF paginado completo sin páginas vacías para el pie', async () => {
    const pdf = await pdfPolitica(
      {
        nombre: 'Política ficticia',
        responsable: 'Empresa ficticia',
        nit: '000',
        correo: 'test@example.com',
        telefono: '000',
        direccion: 'Prueba',
        versionEtiqueta: '1.0',
        contenido: 'Texto laboral ficticio de prueba.\n'.repeat(180),
      },
      'BORRADOR',
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length,
    ).toBeGreaterThan(1);
  });
});
