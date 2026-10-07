import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
test('challenge wager caps, invitation consent, and tutorial only after leaving results',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:740}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/arena.html`;
  await page.goto(url+'?lobby');
  await page.locator('.duel-rivals > div').filter({hasText:'María López'}).getByRole('button',{name:'Retar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Apuesta del reto'}),input=dialog.getByRole('spinbutton');
  assert.match(await dialog.textContent(),/120 galeones/);assert.equal(await input.getAttribute('max'),'40');
  await input.fill('41');assert.equal(await dialog.getByRole('button',{name:'Enviar reto',exact:true}).isDisabled(),true);
  await input.fill('1.5');assert.equal(await dialog.getByRole('button',{name:'Enviar reto',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:'Apostar máximo'}).click();assert.equal(await input.inputValue(),'40');
  await input.fill('1');await dialog.getByRole('button',{name:'Enviar reto',exact:true}).click();
  await page.getByText(/Apuesta: 1 galeones por alumno/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Tutorial contra la computadora',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.arenaCalls.find(c=>c.method==='retar_arena').args.p_apuesta),1);
  await page.evaluate(()=>window.finishArena());await page.getByText('¡Victoria!',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Tutorial contra la computadora',exact:true}).count(),0);
  assert.match(await page.locator('.duel-invite').textContent(),/Fondo recibido: 2/);
  await page.getByRole('button',{name:'Volver a los retos',exact:true}).click();
  await page.getByRole('button',{name:'Tutorial contra la computadora',exact:true}).waitFor();
  await page.locator('.duel-rivals > div').filter({hasText:'Ana Torres'}).getByRole('button',{name:'Retar',exact:true}).click();
  assert.equal(await input.getAttribute('max'),'0');assert.equal(await dialog.getByRole('button',{name:'Apostar máximo'}).isDisabled(),true);
  await dialog.getByRole('button',{name:'Sin apuesta',exact:true}).click();await dialog.getByRole('button',{name:'Enviar reto',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='retar_arena').at(-1).args.p_apuesta),0);
  await page.goto(url+'?invitation');await page.getByText(/Apuesta: 25 galeones por alumno/).waitFor();
  await page.getByRole('button',{name:'Rechazar',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.arenaCalls.find(c=>c.method==='responder_reto_arena').args.p_aceptar),false);
  await page.goto(url+'?invitation');await page.getByRole('button',{name:'Aceptar duelo',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.arenaCalls.find(c=>c.method==='responder_reto_arena').args.p_aceptar),true);
  assert.deepEqual(errors,[]);
 } finally {await browser?.close();await server.close();}
});
