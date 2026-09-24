import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomEntero, sortearCarta, pesosDisponibles, probabilidadesPorRacha } from './cardRandom.js';
import { CARTAS_ACTIVAS, CARTAS_PROBABILIDAD, TOTAL_PESO_CARTAS } from '../data/gameData.js';
import { brilloCarta } from '../data/cardVisuals.js';

test('todos los boletos dan exactamente 45/30/15/10 sin historial', (t) => {
  let valor = 0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = valor++; return buffer; });
  const conteos = new Map();
  for (let i=0; i<TOTAL_PESO_CARTAS*30; i+=1) {
    const carta=sortearCarta(CARTAS_ACTIVAS);
    conteos.set(carta,(conteos.get(carta) ?? 0)+1);
  }
  const categorias={comun:0,especial:0,epica:0,legendaria:0};
  for(const carta of CARTAS_PROBABILIDAD) {
    assert.equal(conteos.get(carta.numero),carta.peso*30);
    categorias[brilloCarta(carta.numero).nivel]+=conteos.get(carta.numero);
  }
  assert.equal(TOTAL_PESO_CARTAS,400);
  assert.deepEqual(categorias,{comun:5400,especial:3600,epica:1800,legendaria:1200});
  assert.equal(brilloCarta(3).nivel,'epica');
  assert.equal(brilloCarta(4).nivel,'epica');
  assert.equal(new Set(CARTAS_PROBABILIDAD.map(c=>c.numero)).size,CARTAS_ACTIVAS.length);
});

test('evita la última carta y reduce a la mitad las otras dos recientes', (t) => {
  let valor=0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valor++; return buffer; });
  // 1 and 7 become 18 each, 15 is excluded, 11 retains 36.
  const conteos={1:0,7:0,11:0,15:0};
  for(let i=0;i<pesosDisponibles([1,7,11,15],[1,7,11,15],[1,7,15]).reduce((s,c)=>s+c.peso,0);i+=1) conteos[sortearCarta([1,7,11,15],[1,7,11,15],[1,7,15])]+=1;
  assert.equal(conteos[1],conteos[7]); assert.equal(conteos[11],conteos[1]*2); assert.equal(conteos[15],0);
});

test('historial antiguo no penaliza; la penalización no se multiplica por repeticiones', (t) => {
  let valor=0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valor++; return buffer; });
  const conteos={1:0,7:0};
  for(let i=0;i<pesosDisponibles([1,7],[1,7],[7,1,1,15]).reduce((s,c)=>s+c.peso,0);i+=1) conteos[sortearCarta([1,7],[1,7],[7,1,1,15])]+=1;
  assert.equal(conteos[7],conteos[1]*2); assert.ok(conteos[1]>0);
});

test('las aperturas de otro alumno no heredan la exclusión', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=0; return buffer; });
  assert.equal(sortearCarta([1,7],[1,7],[1]),7);
  assert.equal(sortearCarta([1,7],[1,7],[]),1);
});

test('respeta elegibilidad y permite repetir si solo queda una carta', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=0; return buffer; });
  assert.equal(sortearCarta([1,15,16],[16,99],[16]),16);
  assert.equal(sortearCarta([1,15,16],[15,16],[1]),15);
  assert.throws(()=>sortearCarta([1],[]));
});

test('descarta valores que sesgarían el módulo', (t) => {
  const valores=[0xffffffff,5];
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valores.shift(); return buffer; });
  assert.equal(randomEntero(3),2);
  assert.throws(()=>randomEntero(0),RangeError);
});

test('legendarias disponibles desde la primera apertura y mejoras graduales por comunes', () => {
  assert.deepEqual(probabilidadesPorRacha([]),{comun:45,especial:30,epica:15,legendaria:10});
  let anterior=probabilidadesPorRacha([]);
  for(let n=1;n<=30;n+=1) {
    const actual=probabilidadesPorRacha(Array.from({length:n},(_,i)=>[1,7,11,15][i%4]));
    assert.equal(Object.values(actual).reduce((a,b)=>a+b),100);
    assert.ok(actual.comun<=anterior.comun);
    assert.ok(actual.epica>=anterior.epica && actual.legendaria>=anterior.legendaria);
    assert.ok(actual.comun>=5 && actual.legendaria<=30);
    anterior=actual;
  }
  const boletos=pesosDisponibles(CARTAS_ACTIVAS);
  assert.equal(boletos.filter(c=>brilloCarta(c.numero).nivel==='legendaria').reduce((s,c)=>s+c.peso,0)/
    boletos.reduce((s,c)=>s+c.peso,0),0.1);
});

test('épica reinicia la racha de comunes; legendaria reinicia toda la protección', () => {
  const comunes=Array(20).fill(1);
  const epica=probabilidadesPorRacha([...comunes,3]);
  assert.equal(epica.especial,30);
  assert.equal(epica.epica,15);
  assert.ok(epica.legendaria>10);
  assert.deepEqual(probabilidadesPorRacha([...comunes,8]),probabilidadesPorRacha([]));
  assert.deepEqual(probabilidadesPorRacha([]),{comun:45,especial:30,epica:15,legendaria:10});
});

test('los boletos siguen siendo enteros positivos en rachas largas y con exclusiones', () => {
  for(let n=0;n<=40;n+=1) {
    for(const ultima of CARTAS_ACTIVAS) {
      const h=[...Array(n).fill(1),ultima];
      const candidatos=pesosDisponibles(CARTAS_ACTIVAS,CARTAS_ACTIVAS.filter(c=>![8,13].includes(c)),h);
      assert.ok(candidatos.every(c=>Number.isInteger(c.peso) && c.peso>0));
      assert.ok(candidatos.every(c=>c.numero!==ultima && ![8,13].includes(c.numero)));
    }
  }
});
