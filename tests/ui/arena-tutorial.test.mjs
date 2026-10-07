import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

test('mobile tutorial completes with touch guidance, blocks wrong moves, and never writes to arena', async () => {
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700},hasTouch:true});
  page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`;
  await page.goto(url+'?lobby');
  await page.getByRole('button',{name:'Tutorial contra la computadora',exact:true}).click();
  const tutorial=page.getByRole('region',{name:'Tutorial contra la computadora',exact:true});
  const stage=async s=>{await page.waitForFunction(s=>document.querySelector('.duel-tutorial')?.dataset.step===s,s);};
  const button=name=>page.getByRole('button',{name,exact:true});
  const hand=uid=>page.locator(`.duel-tutorial .duel-hand [data-uid="${uid}"]`);
  await button('Comenzar tutorial').click();await stage('summon');
  assert.equal(await hand('boost').isDisabled(),true);
  await page.locator('.tutorial-footer button').dispatchEvent('click');await stage('summon');
  // A real touch drag moves the whole card onto the highlighted slot.
  const cdp=await page.context().newCDPSession(page);
  const from=await hand('owl').boundingBox(),to=await button('Invocar en espacio 1').boundingBox();
  const x=from.x+from.width*.3,y=from.y+from.height*.65,tx=to.x+to.width/2,ty=to.y+to.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty}]});
  await page.locator('.duel-drag-ghost .duel-card-face').waitFor();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await stage('flip');
  assert.equal(await button('Colocar boca abajo').isDisabled(),true);
  await button('Girar carta de entrenamiento').click();await stage('place');
  await button('Colocar boca abajo').click();await stage('cpuOpening');await stage('inspect');
  const owl=button('Tu criatura 1: Lechuza');
  await owl.dispatchEvent('click');await stage('inspect');
  const pos=await owl.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pos.x+pos.width/2,y:pos.y+pos.height/2}]});
  await page.getByRole('dialog',{name:'Tu carta boca abajo'}).waitFor();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await button('Cerrar vista de carta').click();await stage('selectDefense');
  await owl.click();await stage('defense');await owl.click();await stage('trap');
  assert.equal(await owl.getAttribute('data-position'),'defensa');
  await hand('trap').click();await stage('trapDrop');await button('Preparar trampa 1').click();await stage('endTurn');
  await button('Terminar turno').click();await stage('cpuTrap');await stage('fusionFirst');
  await hand('bow').click();await stage('fusionSecond');await hand('doxy').click();await stage('fusionDrop');
  assert.match(await page.locator('.tutorial-footer').textContent(),/Acromántula · ATQ 1800/);
  await button('Invocar en espacio 2').click();await stage('fusionConfirm');await button('Confirmar fusión').click();await stage('boost');
  await hand('boost').click();await stage('boostTarget');
  const fusion=page.locator('.duel-tutorial [data-uid="fusion"]');
  await fusion.click();await stage('attackSelect');await fusion.click();await stage('attackTarget');
  await button('Atacar rival 1: Doxy').click();await stage('directSelect');
  assert.match(await page.locator('.tutorial-header').textContent(),/VIDA 3100/);
  await owl.click();await stage('directTarget');await button('Ataque directo 1').click();await stage('cpuRebound');await stage('finalSelect');
  assert.match(await page.locator('.tutorial-header').textContent(),/VIDA 800/);
  await fusion.click();await stage('finalTarget');await button('Ataque directo 1').click();await stage('complete');
  assert.match(await page.locator('.tutorial-header').textContent(),/VIDA 0/);
  await button('Volver a buscar rivales').click();await page.getByRole('heading',{name:'Elige un rival'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.arenaCalls.filter(c=>c.method!=='obtener_arena')),[]);
  for(const [width,height] of [[320,568],[390,700],[844,390]]) {
   await page.setViewportSize({width,height});
   await button('Tutorial contra la computadora').click();await button('Comenzar tutorial').click();await stage('summon');
   const fit=await tutorial.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,bottom:el.querySelector('.tutorial-footer').getBoundingClientRect().bottom}));
   assert.ok(fit.scroll<=fit.width && fit.scrollHeight<=fit.height && fit.bottom<=height,'fits '+width+'x'+height+JSON.stringify(fit));
   if(width===390 && process.env.TUTORIAL_SCREENSHOT) await page.screenshot({path:process.env.TUTORIAL_SCREENSHOT});
   await button('Salir del tutorial').click();
  }
  await page.goto(url);await button('Menú del duelo').click();await button('Salir al listado de retos').click();
  assert.equal(await button('Tutorial contra la computadora').isDisabled(),true,'cannot interrupt a real duel');
  assert.deepEqual(errors,[]);
 } finally { await browser?.close();await server.close(); }
});
