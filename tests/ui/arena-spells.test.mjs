import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');

test('new spells select visible rival monsters or hidden traps and confirm their target',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 let browser;
 try{
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH});
  const page=await browser.newPage({viewport:{width:390,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const spell of ['crucio','avada','sectumsempra','riddikulus','alohomora']){
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/tests/ui/arena.html?spell=hechizo-'+spell);
   await page.locator('.duel-hand [data-uid="test-spell"]').click();
   const target=spell==='alohomora'?page.getByRole('button',{name:'Retirar trampa rival 1',exact:true}):page.getByRole('button',{name:/Aplicar magia a espacio rival 1:/});
   if(spell!=='alohomora') assert.equal(await page.getByRole('button',{name:/Aplicar magia a espacio rival 2:/}).isDisabled(),true,'hidden monsters cannot be targeted');
   await target.click();
   assert.equal(await page.evaluate(()=>window.arenaCalls.filter(c=>c.method==='accion_duelo_arena').length),0,'waits for placement confirmation');
   await page.getByRole('button',{name:'Colocar boca arriba',exact:true}).click();
   await page.waitForFunction(()=>window.arenaCalls.some(c=>c.method==='accion_duelo_arena'));
   const call=await page.evaluate(()=>window.arenaCalls.find(c=>c.method==='accion_duelo_arena'));
   assert.equal(call.args.p_accion,'hechizo');
   assert.equal(call.args.p_datos.uid,'test-spell');
   assert.equal(call.args.p_datos.objetivo,0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.match(await page.getByRole('button',{name:'Tu espacio 1: Bowtruckle',exact:true}).innerText(),/2100/,'defense buffs appear on the card');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
