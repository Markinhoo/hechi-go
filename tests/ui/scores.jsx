import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import HouseScoresTable from '../../src/components/game/HouseScoresTable';
import ConnectionStatus from '../../src/components/ui/ConnectionStatus';
import '../../src/styles/teacher-dashboard.css';
export default function Fixture(){
 const ref=useRef(null);
 const [open,setOpen]=useState(true);
 const [estado,setEstado]=useState({alumnos:[{id:'a',nombre:'Alumno',casaId:'slytherin',puntos:8,puntosPositivos:10,puntosNegativos:2}],
   puntajesPositivos:{slytherin:10},puntajesNegativos:{slytherin:2}});
 return <><ConnectionStatus/><div id='closed'>{open?'Abierto':'Cerrado'}</div>
  {open && <div className='house-detail-modal'><div className='house-detail-card' style={{'--house':'#0d5c45','--metal':'#ccc'}}>
   <header><h2>Puntajes</h2></header>
   <button className='house-detail-close' onClick={()=>ref.current.requestClose(()=>setOpen(false))}>Cerrar</button>
   <HouseScoresTable ref={ref} estado={estado} casaId='slytherin' editable onSave={async(tabla)=>{
    if(window.testShouldFail)throw new Error('Fallo de guardado de prueba');
    window.testSaved=tabla;
    setEstado(prev=>({...prev,alumnos:prev.alumnos.map(a=>({...a,puntosPositivos:tabla.alumnos[0].positivos,
      puntosNegativos:tabla.alumnos[0].negativos,puntos:tabla.alumnos[0].positivos-tabla.alumnos[0].negativos}))}));
   }}/>
  </div></div>}
 </>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);