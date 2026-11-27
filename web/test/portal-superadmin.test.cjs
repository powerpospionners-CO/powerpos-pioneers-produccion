const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript');
const m={exports:{}};new Function('exports','module','process',ts.transpile(fs.readFileSync('lib/portal.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(m.exports,m,{env:{}});
const {portalSuperadmin}=m.exports;
test('el superadministrador que entra por el dominio de una empresa recibe el enlace al portal general',()=>{
 assert.equal(portalSuperadmin('enchilamarketpereira.powerpospioneers.com'),'https://app.powerpospioneers.com/login');
 assert.equal(portalSuperadmin('app.powerpospioneers.com'),null);
 assert.equal(portalSuperadmin('localhost:3001'),null);
 assert.equal(portalSuperadmin('a.b.powerpospioneers.com'),null);
 const login=fs.readFileSync('app/login/page.tsx','utf8');
 assert.match(login,/usuario\?\.rol === 'SUPERADMIN' \? portalSuperadmin\(window\.location\.host\)/);
});
