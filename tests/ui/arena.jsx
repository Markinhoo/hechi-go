import { createRoot } from 'react-dom/client';
import DuelArena from '../../src/components/game/DuelArena';
import '../../src/styles/global.css';
const player = { vida:4000, restantes:56, cantidadMano:5, mano:[{id:'bowtruckle',uid:'one'},{id:'doxy',uid:'two'},{id:'doxy',uid:'three'},{id:'hechizo-invisibilidad',uid:'trap'},{id:'hechizo-engorgio',uid:'boost'}], campo:[null,null,null,null,null], apoyos:[null,null,null,null,null] };
let duel = {id:'duel',estado:'activo',jugador1:'a',jugador2:'b',nombre1:'Alumno',nombre2:'Rival',
 version:1,lado:'a',turno:'a',ronda:2,invoco:false,fase:'invocacion',recompensa:true,
 venceEn:new Date(Date.now()+90000).toISOString(),mensaje:'Tu turno',yo:player,
 rival:{...player,mano:[],campo:[{oculta:true,posicion:'ataque'},null,null,null,null]}};
if(new URLSearchParams(window.location.search).has('direct')) duel.rival.campo=[null,null,null,null,null];
window.arenaCalls=[];
const testSpell=new URLSearchParams(window.location.search).get('spell');
if(testSpell){
 duel.yo={...player,mano:[{id:testSpell,uid:'test-spell'}],campo:[{id:'bowtruckle',uid:'own',bonusDef:500,posicion:'ataque'},null,null,null,null]};
 duel.rival={...duel.rival,campo:[{id:'dragon',uid:'enemy',posicion:'ataque'},{oculta:true,posicion:'ataque'},null,null,null],apoyos:[{oculta:true},null,null,null,null]};
}
window.deliverCombatEvent=event=>{duel={...duel,version:duel.version+1,eventos:[...(duel.eventos||[]),{...event,id:'effect-'+(duel.version+1),tipo:event.tipo||'combate'}]};window.dispatchEvent(new Event('online'));};
window.expireArenaTurn=()=>{duel={...duel,venceEn:new Date(Date.now()-1000).toISOString()};};
const cinematic=new URLSearchParams(window.location.search).has('cinematic');
let lobby=new URLSearchParams(window.location.search).has('lobby');
if(new URLSearchParams(window.location.search).has('invitation')) duel={...duel,estado:'pendiente',jugador1:'b',jugador2:'a',apuesta:25};
window.finishArena=()=>{duel={...duel,estado:'finalizado',ganador:'a',galeonesGanados:80,retornoApuesta:2*(duel.apuesta||0),version:duel.version+1};window.dispatchEvent(new Event('online'));};
window.deliverRemoteCombat=(direct=true)=>{duel={...duel,version:duel.version+1,eventos:[...(duel.eventos||[]),{id:'remote',tipo:'combate',actor:'b',atacante:{id:'dragon'},defensor:direct?null:{id:'bowtruckle',posicion:'ataque'},directo:direct,ataque:2800,danoActor:0,danoRival:2800}]};};
let abierta=true;
const rpc=async(method,args)=>{
 window.arenaCalls.push({method,args});
 if(window.arenaFailure && (method==='obtener_arena' || window.failArenaActions)) {
  if(window.arenaFailure==='throw') throw new TypeError('Failed to fetch');
  return {data:null,error:{message:'TypeError: Failed to fetch'}};
 }
 if(method==='configurar_arena') abierta=args.p_abierta;
 if(method==='retar_arena'){
  lobby=false;duel={...duel,estado:'pendiente',apuesta:args.p_apuesta,recompensa:!args.p_practica};
  return {data:duel};
 }
 if(method==='responder_reto_arena') {duel={...duel,estado:args.p_aceptar?'activo':'cancelado'};return {data:duel};}
 if(method==='accion_duelo_arena'){
  if(args.p_accion==='hechizo'){
   const data=args.p_datos;
   const yo={...duel.yo,mano:duel.yo.mano.filter(c=>c.uid!==data.uid)};
   if(data.uid==='trap') yo.apoyos=Array.from({length:5},(_,i)=>i===data.casilla?{id:'hechizo-invisibilidad',uid:'trap',oculta:true}:null);
   else if(data.uid==='boost') yo.campo=yo.campo.map((c,i)=>i===data.objetivo?{...c,bonusAtk:500}:c);
   duel={...duel,yo,hechizo:true,version:duel.version+1};
  }
  if(args.p_accion==='posicion'){
   duel={...duel,version:duel.version+1,yo:{...duel.yo,campo:duel.yo.campo.map((c,i)=>i===args.p_datos.casilla?{...c,posicion:c.posicion==='ataque'?'defensa':'ataque'}:c)}};
  }
  if(args.p_accion==='invocar'){
   const d=args.p_datos;
   const boost = d.uid === 'boost' || d.uid2 === 'boost';
   duel={...duel,version:duel.version+1,invoco:true,mensaje:'Fusión: acromantula',
    hechizo:boost || duel.hechizo,
    yo:{...duel.yo,mano:duel.yo.mano.filter(c=>![d.uid,d.uid2].includes(c.uid)),
     campo:[{id:d.uid2 && !boost ? 'acromantula' : 'bowtruckle',bonusAtk:boost ? 500 : 0,uid:'one',afinidad:d.afinidad,posicion:d.posicion,oculta:d.oculta,ataco:false,cambio:true},null,null,null,null]}};
  }
  if(args.p_accion==='atacar') duel={...duel,version:duel.version+1,turno:'b',ronda:3,mensaje:'Combate completado'};
  if(args.p_accion==='terminar') duel={...duel,version:duel.version+1,turno:'b',mensaje:'Turno del rival'};
  if(cinematic && args.p_accion==='invocar' && args.p_datos.uid2) duel={...duel,eventos:[...(duel.eventos||[]),{id:'fusion-'+duel.version,tipo:'fusion',actor:'a',ingredientes:['bowtruckle','doxy'],resultado:'acromantula'}]};
  if(cinematic && args.p_accion==='atacar') duel={...duel,eventos:[...(duel.eventos||[]),{id:'combat-'+duel.version,tipo:'combate',actor:'a',atacante:{id:'acromantula'},defensor:{oculta:true},trampa:'hechizo-patronus',ataque:1600,danoActor:400,danoRival:0}]};
  return {data:duel};
 }
 return {data:{abierta,cupos:2,galeones:120,activo:lobby||!['activo','pendiente'].includes(duel.estado)?null:duel,duelos:lobby?[]:[duel],rivales:[{id:"r1",nombre:"María López",ocupado:false,conPremio:true,maxApuesta:40},{id:"r2",nombre:"Carlos Pérez",ocupado:true},{id:"r3",nombre:"Ana Torres",ocupado:false,maxApuesta:0}]}};
};
export default function Fixture(){
 const teacher=new URLSearchParams(window.location.search).has('teacher');
 const mobile=window.matchMedia('(max-width:760px)').matches;
 const nav=<nav className={teacher?(mobile?'student-tab-switcher teacher-tab-switcher':'student-tab-switcher teacher-desktop-tab-switcher'):'student-bottom-nav'}>
  {(teacher?(mobile?['Inicio','Puntajes','Hechizos','Kahoot','Arena']:['Inicio','Kahoot','Arena']):['Inicio','Puntaje','Bestiario','Hechizos','Kahoot','Arena']).map(t=><button key={t}>{t}</button>)}
 </nav>;
 return <main className={'game-shell app-fixed mobile-scroll-page arena-focus '+(teacher?'teacher-view':'student-view')}>

  <section className={teacher?(mobile?'teacher-mobile-tabs-area':'teacher-desktop-tabs-area'):'student-tabs-area'}>
   {teacher&&nav}
   <DuelArena sesion={{tipo:teacher?'maestro':'alumno',token:'TEST',alumnoId:'a',password:'12345'}} rpc={rpc}/>
   {!teacher&&nav}
  </section>
 </main>;
}
const root=createRoot(document.getElementById('root'));
window.unmountArena=()=>root.unmount();
root.render(<Fixture/>);
