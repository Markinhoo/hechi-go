import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leerConexion,actualizarConexion,iniciarPeticion,terminarPeticion,rpcEsLectura } from './connectionStore.js';
test('failed writes remain visible after successful polling and pending writes retain revision',()=>{
 actualizarConexion({conexion:'conectado',pendientes:0,revision:0,errorGuardado:'',guardadoEn:0});
 iniciarPeticion(true);
 assert.equal(leerConexion().pendientes,1);assert.equal(leerConexion().revision,1);
 terminarPeticion(true,new Error('offline'),true);
 assert.equal(leerConexion().conexion,'reconectando');assert.equal(leerConexion().guardadoEn,0);
 terminarPeticion(false,null);
 assert.ok(leerConexion().errorGuardado.includes('No se confirmó'));
 iniciarPeticion(true);terminarPeticion(true,null);
 assert.equal(leerConexion().errorGuardado,'');assert.ok(leerConexion().guardadoEn>0);
 assert.equal(leerConexion().pendientes,0);assert.equal(leerConexion().revision,4);
 assert.equal(rpcEsLectura('cargar_clase_vista'),true);
 assert.equal(rpcEsLectura('obtener_respaldo_parcial'),true);
 assert.equal(rpcEsLectura('reiniciar_clase_con_respaldo'),false);
});