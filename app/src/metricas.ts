// Métricas del contenido propio: lo que te funcionó, cómo creciste en cada red y qué formato y tema rinden, como centro de
// control. Lee <research>/radar.db en sólo lectura: lo junta engine/research/metricas.py (Postiz, archivos CSV o cargas a
// mano) y lo clasifica engine/research/temas.py. El período, las comparaciones y los rankings se arman en public/metricas.js
// con lo que devuelve esta ruta: todo el historial, porque el período puede ser un mes, un año o todo.
import type { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paths } from './config.ts';
import { plannerMediaPath } from './publication-planner.ts';
import { abrir, clases, taxonomia } from './competidores.ts';

const media = (p: unknown) => typeof p === 'string' && !p.includes('..') && plannerMediaPath(p) ? p : null;

// El catálogo de las piezas propias (formato, línea, estilo y tema, en <research>/taxonomia_propia.json). Si no está, las
// propias usan la misma taxonomía que las referencias. Los anillos son los mismos.
// Sin `lineas` ni `estilos`, la pestaña agrupa sólo por formato, tema y anillo.
function taxonomiaPropia() {
  const conDefaults = (t: any) => t ? { lineas: {}, estilos: [], ...t } : t;
  try {
    const t = JSON.parse(readFileSync(resolve(paths().research, 'taxonomia_propia.json'), 'utf8'));
    return conDefaults({ ...t, anillos: t.anillos || taxonomia()?.anillos || [], temas: (t.temas || []).map((x: any) => ({ ...x, largo: x.largo || x.nombre })) });
  } catch { return conDefaults(taxonomia()); }
}

export function metricas() {
  const db = abrir(), vacio = { disponible: false, publicaciones: [], seguidores: [], fuentes: [], videos: [], semanas: [], taxonomia: taxonomiaPropia() };
  if (!db) return vacio;
  try {
    if (!db.prepare("select 1 from sqlite_master where type='table' and name='propias_publicaciones'").get()) return vacio;
    const cl = clases();
    // Cada video una vez, con su catálogo, su balance entre redes y lo que ganó por semana (engine/research/metricas.py videos).
    const hayVideos = !!db.prepare("select count(*) n from sqlite_master where type='table' and name='propias_videos'").get().n && !!db.prepare('select count(*) n from propias_videos').get().n;
    const videos: any[] = hayVideos ? db.prepare('select * from propias_videos').all().map((v: any) => ({ ...v, anillos_perfil: JSON.parse(v.anillos_perfil || '{}') })) : [];
    const semanas = hayVideos ? db.prepare('select video_id, red, semana, vistas, seguidores, estimado from propias_video_semanas').all() : [];
    const delVideo = new Map<string, any>(hayVideos ? db.prepare('select pub_id, video_id, x_red, normal_vistas, componentes, provisional from propias_video_pubs').all().map((r: any) => [r.pub_id, r]) : []);
    const porId = new Map<string, any>(videos.map(v => [v.id, v]));
    // Cada publicación con su última medición (la de la fuente que leyó más tarde).
    const publicaciones = db.prepare(`select p.id, p.red, p.cuenta, p.marca, p.perfil, p.url, p.publicado_at, p.texto, p.titulo, p.formato_pieza, p.trial, p.serie, p.media,
        m.medido_at, m.fuente fuente_metricas, m.vistas, m.alcance, m.likes, m.comentarios, m.compartidos, m.guardados, m.seguidores_nuevos, m.visitas_perfil,
        m.completo, m.tiempo_promedio_s, m.skip_rate
      from propias_publicaciones p
      left join propias_metricas m on m.id=p.id and m.medido_at=(select max(medido_at) from propias_metricas where id=p.id)
      order by p.publicado_at desc`).all()
      .map((p: any) => {
        const dv = delVideo.get(p.id), v = dv && porId.get(dv.video_id);
        const clase = !hayVideos ? cl.get(p.id) || null : v?.tema ? { formato: v.formato, linea: v.linea, estilo: v.estilo, tema: v.tema, anillo: v.anillo, anillos: v.anillos_perfil } : cl.get(p.id) || null;
        return { ...p, texto: String(p.texto || '').slice(0, 400), media: media(p.media), clase, video_id: dv?.video_id || null, x_red: dv?.x_red ?? null, normal_vistas: dv?.normal_vistas ?? null, pub_provisional: dv?.provisional ?? 0 };
      });
    const seguidores = db.prepare('select red, cuenta, fecha, fuente, seguidores, nuevos, perdidos from propias_seguidores order by fecha').all();
    // De qué fecha es la última lectura de cada cuenta: lo que no se mide hace rato se marca como viejo.
    const fuentes = db.prepare(`select p.red, p.cuenta, count(distinct p.id) publicaciones, count(distinct m.id) medidas, max(m.medido_at) ultima_lectura, group_concat(distinct m.fuente) fuentes
      from propias_publicaciones p left join propias_metricas m on m.id=p.id group by 1, 2`).all();
    return { disponible: true, publicaciones, seguidores, fuentes, videos, semanas, taxonomia: taxonomiaPropia() };
  } finally { db.close(); }
}

export function registerMetricas(app: Hono) {
  app.get('/api/planner/metricas', c => c.json(metricas()));
}
