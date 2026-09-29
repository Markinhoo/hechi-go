import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);

test('combat effects: counterattack, falling fragments and direct field flash on the correct side',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`);
  await page.locator('.duel-battlefield').waitFor();
  const lose={actor:'a',atacante:{id:'bowtruckle'},defensor:{id:'dragon',posicion:'ataque'},ataque:800,defensa:2800,danoActor:2000,danoRival:0,destruidoActor:true,destruidoRival:false};
  const send=event=>page.evaluate(e=>window.deliverCombatEvent(e),event);
  const close=()=>page.getByRole('button',{name:'Continuar',exact:true}).click();
  await send(lose);
  await page.locator('.is-rebound').waitFor();
  assert.equal(await page.locator('.combat-return-beam').count(),1);
  await page.getByText('−2000 de vida para ti',{exact:true}).waitFor();
  assert.equal(await page.locator('.combat-attacker .combat-shards img').count(),12);
  assert.equal(await page.locator('.combat-defender .combat-shards').count(),0);
  await close();
  await send({...lose,ataque:2800,defensa:800,danoActor:0,danoRival:2000,destruidoActor:false,destruidoRival:true});
  await page.locator('.combat-defender .combat-shards').waitFor({state:'attached'});
  assert.equal(await page.locator('.combat-defender .combat-shards img').count(),12);
  assert.equal(await page.locator('.is-rebound').count(),0);
  assert.equal(await page.locator('.combat-defender').evaluate(el=>getComputedStyle(el,'::after').animationName),'attack-light');
  if(process.env.EFFECT_SCREENSHOT){await page.waitForTimeout(1200);await page.screenshot({path:process.env.EFFECT_SCREENSHOT});}
  await close();
  await send({...lose,defensor:{id:'dragon',posicion:'defensa'},destruidoActor:false});
  await page.getByRole('dialog',{name:'Resolución del combate'}).waitFor();
  assert.equal(await page.locator('.is-rebound,.combat-shards').count(),0,'losing against defense does not trigger an attack-mode counterattack or destruction');
  await close();
  for(const actor of ['a','b']) {
   await send({actor,atacante:{id:'dragon'},directo:true,danoActor:0,danoRival:2800});
   const field=actor==='a'?'Campo rival':'Tu campo';
   await page.locator(`[aria-label="${field}"] .duel-direct-flash`).waitFor();
   assert.equal(await page.getByRole('dialog').count(),0,'direct attack does not open a combat screen');
   await page.waitForFunction(()=>!document.querySelector('.duel-direct-flash'));
  }
  await send({...lose,trampa:'hechizo-patronus',destruidoActor:false,defensor:{oculta:true},danoActor:400});
  await page.getByRole('dialog',{name:'Resolución del combate'}).waitFor();
  assert.equal(await page.locator('.is-rebound,.combat-shards').count(),0,'trap reflection is not a creature counterattack');
  await close();
  await page.emulateMedia({reducedMotion:'reduce'});
  await send(lose);await page.locator('.is-rebound').waitFor();
  assert.equal(await page.locator('.combat-return-beam').isVisible(),false);
  assert.equal(await page.locator('.combat-shards').isVisible(),false);
  assert.deepEqual(errors,[]);
 } finally {await browser?.close();await server.close();}
});
