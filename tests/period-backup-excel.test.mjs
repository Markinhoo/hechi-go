import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {generarExcelRespaldo} from '../src/utils/periodBackupExcel.js';
test('Excel backup preserves numeric scores, full history and literal names',async()=>{
 const buffer=await generarExcelRespaldo({id:'backup',nombre:'Grupo A',created_at:'2026-10-07T12:00:00Z',datos:{puntajes:{slytherin:12},puntajesPositivos:{slytherin:14},puntajesNegativos:{slytherin:2},alumnos:[{nombre:'=1+1',casaId:'slytherin',puntos:12,puntosPositivos:14,puntosNegativos:2,galeones:250,bestiario:['dragon'],bestiasUsadas:['dragon'],cartasGuardadas:[{numero:18,titulo:'Crecehuesos',descripcion:'Justifica una falta'}]}],historialCompleto:Array.from({length:125},(_,i)=>({alumno:'Alumno',carta:7,puntos:i,createdAt:'2026-10-07T12:00:00Z'}))}});
 assert.equal(Buffer.from(buffer).subarray(0,2).toString(),'PK');
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
 assert.deepEqual(book.worksheets.map(s=>s.name),['Resumen','Casas','Alumnos','Mochila','Historial','Auditoría']);
 assert.equal(book.getWorksheet('Alumnos').getCell('A2').value,'=1+1');
 assert.equal(book.getWorksheet('Alumnos').getCell('F2').value,250);
 assert.equal(book.getWorksheet('Historial').rowCount,126);
 assert.equal(book.getWorksheet('Mochila').getCell('D2').value,'Justifica una falta');
});
