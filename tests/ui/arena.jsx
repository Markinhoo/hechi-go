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
let abierta=true;
const rpc=async(method,args)=>{
 window.arenaCalls.push({method,args});
 if(method==='configurar_arena') abierta=args.p_abierta;
 if(method==='accion_duelo_arena'){
  if(args.p_accion==='hechizo'){
   const data=args.p_datos;
   const yo={...duel.yo,mano:duel.yo.mano.filter(c=>c.uid!==data.uid)};
   if(data.uid==='trap') yo.apoyos=Array.from({length:5},(_,i)=>i===data.casilla?{id:'hechizo-invisibilidad',uid:'trap',oculta:true}:null);
   else yo.campo=yo.campo.map((c,i)=>i===data.objetivo?{...c,bonusAtk:500}:c);
   duel={...duel,yo,hechizo:true,version:duel.version+1};
  }
  if(args.p_accion==='invocar'){
   const d=args.p_datos;
   duel={...duel,version:duel.version+1,invoco:true,mensaje:'Fusión: acromantula',
    yo:{...duel.yo,mano:duel.yo.mano.filter(c=>![d.uid,d.uid2].includes(c.uid)),
     campo:[{id:d.uid2 ? 'acromantula' : 'bowtruckle',uid:'one',afinidad:d.afinidad,posicion:d.posicion,oculta:d.oculta,ataco:false,cambio:true},null,null,null,null]}};
  }
  if(args.p_accion==='atacar') duel={...duel,version:duel.version+1,turno:'b',ronda:3,mensaje:'Combate completado'};
  if(args.p_accion==='terminar') duel={...duel,version:duel.version+1,turno:'b',mensaje:'Turno del rival'};
  return {data:duel};
 }
 return {data:{abierta,cupos:2,activo:duel,duelos:[duel],rivales:[]}};
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
createRoot(document.getElementById('root')).render(<Fixture/>);