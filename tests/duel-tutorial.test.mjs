import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('guided duel only accepts its current action and finishes with valid damage',async()=>{
 const server=await createServer({server:{middlewareMode:true}});
 try {
 const {createTutorial,tutorialReducer}=await server.ssrLoadModule('/src/utils/duelTutorial.js');
 let s=createTutorial();
 const run=(action,step)=>{s=tutorialReducer(s,action);assert.equal(s.step,step);};
 const rejected=action=>assert.strictEqual(tutorialReducer(s,action),s);
 rejected({type:'CPU'});rejected({type:'ANIMATION_DONE'});
 run({type:'START'},'summon');
 rejected({type:'HAND',uid:'boost'});rejected({type:'DROP',uid:'owl',zone:'field',index:3});
 run({type:'DROP',uid:'owl',zone:'field',index:0},'flip');
 rejected({type:'PLACE'});
 run({type:'FLIP'},'place');run({type:'PLACE'},'cpuOpening');
 assert.equal(s.round,2);assert.equal(s.field[0].oculta,true);
 run({type:'CPU'},'inspect');assert.equal(s.hand.length,5);
 rejected({type:'FIELD',index:0});
 run({type:'INSPECT',index:0},'closeInspection');run({type:'CLOSE'},'selectDefense');
 run({type:'FIELD',index:0},'defense');assert.equal(s.field[0].posicion,'ataque');
 run({type:'FIELD',index:0},'trap');assert.equal(s.field[0].posicion,'defensa');
 run({type:'HAND',uid:'trap'},'trapDrop');rejected({type:'SUPPORT',index:2});
 run({type:'SUPPORT',index:0},'endTurn');run({type:'END'},'cpuTrap');
 run({type:'CPU'},'trapAnimation');assert.equal(s.event.trampa,'hechizo-invisibilidad');assert.equal(s.supports[0],null);
 run({type:'ANIMATION_DONE'},'fusionFirst');assert.equal(s.life,4000);assert.equal(s.rivalLife,4000);
 run({type:'HAND',uid:'bow'},'fusionSecond');run({type:'HAND',uid:'doxy'},'fusionDrop');
 run({type:'FIELD',index:1},'fusionConfirm');run({type:'PLACE'},'fusionAnimation');
 assert.equal(s.field[1].id,'acromantula');assert.equal(s.field[1].oculta,false);
 run({type:'ANIMATION_DONE'},'boost');run({type:'HAND',uid:'boost'},'boostTarget');
 rejected({type:'FIELD',index:0});run({type:'FIELD',index:1},'attackSelect');
 assert.equal(s.field[1].bonusAtk,500);
 run({type:'FIELD',index:1},'attackTarget');run({type:'RIVAL',index:0},'attackAnimation');
 assert.equal(s.rivalLife,3100);assert.equal(s.event.danoRival,900);assert.ok(s.event.destruidoRival);
 run({type:'ANIMATION_DONE'},'directSelect');run({type:'FIELD',index:0},'directTarget');
 run({type:'RIVAL',index:0},'directAnimation');assert.equal(s.rivalLife,2100);assert.equal(s.field[0].oculta,false);
 run({type:'ANIMATION_DONE'},'cpuRebound');run({type:'CPU'},'reboundAnimation');
 assert.equal(s.rivalLife,800);assert.equal(s.event.danoActor,1300);assert.ok(s.event.destruidoActor);
 run({type:'ANIMATION_DONE'},'finalSelect');run({type:'FIELD',index:1},'finalTarget');
 run({type:'RIVAL',index:0},'victoryAnimation');run({type:'ANIMATION_DONE'},'complete');
 assert.equal(s.rivalLife,0);assert.equal(s.life,4000);assert.equal(s.round,7);
 rejected({type:'END'});assert.deepEqual(createTutorial().field,[null,null,null,null,null]);
 } finally { await server.close(); }
});
