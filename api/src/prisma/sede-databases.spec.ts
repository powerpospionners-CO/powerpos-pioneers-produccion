import { RegistroBasesSede } from './sede-databases';
const control='postgresql://control:secret@central.example/control';
const destinos=[{empresaId:1,sucursalId:1,variable:'SEDE_UNO'},{empresaId:1,sucursalId:2,variable:'SEDE_DOS'}];
const variables={SEDE_UNO:'postgresql://uno:secret@host.example/sede1',SEDE_DOS:'postgresql://dos:secret@host.example/sede2'};
describe('Registro de bases físicas por sede',()=>{
  it('asigna bases distintas a dos sedes de la misma empresa',()=>{
    const r=new RegistroBasesSede(destinos,variables,control);
    expect(r.resolver({empresaId:1,sucursalId:1})).toBe(variables.SEDE_UNO);
    expect(r.resolver({empresaId:1,sucursalId:2})).toBe(variables.SEDE_DOS);
    expect(()=>r.resolver({empresaId:2,sucursalId:1})).toThrow('bloqueado');
  });
  it('impide reutilizar el control o una base cambiando usuario o esquema',()=>{
    expect(()=>new RegistroBasesSede(destinos,{...variables,SEDE_DOS:'postgresql://otro:password@host.example/sede1'},control)).toThrow('compartir');
    expect(()=>new RegistroBasesSede(destinos,{...variables,SEDE_UNO:control},control)).toThrow('compartir');
    expect(()=>new RegistroBasesSede(destinos,{...variables,SEDE_DOS:variables.SEDE_DOS+'?schema=otra'},control)).toThrow('independiente');
  });
  it('no considera que el endpoint de pooling sea otra base',()=>{
    expect(()=>new RegistroBasesSede(destinos,{...variables,SEDE_UNO:'postgresql://a:p@ep-test.neon.tech/neondb',SEDE_DOS:'postgresql://b:p@ep-test-pooler.neon.tech/neondb'},control)).toThrow('compartir');
  });
  it('rechaza destinos faltantes, duplicados y sedes activas sin cubrir',()=>{
    expect(()=>new RegistroBasesSede(destinos,{},control)).toThrow('Falta');
    expect(()=>new RegistroBasesSede([destinos[0],destinos[0]],variables,control)).toThrow('compartir');
    const r=new RegistroBasesSede(destinos,variables,control);
    expect(()=>r.verificarCobertura([{empresaId:1,id:3}])).toThrow('bloqueado');
  });
});
