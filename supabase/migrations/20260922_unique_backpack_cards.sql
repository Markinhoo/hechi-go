-- Reject new duplicate backpack cards, without deleting existing copies.
create or replace function hechi.validar_cartas_guardadas_unicas()
returns trigger language plpgsql set search_path = hechi, public, pg_catalog as $$
declare
  v_numero text;
  v_antes integer;
  v_despues integer;
begin
  foreach v_numero in array array['8','13','18','19','22'] loop
    v_antes := 0;
    if TG_OP = 'UPDATE' then
      select count(*) into v_antes from jsonb_array_elements(coalesce(old.cartas_guardadas,'[]'::jsonb)) carta where carta->>'numero'=v_numero;
    end if;
    select count(*) into v_despues from jsonb_array_elements(coalesce(new.cartas_guardadas,'[]'::jsonb)) carta where carta->>'numero'=v_numero;
    if v_despues > greatest(1,v_antes) then
      raise exception 'Ya tienes esa carta en la mochila. Usala antes de obtener otra.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists cartas_guardadas_sin_duplicados on hechi.alumnos;
create trigger cartas_guardadas_sin_duplicados
before insert or update of cartas_guardadas on hechi.alumnos
for each row execute function hechi.validar_cartas_guardadas_unicas();
