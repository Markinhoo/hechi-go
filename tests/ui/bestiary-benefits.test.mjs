import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
test('student chooses one benefit, legendary selection spends only on success, teacher approves exemption',async()=>{
 const server=await createServer({resolve:{alias:[{find:/.*\/services\/hechiApi$/,replacement:fileURLToPath(new URL('./bestiary-benefits-api.js',import.meta.url))}]},server:{host:'127.0.0.1',port:0}});let browser;
 try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:800}});page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/ui/bestiary-benefits.html`;
  await page.goto(url);await page.locator('.pack-card.active').click();
  const picker=page.getByRole('dialog',{name:'Elegir beneficio de bestia'});await picker.waitFor();
  assert.equal(await picker.getByRole('button',{name:/Doxy/}).count(),0);
  await picker.getByRole('button',{name:/Dragon/}).click();
  await page.getByRole('heading',{name:'Escoge cualquier carta'}).waitFor();
  assert.equal(await page.evaluate(()=>window.benefitState.alumnos[0].bestiasUsadas.includes('dragon')),false);
  await page.evaluate(()=>window.failBenefitCard=true);
  await page.locator('.card-choice-option').filter({hasText:'Incendio'}).click();
  await page.getByText('Fallo de carta de prueba').waitFor();
  assert.equal(await page.evaluate(()=>window.benefitState.alumnos[0].bestiasUsadas.includes('dragon')),false);
  await page.locator('.pack-card.active').click();await picker.waitFor();
  await page.evaluate(()=>window.failBenefitCard=false);
  await picker.getByRole('button',{name:/Dragon/}).click();
  await page.locator('.card-choice-option').filter({hasText:'Incendio'}).click();
  await page.waitForFunction(()=>window.benefitState.alumnos[0].bestiasUsadas.includes('dragon'));
  assert.equal(await page.evaluate(()=>window.benefitCalls.some(c=>c.name==='consumir_eleccion_legendaria')),false);
  await page.goto(url);await page.getByRole('button',{name:'Bestiario',exact:true}).click();
  await page.getByRole('button',{name:'Solicitar exención'}).click();
  await page.getByText(/Solicitud de exención pendiente/).waitFor();
  await page.goto(url+'?teacher');await page.getByRole('button',{name:'Galeones',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Autorizar exención de Alumno'}).filter({visible:true}).click();
  await page.getByText('Alumno · Exención del parcial autorizada',{exact:true}).filter({visible:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
