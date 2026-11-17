import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {db} from '../../services/hechiApi';
import '../../styles/exams.css';

export default function ExamPanel({sesion,alumnos=[]}) {
 const teacher=sesion.tipo==='maestro';
 const [exams,setExams]=useState([]),[draft,setDraft]=useState(null),[title,setTitle]=useState(''),[active,setActive]=useState(null),[answers,setAnswers]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const activeRef=useRef(null),sent=useRef(false);
 const startedHere=useRef(false);
 const resumeKey=`hechi-exam-active-${sesion.alumnoId}`;
 const args=useMemo(()=>({p_token:sesion.token,...(teacher?{}:{p_alumno_id:sesion.alumnoId,p_password:sesion.password})}),[teacher,sesion.token,sesion.alumnoId,sesion.password]);
 const fetchExams=useCallback(async()=>{
  const {data,error:failure}=await db.rpc(teacher?'examen_maestro':'examen_alumno',args);
  if(failure) throw new Error(failure.message);
  setExams(data||[]);
  if(!teacher){const running=(data||[]).find(x=>x.intento?.estado==='en_curso');setActive(running?.id||null);activeRef.current=running?.id||null;setAnswers(running?.intento?.respuestas||{});}
  return data;
 },[teacher,args]);
 useEffect(()=>{const timer=setTimeout(()=>void fetchExams().catch(e=>setError(e.message)),0);return()=>clearTimeout(timer);},[fetchExams]);
 const incident=useCallback((reason,keepalive=false)=>{
  if(!activeRef.current||sent.current||teacher) return;
  sent.current=true;
  const payload={...args,p_accion:'incidente',p_examen:activeRef.current};
  if(keepalive){
   // The lease on the server also blocks an attempt if this request cannot leave the device.
   const endpoint=`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/examen_alumno`;
   void fetch(endpoint,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify(payload)}).catch(()=>{});
  }else void db.rpc('examen_alumno',payload).finally(()=>{setError(reason);setActive(null);activeRef.current=null;localStorage.removeItem(resumeKey);void fetchExams().catch(()=>{});});
 },[teacher,args,fetchExams,resumeKey]);
 useEffect(()=>{
  if(!active||teacher) return;
  if(localStorage.getItem(resumeKey)===active&&!startedHere.current){incident('Intento bloqueado por cerrar o recargar el examen.');return;}
  const hidden=()=>{if(document.hidden) incident('Intento bloqueado por salir de la pantalla del examen.');};
  const leave=()=>incident('Intento bloqueado por cerrar la app.',true);
  const blur=()=>{if(!document.hasFocus()) incident('Intento bloqueado por cambiar de ventana.');};
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);window.addEventListener('blur',blur);
  const timer=setInterval(async()=>{if(!document.hidden&&activeRef.current&&!sent.current){const {error:failure}=await db.rpc('examen_alumno',{...args,p_accion:'pulso',p_examen:activeRef.current});if(failure) incident('Se perdió la conexión durante el examen.');}},8000);
  return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);window.removeEventListener('blur',blur);clearInterval(timer);};
  },[active,teacher,args,incident,resumeKey]);
 useEffect(()=>()=>{if(activeRef.current&&!sent.current) incident('Se salió del examen.',true);},[incident]);
 const run=async(action,extra={})=>{setBusy(true);setError('');try{const {data,error:failure}=await db.rpc(teacher?'examen_maestro':'examen_alumno',{...args,...extra,...(teacher?{}:{p_accion:action})});if(failure)throw new Error(failure.message);setExams(data||[]);return data;}catch(e){setError(e.message);return null;}finally{setBusy(false);}};
 const choose=async(index,choice)=>{const next={...answers,[index]:choice};setAnswers(next);const data=await run('pulso',{p_examen:active,p_respuestas:next});if(!data) incident('No se pudo guardar la respuesta.');};
 const loadWord=async(file)=>{setError('');try{const {examFromWord}=await import('../../utils/examWord');const questions=await examFromWord(file);setDraft(questions);setTitle('Examen parcial');}catch(e){setError(e.message);}};
 const save=async(publish)=>{if(!draft)return;const result=await run('',{p_titulo:title,p_preguntas:draft,p_publicado:publish});if(result){setDraft(null);setTitle('');}};
 return <section className="exam-panel panel student-tab-panel" aria-label="Exámenes">
  <h2>Exámenes</h2>
  {error&&<p role="alert" className="exam-alert">{error}</p>}
  {teacher&&<div className="exam-editor"><h3>Crear desde Word</h3><p>Importa preguntas A–D con su «Clave rápida de respuestas». Revisa el borrador antes de publicarlo.</p><input type="file" accept=".docx" onChange={e=>e.target.files?.[0]&&void loadWord(e.target.files[0])} />
   {draft&&<><label>Título<input value={title} onChange={e=>setTitle(e.target.value)} /></label><p>{draft.length} preguntas detectadas.</p>
    {draft.map((q,i)=><article key={i} className="exam-question"><label>Pregunta {i+1}<textarea value={q.texto} onChange={e=>setDraft(old=>old.map((v,j)=>j===i?{...v,texto:e.target.value}:v))} /></label>
      {q.opciones.map((option,j)=><label key={j}>{'ABCD'[j]}<input value={option} onChange={e=>setDraft(old=>old.map((v,k)=>k===i?{...v,opciones:v.opciones.map((o,n)=>n===j?e.target.value:o)}:v))} /></label>)}
      <label>Correcta<select value={q.correcta} onChange={e=>setDraft(old=>old.map((v,j)=>j===i?{...v,correcta:Number(e.target.value)}:v))}>{'ABCD'.split('').map((letter,j)=><option key={letter} value={j}>{letter}</option>)}</select></label>
    </article>)}<button disabled={busy||!title.trim()} onClick={()=>void save(false)}>Guardar borrador</button><button disabled={busy||!title.trim()} onClick={()=>void save(true)}>Publicar examen</button></>}
  </div>}
  {exams.map(exam=><article key={exam.id} className="exam-entry"><h3>{teacher ? exam.titulo : 'Examen parcial'}</h3><p>{exam.total??exam.preguntas.length} preguntas{teacher?` · ${exam.publicado?'Publicado':'Borrador'}`:''}</p>
   {teacher?<><button disabled={busy} onClick={()=>void run('',{p_id:exam.id,p_publicado:!exam.publicado})}>{exam.publicado?'Ocultar':'Publicar'}</button>
    {exam.intentos?.map(attempt=><div className="exam-attempt" key={attempt.id}><span>{attempt.nombre}: {attempt.estado} · {attempt.aciertos}/{attempt.total}{attempt.motivo&&` · ${attempt.motivo}`}</span>
      {exam.publicado&&['bloqueado','finalizado'].includes(attempt.estado)&&<button disabled={busy} onClick={()=>void run('',{p_id:exam.id,p_autorizar:attempt.alumnoId})}>Permitir otro intento</button>}</div>)}
    {alumnos.filter(a=>!exam.intentos?.some(i=>i.alumnoId===a.id)).map(a=><p key={a.id}>{a.nombre}: disponible</p>)}
   </>:<>{!exam.intento||exam.intento.estado==='disponible'?<button disabled={busy||Boolean(active)} onClick={async()=>{const data=await run('iniciar',{p_examen:exam.id});if(data){activeRef.current=exam.id;sent.current=false;startedHere.current=true;localStorage.setItem(resumeKey,exam.id);setActive(exam.id);setAnswers({});}}}>Comenzar examen</button>:null}
    {exam.intento?.estado==='bloqueado'&&<p>Calificación: 0. Intento bloqueado. El maestro debe permitir otro intento.</p>}
    {exam.intento?.estado==='finalizado'&&<><p>Calificación: {exam.intento.aciertos}/{exam.total} ({Math.round(exam.intento.aciertos*100/exam.total)}%).</p><div className="exam-results">{exam.preguntas.map((q,i)=>{
      const correct=Number(exam.intento.respuestas[i])===q.correcta && exam.intento.respuestas[i]!==undefined;
      return <details key={i} className="exam-result" data-correct={correct}>
        <summary><span className="exam-result-mark" aria-label={correct?'Correcta':'Incorrecta'}>{correct?'✓':'✕'}</span><span>{i+1}. {q.texto}</span></summary>
        <div className="exam-result-answers">{!correct&&<p className="exam-answer-wrong"><strong>Tu respuesta:</strong> {q.opciones[exam.intento.respuestas[i]]||'Sin responder'}</p>}<p className="exam-answer-right"><strong>Respuesta correcta:</strong> {q.opciones[q.correcta]}</p></div>
      </details>;
    })}</div></>}
    {active===exam.id&&<div className="exam-running"><p>Permanece en esta ventana hasta entregar. Cambiar de pestaña o cerrar la app bloquea el intento con cero.</p>{exam.preguntas.map((q,i)=><fieldset key={i}><legend>{i+1}. {q.texto}</legend>{q.opciones.map((option,j)=><label key={j}><input type="radio" name={`exam-${i}`} checked={answers[i]===j} onChange={()=>void choose(i,j)} /> {'ABCD'[j]}. {option}</label>)}</fieldset>)}<button disabled={busy} onClick={async()=>{const data=await run('finalizar',{p_examen:exam.id});if(data){sent.current=true;activeRef.current=null;localStorage.removeItem(resumeKey);setActive(null);}}}>Entregar examen</button></div>}
   </>}
  </article>)}
  {exams.length===0&&<p>{teacher?'Importa un Word para crear el primer examen.':'Todavía no hay exámenes publicados.'}</p>}
 </section>;
}
