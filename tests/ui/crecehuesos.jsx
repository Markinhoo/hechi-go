import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import CardModal from '../../src/components/game/CardModal';
import '../../src/styles/global.css';
function Fixture(){
 const [carta,setCarta]=useState({numero:18,titulo:'Crecehuesos',descripcion:'SUMA +1 O JUSTIFICA UNA FALTA',tipo:'guardable',puntos:1,casaId:'slytherin',revelada:true,pendienteCrecehuesos:true});
 return <CardModal carta={carta} onClose={()=>setCarta(null)} onSelectCrecehuesos={async choice=>{
  if(window.failChoice) throw new Error('Fallo de prueba');
  window.choice=choice;
  setCarta(old=>({...old,pendienteCrecehuesos:false,puntos:choice==='punto'?1:0,descripcion:choice==='punto'?'Sumaste un punto':'Guardada sin puntos'}));
 }}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
