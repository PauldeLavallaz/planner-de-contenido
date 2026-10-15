import { Hono } from 'hono';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, extname, relative, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { ENGINE_DIR, PYTHON, REPO_DIR, CONFIG_PATH, paths } from './config.ts';
export const exec = promisify(execFile);
export const ROOT=()=>paths().root, STATE=()=>paths().state;
// Una ruta dentro de la carpeta de contenido (o de la cola, si vive afuera), siempre con barras /.
export const within=(base:string,p:string)=>{const r=relative(base,p);return !!r&&!r.startsWith('..')&&!r.includes(':');};
export const posix=(p:string)=>p.split(sep).join('/');
export const TYPES: Record<string,string> = {'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export const fileRead=(p:string,fallback:any)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{return fallback;}};
export function write(name:string, data:unknown) { mkdirSync(STATE(),{recursive:true}); const target=resolve(STATE(),name), tmp=target+'.'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(data,null,2));renameSync(tmp,target); }
export function plannerMediaPath(value:string) {
  try { if(!value)return null;
    const p=realpathSync(resolve(ROOT(),value)), roots=[ROOT(),paths().publish].map(r=>{try{return realpathSync(r);}catch{return r;}});
    const base=roots.find(r=>within(r,p));
    // Nada oculto (.git, .env, borradas) salvo lo que guarda el propio planner.
    if (!base||relative(base,p).split(sep).some(part=>part.startsWith('.')&&part!=='.planner'&&part!=='.assets')||!TYPES[extname(p).toLowerCase()]||!statSync(p).isFile())return null;
    return p;
  } catch {return null;}
}
// Feedback por pieza, escrito o grabado: persiste y se puede pasar a Claude Code tal cual.
// Cada nota vive dentro de la carpeta de la pieza, en feedback/, con su audio al lado.
const FEEDBACK_AUDIO:Record<string,string>={'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav'};
export function validatePlannerFeedback(body:any) {
  if(!body||typeof body.id!=='string'||!body.id||body.id.length>500)throw new Error('Feedback inválido');
  const text=typeof body.text==='string'?body.text.trim():'';
  if(text.length>20000)throw new Error('El texto es demasiado largo.');
  let audio:null|{buf:Buffer,ext:string,mime:string}=null;
  if(body.audio!=null){
    const mime=String(body.mime||'').split(';')[0].trim();
    if(typeof body.audio!=='string'||body.audio.length>60_000_000||!FEEDBACK_AUDIO[mime])throw new Error('Audio no admitido');
    const buf=Buffer.from(body.audio,'base64');if(buf.length<200)throw new Error('El audio llegó vacío. Grabalo de nuevo.');
    audio={buf,ext:FEEDBACK_AUDIO[mime],mime};
  }
  if(!text&&!audio)throw new Error('Escribí algo o grabá un audio.');
  const num=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<36000?Math.round(v*10)/10:null;
  return {id:body.id,text,audio,video_time:num(body.video_time),audio_seconds:num(body.audio_seconds)};
}
export function feedbackDir(item:any) {
  if(typeof item.source==='string'&&item.source){
    const folder=resolve(ROOT(),item.source);
    if(within(ROOT(),folder)&&existsSync(folder)&&statSync(folder).isDirectory())return resolve(folder,'feedback');
  }
  // Piezas que son un archivo suelto o registros de Postiz: carpeta propia del planner.
  return resolve(STATE(),'feedback',String(item.id).replace(/[^\w.-]+/g,'_').slice(0,120));
}
export const rel=(p:string)=>within(ROOT(),p)?posix(relative(ROOT(),p)):p;
export function readFeedback(dir:string) {
  if(!existsSync(dir))return [];
  // Por hora de creación: dos notas del mismo segundo no quedan en orden por el sufijo aleatorio del nombre.
  return readdirSync(dir).filter(f=>f.endsWith('-planner.json')).map(f=>({file:f,...fileRead(resolve(dir,f),{})})).filter(e=>e.created_at).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.file.localeCompare(b.file));
}
const clock=(s:number)=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
// Estados de una nota: pendiente → enviado (se copió) → en_curso (una sesión la tomó) → aplicado.
// Así dos sesiones de Claude Code no hacen la misma corrección.
const FEEDBACK_RULES=[
  '- Antes de tocar nada, fijate que la corrección no esté ya en marcha: abrí el JSON de cada nota y, si dice «aplicado» o «en_curso» con tomado_at de las últimas 12 horas, no la hagas y avisame.',
  '- Si está libre, tomala: en el JSON poné estado «en_curso», tomado_at y tomado_por (una línea que identifique esta sesión).',
  '- Leé las instrucciones del proyecto de contenido (CLAUDE.md o AGENTS.md de esa carpeta, si existen) y los archivos de la pieza antes de cambiar nada.',
  '- Si hay audios, transcribilos; mirá el video en los segundos indicados antes de decidir qué cambiar.',
  '- Si la pieza ya estaba aprobada, agendada o publicada, no la pises: guardá la versión corregida aparte (por ejemplo final_v2.mp4) y avisame.',
  '- Si la corrección implica gastar (generar video, voz o imágenes con servicios pagos), avisame antes con qué y cuánto.',
  '- Al terminar, en el JSON de cada nota poné estado «aplicado», aplicado_at y una línea de qué cambió en «cambio».',
];
export const OPEN=(e:any)=>!e.estado||e.estado==='pendiente';
// Las notas de historias (tipo «historia») viven en la carpeta de la semana: no son de una pieza de la cola.
export const pieceFeedback=(dir:string)=>readFeedback(dir).filter((e:any)=>e.tipo!=='historia');
export const pendingFeedback=(item:any)=>pieceFeedback(feedbackDir(item)).filter(OPEN);
// Marca como enviadas (copiadas a una sesión) las notas pendientes; dejan de viajar en la propuesta global.
export function markFeedbackSent(dir:string, files:string[], via:string) {
  const now=new Date().toISOString();
  for(const f of files){const p=resolve(dir,f),e=fileRead(p,null);if(!e||!OPEN(e))continue;
    const tmp=p+'.tmp';writeFileSync(tmp,JSON.stringify({...e,estado:'enviado',enviado_at:now,enviado_via:via},null,2));renameSync(tmp,p);}
}
export function feedbackPrompt(item:any, dir:string, entries:any[]) {
  const pending=entries.filter(e=>e.estado!=='aplicado'&&e.estado!=='en_curso');
  const busy=entries.filter(e=>e.estado==='en_curso');
  const run=typeof item.source==='string'&&item.source?item.source:null;
  const lines=pending.map((e,n)=>{
    const head=`${n+1}. ${new Date(e.created_at).toLocaleString('es-AR',{timeZone:paths().timezone,dateStyle:'short',timeStyle:'short'})}${e.video_time!=null?` · en el ${clock(e.video_time)} del video`:''}`;
    const parts=[e.text?`   Texto: «${e.text}»`:'',e.audio?`   Audio: ${e.audio}${e.audio_seconds?` (${Math.round(e.audio_seconds)} s)`:''}. Transcribilo antes de actuar.`:''].filter(Boolean);
    return [head,...parts,`   Nota: ${rel(dir)}/${e.file}`].join('\n');
  });
  return [
    `Feedback desde el planner sobre «${item.title}».`,
    '',
    `Carpeta de contenido: ${ROOT()}`,
    run?`Pieza: ${run}`:'Pieza sin carpeta local (registro de Postiz).',
    item.primary?.path?`Archivo revisado: ${item.primary.path}`:'',
    item.sidecar?`Ficha de la cola: ${item.sidecar}`:'',
    `Estado en el planner: ${({review:'Por revisar',ready:'Listo',development:'En desarrollo',scheduled:'Agendado',paused:'Pausado',published:'Publicado'} as any)[item.status]||item.status}`,
    '',
    `Notas pendientes (${pending.length}):`,
    ...lines,
    ...(busy.length?['',`Ya en curso en otra sesión, no las repitas: ${busy.map(e=>e.file+(e.tomado_por?' ('+e.tomado_por+')':'')).join(', ')}`]:[]),
    '',
    'Implementá estos cambios:',
    ...FEEDBACK_RULES,
    '- No agendes, muevas ni publiques nada en Postiz.',
  ].filter((l,i,a)=>l!==''||a[i-1]!=='').join('\n');
}
let cache:any=null, cacheAt=0, inFlight:Promise<any>|null=null;
export const PLANNER_STAGES=['development','review','ready'];
export function applyPlannerPublications(data:any, records:Record<string,any>, discards:Record<string,any>={}, stages:Record<string,any>={}) {
  return {...data,items:data.items.map((raw:any)=>{
    // Las columnas del tablero mueven piezas de producción; Listo significa que aprobaste el final.
    const override=PLANNER_STAGES.includes(raw.status)&&stages[raw.id]?.active&&PLANNER_STAGES.includes(stages[raw.id].stage)&&stages[raw.id].stage!==raw.status ? stages[raw.id] : null;
    const item=override?{...raw,status:override.stage,approved:override.stage==='ready',production_status:raw.status}:raw;
    const returned=override&&raw.status==='ready'?override:null;
    const publication=records[item.id]?.active ? records[item.id] : null;
    // A discard hides a piece from planning; a confirmed publication still wins.
    const discarded=!publication&&discards[item.id]?.active&&item.status!=='scheduled' ? discards[item.id] : null;
    const status=publication?'published':discarded?'discarded':item.status;
    const reference=item.publication_reference||item.scheduled;
    return {...item,status,publication,discard:discarded,returned,stage_override:override,
      history_date:status==='published'?(publication?.published_on||reference?.slice(0,10)||null):null,
      history_basis:status==='published'?(publication?.published_on?'user_date':reference?'scheduled_reference':'unknown'):null,
      pending_channels:status==='published'?(item.channels||[]).filter((c:any)=>c.verified&&c.state==='QUEUE'):[]};
  })};
}
function withPublications(data:any) {
  const out=applyPlannerPublications(data,fileRead(resolve(STATE(),'manual-publications.json'),{}),fileRead(resolve(STATE(),'discarded.json'),{}),plannerStages());
  // Notas de contenido sin aplicar: se suman a «Revisar cambios».
  return {...out,items:out.items.map((i:any)=>{const n=existsSync(feedbackDir(i))?pendingFeedback(i).length:0;return n?{...i,feedback_pending:n}:i;})};
}
// Stage overrides; returned-to-review.json is the earlier single-purpose record and still counts.
function plannerStages() {
  const legacy=fileRead(resolve(STATE(),'returned-to-review.json'),{}),current=fileRead(resolve(STATE(),'stages.json'),{});
  const out:Record<string,any>={};
  for(const [id,r] of Object.entries(legacy) as any)if(r?.active)out[id]={...r,stage:'review'};
  return {...out,...current};
}
export function validatePlannerStage(body:any) {
  if(!body||typeof body.id!=='string'||!body.id||body.id.length>500||!PLANNER_STAGES.includes(body.stage)||!Number.isInteger(body.revision))throw new Error('Estado inválido');
  return body;
}

