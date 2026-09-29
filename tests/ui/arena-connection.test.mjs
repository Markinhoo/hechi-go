import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);

test('arena reconnects after leaving an active duel, catches expiry failures and stops after unmount',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`);
  await page.getByRole('button',{name:'Menú del duelo',exact:true}).click();
  await page.getByRole('button',{name:'Salir al listado de retos',exact:true}).click();
  for(const failure of ['returned','throw']) {
   await page.evaluate(mode=>{window.arenaFailure=mode;window.dispatchEvent(new Event('online'));},failure);
   await page.getByText('Se perdió la conexión. Reconectando el duelo…',{exact:true}).waitFor();
   assert.equal(await page.getByText('TypeError: Failed to fetch',{exact:true}).count(),0);
   await page.evaluate(()=>{window.arenaFailure=null;window.dispatchEvent(new Event('online'));});
   await page.waitForFunction(()=>!document.querySelector('.duel-error'));
  }
  // A background tab should neither poll nor issue expiry reads.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const count=await page.evaluate(()=>window.arenaCalls.length);
  await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>window.arenaCalls.length),count);
  await page.evaluate(()=>{delete document.hidden;window.expireArenaTurn();document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(previous=>window.arenaCalls.length>previous,count);
  await page.evaluate(()=>{window.arenaFailure='throw';window.dispatchEvent(new Event('online'));});
  await page.getByText('Se perdió la conexión. Reconectando el duelo…',{exact:true}).waitFor();
  await page.evaluate(()=>{window.arenaFailure=null;window.dispatchEvent(new Event('online'));});
  await page.waitForFunction(()=>!document.querySelector('.duel-error'));
  await page.evaluate(()=>window.unmountArena());
  const finalCount=await page.evaluate(()=>window.arenaCalls.length);
  await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>window.arenaCalls.length),finalCount);
  assert.deepEqual(errors,[]);
 } finally {await browser?.close();await server.close();}
});
