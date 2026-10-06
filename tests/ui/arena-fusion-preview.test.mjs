import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
test('fusion preview shows result stats and only the actor sees the animation',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`);
  await page.getByRole('button',{name:'Bowtruckle, ataque 1200, defensa 1600',exact:true}).click();
  await page.getByRole('button',{name:'Doxy, ataque 1400, defensa 1000',exact:true}).first().click();
  await page.locator('.duel-message').filter({hasText:'Fusión: Acromantula · ATQ 1800 · DEF 1400'}).waitFor();
  const event={tipo:'fusion',actor:'b',ingredientes:['bowtruckle','doxy'],resultado:'acromantula'};
  const previous=await page.evaluate(()=>window.arenaCalls.length);
  await page.evaluate(e=>window.deliverCombatEvent(e),event);
  await page.waitForFunction(n=>window.arenaCalls.length>n,previous);
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole('dialog',{name:'Fusión de criaturas'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Terminar turno',exact:true}).isEnabled(),true);
  await page.evaluate(e=>window.deliverCombatEvent({...e,actor:'a'}),event);
  await page.getByRole('dialog',{name:'Fusión de criaturas'}).waitFor();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(250);
  assert.equal(await page.getByRole('dialog',{name:'Fusión de criaturas'}).count(),0,'polling does not replay either fusion');
 }finally{await browser?.close();await server.close();}
});