export function validatePlannerDiscard(body:any) {
  if(!body||typeof body.id!=='string'||!body.id||body.id.length>500||!['discard','restore'].includes(body.action)||!Number.isInteger(body.revision))throw new Error('Descarte inválido');
  if(body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500))throw new Error('Motivo inválido');
  return body;
}
async function inventory(refresh=false) {
  if(!refresh&&cache&&Date.now()-cacheAt<15000)return withPublications(cache);
  if(inFlight)return withPublications(await inFlight);
  inFlight=(async()=>{
    let stdout='';
    try{({stdout}=await exec(PYTHON,[process.env.PLANNER_INVENTORY||resolve(ENGINE_DIR,'inventario.py'),...(refresh?['--refresh']:[])],{cwd:REPO_DIR,maxBuffer:32*1024*1024,timeout:60000}));}
    catch(e:any){let msg:any={};try{msg=JSON.parse(e?.stdout||'{}');}catch{}
      if(e?.code==='ENOENT')throw new PlannerError(`No encuentro ${PYTHON}. Instalá Python 3.10+ o definí PLANNER_PYTHON.`,503);
      throw new PlannerError(msg.error||'No se pudo leer el inventario. Corré python3 engine/doctor.py para ver qué falta.',msg.needs_setup?503:502,!!msg.needs_setup);}
    cache=JSON.parse(stdout);cacheAt=Date.now();return cache;})().finally(()=>{inFlight=null;});
  return withPublications(await inFlight);
}
export class PlannerError extends Error { status:number; needsSetup:boolean; constructor(message:string, status=502, needsSetup=false){super(message);this.status=status;this.needsSetup=needsSetup;} }
export function validatePlannerPublication(body:any,today=new Intl.DateTimeFormat('en-CA',{timeZone:paths().timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
  if(!body||typeof body.id!=='string'||!body.id||body.id.length>500||!['mark','undo'].includes(body.action)||!Number.isInteger(body.revision))throw new Error('Marca de publicación inválida');
  const day=body.published_on;
  if(day!==undefined&&day!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day||day>today))throw new Error('Elegí un día válido, hasta hoy, o dejá la fecha vacía.');
  return body;
}
// Instagram: feed (default) o Trial por reel. El toggle escribe sólo el dato que lee la cola al agendar.
export function validatePlannerInstagramMode(body:any) {
  if(!body||typeof body.id!=='string'||!body.id||body.id.length>500||typeof body.trial!=='boolean'||typeof body.fingerprint!=='string'||(body.confirm_scheduled!==undefined&&typeof body.confirm_scheduled!=='boolean'))throw new Error('Modo de Instagram inválido');
  return body;
}
// Las redes válidas son las cuentas conectadas en la config (engine/conectar.py).
const plannerNetworks=()=>paths().networks;
export function validatePlannerDraft(body:any) {
  if(!body||!Number.isInteger(body.revision)||!body.changes||typeof body.changes!=='object'||Array.isArray(body.changes))throw new Error('Propuesta inválida');
  if(Object.keys(body.changes).length>1000)throw new Error('Demasiadas piezas');
  for(const [id,raw] of Object.entries(body.changes)){
    const c=raw as any;
    if(id.length>500||!c||typeof c!=='object'||Array.isArray(c))throw new Error('Pieza inválida');
    if(c.when!==null&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.when)||!Number.isFinite(Date.parse(c.when+'-03:00'))))throw new Error('Fecha inválida');
    if(typeof(c.note??'')!=='string'||(c.note??'').length>3000)throw new Error('Nota inválida');
    if(c.networks!==undefined&&(!Array.isArray(c.networks)||!c.networks.length||c.networks.some((n:any)=>!plannerNetworks().includes(n))||new Set(c.networks).size!==c.networks.length))throw new Error('Elegí al menos una red válida');
    if(c.collaborators!==undefined&&(!Array.isArray(c.collaborators)||c.collaborators.length>5||c.collaborators.some((h:any)=>typeof h!=='string'||!/^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9._ -]{1,60}$/.test(h))))throw new Error('Colaboradores inválidos');
    if(c.version!==undefined&&(typeof c.version!=='string'||!plannerMediaPath(c.version)||!['.mp4','.mov'].includes(extname(c.version).toLowerCase())))throw new Error('Versión inválida');
    if(c.accounts!==undefined&&(!c.accounts||typeof c.accounts!=='object'||Array.isArray(c.accounts)||Object.entries(c.accounts).some(([n,v]:[string,any])=>!plannerNetworks().includes(n)||typeof v!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(v))))throw new Error('Cuenta inválida');
    if((c.pause!==undefined&&c.pause!==true)||(c.resume!==undefined&&c.resume!==true)||(c.pause&&(c.resume||c.when!==null)))throw new Error('Pausa inválida');
  }
  return body;
}
// Qué tiene que correr el agente por cada cambio de una propuesta congelada (ver .claude/skills/publicar/SKILL.md).
export function plannerAction(item:any,change:any) {
  if(change.pause)return 'pause';
  if(change.when)return item.scheduled?(change.when===item.scheduled?'update':'move'):'schedule';
  if(change.resume)return 'resume';
  return item.scheduled?'unschedule':'update';
}
export function proposalPrompt(id:string, agenda:number, feedback:any[]) {
  const file=resolve(STATE(),'proposal-'+id+'.json');
  const lines=['Confirmo la propuesta '+id+' del planner de contenido.','',
    `Propuesta: ${file}`,`Planner: ${REPO_DIR}`,`Instrucciones: seguí ${resolve(REPO_DIR,'.claude/skills/publicar/SKILL.md')} (motor: ${resolve(ENGINE_DIR,'cola.py')}).`];
  if(agenda)lines.push('','Agenda: revisá sus fechas, redes, cuentas, colaboradores, versiones y estados actuales, y programá en Postiz las piezas terminadas que indiqué. Las que todavía no tienen archivo final quedan como reserva.',
    'Versiones: si un cambio trae requested_version, publicá ese archivo. Si la pieza está en la cola sin fecha, `cola.py reemplazar <slug> <archivo>`; si ya está agendada, quitar, reemplazar y volver a agendarla en la fecha pedida. Si todavía no está en la cola, `cola.py listo` con ese archivo.');
  if(feedback.length){
    lines.push('',`Contenido: aplicá el feedback que dejé en ${feedback.length===1?'una pieza':feedback.length+' piezas'} (campo «feedback» de la propuesta; cada nota y su audio están en la carpeta feedback de la pieza):`);
    for(const f of feedback)lines.push(`- «${f.title}» · ${f.source||f.id} · ${f.notes.length===1?'1 nota':f.notes.length+' notas'}${f.notes.some((n:any)=>n.audio)?' (con audio)':''}`);
    lines.push('',...FEEDBACK_RULES);
    if(agenda)lines.push('- Si una pieza tiene feedback de contenido y también un cambio de agenda en esta propuesta, primero corregí el contenido y agendá la versión nueva recién cuando yo la apruebe; el resto de la agenda va igual.');
  }
  return lines.join('\n');
}
export function registerPublicationPlanner(app:Hono) {
  app.get('/planner',c=>c.redirect('/planner.html'));
  app.use('/api/planner/*',async(c,next)=>{
    // Hono drains request bodies with destroySoon, absent in the bundled Bun 1.1.
    const socket=(c.env as any)?.incoming?.socket;
    if(socket && typeof socket.destroySoon!=='function')socket.destroySoon=()=>socket.destroy();
    c.header('Cache-Control','no-store');
    if(c.req.method!=='GET') {
      const origin=c.req.header('origin');
      if(origin&&origin!==new URL(c.req.url).origin)return c.json({error:'Origen no permitido'},403);
      if(!c.req.header('content-type')?.includes('application/json'))return c.json({error:'Se requiere JSON'},415);
    }
    await next();
  });
  app.get('/api/planner/data',async c=>{try{return c.json(await inventory());}catch(e:any){return c.json({error:e.message,needs_setup:!!e.needsSetup,config:CONFIG_PATH},e.status||502);}});
  app.post('/api/planner/refresh',async c=>{try{await c.req.json();return c.json(await inventory(true));}catch(e:any){return c.json({error:e instanceof PlannerError&&e.needsSetup?e.message:'No se pudo consultar Postiz. Conservamos el último estado verificado.'},502);}});
  app.get('/api/planner/draft',c=>c.json(fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}})));
  // Confirmación local de algo que ya salió; nunca llama a Postiz.
  app.post('/api/planner/publication',async c=>{
    try {
      const body=validatePlannerPublication(await c.req.json());
      const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
      if(!item||['component','archived','discarded'].includes(item.status))return c.json({error:'Esta tarjeta no es una publicación vigente.'},400);
      const draft=fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}});
      if(body.revision!==draft.revision)return c.json({error:'El tablero cambió en otra pestaña. Recargá antes de marcar.'},409);
      const records=fileRead(resolve(STATE(),'manual-publications.json'),{}),previous=records[body.id];
      if(body.action==='undo'&&!previous?.active)return c.json({error:'No hay una marca manual para deshacer.'},400);
      const now=new Date().toISOString();
      records[body.id]=body.action==='mark'?{...previous,active:true,title:item.title,source:item.source,marked_at:now,published_on:body.published_on||null,confirmation:'Marcado como publicado en el planner',reverted_at:null}:{...previous,active:false,reverted_at:now};
      write('manual-publications.json',records);
      // A published item must not survive inside a pending scheduling proposal.
      if(body.action==='mark'&&Object.hasOwn(draft.changes,body.id)){delete draft.changes[body.id];draft.revision++;draft.saved_at=now;write('draft.json',draft);}
      return c.json({data:withPublications(cache),draft});
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  // Descarte local: oculta la pieza del planner. Nunca borra archivos, fichas ni posts remotos.
  app.post('/api/planner/discard',async c=>{
    try {
      const body=validatePlannerDiscard(await c.req.json());
      const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
      if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
      if(body.action==='discard'&&['scheduled','published'].includes(item.status))return c.json({error:item.status==='scheduled'?'Sigue programada en Postiz: quitale la fecha y confirmá esa propuesta antes de descartarla.':'Ya está publicada; queda en el historial.'},400);
      const draft=fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}});
      if(body.revision!==draft.revision)return c.json({error:'El tablero cambió en otra pestaña. Recargá antes de descartar.'},409);
      const records=fileRead(resolve(STATE(),'discarded.json'),{}),previous=records[body.id],now=new Date().toISOString();
      if(body.action==='restore'&&!previous?.active)return c.json({error:'Esta pieza no estaba descartada.'},400);
      records[body.id]=body.action==='discard'?{...previous,active:true,title:item.title,source:item.source,sidecar:item.sidecar||null,discarded_at:now,reason:body.reason||'',restored_at:null}:{...previous,active:false,restored_at:now};
      write('discarded.json',records);
      if(body.action==='discard'&&Object.hasOwn(draft.changes,body.id)){delete draft.changes[body.id];draft.revision++;draft.saved_at=now;write('draft.json',draft);}
      return c.json({data:withPublications(cache),draft});
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  // Estado de producción del tablero (columnas tipo Trello). Nunca toca tus carpetas ni la cola; Listo = aprobada.
  app.post('/api/planner/stage',async c=>{
    try {
      const body=validatePlannerStage(await c.req.json());
      const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
      if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
      if(!PLANNER_STAGES.includes(item.status))return c.json({error:item.status==='scheduled'?'Está programada en Postiz: quitale la fecha primero.':item.status==='paused'?'Está pausada: volvela a Listos o elegile una fecha.':'Esta pieza no se puede mover de columna.'},400);
      const draft=fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}});
      if(body.revision!==draft.revision)return c.json({error:'El tablero cambió en otra pestaña. Recargá antes de seguir.'},409);
      const legacy=fileRead(resolve(STATE(),'returned-to-review.json'),{});
      if(legacy[body.id]?.active){legacy[body.id]={...legacy[body.id],active:false,restored_at:new Date().toISOString(),moved_to:'stages.json'};write('returned-to-review.json',legacy);}
      const records=fileRead(resolve(STATE(),'stages.json'),{}),now=new Date().toISOString();
      const base=item.production_status||item.status;
      records[body.id]=body.stage===base?{...records[body.id],active:false,cleared_at:now}:{active:true,stage:body.stage,from:base,title:item.title,source:item.source||null,sidecar:item.sidecar||null,set_at:now,by:'planner'};
      write('stages.json',records);
      return c.json({data:withPublications(cache),draft});
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  // Feed o Trial de Instagram por pieza. En la cola escribe la ficha con cola.py modo-ig; una pieza que todavía no
  // entró a la cola lo guarda en instagram-mode.json, que `listo` lee al crear la ficha. Nunca llama a Postiz:
  // en una pieza agendada el post programado queda igual y el modo se aplica al reagendarla, con tu OK en el chat.
  app.post('/api/planner/instagram-mode',async c=>{
    try {
      const body=validatePlannerInstagramMode(await c.req.json());
      const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
      if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
      if(!['reel','video'].includes(item.format))return c.json({error:'Feed o Trial aplica sólo a reels.'},400);
      if(['published','component','archived','discarded'].includes(item.status))return c.json({error:'Esta pieza ya no se agenda.'},400);
      if(item.fingerprint!==body.fingerprint)return c.json({error:'La pieza cambió desde que la abriste. Recargá antes de cambiarla.'},409);
      if(item.status==='scheduled'&&body.confirm_scheduled!==true)return c.json({error:'Ya está en Postiz: confirmá que el cambio quede para cuando se reagende.'},409);
      if(String(item.id).startsWith('queue:')&&item.slug){
        try{await exec(PYTHON,[resolve(ENGINE_DIR,'cola.py'),'modo-ig',item.slug,body.trial?'trial':'feed',...(item.status==='scheduled'?['--aunque-agendada']:[])],{cwd:REPO_DIR,timeout:30000});}
        catch(e:any){return c.json({error:String(e?.stderr||'').replace(/^✗\s*/,'').trim()||'No se pudo guardar en la ficha de la cola.'},400);}
      } else if(String(item.id).startsWith('piece:')&&typeof item.source==='string'&&item.source){
        const records=fileRead(resolve(STATE(),'instagram-mode.json'),{});
        records[item.source]={trial:body.trial,title:item.title,set_at:new Date().toISOString(),by:'planner'};
        write('instagram-mode.json',records);
      } else return c.json({error:'Esta pieza no tiene carpeta local donde guardar el modo.'},400);
      cache=null;
      const fresh=await inventory(),now=fresh.items.find((i:any)=>i.id===item.id);
      // El toggle es una edición tuya: no debe hacer que tu propia propuesta pendiente de esa pieza parezca vieja.
      const draft=fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}}),pending=draft.changes?.[item.id];
      if(pending&&now&&pending.fingerprint===item.fingerprint&&now.fingerprint!==item.fingerprint){pending.fingerprint=now.fingerprint;draft.revision++;draft.saved_at=new Date().toISOString();write('draft.json',draft);}
      return c.json({data:fresh,draft});
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  app.get('/api/planner/feedback',async c=>{
    const data=await inventory(),item=data.items.find((i:any)=>i.id===c.req.query('id'));
    if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},404);
    const dir=feedbackDir(item),entries=pieceFeedback(dir);
    return c.json({dir:rel(dir),entries,prompt:entries.some(e=>e.estado!=='aplicado'&&e.estado!=='en_curso')?feedbackPrompt(item,dir,entries):null});
  });
  app.post('/api/planner/feedback',async c=>{
    try {
      const body=validatePlannerFeedback(await c.req.json());
      const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
      if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
      const dir=feedbackDir(item);mkdirSync(dir,{recursive:true});
      const now=new Date(),stamp=now.toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)+'-'+randomUUID().slice(0,4);
      let audio=null;
      if(body.audio){const target=resolve(dir,stamp+'-planner'+body.audio.ext),raw=resolve(dir,stamp+'-raw'+body.audio.ext);writeFileSync(raw,body.audio.buf);
        // MediaRecorder deja el webm sin duración: una copia con ffmpeg la escribe. Sin ffmpeg, queda el original tal cual.
        try{await exec('ffmpeg',['-v','error','-y','-i',raw,'-c','copy',target],{timeout:30000});if(!existsSync(target)||!statSync(target).size)throw new Error('vacío');unlinkSync(raw);}catch{renameSync(raw,target);}
        audio=rel(target);}
      const entry={id:item.id,title:item.title,source:item.source||null,video:item.primary?.path||null,status_planner:item.status,created_at:now.toISOString(),by:'planner',text:body.text||null,audio,audio_mime:body.audio?.mime||null,audio_seconds:body.audio_seconds,video_time:body.video_time,transcript:null,estado:'pendiente'};
      const target=resolve(dir,stamp+'-planner.json'),tmp=target+'.tmp';writeFileSync(tmp,JSON.stringify(entry,null,2));renameSync(tmp,target);
      const entries=pieceFeedback(dir);
      return c.json({dir:rel(dir),entries,prompt:feedbackPrompt(item,dir,entries)});
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  // «Copiar para Claude Code» de una pieza: sus notas pendientes pasan a «enviado».
  app.post('/api/planner/feedback/sent',async c=>{
    const body=await c.req.json().catch(()=>null);
    if(!body||typeof body.id!=='string')return c.json({error:'Pieza inválida'},400);
    const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
    if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
    const dir=feedbackDir(item);markFeedbackSent(dir,pieceFeedback(dir).map(e=>e.file),'copiar');
    const entries=pieceFeedback(dir);
    return c.json({dir:rel(dir),entries,prompt:entries.some(e=>e.estado!=='aplicado'&&e.estado!=='en_curso')?feedbackPrompt(item,dir,entries):null});
  });
  // Borrar una nota la mueve a feedback/.borradas: nada se pierde.
  app.post('/api/planner/feedback/remove',async c=>{
    const body=await c.req.json().catch(()=>null);
    if(!body||typeof body.id!=='string'||typeof body.file!=='string'||!/^[\w.-]+-planner\.json$/.test(body.file))return c.json({error:'Nota inválida'},400);
    const data=await inventory(),item=data.items.find((i:any)=>i.id===body.id);
    if(!item)return c.json({error:'Esta pieza ya no está en el tablero.'},400);
    const dir=feedbackDir(item),src=resolve(dir,body.file);
    if(!existsSync(src))return c.json({error:'Esa nota ya no está.'},404);
    const trash=resolve(dir,'.borradas');mkdirSync(trash,{recursive:true});
    const entry=fileRead(src,{});
    if(entry.audio){const a=resolve(ROOT(),entry.audio);if(within(dir,a)&&existsSync(a))renameSync(a,resolve(trash,relative(dir,a)));}
    renameSync(src,resolve(trash,body.file));
    const entries=pieceFeedback(dir);
    return c.json({dir:rel(dir),entries,prompt:entries.some(e=>e.estado!=='aplicado'&&e.estado!=='en_curso')?feedbackPrompt(item,dir,entries):null});
  });
  app.put('/api/planner/draft',async c=>{
    try {const body=validatePlannerDraft(await c.req.json());const old=fileRead(resolve(STATE(),'draft.json'),{revision:0});
      if(body.revision!==old.revision)return c.json({error:'El tablero cambió en otra pestaña. Recargá antes de guardar.'},409);
      const next={revision:old.revision+1,changes:body.changes,saved_at:new Date().toISOString()};write('draft.json',next);return c.json(next);
    }catch(e){return c.json({error:(e as Error).message},400);}
  });
  // Este endpoint sólo congela una propuesta. Se agenda cuando la confirmás en el chat de Claude Code.
  app.post('/api/planner/proposals',async c=>{
    const body=await c.req.json().catch(()=>null);if(!body||!Number.isInteger(body.revision))return c.json({error:'Propuesta inválida'},400);
    const draft=fileRead(resolve(STATE(),'draft.json'),{revision:0,changes:{}});
    if(body.revision!==draft.revision)return c.json({error:'Guardá primero la última versión.'},409);
    const data=await inventory();const changes=Object.entries(draft.changes).map(([id,value])=>({item:data.items.find((i:any)=>i.id===id),change:value as any}));
    // El feedback de contenido viaja en la misma propuesta que la agenda.
    const feedback=data.items.filter((i:any)=>i.feedback_pending&&!['discarded','component','archived'].includes(i.status)).map((i:any)=>({id:i.id,title:i.title,status:i.status,source:i.source||null,video:i.primary?.path||null,feedback_dir:rel(feedbackDir(i)),notes:pendingFeedback(i).map(e=>({file:e.file,created_at:e.created_at,text:e.text,audio:e.audio,audio_seconds:e.audio_seconds,video_time:e.video_time}))}));
    if(!changes.length&&!feedback.length)return c.json({error:'Todavía no hay cambios.'},400);
    // Cada rechazo nombra las piezas, para corregirlas desde la lista de la propuesta.
    const names=(list:any[])=>list.map(x=>'«'+x.item.title+'»').join(', ');
    if(changes.some(x=>!x.item))return c.json({error:'Una pieza ya no está en el tablero. Quitala de la propuesta.'},409);
    const closed=changes.filter(x=>['published','component','archived','discarded'].includes(x.item.status));
    if(closed.length)return c.json({error:`Ya está publicada o es de consulta: ${names(closed)}. Quitala de la propuesta.`},409);
    const stale=changes.filter(({item,change})=>change.fingerprint && (item.fingerprint!==change.fingerprint || JSON.stringify(item.primary)!==JSON.stringify(change.primary)));
    if(stale.length)return c.json({error:`Cambió desde tu edición: ${names(stale)}. Revisala en la propuesta.`},409);
    const id=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+randomUUID().slice(0,6);
    // Una pieza con final y fecha en el calendario queda aprobada al confirmar; sólo la que no tiene final sigue en reserva.
    const proposal={id,status:'awaiting_chat_confirmation',created_at:new Date().toISOString(),timezone:data.timezone,postiz_fetched_at:data.postiz_fetched_at,revision:draft.revision,changes:changes.map(({item,change})=>({id:item.id,title:item.title,source:item.source,sidecar:item.sidecar,slug:item.slug,primary:item.primary,fingerprint:item.fingerprint,original:item.scheduled,requested:change.when,requested_action:plannerAction(item,change),paused:item.status==='paused',pause:item.pause||null,note:change.note||'',networks:item.networks,requested_networks:change.networks??(item.networks?.length?item.networks:data.config?.default_networks||[]),collaborators:item.collaborators||[],requested_version:change.version||null,accounts:item.accounts||{},requested_accounts:change.accounts??(item.accounts||{}),requested_collaborators:change.collaborators??(String(item.id).startsWith('queue:')?(item.collaborators||[]):data.config?.default_collaborators||[]),channels:item.channels,instagram_trial:item.trial===true,production_status:item.status,missing_final:!item.primary,approved_by_calendar:!item.approved&&!!change.when&&!!item.primary,requires_final_approval:!item.approved&&!(change.when&&item.primary)})),feedback};
    write('proposal-'+id+'.json',proposal);
    for(const f of feedback)markFeedbackSent(resolve(ROOT(),f.feedback_dir),f.notes.map((n:any)=>n.file),'propuesta '+id);
    return c.json({id,path:rel(resolve(STATE(),'proposal-'+id+'.json')),prompt:proposalPrompt(id,changes.length,feedback)});
  });
  app.get('/api/planner/media',c=>{
    const p=plannerMediaPath(c.req.query('path')||'');if(!p)return c.text('No disponible',404);
    const size=statSync(p).size,headers:Record<string,string>={'Content-Type':TYPES[extname(p).toLowerCase()],'Accept-Ranges':'bytes','Cache-Control':'private, max-age=30'};
    const range=c.req.header('range');let start=0,end=size-1,status=200;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
      if(start>=size||start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length']=String(end-start+1);
    return new Response(Readable.toWeb(createReadStream(p,{start,end})) as ReadableStream,{status,headers});
  });
  app.get('/api/planner/poster',async c=>{
    const p=plannerMediaPath(c.req.query('path')||''),isImage=!!p&&['.png','.jpg','.jpeg','.webp'].includes(extname(p).toLowerCase());
    if(!p||!(isImage||['.mp4','.mov','.webm'].includes(extname(p).toLowerCase())))return c.text('No disponible',404);
    const key=createHash('sha256').update(p+statSync(p).mtimeMs).digest('hex');const folder=resolve(STATE(),'cache/posters');mkdirSync(folder,{recursive:true});const out=resolve(folder,key+'.jpg');
    try {if(!existsSync(out))await exec('ffmpeg',['-hide_banner','-loglevel','error',...(isImage?[]:['-ss','0.15']),'-i',p,'-frames:v','1','-vf','scale=320:-2','-q:v','5','-y',out],{timeout:15000});return new Response(readFileSync(out),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=3600'}});}
    // Sin ffmpeg, una imagen se muestra tal cual.
    catch{if(isImage)return new Response(readFileSync(p),{headers:{'Content-Type':TYPES[extname(p).toLowerCase()],'Cache-Control':'private, max-age=60'}});return c.text('Sin portada',404);}
  });
}
