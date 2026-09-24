import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('src/data/duelCatalog.json','utf8'));
const q=s=>"'"+s.replaceAll("'","''")+"'";
const rows=catalog.cards.map(c=>"("+[q(c.id),c.atk,c.def,c.copies,"array["+c.stars.map(q).join(',')+"]"].join(',')+")").join(',\n');
const fusions=catalog.fusions.map(([a,b,c])=>"("+q([a,b].sort().join('+'))+","+q(c)+")").join(',\n');
const sql="-- Generated catalog from src/data/duelCatalog.json; stats are authoritative on the server.\n"+
"insert into hechi.cartas_arena(id,ataque,defensa,copias,afinidades) values\n"+rows+"\non conflict(id) do update set ataque=excluded.ataque,defensa=excluded.defensa,copias=excluded.copias,afinidades=excluded.afinidades;\n"+
"insert into hechi.fusiones_arena(receta,resultado) values\n"+fusions+"\non conflict(receta) do update set resultado=excluded.resultado;\n";
fs.writeFileSync('supabase/migrations/20260924_zzz_duel_catalog.sql',sql.replaceAll('\\n','\n'));