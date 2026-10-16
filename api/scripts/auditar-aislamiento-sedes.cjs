// Read-only audit: no database creation, copying, updates, or routing changes.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const quote = value => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Identificador inesperado');
  return `"${value}"`;
};
const models = Prisma.dmmf.datamodel.models;
const database = new PrismaClient();
async function audit() {
  return database.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const rows = new Map(), owners = new Map(), ambiguous = new Set(), indices = new Map();
    let totalRows = 0;
    const parentOf = (relation, row) => {
      const name = `${relation.type}:${relation.relationToFields.join(',')}`;
      if (!indices.has(name)) indices.set(name, new Map(rows.get(relation.type).map(parent=>[JSON.stringify(relation.relationToFields.map(key=>parent[key])),parent])));
      return indices.get(name).get(JSON.stringify(relation.relationFromFields.map(key=>row[key])));
    };
    for (const model of models) {
      const needed = new Set(['id']);
      for (const field of model.fields) {
        if (['empresaId', 'sucursalId'].includes(field.name)) needed.add(field.name);
        for (const name of field.relationFromFields || []) needed.add(name);
      }
      const fields = model.fields.filter(f => needed.has(f.name) && f.kind !== 'object');
      const select = fields.map(f=>`${quote(f.dbName || f.name)} AS ${quote(f.name)}`).join(',');
      const data = await tx.$queryRawUnsafe(`SELECT ${select} FROM ${quote(model.dbName || model.name)} LIMIT 50001`);
      totalRows += data.length;
      if (data.length > 50000 || totalRows > 250000) throw new Error('El diagnóstico requiere ejecución por lotes');
      rows.set(model.name, data);
      owners.set(model.name, new Map(data.map(row => [row.id, model.name === 'Empresa' ? row.id : row.empresaId ?? null])));
    }
    // Infer ownership for child tables using business parents, excluding identity actors.
    for (let iteration = 0; iteration < models.length; iteration++) {
      let changed = false;
      for (const model of models) {
        if (model.fields.some(f=>f.name === 'empresaId') || model.name === 'Empresa') continue;
        const relations = model.fields.filter(f=>f.kind === 'object' && f.relationFromFields?.length && f.type !== 'Usuario');
        for (const row of rows.get(model.name)) {
          if (owners.get(model.name).get(row.id) !== null) continue;
          const candidates = new Set();
          for (const relation of relations) {
            const parent = parentOf(relation, row);
            const company = parent && owners.get(relation.type).get(parent.id);
            if (company !== null && company !== undefined) candidates.add(company);
          }
          if (candidates.size === 1) { owners.get(model.name).set(row.id,[...candidates][0]); changed = true; }
          if (candidates.size > 1) ambiguous.add(`${model.name}:${row.id}`);
        }
      }
      if (!changed) break;
    }
    const inconsistencies = [...ambiguous].map(clave=>({clave,tipo:'EMPRESAS_MULTIPLES'})), unresolved = [];
    for (const model of models) {
      const unknown = rows.get(model.name).filter(r=>owners.get(model.name).get(r.id) === null);
      if (unknown.length) unresolved.push({ modelo: model.name, registrosSinEmpresa: unknown.length });
      for (const row of rows.get(model.name)) {
        const company = owners.get(model.name).get(row.id);
        if (company === null) continue;
        for (const relation of model.fields.filter(f=>f.kind==='object' && f.relationFromFields?.length)) {
          if (relation.relationFromFields.some(key=>row[key] === null)) continue;
          const parent = parentOf(relation, row);
          const parentCompany = parent && owners.get(relation.type).get(parent.id);
          if (!parent || (parentCompany !== null && parentCompany !== undefined && parentCompany !== company)) inconsistencies.push({ modelo:model.name, id:row.id, relacion:relation.name, tipo:parent ? 'EMPRESA_DISTINTA' : 'REFERENCIA_AUSENTE' });
        }
      }
    }
    const branches = rows.get('Sucursal').map(s=>({empresaId:s.empresaId,sucursalId:s.id}));
    return {
      verificadoEn: new Date().toISOString(), soloLectura: true,
      modelosRevisados: models.length, sedes: branches,
      referenciasInconsistentes: inconsistencies,
      registrosDeControlOAlcancePendiente: unresolved,
      aislamientoFisicoActivado: false,
      aviso: 'Este diagnóstico no autoriza copiar tablas globales ni sustituye la validación por sede, los saldos, las huellas y el corte de escrituras.',
    };
  }, { isolationLevel: 'RepeatableRead', timeout: 90000 });
}
audit().then(result=>{ console.log(JSON.stringify(result,null,2)); if (result.referenciasInconsistentes.length) process.exitCode=1; })
  .catch(()=>{ console.error('No se pudo completar el diagnóstico de aislamiento; no se modificaron datos.'); process.exitCode=1; })
  .finally(()=>database.$disconnect());
