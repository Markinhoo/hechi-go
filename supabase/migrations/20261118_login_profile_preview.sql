-- La vista previa del acceso solo revela una foto si coinciden el token de una clase activa y el usuario.
create or replace function hechi.perfil_vista_login(p_token text, p_nombre text)
returns text language sql stable security definer set search_path = hechi, public, pg_catalog as $$
  select f.foto
  from hechi.clases c
  join hechi.alumnos a on a.clase_id = c.id
  join hechi.perfil_fotos f on f.alumno_id = a.id
  where c.token = upper(trim(p_token))
    and c.estado = 'activa'
    and lower(a.nombre) = lower(trim(p_nombre))
  limit 1;
$$;

revoke all on function hechi.perfil_vista_login(text,text) from public;
grant execute on function hechi.perfil_vista_login(text,text) to anon, authenticated;
