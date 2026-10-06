import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
test('teacher can find pupils and edit total currency, with validation and recoverable errors',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/galleons.html`);
  await page.getByText('240 galeones',{exact:true}).waitFor();
  await page.getByLabel('Buscar alumno').fill('maria');
  assert.equal(await page.locator('li').count(),1);
  await page.getByRole('button',{name:'Editar galeones de María López'}).click();
  await page.getByLabel('Nuevo saldo').fill('-1');
  assert.equal(await page.getByRole('button',{name:'Guardar saldo'}).isDisabled(),true);
  await page.getByLabel('Nuevo saldo').fill('0');
  await page.evaluate(()=>window.failSave=true);
  await page.getByRole('button',{name:'Guardar saldo'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Nuevo saldo').inputValue(),'0');
  await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'Guardar saldo'}).click();
  await page.getByRole('status').filter({hasText:'saldo actualizado a 0 galeones'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.saved),{id:'a',total:0,previous:240});
  await page.getByLabel('Buscar alumno').fill('');
  await page.getByText('80 galeones',{exact:true}).waitFor();
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:700});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
 }finally{await browser?.close();await server.close();}
});
