import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
test('Crecehuesos offers both effects and keeps the choice after an error',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:800}});
  const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/crecehuesos.html`;
  await page.goto(url);
  await page.getByRole('heading',{name:'Elige un efecto'}).waitFor();
  await page.evaluate(()=>window.failChoice=true);
  await page.getByRole('button',{name:'Guardar para justificar una falta'}).click();
  await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.choice),undefined);
  await page.evaluate(()=>window.failChoice=false);
  await page.getByRole('button',{name:'Guardar para justificar una falta'}).click();
  await page.getByText('Guardada sin puntos',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.choice),'justificar');
  await page.goto(url);await page.getByRole('button',{name:'Sumar 1 punto'}).click();
  await page.getByText('Sumaste un punto',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.choice),'punto');
 }finally{await browser?.close();await server.close();}
});
