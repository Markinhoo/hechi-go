// A Word document can contain numbered questions with four labelled choices and
// a "Respuesta: B" line, or definitions in the form "Concepto: descripción".
export async function examFromWord(file) {
 const mammoth=await import('mammoth/mammoth.browser');
 const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
 const lines=result.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const keyStart=lines.findIndex(line=>/clave\s+r[aá]pida\s+de\s+respuestas/i.test(line));
 if(keyStart>=0){
  const key=Object.fromEntries(lines.slice(keyStart+1).flatMap(line=>[...line.matchAll(/\b(\d{1,3})\s*[-.:)]\s*([A-D])\b/gi)].map(match=>[Number(match[1]),'ABCD'.indexOf(match[2].toUpperCase())])));
  const body=lines.slice(0,keyStart).join('\n');
  const starts=[...body.matchAll(/(?:^|\n)(\d{1,3})\.\s+/g)];
  const extracted=[];
  for(let i=0;i<starts.length;i++){
   const number=Number(starts[i][1]);
   const block=body.slice(starts[i].index+starts[i][0].length,starts[i+1]?.index??body.length).trim();
   const optionStart=[...block.matchAll(/(?:^|\s)([A-D])\)\s*/g)];
   if(optionStart.length!==4 || optionStart.map(x=>x[1].toUpperCase()).join('')!=='ABCD' || key[number]===undefined) continue;
   const texto=block.slice(0,optionStart[0].index).trim();
   const opciones=optionStart.map((marker,j)=>block.slice(marker.index+marker[0].length,optionStart[j+1]?.index??block.length).trim().replace(/\nRespuesta:.*$/s,''));
   if(texto.length>=5 && opciones.every(Boolean)) extracted.push({texto,opciones,correcta:key[number]});
  }
  if(extracted.length!==Object.keys(key).length || extracted.length===0) throw new Error(`La clave contiene ${Object.keys(key).length} respuestas, pero pude leer ${extracted.length} preguntas completas. Revisa el formato antes de publicar.`);
  return extracted;
 }
 const questions=[];let current=null;
 const flush=()=>{if(current?.texto && current.opciones.length===4 && Number.isInteger(current.correcta)) questions.push(current);current=null;};
 for(const line of lines) {
  const heading=line.match(/^(?:pregunta\s*)?\d+[.)-]\s*(.{5,})$/i);
  const option=line.match(/^([A-D])[).:-]\s*(.+)$/i);
  const answer=line.match(/^(?:respuesta\s*(?:correcta)?|correcta|clave)\s*[:=-]\s*([A-D])\b/i);
  if(heading){flush();current={texto:heading[1],opciones:[],correcta:null};}
  else if(option && current) current.opciones['ABCD'.indexOf(option[1].toUpperCase())]=option[2];
  else if(answer && current) current.correcta='ABCD'.indexOf(answer[1].toUpperCase());
 }
 flush();
 if(questions.length) return questions;
 const definitions=lines.map(line=>line.match(/^([^:]{3,70}):\s*(.{12,})$/)).filter(Boolean).map(match=>({term:match[1].trim(),description:match[2].trim()}));
 if(definitions.length<4) throw new Error('No encontré preguntas con A–D y “Respuesta: B”, ni cuatro definiciones “Concepto: descripción”. Revisa el Word.');
 return definitions.map(({term,description},index)=>{
  const choices=[term,...[1,2,3].map(offset=>definitions[(index+offset)%definitions.length].term)];
  const rotation=index%4;
  return {texto:`¿Qué concepto corresponde a esta descripción? ${description}`,opciones:choices.map((_,i)=>choices[(i+4-rotation)%4]),correcta:rotation};
 });
}
