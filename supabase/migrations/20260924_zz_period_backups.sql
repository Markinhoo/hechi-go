-- Durable, owner-only snapshots taken atomically before resetting the grading period.
begin;
create table if not exists hechi.respaldos_parcial (
 id uuid primary key, propietario uuid not null, clase_id uuid references hechi.clases(id) on delete set null,
 token text not null, nombre text not null, datos jsonb not null, created_at timestamptz not null default now()
);
create index if not exists respaldos_parcial_propietario on hechi.respaldos_parcial(propietario,created_at desc);
alter table hechi.respaldos_parcial enable row level security;
revoke all on hechi.respaldos_parcial from public,anon,authenticated;
do $rename$
begin
 if to_regprocedure('hechi.reiniciar_clase_sin_respaldo(text)') is null then
   alter function hechi.reiniciar_clase(text) rename to reiniciar_clase_sin_respaldo;
 end if;
end;
$rename$;
revoke all on function hechi.reiniciar_clase_sin_respaldo(text) from public,anon,authenticated;

create or replace function hechi.reiniciar_clase_con_respaldo(p_token text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype; r hechi.respaldos_parcial%rowtype; snapshot jsonb; resultado jsonb;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesion como maestro'; end if;
 if p_solicitud is null then raise exception 'Falta identificador de respaldo'; end if;
 select * into c from hechi.clases where token=upper(trim(p_token)) and created_by=auth.uid() for update;
 if not found then raise exception 'No autorizado como maestro'; end if;
 select * into r from hechi.respaldos_parcial where id=p_solicitud;
 if found then
   if r.propietario<>auth.uid() or r.clase_id is distinct from c.id then raise exception 'Respaldo no autorizado'; end if;
   -- A retry after a lost response must not reset the new period again.
   return jsonb_build_object('estado',hechi.estado_clase(c.id),'respaldo',to_jsonb(r)-'propietario'-'token');
 end if;
 if c.estado<>'activa' then raise exception 'La clase no está activa'; end if;
 perform id from hechi.alumnos where clase_id=c.id order by id for update;
 snapshot:=hechi.estado_clase(c.id)-'token'-'solicitudes';
 -- Preserve the FULL history rather than the 100-row class-view limit.
 snapshot:=snapshot||jsonb_build_object('historialCompleto',(
   select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'alumnoId',p.alumno_id,
     'alumno',a.nombre,'carta',p.carta,'puntos',p.puntos,'casaObjetivo',p.casa_objetivo,
     'titulo',p.titulo,'descripcion',p.descripcion,'createdAt',p.created_at) order by p.created_at),'[]'::jsonb)
   from hechi.participaciones p left join hechi.alumnos a on a.id=p.alumno_id where p.clase_id=c.id
 ),'auditoriaCompleta',(
   select coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('movimientos',(
     select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb)
     from hechi.movimientos_puntaje m where m.operacion_id=o.id)) order by o.secuencia),'[]'::jsonb)
   from hechi.operaciones_puntaje o where o.clase_id=c.id
 ));
 insert into hechi.respaldos_parcial(id,propietario,clase_id,token,nombre,datos)
 values(p_solicitud,auth.uid(),c.id,c.token,c.nombre,snapshot) returning * into r;
 resultado:=hechi.reiniciar_clase_sin_respaldo(p_token);
 return jsonb_build_object('estado',resultado,'respaldo',to_jsonb(r)-'propietario'-'token');
end;
$$;
revoke all on function hechi.reiniciar_clase_con_respaldo(text,uuid) from public,anon;
grant execute on function hechi.reiniciar_clase_con_respaldo(text,uuid) to authenticated;

create or replace function hechi.reiniciar_clase(p_token text)
returns jsonb language sql security definer set search_path=hechi,public,pg_catalog as $$
 select hechi.reiniciar_clase_con_respaldo(p_token,gen_random_uuid())->'estado';
$$;
revoke all on function hechi.reiniciar_clase(text) from public,anon;
grant execute on function hechi.reiniciar_clase(text) to authenticated;

create or replace function hechi.listar_respaldos_parcial(p_token text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesion como maestro'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'created_at',created_at)
   order by created_at desc),'[]'::jsonb) from hechi.respaldos_parcial
   where propietario=auth.uid() and token=upper(trim(p_token)));
end;
$$;
create or replace function hechi.obtener_respaldo_parcial(p_id uuid)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare r hechi.respaldos_parcial%rowtype;
begin
 select * into r from hechi.respaldos_parcial where id=p_id and propietario=auth.uid();
 if not found then raise exception 'Respaldo no encontrado o no autorizado'; end if;
 return to_jsonb(r)-'propietario'-'token';
end;
$$;
revoke all on function hechi.listar_respaldos_parcial(text),hechi.obtener_respaldo_parcial(uuid) from public,anon;
grant execute on function hechi.listar_respaldos_parcial(text),hechi.obtener_respaldo_parcial(uuid) to authenticated;
commit;