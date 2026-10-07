begin;
create or replace function hechi.resolver_crecehuesos(p_token text,p_alumno_id uuid,p_password text,p_opcion text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype; a hechi.alumnos%rowtype; puntos_carta integer:=0;
begin
 if p_opcion is null or p_opcion not in ('punto','justificar') then raise exception 'Elige sumar un punto o justificar una falta'; end if;
 select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' for update;
 if not found then raise exception 'Clase no encontrada'; end if;
 select * into a from hechi.alumnos where id=p_alumno_id and clase_id=c.id for update;
 if not found or a.password is distinct from p_password then raise exception 'Credenciales incorrectas'; end if;
 if a.oportunidades<=0 then raise exception 'Necesitas una participación autorizada'; end if;
 if p_opcion='justificar' and exists(select 1 from jsonb_array_elements(a.cartas_guardadas) x where x->>'numero'='18') then raise exception 'Ya tienes Crecehuesos en la mochila'; end if;
 perform hechi.iniciar_operacion_puntaje(p_token,a.id,'crecehuesos','Crecehuesos: '||p_opcion);
 if p_opcion='punto' then puntos_carta:=case when c.casa_multiplicador=a.casa_id then 2 else 1 end; end if;
 update hechi.alumnos set oportunidades=oportunidades-1,cartas=array_append(cartas,18),puntos=puntos+puntos_carta,
  cartas_guardadas=case when p_opcion='justificar' then cartas_guardadas||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'numero',18,'titulo','Crecehuesos','descripcion','Justifica una falta. Sin puntos.','createdAt',now())) else cartas_guardadas end,
  beneficio_bestia=case when p_opcion='justificar' and hechi.bestiario_puntos(beneficio_bestia)>0 then null else beneficio_bestia end,
  beneficio_oportunidades=case when p_opcion='justificar' and hechi.bestiario_puntos(beneficio_bestia)>0 then null else beneficio_oportunidades end,
  updated_at=now() where id=a.id;
 if puntos_carta>0 then
  update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(a.casa_id,coalesce((puntajes_positivos->>a.casa_id)::integer,0)+puntos_carta),
   puntajes=puntajes||jsonb_build_object(a.casa_id,coalesce((puntajes_positivos->>a.casa_id)::integer,0)+puntos_carta-coalesce((puntajes_negativos->>a.casa_id)::integer,0)),
   casa_multiplicador=case when casa_multiplicador=a.casa_id then null else casa_multiplicador end where id=c.id;
 end if;
 update hechi.clases set sobre_activo=floor(random()*7)::integer,updated_at=now() where id=c.id;
 insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,casa_objetivo,titulo,descripcion)
 values(c.id,a.id,18,puntos_carta,a.casa_id,'Crecehuesos',case when p_opcion='punto' then 'Eligió sumar puntos' else 'Guardada para justificar una falta, sin puntos' end);
 perform hechi.aplicar_beneficio_bestia(a.id,a.oportunidades);
 return hechi.estado_clase(c.id);
end;
$$;
revoke all on function hechi.resolver_crecehuesos(text,uuid,text,text) from public;
grant execute on function hechi.resolver_crecehuesos(text,uuid,text,text) to anon,authenticated;
do $choice$
declare definition text;
begin
 select pg_get_functiondef('hechi.abrir_carta(text,uuid,text,integer,integer,text,text,text)'::regprocedure) into definition;
 if position('crecehuesos_choice_required' in definition)=0 then
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n -- crecehuesos_choice_required\n if p_numero=18 then raise exception ''Elige cómo usar Crecehuesos antes de aplicarla''; end if;','i');
  execute definition;
 end if;
end;
$choice$;
commit;
