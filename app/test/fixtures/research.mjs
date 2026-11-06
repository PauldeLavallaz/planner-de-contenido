// Una carpeta de contenido de prueba con su base de research (el esquema lo crea engine/research/base.py) y datos inventados.
// Hay que llamar a crear() antes de importar los módulos del servidor: config.ts lee PLANNER_CONFIG al cargarse.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const research = fileURLToPath(new URL('../../../engine/research', import.meta.url));
const hace = d => new Date(Date.now() - d * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00');
export const lunes = (d = new Date()) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

export function crear({ base = true } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'planner-research-'));
  const config = resolve(root, 'planner.config.json');
  writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', brands: ['Mi Marca', 'Otra Marca'], content: { root: '.' }, publish_root: 'publicar',
    channels: { instagram: { id: 'ig', profile: 'mimarca', marca: 'Mi Marca' } } }));
  process.env.PLANNER_CONFIG = config;
  process.env.PLANNER_SIN_ANALISIS = '1';
  mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
  if (base) {
    const r = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(research)}); import base; base.connect().close()`], { env: { ...process.env, PLANNER_CONFIG: config }, encoding: 'utf8' });
    if (r.status) throw new Error(r.stderr);
  }
  return { root, config, db: resolve(root, 'research/radar.db') };
}

// Tres cuentas: una de Mi Marca, una de Otra Marca y una sin marca (de todas), más una propia que no es competidor.
export async function sembrar(db) {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(db), t = hace(1);
  const cuenta = (id, handle, tags) => d.prepare("insert into radar_accounts(id,platform,handle,purpose,enabled,tags) values(?,?,?,'competitor',1,?)").run(id, 'instagram', handle, JSON.stringify(tags));
  cuenta('instagram:deuna', 'deuna', ['marca-mi-marca']); cuenta('instagram:deotra', 'deotra', ['marca-otra-marca']); cuenta('instagram:detodas', 'detodas', []); cuenta('instagram:mia', 'mia', ['propia']);
  for (const [aid, seg] of [['instagram:deuna', 40000], ['instagram:deotra', 9000], ['instagram:detodas', 120000], ['instagram:mia', 500]]) {
    d.prepare("insert into competidores_mediciones(account_id,medido_at,fuente,nombre,seguidores,muestra,reels,carruseles,imagenes) values(?,?,'scrapecreators',?,?,10,8,2,0)").run(aid, t, aid, seg);
    d.prepare("insert into competidores_lineas_base(account_id,medido_at,formato,n,views_mediana,likes_mediana) values(?,?,'reel',8,1000,50)").run(aid, t);
  }
  const contenido = (id, aid, code, x, views, origen = null) => {
    d.prepare("insert into competidores_contenidos(id,account_id,platform,formato,url,publicado_at,texto,primera_vez_at,ultima_vez_at,origen) values(?,?,'instagram','reel',?,?,?,?,?,?)").run(id, aid, `https://instagram.com/p/${code}`, hace(3), `Texto de ${code}. Segunda oración.`, t, t, origen);
    d.prepare("insert into competidores_contenido_mediciones(contenido_id,medido_at,views,likes,x_mediana,x_sobre,pautado) values(?,?,?,?,?,'views',0)").run(id, t, views, views / 20, x);
  };
  contenido('c1', 'instagram:deuna', 'UNO', 8, 8000); contenido('c2', 'instagram:deotra', 'OTRO', 6, 6000); contenido('c3', 'instagram:detodas', 'TODAS', 12, 12000);
  contenido('c4', 'instagram:mia', 'MIO', 20, 20000); contenido('c5', 'instagram:detodas', 'TUYO', 1, 1000, 'la pasaste vos');
  d.prepare("insert into competidores_catalogo(account_id,catalogado_at,rol,anillo,sim_oferta,sim_contenido,similarity) values('instagram:deuna',?,'competidor_directo',2,8,8,80)").run(t);
  d.prepare("insert into contenido_clase values('ig:UNO','https://instagram.com/p/UNO','tutorial','talking-head',1,'palabras',null,?)").run(t);
  d.close();
}
