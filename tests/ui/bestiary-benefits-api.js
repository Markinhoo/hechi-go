export const supabase = {auth:{signOut:async()=>({})}};
export const db = {rpc:async(name,args)=>{
 window.benefitCalls.push({name,args});
 if(name==='riddikulus_pendientes') return {data:[]};
 const a=window.benefitState.alumnos[0];
 if(name==='elegir_beneficio_bestia') a.beneficioBestia=args.p_bestia;
 if(name==='abrir_carta'){
  if(window.failBenefitCard) return {error:{message:'Fallo de carta de prueba'}};
  if(a.beneficioBestia) a.bestiasUsadas.push(a.beneficioBestia);
  a.beneficioBestia=null;a.oportunidades--;
 }
 if(name==='solicitar_exencion_bestiario') a.exencionBestiario='pendiente';
 if(name==='autorizar_exencion_bestiario') a.exencionBestiario='autorizada';
 return {data:structuredClone(window.benefitState)};
}};
