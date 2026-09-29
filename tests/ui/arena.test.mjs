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
  page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html');
  assert.equal(await page.locator('.duel-card strong').count(),0,'no repeated card names');
  assert.equal(await page.locator('.duel-card-back').getAttribute('src'),'/hechi/card-back.png');
  assert.equal(await page.locator('.house-cup-hero').count(),0);
  assert.equal(await page.locator('.duel-hand .is-compatible').count(),4,'creatures and Engorgio glow when combinations are available');
  assert.equal(await page.locator('[data-uid="trap"].is-compatible').count(),0,'unrelated traps do not glow');
  const pairs=await page.locator('.duel-hand .duel-pair-tags > span').evaluateAll(tags=>tags.map(tag=>({number:tag.textContent,color:getComputedStyle(tag).backgroundColor})));
  for(const number of new Set(pairs.map(p=>p.number))) {
   const pair=pairs.filter(p=>p.number===number);assert.equal(pair.length,2);assert.equal(pair[0].color,pair[1].color);
  }
  await page.getByRole('button',{name:/Invisibilidad, trampa:/}).click();
  await page.getByRole('button',{name:'Usar magia o trampa en espacio 1',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Invisibilidad, trampa preparada'}).locator('img').getAttribute('src'),'/hechi/card-back.png');
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).count(),2);
  await page.getByRole('button',{name:'Doxy, ataque 1100, defensa 700',exact:true}).first().click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Colocar boca arriba',exact:true}).click();
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
  assert.equal(await page.getByRole('button',{name:'Terminar turno',exact:true}).isDisabled(),true);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.duel-turn-toast')).visibility==='hidden');
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
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
  await page.getByRole('button',{name:'Colocar boca arriba',exact:true}).click();
  await page.getByRole('button',{name:/Engorgio, magia:/}).click();
  await page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true}).click();
  await page.getByText('ATQ 1300',{exact:true}).waitFor();
  assert.ok((await page.locator('.duel-battlefield').boundingBox()).height<650,'battlefield stays compact on desktop');
  assert.match(await page.locator('.duel-arena').evaluate(el=>getComputedStyle(el).backgroundImage),/arena-castle/);
  if(process.env.ARENA_SCREENSHOT) await page.screenshot({path:process.env.ARENA_SCREENSHOT,type:'jpeg',quality:55});
  await page.setViewportSize({width:390,height:700});
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html?direct');
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Usar magia o trampa en espacio 5',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:/Poner boca/}).count(),0);
  assert.equal(await page.locator('.duel-card-preview, .duel-selection-options').count(),0);
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Girar carta a la derecha',exact:true}).click();
  await page.getByRole('button',{name:'Colocar boca abajo',exact:true}).click();
  const defender=page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true});
  assert.equal(await defender.getAttribute('data-position'),'ataque');
  await defender.click();
  assert.equal(await defender.getAttribute('data-position'),'ataque');
  await defender.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Tu espacio 1: Bowtruckle"]').dataset.position==='defensa');
  assert.notEqual(await defender.locator('.duel-card-face').evaluate(el=>getComputedStyle(el).transform),'none');
  assert.equal(await defender.locator('img').evaluate(el=>getComputedStyle(el).transform),'none');
  for(const [width,height] of [[320,568],[390,700],[430,932],[844,390],[1280,900]]) {
   await page.setViewportSize({width,height});
   const fit=await page.locator('.duel-fullscreen').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,hand:el.querySelector('.duel-hand').scrollWidth,handWidth:el.querySelector('.duel-hand').clientWidth,bottom:el.querySelector('.duel-turn').getBoundingClientRect().bottom}));
   assert.ok(fit.scroll<=fit.width && fit.scrollHeight<=fit.height && fit.hand<=fit.handWidth && fit.bottom<=height,'whole board fits '+width+'x'+height+' '+JSON.stringify(fit));
  }
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
  await page.getByText('Duelos recientes',{exact:true}).click();
  await page.getByRole('button',{name:'Salir al listado de retos',exact:true}).click();
  await page.getByRole('heading',{name:'Elige un rival',exact:true}).waitFor();
  assert.equal(await page.locator('.duel-fullscreen').count(),0);
  await page.getByRole('button',{name:'Reanudar duelo',exact:true}).click();
  assert.equal(await page.locator('.duel-fullscreen').count(),1);
  await page.reload();
  await page.getByRole('button',{name:'Bowtruckle, ataque 800, defensa 1400',exact:true}).click();
  await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Colocar boca arriba',exact:true}).click();
  await page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true}).click();
  await page.getByRole('button',{name:'Ataque directo en espacio rival 1',exact:true}).click();
  const direct=await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='accion_duelo_arena').at(-1));
  assert.equal(direct.args.p_accion,'atacar');assert.equal(direct.args.p_datos.objetivo,undefined);
  for (const order of [['one','boost'],['boost','one']]) {
   await page.reload();
   await page.locator('.duel-hand [data-uid="'+order[0]+'"]').click();
   await page.locator('.duel-hand [data-uid="'+order[1]+'"]').click();
   assert.equal(await page.locator('.duel-hand .is-selected').count(),2);
   await page.getByRole('button',{name:'Invocar en espacio 1',exact:true}).click();
  await page.getByRole('button',{name:'Colocar boca arriba',exact:true}).click();
   await page.getByText('ATQ 1300',{exact:true}).waitFor();
   const boost=await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='accion_duelo_arena').at(-1));
   assert.deepEqual([boost.args.p_datos.uid,boost.args.p_datos.uid2],order);
   assert.equal(await page.locator('.duel-hand .is-compatible').count(),0,'no glow after summon and magic are used');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
