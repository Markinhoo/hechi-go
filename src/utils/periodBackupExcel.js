import ExcelJS from 'exceljs';

export async function generarExcelRespaldo(respaldo) {
  const book = new ExcelJS.Workbook();
  book.creator = 'HECHI GO';
  const data = respaldo.datos;
  const text = value => value == null ? '' : String(value);
  const when = value => value ? new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}) : '';
  const sheet = (name, columns, rows) => {
    const page = book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
    page.columns = columns.map(([header,width])=>({header,width}));
    page.addRows(rows);
    page.getRow(1).font = {bold:true,color:{argb:'FFFFFFFF'}};
    page.getRow(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF19334D'}};
    page.getRow(1).height = 28;
    page.autoFilter = {from:{row:1,column:1},to:{row:Math.max(1,page.rowCount),column:columns.length}};
    page.eachRow((row,index)=>{
      row.alignment={vertical:'top',wrapText:true};
      if(index>1){row.font={size:11};if(index%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F5FA'}};}
    });
    page.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
    return page;
  };
  sheet('Resumen',[['Dato',30],['Valor',60]],[['Clase',text(respaldo.nombre)],['Fecha de respaldo (CDMX)',when(respaldo.created_at)],['ID del respaldo',text(respaldo.id)],['Alumnos',(data.alumnos || []).length],['Casa protegida',text(data.casaProtegida)]]);
  sheet('Casas',[['Casa',24],['Puntos positivos',20],['Puntos negativos',20],['Total',18]],Object.entries(data.puntajes || {}).map(([c,total])=>[c,data.puntajesPositivos?.[c] ?? 0,data.puntajesNegativos?.[c] ?? 0,total]));
  sheet('Alumnos',[['Alumno',30],['Casa',18],['Positivos',14],['Negativos',14],['Total',14],['Galeones',16],['Cartas obtenidas',30],['Bestias compradas',55],['Beneficios usados',50],['Exención del parcial',24]],
    (data.alumnos || []).map(a=>[text(a.nombre),text(a.casaId),a.puntosPositivos ?? 0,a.puntosNegativos ?? 0,a.puntos ?? 0,a.galeones ?? 0,(a.cartas || []).join(', '),(a.bestiario || []).join(', '),(a.bestiasUsadas || []).join(', '),text(a.exencionBestiario)]));
  sheet('Mochila',[['Alumno',30],['Carta',12],['Título',30],['Descripción',70]],(data.alumnos || []).flatMap(a=>(a.cartasGuardadas || []).map(c=>[text(a.nombre),c.numero,text(c.titulo),text(c.descripcion)])));
  sheet('Historial',[['Fecha (CDMX)',24],['Alumno',30],['Carta',12],['Puntos',14],['Casa objetivo',22],['Título',30],['Descripción',70]],
    (data.historialCompleto || data.historial || []).map(p=>[when(p.createdAt ?? p.created_at),text(p.alumno),p.carta,p.puntos,text(p.casaObjetivo ?? p.casa_objetivo),text(p.titulo),text(p.descripcion)]));
  sheet('Auditoría',[['Fecha (CDMX)',24],['Actor',24],['Operación',30],['Deshecha',14],['Objetivo',30],['Antes',55],['Después',55]],
    (data.auditoriaCompleta || data.historialPuntajes || []).flatMap(op=>(op.movimientos?.length ? op.movimientos : [{}]).map(m=>[when(op.created_at ?? op.createdAt),text(op.actor),text(op.titulo),op.deshecha?'Sí':'No',text(m.nombre),JSON.stringify(m.antes ?? {}),JSON.stringify(m.despues ?? {})])));
  return book.xlsx.writeBuffer();
}
