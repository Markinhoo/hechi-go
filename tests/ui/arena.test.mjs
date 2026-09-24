import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
test('mobile arena: duplicate cards, fusion, target selection and turn controls',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 let browser;
 try{
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html');
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).count(),2);
  await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).first().click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Fusionar e invocar',exact:true}).click();
  await page.getByRole('button',{name:'Tu espacio 1: Acromantula',exact:true}).click();
  await page.getByRole('button',{name:'Atacar espacio rival 1: carta oculta',exact:true}).click();
  await page.getByText('Combate completado',{exact:true}).first().waitFor();
  const calls=await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='accion_duelo_arena'));
  assert.deepEqual(calls.map(c=>c.args.p_accion),['invocar','atacar']);
  assert.equal(calls[0].args.p_datos.uid2,'two');
  assert.equal(calls[1].args.p_datos.objetivo,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
  await page.getByRole('button',{name:'Terminar turno',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Terminar turno',exact:true}).isDisabled(),true);
  await page.getByText('Cómo jugar · Mazo y fusiones',{exact:true}).click();
  assert.equal(await page.locator('.duel-catalog article').count(),24);

  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:700});
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html?teacher');
   await page.getByRole('button',{name:'Cerrar arena',exact:true}).click();
   await page.getByRole('button',{name:'Abrir arena',exact:true}).waitFor();
   const box=await page.getByRole('button',{name:'Arena',exact:true}).boundingBox();
   assert.ok(box.x>=0 && box.x+box.width<=width && box.y+box.height<=700,'teacher arena tab fits '+width+' '+JSON.stringify(box));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});