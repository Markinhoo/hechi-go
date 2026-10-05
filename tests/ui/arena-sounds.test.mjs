import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { combatSoundCues } from '../../src/utils/duelSounds.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);

test('arena audio: real synthesis, placement, flip, saber impact, skip and persisted mute',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  await page.addInitScript(()=>{
   window.audioDurations=[];
   const Native=window.AudioContext;
   window.AudioContext=class extends Native {
    createBuffer(channels,length,rate){window.audioDurations.push(Math.round(length/rate*1000));return super.createBuffer(channels,length,rate);}
   };
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`);
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar menú',exact:true}).click();
  await page.getByRole('button',{name:'Bowtruckle, ataque 1200, defensa 1600',exact:true}).click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Girar carta a la derecha',exact:true}).click();
  await page.getByRole('button',{name:'Colocar boca abajo',exact:true}).click();
  await page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true}).waitFor();
  const sounds=await page.evaluate(()=>window.audioDurations);
  for(const duration of [45,160,130]) assert.ok(sounds.includes(duration),`missing sound duration ${duration}`);
  const event={actor:'a',atacante:{id:'dragon'},defensor:{id:'bowtruckle',posicion:'ataque'},ataque:2500,defensa:1200,danoActor:0,danoRival:1300,destruidoRival:true};
  await page.evaluate(e=>{window.audioDurations=[];window.deliverCombatEvent(e);},event);
  await page.waitForFunction(()=>window.audioDurations.includes(480));
  assert.ok((await page.evaluate(()=>window.audioDurations)).includes(240));
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.evaluate(e=>{window.audioDurations=[];window.deliverCombatEvent(e);},event);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.waitForTimeout(1100);
  assert.equal((await page.evaluate(()=>window.audioDurations)).includes(480),false,'skip cancels pending saber sound');
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
  await page.getByRole('button',{name:'Sonido: activado',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar menú',exact:true}).click();
  await page.evaluate(e=>{window.audioDurations=[];window.deliverCombatEvent(e);},event);
  await page.getByRole('button',{name:'Continuar',exact:true}).waitFor();
  await page.waitForTimeout(1100);
  assert.deepEqual(await page.evaluate(()=>window.audioDurations),[],'mute prevents playback');
  await page.reload();
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
  await page.getByRole('button',{name:'Sonido: silenciado',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});

test('combat sounds distinguish rebound destruction, traps and direct attacks',()=>{
 assert.deepEqual(combatSoundCues({directo:true}),[[0,'attack']]);
 assert.deepEqual(combatSoundCues({trampa:'confundo',destruidoRival:true}),[[650,'flip']]);
 assert.deepEqual(combatSoundCues({defensor:{posicion:'ataque'},danoActor:500,ataque:1000,defensa:1500,destruidoActor:true}),[[400,'attack'],[1100,'attack'],[1500,'slash']]);
 assert.deepEqual(combatSoundCues({destruidoActor:true,destruidoRival:true}),[[400,'attack'],[900,'slash']]);
});
