import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import GameView from '../../src/components/game/GameView';
import {bestiario} from '../../src/data/bestiaryData';
import '../../src/styles/global.css';
const houses={gryffindor:0,slytherin:0,ravenclaw:0,hufflepuff:0};
window.benefitCalls=[];
window.benefitState={token:'TEST',nombre:'Prueba',estado:'activa',total:20,sobreActivo:0,puntajes:houses,puntajesPositivos:houses,puntajesNegativos:houses,conteos:houses,objetivos:houses,historial:[],historialPuntajes:[],solicitudes:[],alumnos:[{id:'a',nombre:'Alumno',casaId:'slytherin',puntos:0,galeones:100,cartas:[],cartasGuardadas:[],oportunidades:5,bestiario:bestiario.map(b=>b.id),bestiasUsadas:['doxy'],eleccionesLegendarias:4,exencionBestiario:new URLSearchParams(location.search).has('teacher')?'pendiente':'ninguna'}]};
function Fixture(){
 const [estado,setEstado]=useState(structuredClone(window.benefitState));
 const [mensaje,setMensaje]=useState('');
 const sesion={tipo:new URLSearchParams(location.search).has('teacher')?'maestro':'alumno',token:'TEST',alumnoId:'a',password:'12345'};
 return <GameView sesion={sesion} estado={estado} setEstado={setEstado} mensaje={mensaje} setMensaje={setMensaje} setSesion={()=>{}} setModo={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
