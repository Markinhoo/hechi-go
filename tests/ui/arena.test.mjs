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
  assert.equal(await page.locator('.duel-card strong').count(),0,'no repeated card names');
  assert.equal(await page.locator('.duel-card-back').getAttribute('src'),'/hechi/card-back.png');
  assert.equal(await page.locator('.house-cup-hero').count(),0);
  await page.getByRole('button',{name:/Invisibilidad, trampa:/}).click();
  await page.getByRole('button',{name:'Usar magia o trampa en espacio 1',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Invisibilidad, trampa preparada'}).locator('img').getAttribute('src'),'/hechi/card-back.png');
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).count(),2);
  await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).first().click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Fusionar e invocar',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Tu espacio 1: Acromantula',exact:true}).locator('.duel-card-stats b').count(),2);
  await page.getByRole('button',{name:'Tu espacio 1: Acromantula',exact:true}).click();
  await page.getByRole('button',{name:'Atacar espacio rival 1: carta oculta',exact:true}).click();
  await page.getByText('Combate completado',{exact:true}).first().waitFor();
  const calls=await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='accion_duelo_arena'));
  assert.deepEqual(calls.map(c=>c.args.p_accion),['hechizo','invocar','atacar']);
  assert.equal(calls[1].args.p_datos.uid2,'two');
  assert.equal(calls[2].args.p_datos.objetivo,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
  await page.getByText('Ahora juega tu rival',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Pasar sin atacar',exact:true}).isDisabled(),true);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.duel-turn-toast')).visibility==='hidden');
  await page.getByText('Cómo jugar · Mazo y fusiones',{exact:true}).click();
  assert.equal(await page.locator('.duel-catalog article').count(),30);

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
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html');
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:/Engorgio, magia:/}).click();
  await page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true}).click();
  await page.getByText('ATQ 1300',{exact:true}).waitFor();
  assert.ok((await page.locator('.duel-battlefield').boundingBox()).height<650,'battlefield stays compact on desktop');
  assert.match(await page.locator('.duel-arena').evaluate(el=>getComputedStyle(el).backgroundImage),/arena-castle/);
  if(process.env.ARENA_SCREENSHOT) await page.screenshot({path:process.env.ARENA_SCREENSHOT,type:'jpeg',quality:55});
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});