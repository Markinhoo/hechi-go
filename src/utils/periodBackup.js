const escapar = (value) => String(value ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function resumenRespaldo(respaldo) {
  const estado=respaldo.datos;
  const alumnos=estado.alumnos ?? [];
  const filas=alumnos.map(a=>'<tr><td>'+escapar(a.nombre)+'</td><td>'+escapar(a.casaId)+'</td><td>'+
    escapar(a.puntosPositivos)+'</td><td>'+escapar(a.puntosNegativos)+'</td><td>'+escapar(a.puntos)+
    '</td><td>'+escapar(a.cartas?.length ?? 0)+'</td></tr>').join('');
  const casas=Object.entries(estado.puntajes ?? {}).map(([c,total])=>'<tr><td>'+escapar(c)+'</td><td>'+
    escapar(estado.puntajesPositivos?.[c] ?? '')+'</td><td>'+escapar(estado.puntajesNegativos?.[c] ?? '')+
    '</td><td>'+escapar(total)+'</td></tr>').join('');
  return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Respaldo '+escapar(respaldo.nombre)+'</title><style>body{font:16px Arial;margin:24px;color:#222}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #aaa;padding:8px;text-align:left}th{background:#eee}</style>'+
    '<h1>'+escapar(respaldo.nombre)+' — cierre de parcial</h1><p>Respaldo del '+escapar(new Date(respaldo.created_at).toLocaleString('es-MX'))+
    '</p><h2>Casas</h2><table><tr><th>Casa</th><th>Positivos</th><th>Negativos</th><th>Total</th></tr>'+casas+
    '</table><h2>Alumnos</h2><table><tr><th>Nombre</th><th>Casa</th><th>Positivos</th><th>Negativos</th><th>Total</th><th>Cartas</th></tr>'+filas+'</table></html>';
}
export function descargarRespaldo(respaldo, completo=false) {
  const contenido=completo ? JSON.stringify(respaldo,null,2) : resumenRespaldo(respaldo);
  const blob=new Blob([contenido],{type:completo?'application/json':'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='parcial-'+String(respaldo.nombre).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+respaldo.id+(completo?'.json':'.html');
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}