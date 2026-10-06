import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import TeacherGalleons from '../../src/components/game/TeacherGalleons';
import '../../src/styles/global.css';
function Fixture(){
 const [alumnos,setAlumnos]=useState([{id:'a',nombre:'María López',galeones:240},{id:'b',nombre:'Carlos Pérez',galeones:80}]);
 return <TeacherGalleons alumnos={alumnos} onSave={async(alumno,total,previous)=>{
  if(window.failSave) throw new Error('No se pudo guardar el saldo.');
  window.saved={id:alumno.id,total,previous};
  setAlumnos(old=>old.map(a=>a.id===alumno.id?{...a,galeones:total}:a));
 }}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
