'use strict';
// Planner de publicaciones. Lee /api/planner/*, guarda un borrador de cambios y congela propuestas;
// nunca agenda en Postiz: eso lo hace Claude Code cuando confirmás la propuesta en el chat.

const $ = id => document.getElementById(id);
// Zona horaria, idioma de fechas y marcas salen de planner.config.json (llegan con /api/planner/data).
let TZ = 'America/Argentina/Buenos_Aires', LOCALE = 'es-AR';
let BRANDS = [];
const BRAND_LABEL = {};
const defaultBrand = () => BRANDS[0] || '';
const STATUS = { scheduled: 'En Postiz', ready: 'Listo', review: 'Por revisar', development: 'En desarrollo', attention: 'Por confirmar', paused: 'Pausada', published: 'Publicada', component: 'Componente', archived: 'Archivada', discarded: 'Descartada' };
// En la barra «Por agendar» van sólo Listos y Por revisar.
const GROUPS = { ready: 'Listos', review: 'Por revisar' };
const AGE_DAYS = 21;
const NET_ICON = {
  instagram: '<svg viewBox="0 0 24 24"><path d="M7.03.084c-1.277.06-2.149.264-2.91.563a5.9 5.9 0 0 0-2.124 1.388a5.9 5.9 0 0 0-1.38 2.127C.321 4.926.12 5.8.064 7.076s-.069 1.688-.063 4.947s.021 3.667.083 4.947c.061 1.277.264 2.149.563 2.911c.308.789.72 1.457 1.388 2.123a5.9 5.9 0 0 0 2.129 1.38c.763.295 1.636.496 2.913.552c1.278.056 1.689.069 4.947.063s3.668-.021 4.947-.082c1.28-.06 2.147-.265 2.91-.563a5.9 5.9 0 0 0 2.123-1.388a5.9 5.9 0 0 0 1.38-2.129c.295-.763.496-1.636.551-2.912c.056-1.28.07-1.69.063-4.948c-.006-3.258-.02-3.667-.081-4.947c-.06-1.28-.264-2.148-.564-2.911a5.9 5.9 0 0 0-1.387-2.123a5.9 5.9 0 0 0-2.128-1.38c-.764-.294-1.636-.496-2.914-.55C15.647.009 15.236-.006 11.977 0S8.31.021 7.03.084m.14 21.693c-1.17-.05-1.805-.245-2.228-.408a3.7 3.7 0 0 1-1.382-.895a3.7 3.7 0 0 1-.9-1.378c-.165-.423-.363-1.058-.417-2.228c-.06-1.264-.072-1.644-.08-4.848c-.006-3.204.006-3.583.061-4.848c.05-1.169.246-1.805.408-2.228c.216-.561.477-.96.895-1.382a3.7 3.7 0 0 1 1.379-.9c.423-.165 1.057-.361 2.227-.417c1.265-.06 1.644-.072 4.848-.08c3.203-.006 3.583.006 4.85.062c1.168.05 1.804.244 2.227.408c.56.216.96.475 1.382.895s.681.817.9 1.378c.165.422.362 1.056.417 2.227c.06 1.265.074 1.645.08 4.848c.005 3.203-.006 3.583-.061 4.848c-.051 1.17-.245 1.805-.408 2.23c-.216.56-.477.96-.896 1.38a3.7 3.7 0 0 1-1.378.9c-.422.165-1.058.362-2.226.418c-1.266.06-1.645.072-4.85.079s-3.582-.006-4.848-.06m9.783-16.192a1.44 1.44 0 1 0 1.437-1.442a1.44 1.44 0 0 0-1.437 1.442M5.839 12.012a6.161 6.161 0 1 0 12.323-.024a6.162 6.162 0 0 0-12.323.024M8 12.008A4 4 0 1 1 12.008 16A4 4 0 0 1 8 12.008"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02c.08 1.53.63 3.09 1.75 4.17c1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97c-.57-.26-1.1-.59-1.62-.93c-.01 2.92.01 5.84-.02 8.75c-.08 1.4-.54 2.79-1.35 3.94c-1.31 1.92-3.58 3.17-5.91 3.21c-1.43.08-2.86-.31-4.08-1.03c-2.02-1.19-3.44-3.37-3.65-5.71c-.02-.5-.03-1-.01-1.49c.18-1.9 1.12-3.72 2.58-4.96c1.66-1.44 3.98-2.13 6.15-1.72c.02 1.48-.04 2.96-.04 4.44c-.99-.32-2.15-.23-3.02.37c-.63.41-1.11 1.04-1.36 1.75c-.21.51-.15 1.07-.14 1.61c.24 1.64 1.82 3.02 3.5 2.87c1.12-.01 2.19-.66 2.77-1.61c.19-.33.4-.67.41-1.06c.1-1.79.06-3.57.07-5.36c.01-4.03-.01-8.05.02-12.07"/></svg>',
  youtube: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.02 3.02 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.02 3.02 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.02 3.02 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.02 3.02 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814M9.545 15.568V8.432L15.818 12z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978c.401 0 .955.042 1.468.103a9 9 0 0 1 1.141.195v3.325a9 9 0 0 0-.653-.036a27 27 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.7 1.7 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103l-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584l-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
  threads: '<svg viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098c1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015c-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164c1.43 1.783 3.631 2.698 6.54 2.717c2.623-.02 4.358-.631 5.8-2.045c1.647-1.613 1.618-3.593 1.09-4.798c-.31-.71-.873-1.3-1.634-1.75c-.192 1.352-.622 2.446-1.284 3.272c-.886 1.102-2.14 1.704-3.73 1.79c-1.202.065-2.361-.218-3.259-.801c-1.063-.689-1.685-1.74-1.752-2.964c-.065-1.19.408-2.285 1.33-3.082c.88-.76 2.119-1.207 3.583-1.291a14 14 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757c-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388q.163.07.321.142c1.49.7 2.58 1.761 3.154 3.07c.797 1.82.871 4.79-1.548 7.158c-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69q-.362 0-.739.021c-1.836.103-2.98.946-2.916 2.143c.067 1.256 1.452 1.839 2.784 1.767c1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221"/></svg>',
  bluesky: '<svg viewBox="0 0 24 24"><path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037c-.856 3.061-3.978 3.842-6.755 3.37c4.854.826 6.089 3.562 3.422 6.299c-5.065 5.196-7.28-1.304-7.847-2.97c-.104-.305-.152-.448-.153-.327c0-.121-.05.022-.153.327c-.568 1.666-2.782 8.166-7.847 2.97c-2.667-2.737-1.432-5.473 3.422-6.3c-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/></svg>',
  pinterest: '<svg viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162c-.105-.949-.199-2.403.041-3.439c.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911c1.024 0 1.518.769 1.518 1.688c0 1.029-.653 2.567-.992 3.992c-.285 1.193.6 2.165 1.775 2.165c2.128 0 3.768-2.245 3.768-5.487c0-2.861-2.063-4.869-5.008-4.869c-3.41 0-5.409 2.562-5.409 5.199c0 1.033.394 2.143.889 2.741c.099.12.112.225.085.345c-.09.375-.293 1.199-.334 1.363c-.053.225-.172.271-.401.165c-1.495-.69-2.433-2.878-2.433-4.646c0-3.776 2.748-7.252 7.92-7.252c4.158 0 7.392 2.967 7.392 6.923c0 4.135-2.607 7.462-6.233 7.462c-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146c1.123.345 2.306.535 3.55.535c6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"/></svg>',
};
const NET_NAME = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X', threads: 'Threads', bluesky: 'Bluesky', pinterest: 'Pinterest', mastodon: 'Mastodon', google: 'Google Business' };
const PREFERRED_ORDER = ['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'x', 'threads', 'bluesky', 'pinterest'];
// Las redes son las cuentas conectadas en Postiz (planner.config.json → channels).
let NET_ORDER = [];
const netName = n => NET_NAME[n] || (n ? n[0].toUpperCase() + n.slice(1) : '');
const netIcon = n => NET_ICON[n] || `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11"/><text x="12" y="16.5" text-anchor="middle" font-size="13" font-family="sans-serif" font-weight="700" fill="#fff">${(n || '?')[0].toUpperCase()}</text></svg>`;
const ICON = {
  check: '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
  restore: '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.8h2.8"/></svg>',
  left: '<svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg>',
  right: '<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>',
  copy: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M6 3.5v9M10 3.5v9"/></svg>',
  mic: '<svg viewBox="0 0 16 16"><rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14"/></svg>',
  stop: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" style="fill:currentColor"/></svg>',
};

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mediaUrl = a => '/api/planner/media?path=' + encodeURIComponent(typeof a === 'string' ? a : a.path);
const pad = n => String(n).padStart(2, '0');
const localParts = () => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
const nowLocal = () => { const p = localParts(); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const todayStr = () => nowLocal().slice(0, 10);
const dateAdd = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monday = d => dateAdd(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const fmt = (d, o) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...o }).format(new Date(d + 'T12:00:00Z')).replace('.', '');
const dayShort = d => fmt(d, { weekday: 'short' });
const dayLong = d => `${dayShort(d)} ${Number(d.slice(8))} ${fmt(d, { month: 'short' })}`;
const whenLabel = w => w ? `${dayLong(w.slice(0, 10))} · ${w.slice(11, 16)}` : 'Sin fecha';
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const addMinutes = (w, n) => { const d = new Date(w + ':00Z'); d.setUTCMinutes(d.getUTCMinutes() + n); return d.toISOString().slice(0, 16); };
const minutesBetween = (a, b) => Math.abs(new Date(a + ':00Z') - new Date(b + ':00Z')) / 60000;
const parseTime = raw => {
  const s = String(raw || '').trim().replace(/[.,h\s]/g, ':').replace(/:+/g, ':');
  let m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s) || /^(\d{1,2})(\d{2})$/.exec(s.replace(':', ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] || 0);
  return h < 24 && mi < 60 ? pad(h) + ':' + pad(mi) : null;
};
const relDays = iso => {
  if (!iso) return '';
  const n = Math.round((new Date(todayStr() + 'T12:00:00Z') - new Date(iso.slice(0, 10) + 'T12:00:00Z')) / 864e5);
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : n < 14 ? `hace ${n} d` : `hace ${Math.round(n / 7)} sem`;
};
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const eqSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const store = { get(k, d) { try { const v = localStorage.getItem('planner.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('planner.' + k, JSON.stringify(v)); } catch {} } };

// ---------- estado ----------
let data = { items: [], config: {} }, draft = { revision: 0, changes: {} };
let view = store.get('view', 'week'), group = store.get('group', 'ready');
let backlogCollapsed = store.get('backlogCollapsed', false) === true;
let week = monday(todayStr());
let saving = Promise.resolve(), saveError = false, busy = false;
let acked = {}; // los cambios tal como los confirmó el servidor en el último guardado
const showOlder = {}, pages = {};
const PAGE_BACKLOG = 8, PAGE_COLUMN = 8;
const STAGES = [['development', 'En desarrollo'], ['review', 'Por revisar'], ['ready', 'Listo']];
// Paginador común: ‹ 1–8 de 70 ›
const pager = (key, total, size) => { if (total <= size) return ''; const p = Math.min(pages[key] || 0, Math.ceil(total / size) - 1); return `<div class="pager"><button class="icon" data-page="${key}" data-to="${p - 1}" ${p === 0 ? 'disabled' : ''} aria-label="Anteriores">${ICON.left}</button><span>${p * size + 1}–${Math.min(total, (p + 1) * size)} de ${total}</span><button class="icon" data-page="${key}" data-to="${p + 1}" ${(p + 1) * size >= total ? 'disabled' : ''} aria-label="Siguientes">${ICON.right}</button></div>`; };
const pageSlice = (key, list, size) => { const p = Math.max(0, Math.min(pages[key] || 0, Math.ceil(list.length / size) - 1)); pages[key] = p; return list.slice(p * size, (p + 1) * size); };
const undoStack = [];
const cfg = () => data.config || {};
const slotsCfg = () => cfg().slots || ['12:45', '18:30', '22:00'];
// Horarios sugeridos de los botones; `slots` mide la capacidad del día.
const suggestedTimes = () => cfg().suggested_times?.length ? cfg().suggested_times : slotsCfg();
const windowMin = () => cfg().occupied_window_minutes || 75;

// ---------- lectura de piezas ----------
const ch = i => draft.changes[i.id];
const when = i => ch(i) ? ch(i).when : i.scheduled;
const normNet = n => String(n || '').replace(/-(standalone|business|page)$/, '');
const sortNets = a => NET_ORDER.filter(n => a.includes(n));
const origNets = i => i.networks?.length ? sortNets([...new Set(i.networks.map(normNet))]) : sortNets(cfg().default_networks || NET_ORDER);
const nets = i => ch(i)?.networks ?? origNets(i);
const origCollab = i => i.id.startsWith('queue:') ? (i.collaborators || []) : [...(cfg().default_collaborators || [])];
const collab = i => ch(i)?.collaborators ?? origCollab(i);
const collabOptions = () => cfg().collaborator_options || [];
// Cuentas reales de Postiz por red (la principal primero): cada pieza puede salir desde otra cuenta de la misma red.
const acctOpts = n => (cfg().networks || []).find(x => x.id === n)?.accounts || [];
const normAcc = map => Object.fromEntries(Object.entries(map || {}).filter(([n, v]) => v && acctOpts(n).length > 1 && v !== acctOpts(n)[0].id).sort());
const origAccounts = i => normAcc(i.accounts);
const accounts = i => ch(i)?.accounts ?? origAccounts(i);
const acctOf = (n, map) => { const o = acctOpts(n); return o.find(a => a.id === map?.[n]) || o[0]; };
// Versión que se publica: la elegida en el detalle o la de la pieza.
const version = i => ch(i)?.version ?? null;
const isVideoPiece = i => !isCarousel(i) && i.primary?.kind === 'video';
const eqAcc = (a, b) => JSON.stringify(normAcc(a)) === JSON.stringify(normAcc(b));
const collabValue = o => o.handle || o.label;
const collabLabel = v => (collabOptions().find(o => o.handle === v || o.label === v)?.label) || '@' + v;
// Piezas con feedback de contenido sin aplicar: viajan en la misma propuesta.
const feedbackItems = () => data.items.filter(i => i.feedback_pending && !['discarded', 'component', 'archived'].includes(i.status));
const isCarousel = i => ['carrusel', 'carousel'].includes(i.format);
const formatLabel = i => isCarousel(i) ? 'Carrusel' : ({ reel: 'Reel', video: 'Video', story: 'Historia', image: 'Imagen' }[i.format] || 'Sin ficha');
const isRef = i => ['component', 'archived'].includes(i.status);
const editable = i => !['published', 'component', 'archived', 'discarded'].includes(i.status);
// Sólo puede haber salido algo con final: una pieza en desarrollo no se marca como publicada.
const canMark = i => editable(i) && i.status !== 'development';
const canDiscard = i => editable(i) && i.status !== 'scheduled';
// Ponerle fecha a una pieza con final la aprueba; sólo queda en reserva la que todavía no tiene archivo final,
// y va en rojo para que llame la atención.
const noFinal = i => !i.primary;
const byId = id => data.items.find(i => i.id === id);
const thumbUrl = i => i.poster ? mediaUrl(i.poster) : i.primary?.kind === 'image' ? mediaUrl(i.primary) : i.primary?.kind === 'video' ? '/api/planner/poster?path=' + encodeURIComponent(i.primary.path) : null;
const thumb = (i, cls = '') => { const u = thumbUrl(i); return u ? `<img class="thumb ${cls}" src="${esc(u)}" alt="" loading="lazy" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb ph ${cls}',textContent:'—'}))">` : `<div class="thumb ph ${cls}">${i.status === 'development' ? '…' : '—'}</div>`; };
const netIcons = list => list.map(n => `<span class="net" title="${esc(netName(n))}">${netIcon(n)}</span>`).join('');
// Instagram: feed directo (default) o Trial, por reel.
const canIgMode = i => editable(i) && ['reel', 'video'].includes(i.format) && (i.id.startsWith('queue:') || i.id.startsWith('piece:'));
const liveIgTrial = i => { const c = (i.channels || []).find(x => normNet(x.network) === 'instagram' && x.verified && x.state === 'QUEUE'); return c ? !!c.trial : null; };
const collabText = i => nets(i).includes('instagram') && !i.trial && collab(i).length ? `<span class="collab">+${collab(i).map(v => esc(collabLabel(v).replace(/^La /, ''))).join(', ')}</span>` : '';

function inScope(i) {
  // Borradores sueltos de Postiz (p. ej. historias que nunca salieron): no son piezas para planificar.
  if (i.id.startsWith('remote:') && (i.channels || []).every(c => c.state === 'DRAFT')) return false;
  const b = $('brand').value, f = $('format').value, q = $('search').value.toLowerCase().trim();
  if (b && b !== 'mine' && i.brand !== b) return false;
  if (f === 'reel' && !['reel', 'video'].includes(i.format)) return false;
  if (f === 'carrusel' && !isCarousel(i)) return false;
  return !q || (i.title + ' ' + i.slug + ' ' + i.brand).toLowerCase().includes(q);
}
// La ocupación de horarios no depende del filtro de marca. Lo que está en desarrollo no ocupa el calendario.
const timeline = (exceptIds = []) => data.items.filter(i => !exceptIds.includes(i.id) && editable(i) && when(i) && i.status !== 'development');
function backlogGroupOf(i) {
  if (!editable(i) || when(i)) return null;
  if (ch(i)?.pause || (i.status === 'paused' && !ch(i)?.resume)) return null;
  if (['ready', 'scheduled', 'paused'].includes(i.status)) return 'ready';
  return GROUPS[i.status] ? i.status : null;
}
const freshEnough = (i, days) => days === 'all' || i.status === 'ready' || i.status === 'scheduled' || (i.created || '') >= dateAdd(todayStr(), -Number(days));

// ---------- render ----------
function renderBacklogVisibility() {
  $('weekView').classList.toggle('backlog-collapsed', backlogCollapsed);
  $('backlogPanel').hidden = backlogCollapsed;
  $('showBacklog').hidden = !backlogCollapsed;
}
function toggleBacklog(collapsed) {
  backlogCollapsed = collapsed;
  store.set('backlogCollapsed', collapsed);
  renderBacklogVisibility();
  $(collapsed ? 'showBacklog' : 'hideBacklog').focus({ preventScroll: true });
}
$('hideBacklog').onclick = () => toggleBacklog(true);
$('showBacklog').onclick = () => toggleBacklog(false);
renderBacklogVisibility();

function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('weekView').hidden = view !== 'week'; $('piecesView').hidden = view !== 'pieces'; $('historyView').hidden = view !== 'history'; $('storiesView').hidden = view !== 'stories';
  document.body.classList.toggle('stories-mode', view === 'stories');
  const n = Object.keys(draft.changes).length + feedbackItems().filter(i => !draft.changes[i.id]).length;
  $('changeCount').textContent = n; $('review').disabled = !n || saveError || busy;
  renderSync(); renderAlerts();
  if (view === 'week') { renderBacklog(); renderWeek(); }
  else if (view === 'pieces') renderPieces();
  else if (view === 'stories') renderStories(); // historias.js
  else renderHistory();
}

function renderSync() {
  const t = data.postiz_fetched_at; const el = $('sync');
  if (el.classList.contains('busy')) return;
  if (!t) { $('syncLabel').textContent = 'Postiz sin consultar'; el.classList.add('stale'); return; }
  const mins = Math.round((Date.now() - Date.parse(t)) / 60000);
  $('syncLabel').textContent = 'Postiz · ' + (mins < 2 ? 'recién' : mins < 60 ? `hace ${mins} min` : mins < 1440 ? `hace ${Math.round(mins / 60)} h` : `hace ${Math.round(mins / 1440)} d`);
  el.classList.toggle('stale', mins > 60);
  el.title = 'Consultado ' + new Date(t).toLocaleString(LOCALE, { timeZone: TZ, hourCycle: 'h23' }) + '. Clic para volver a consultar.';
}

function renderAlerts() {
  const pending = data.items.filter(i => i.pending_channels?.length);
  $('alerts').innerHTML = pending.map(i => `<div class="alert"><span><b>Ya publicada, con envíos en cola en Postiz:</b> ${esc(i.title)}</span><button class="ghost" data-open="${esc(i.id)}">Ver canales</button></div>`).join('');
}

function renderBacklog() {
  const items = data.items.filter(i => inScope(i) && backlogGroupOf(i));
  const groups = Object.keys(GROUPS).map(k => {
    const all = items.filter(i => backlogGroupOf(i) === k);
    const fresh = all.filter(i => freshEnough(i, AGE_DAYS));
    return { k, all, fresh };
  }).filter(g => g.k === 'ready' || g.all.length);
  if (!groups.find(g => g.k === group)) group = 'ready';
  $('groupSwitch').innerHTML = groups.map(g => `<button role="tab" class="${g.k === group ? 'on' : ''}" aria-selected="${g.k === group}" data-group="${g.k}">${GROUPS[g.k]}<span class="n">${g.fresh.length}</span></button>`).join('');
  const g = groups.find(x => x.k === group);
  const list = (showOlder[group] ? g.all : g.fresh).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const older = g.all.length - g.fresh.length;
  const key = 'b:' + group + (showOlder[group] ? ':all' : '');
  $('backlogList').innerHTML = (pageSlice(key, list, PAGE_BACKLOG).map(i => tile(i, 'backlog')).join('') || `<div class="empty">${group === 'ready' ? 'No hay piezas listas sin fecha.' : 'Nada por acá.'}</div>`)
    + `<div class="backlog-foot">${pager(key, list.length, PAGE_BACKLOG)}${older ? `<button class="link" data-older="${group}">${showOlder[group] ? 'Sólo las recientes' : `+${older} anteriores`}</button>` : ''}</div>`;
  $('autoOpen').disabled = !data.items.some(i => inScope(i) && backlogGroupOf(i) === 'ready');
}

// Una pieza se reconoce por su portada: la imagen manda y el estado se lee siempre en texto.
function statusOf(i) {
  if (i.status === 'published') return ['done', i.publication ? 'Publicada · marcada por vos' : 'Publicada'];
  if (i.status === 'discarded') return ['muted', 'Descartada'];
  if (isRef(i)) return ['muted', STATUS[i.status]];
  const c = ch(i);
  if (c?.pause) return ['proposed', 'Se pausa'];
  if (c?.resume && !c.when) return ['proposed', 'Vuelve a Listos'];
  if (c && !c.when && i.scheduled) return ['proposed', 'Se desagenda'];
  if (c?.when && noFinal(i)) return ['alert', 'Sin final · reserva'];
  if (c) return ['proposed', i.scheduled ? (c.when === i.scheduled ? 'Cambio tuyo' : 'Cambio de fecha') : 'Fecha nueva'];
  if (when(i) && noFinal(i)) return ['alert', 'Sin final · reserva'];
  return [{ scheduled: 'postiz', ready: 'ready', review: 'review', development: 'dev', attention: 'warn', paused: 'paused' }[i.status] || 'muted', STATUS[i.status] || i.status];
}
function tile(i, mode) {
  const [st, label] = statusOf(i), done = i.status === 'published';
  const u = thumbUrl(i), w = when(i);
  let chip = '';
  if (mode === 'week') chip = done ? `<span class="chip-ov ok">✓ ${esc(calendarTime(i) || '')}</span>` : editable(i) && w ? `<button class="chip-ov time" data-time="${esc(i.id)}" title="Cambiar la hora">${esc(calendarTime(i))}</button>` : `<span class="chip-ov">${esc(calendarTime(i))}</span>`;
  else if (mode === 'history') chip = i.history_date ? `<span class="chip-ov">${esc(dayShort(i.history_date))} ${Number(i.history_date.slice(8))}</span>` : '';
  else if (w && i.status !== 'published') chip = `<span class="chip-ov">${esc(dayShort(w.slice(0, 10)))} ${Number(w.slice(8, 10))} · ${w.slice(11, 16)}</span>`;
  else if (i.created) chip = `<span class="chip-ov soft">${esc(relDays(i.created))}</span>`;
  const brand = BRANDS.length > 1 && i.brand !== defaultBrand() ? `<span class="chip-ov brand">${esc(BRAND_LABEL[i.brand] || i.brand)}</span>` : '';
  const decided = done || i.id.startsWith('queue:') || i.id.startsWith('remote:') || ch(i)?.networks || w;
  const shownNets = done ? sortNets((i.channels || []).map(x => normNet(x.network))) : decided ? nets(i) : [];
  const extras = [i.newer_final && !version(i) ? '<span class="mini warn" title="La carpeta de la pieza tiene un final más nuevo que el de la cola">Versión nueva</span>' : '', isCarousel(i) ? '<span class="mini">Carrusel</span>' : '', i.trial && shownNets.includes('instagram') ? '<span class="mini" title="Reel de prueba en Instagram">Prueba</span>' : '', done || !decided ? '' : collabText(i)].join('');
  const acts = [];
  // Aprobar desde la semana = pasar a Listo (stages.json), con deshacer; no agenda nada en Postiz.
  // Con Aprobar no se muestra el estado al pie: repetiría el grupo «Por revisar».
  const approvable = mode === 'backlog' && i.status === 'review';
  if (approvable) acts.push(`<button class="approve" data-approve="${esc(i.id)}" title="Aprobar: pasa a Listos" aria-label="Aprobar pieza">Aprobar</button>`);
  // En las portadas sólo va descartar (con deshacer); «publicada» se marca desde el detalle para evitar clics sin querer.
  if (canDiscard(i) && mode !== 'week') acts.push(`<button data-discard="${esc(i.id)}" title="Descartar: deja de aparecer" aria-label="Descartar pieza">${ICON.trash}</button>`);
  if (i.status === 'discarded') acts.push(`<button data-restore="${esc(i.id)}" title="Recuperar" aria-label="Recuperar pieza">${ICON.restore}</button>`);
  const before = ch(i) && i.scheduled && ch(i).when !== i.scheduled ? ` · antes ${whenLabel(i.scheduled)}` : '';
  const img = u ? `<img src="${esc(u)}" alt="" loading="lazy" draggable="false" onerror="this.remove()">` : '';
  return `<article class="tile st-${st}" data-id="${esc(i.id)}" ${(editable(i) && mode !== 'history') || (mode === 'pieces' && i.status === 'discarded') ? 'data-drag="1"' : ''} tabindex="0" role="button" aria-label="${esc(i.title)}" title="${esc(i.title + before)}">
    <div class="poster"><span class="ph"><span>${esc(i.title)}</span></span>${img}<div class="ov-top">${chip}${brand}</div><div class="ov-bottom">${netIcons(shownNets)}${extras}</div></div>
    <div class="tile-foot">${(mode === 'pieces' && !['proposed', 'alert'].includes(st)) || approvable ? '<span></span>' : `<span class="st" title="${esc(label)}"><i></i><span>${esc(label)}</span></span>`}${acts.length ? `<span class="acts">${acts.join('')}</span>` : ''}</div></article>`;
}

function calendarDay(i) { return i.status === 'published' ? i.history_date : when(i)?.slice(0, 10); }
function calendarTime(i) { return i.status === 'published' ? (i.history_basis === 'scheduled_reference' ? (i.publication_reference || '').slice(11, 16) : '') : when(i)?.slice(11, 16) || ''; }

function renderWeek() {
  const today = todayStr(), end = dateAdd(week, 6);
  const sameYear = week.slice(0, 4) === end.slice(0, 4);
  $('weekTitle').textContent = week.slice(5, 7) === end.slice(5, 7)
    ? `${Number(week.slice(8))} – ${Number(end.slice(8))} ${fmt(end, { month: 'long' })}`
    : `${Number(week.slice(8))} ${fmt(week, { month: 'short' })} – ${Number(end.slice(8))} ${fmt(end, { month: 'short' })}${sameYear ? '' : ' ' + end.slice(0, 4)}`;
  $('jumpDate').value = week;
  const items = data.items.filter(i => inScope(i) && !isRef(i) && i.status !== 'discarded' && i.status !== 'development' && calendarDay(i));
  const occupied = timeline();
  $('grid').innerHTML = Array.from({ length: 7 }, (_, n) => {
    const d = dateAdd(week, n), list = items.filter(i => calendarDay(i) === d).sort((a, b) => calendarTime(a).localeCompare(calendarTime(b)));
    const count = occupied.filter(i => when(i).slice(0, 10) === d).length, slots = slotsCfg().length;
    const bars = Array.from({ length: Math.max(slots, count) }, (_, k) => `<i class="${k < count ? (k >= slots ? 'on over' : 'on') : ''}"></i>`).join('');
    const cls = ['day', d === today ? 'today' : '', d < today ? 'past' : ''].join(' ');
    return `<section class="${cls}" ${d >= today ? `data-drop="${d}"` : ''} aria-label="${esc(dayLong(d))}"><div class="day-head"><span class="day-name">${esc(dayShort(d))}</span><span class="day-num">${Number(d.slice(8))}</span></div><div class="load" title="${count} de ${slots} horarios ocupados">${bars}</div>${list.map(i => tile(i, 'week')).join('')}<div class="drop-hint">Soltá acá</div></section>`;
  }).join('');
  const outside = items.filter(i => i.status !== 'published' && (calendarDay(i) < week || calendarDay(i) > end) && calendarDay(i) >= today).map(calendarDay).sort();
  const target = outside.find(d => d > end) || outside[outside.length - 1];
  $('footnote').hidden = !outside.length;
  $('footnote').innerHTML = outside.length ? `${outside.length} ${outside.length === 1 ? 'pieza más' : 'piezas más'} en otras semanas · <button class="link" data-week="${target}">Ir al ${esc(dayLong(target))}</button>` : '';
}

// Tablero por estados en filas: cada franja es un estado; arrastrar a otra franja cambia el estado (Lista = aprobada).
// Sin textos de uso en las franjas: sólo nombre y contador.
function laneSize() { const w = ($('piecesList').clientWidth || window.innerWidth - 56) - 24; return Math.max(2, Math.floor((w + 12) / (150 + 12))); }
function renderPieces() {
  const age = $('age').value, per = laneSize();
  const lanes = [...STAGES.map(([k, l]) => ({ k, l, drop: 'stage:' + k })), { k: 'scheduled', l: 'En Postiz' }, { k: 'paused', l: 'Pausadas', drop: 'pause' }, { k: 'discarded', l: 'Descartadas', drop: 'stage:discarded' }, ...($('showRefs').checked ? [{ k: 'ref', l: 'Archivadas' }] : [])];
  const scope = data.items.filter(inScope);
  $('piecesList').innerHTML = lanes.map(c => {
    const list = scope.filter(i => (c.k === 'ref' ? isRef(i) : i.status === c.k) && (c.k === 'scheduled' || c.k === 'paused' || freshEnough(i, age)))
      .sort((a, b) => c.k === 'scheduled' ? (when(a) || '').localeCompare(when(b) || '') : c.k === 'discarded' ? (b.discard?.discarded_at || '').localeCompare(a.discard?.discarded_at || '') : c.k === 'paused' ? (b.pause?.desde || '').localeCompare(a.pause?.desde || '') : (b.created || '').localeCompare(a.created || ''));
    const key = 'l:' + c.k + ':' + age + ':' + per;
    const tiles = pageSlice(key, list, per).map(i => tile(i, 'pieces')).join('');
    return `<section class="lane lane-${c.k}" ${c.drop ? `data-drop="${c.drop}"` : ''}><header class="lane-head"><i class="lane-dot"></i><h3>${c.l}</h3><span class="n">${list.length}</span>${pager(key, list.length, per)}</header>${list.length ? `<div class="lane-row" style="--per:${per}">${tiles}</div>` : '<div class="lane-empty">Vacía</div>'}</section>`;
  }).join('');
}
window.addEventListener('resize', () => { if (view === 'pieces') { clearTimeout(renderPieces.t); renderPieces.t = setTimeout(renderPieces, 150); } });

function renderHistory() {
  const list = data.items.filter(i => inScope(i) && i.status === 'published').sort((a, b) => (b.history_date || '').localeCompare(a.history_date || ''));
  const months = {};
  for (const i of list) { const k = i.history_date ? i.history_date.slice(0, 7) : 'none'; (months[k] ||= []).push(i); }
  const keys = Object.keys(months).sort((a, b) => a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a));
  $('historyList').innerHTML = keys.map(k => `<section class="section"><div class="section-head"><h3>${k === 'none' ? 'Sin fecha registrada' : esc(fmt(k + '-15', { month: 'long', year: 'numeric' }))}</h3><span class="n">${months[k].length}</span></div><div class="gallery">${months[k].map(i => tile(i, 'history')).join('')}</div></section>`).join('') || '<div class="empty">Todavía no hay publicaciones con estos filtros.</div>';
}

// ---------- guardar el borrador ----------
function toast(text, action, label = 'Deshacer') {
  $('toastText').textContent = text;
  const b = $('toastAction'); b.hidden = !action; b.textContent = label; b.onclick = () => { $('toast').classList.remove('show'); action(); };
  $('toast').classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => $('toast').classList.remove('show'), action ? 7000 : 4000);
}
async function api(path, options) { const r = await fetch('/api/planner/' + path, options); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'No se pudo completar.'), { status: r.status, needsSetup: !!j.needs_setup, config: j.config }); return j; }
const post = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
// «Guardado» se muestra un momento y se va; un error queda fijo.
function setSave(text, error = false) {
  const el = $('saveStatus'); el.textContent = text; el.classList.toggle('error', error);
  clearTimeout(setSave.t); if (text === 'Guardado') setSave.t = setTimeout(() => { if (el.textContent === 'Guardado') el.textContent = ''; }, 2500);
}
const dirtyIds = () => [...new Set([...Object.keys(acked), ...Object.keys(draft.changes)])].filter(id => JSON.stringify(acked[id]) !== JSON.stringify(draft.changes[id]));
function queueSave() {
  setSave('Guardando…');
  saving = saving.then(async () => {
    if (saveError) throw new Error('Recargá para recuperar la última versión guardada.');
    const changes = structuredClone(draft.changes);
    try {
      const r = await api('draft', post({ revision: draft.revision, changes }, 'PUT'));
      draft.revision = r.revision; acked = changes;
    } catch (e) { if (e.status === 409) await rebase(); else throw e; }
    setSave('Guardado');
  }).catch(e => { saveError = true; setSave('Sin guardar', true); toast(e.message, () => location.reload(), 'Recargar'); render(); });
  return saving;
}
// El borrador cambió afuera (el agente al aplicar una propuesta, u otra pestaña): se toma esa versión y se
// vuelven a aplicar encima sólo las piezas que editaste desde el último guardado.
async function rebase() {
  const mine = Object.fromEntries(dirtyIds().map(id => [id, draft.changes[id]]));
  const [server, fresh] = await Promise.all([api('draft'), api('data')]);
  data = fresh;
  const changes = { ...server.changes };
  for (const [id, c] of Object.entries(mine)) { if (c) changes[id] = c; else delete changes[id]; }
  draft = { ...server, changes }; acked = structuredClone(server.changes); undoStack.length = 0;
  pruneChanges();
  const r = await api('draft', post({ revision: draft.revision, changes: draft.changes }, 'PUT'));
  draft.revision = r.revision; acked = structuredClone(draft.changes);
  render(); if ($('drawer').open && ed) renderDrawer();
  toast('El borrador cambió afuera. Se actualizó y tus ediciones quedaron.');
}
// Quita lo que ya no cambia nada: la pieza ya está así en Postiz, o se publicó y dejó de ser editable.
function pruneChanges() {
  let n = 0;
  for (const [id, c] of Object.entries(draft.changes)) {
    const i = byId(id); if (!i) continue;
    const moot = (c.pause && i.status !== 'scheduled') || (c.resume && i.status !== 'paused');
    const same = !c.pause && !c.resume && (c.when ?? null) === (i.scheduled ?? null) && eqSet(c.networks ?? origNets(i), origNets(i)) && eqSet(c.collaborators ?? origCollab(i), origCollab(i)) && !c.note;
    if (same || moot || !editable(i)) { delete draft.changes[id]; n++; }
  }
  return n;
}
function snapshot() { undoStack.push(structuredClone(draft.changes)); if (undoStack.length > 30) undoStack.shift(); }
function undo() { if (!undoStack.length) return; draft.changes = undoStack.pop(); queueSave(); render(); }

// Escribe tu intención para una pieza; si coincide con lo que ya está, no queda cambio.
// Pausar saca de Postiz una pieza programada; volver a Lista levanta una pausa. Elegir una fecha gana sobre las dos.
function applyChange(i, next) {
  const pause = !!next.pause && !next.when && i.status === 'scheduled';
  const resume = !!next.resume && !next.when && i.status === 'paused';
  const sameWhen = (next.when ?? null) === (i.scheduled ?? null);
  const sameNets = eqSet(next.networks, origNets(i));
  const sameCollab = eqSet(next.collaborators, origCollab(i));
  const sameAcc = eqAcc(next.accounts, origAccounts(i));
  const sameVersion = !next.version || next.version === i.primary?.path;
  if (sameWhen && sameNets && sameCollab && sameAcc && sameVersion && !next.note && !pause && !resume) delete draft.changes[i.id];
  else draft.changes[i.id] = { when: next.when ?? null, note: next.note || '', ...(pause ? { pause: true } : {}), ...(resume ? { resume: true } : {}), ...(sameNets ? {} : { networks: next.networks }), ...(sameCollab ? {} : { collaborators: next.collaborators }), ...(sameAcc ? {} : { accounts: normAcc(next.accounts) }), ...(sameVersion ? {} : { version: next.version }), fingerprint: i.fingerprint, primary: i.primary };
}
function commit(i, patch, message) {
  if (busy) return false;
  if (saveError) { toast('El borrador no se pudo guardar.', () => location.reload(), 'Recargar'); return false; }
  if (!editable(i)) { toast('Esta pieza es de consulta.'); return false; }
  const next = { when: when(i), note: ch(i)?.note || '', networks: nets(i), collaborators: collab(i), accounts: accounts(i), version: version(i), pause: ch(i)?.pause, resume: ch(i)?.resume, ...patch };
  if (next.when && next.when <= nowLocal()) { toast('Elegí un horario futuro.'); return false; }
  if (!next.networks.length) { toast('Elegí al menos una red.'); return false; }
  snapshot(); applyChange(i, next); queueSave(); render();
  if (message) toast(message, undo);
  return true;
}

// ---------- horarios ----------
function takenTimes(day, exceptId) { return timeline([exceptId]).filter(i => when(i).slice(0, 10) === day).map(i => when(i).slice(11, 16)); }
function isTaken(day, time, exceptId) { return takenTimes(day, exceptId).some(t => Math.abs(toMin(t) - toMin(time)) < windowMin()); }
function freeTime(day, i) {
  const soon = addMinutes(nowLocal(), 45);
  const free = suggestedTimes().find(s => day + 'T' + s > soon && !isTaken(day, s, i.id));
  if (free) return free;
  if (day === todayStr()) { const m = toMin(soon.slice(11, 16)); return soon.slice(0, 10) === day ? fromMin(Math.ceil(m / 15) * 15) : null; }
  return slotsCfg()[1] || slotsCfg()[0];
}
const pauseItem = i => i.status !== 'scheduled' ? (toast('Sólo se pausa una pieza programada en Postiz.'), false) : ch(i)?.pause ? false : commit(i, { when: null, pause: true }, `${i.title.slice(0, 40)}: se pausa en tu propuesta.`);
const resumeItem = i => commit(i, { when: null, resume: true }, `${i.title.slice(0, 40)}: vuelve a Listos en tu propuesta.`);
function dropOn(i, day) {
  let t = when(i)?.slice(11, 16);
  if (!t || day + 'T' + t <= addMinutes(nowLocal(), 10) || isTaken(day, t, i.id)) t = freeTime(day, i);
  if (!t) { toast('Hoy ya no quedan horarios. Probá con mañana.'); return; }
  commit(i, { when: day + 'T' + t }, `${i.title.slice(0, 40)} → ${whenLabel(day + 'T' + t)}`);
}

// ---------- panel lateral ----------
let ed = null; // edición en curso del panel
function openItem(id) {
  const i = byId(id); if (!i) return;
  const w = when(i);
  ed = { id, date: w?.slice(0, 10) || '', time: w?.slice(11, 16) || '', nets: [...nets(i)], collab: [...collab(i)], accounts: { ...accounts(i) }, version: version(i), note: ch(i)?.note || '', calStart: monday(w?.slice(0, 10) || todayStr()) };
  $('dTitle').textContent = i.title;
  const assets = []; const seen = new Set();
  for (const a of [i.primary, i.newer_final, ...(i.media || []), ...(i.components || [])]) if (a && !seen.has(a.path)) { seen.add(a.path); assets.push(a); }
  ed.slides = slidesOf(i, assets); ed.slide = 0;
  if (ed.slides.length > 1) {
    $('dAssets').innerHTML = ed.slides.map((a, n) => `<button class="slide-thumb" data-slide="${n}" title="${esc(a.name)}" aria-label="Lámina ${n + 1}"><img src="${esc(a.kind === 'video' ? '/api/planner/poster?path=' + encodeURIComponent(a.path) : mediaUrl(a))}" alt="" loading="lazy">${a.kind === 'video' ? '<i>▶</i>' : ''}</button>`).join('');
    $('dAssets').querySelectorAll('[data-slide]').forEach(b => b.onclick = () => showSlide(Number(b.dataset.slide)));
    showSlide(0);
  } else {
    const visual = assets.filter(a => a.kind !== 'audio').slice(0, 8);
    $('dAssets').innerHTML = visual.length > 1 ? visual.map((a, n) => `<button data-asset="${n}" title="${esc(a.path)}">${a.kind === 'video' ? '▶ ' : ''}${esc(a.name)}</button>`).join('') : '';
    // Elegir otro video lo deja como versión a publicar y habilita Guardar.
    $('dAssets').querySelectorAll('button').forEach(b => b.onclick = () => pickVersion(visual[Number(b.dataset.asset)]));
    showAsset(assets.find(a => a.path === ed.version) || i.primary || assets.find(a => a.kind === 'video') || assets[0]);
  }
  if (fb?.id !== id) { if (fb?.rec) fb.rec.rec.stop(); fb = { id, entries: [], prompt: null, dir: '', loading: true, text: '' }; loadFeedback(id); }
  renderDrawer();
  if (!$('drawer').open) $('drawer').showModal();
  $('drawer').querySelector('.drawer-scroll').scrollTop = 0;
}
function pickVersion(a) {
  const i = ed && byId(ed.id);
  if (!i || !a || a.kind !== 'video' || !editable(i) || !isVideoPiece(i)) return showAsset(a);
  ed.version = a.path === i.primary?.path ? null : a.path;
  showAsset(a);
  const top = $('drawer').querySelector('.drawer-scroll').scrollTop; renderDrawer(); $('drawer').querySelector('.drawer-scroll').scrollTop = top;
}
function showAsset(a) {
  $('dMedia').querySelectorAll('video,audio').forEach(v => v.pause());
  $('dMedia').innerHTML = !a ? '<div class="empty">Todavía no hay un archivo para ver.</div>' : a.kind === 'video' ? `<video src="${esc(mediaUrl(a))}" ${ed && byId(ed.id) && thumbUrl(byId(ed.id)) && a.path === byId(ed.id).primary?.path ? `poster="${esc(thumbUrl(byId(ed.id)))}"` : ''} controls playsinline preload="metadata"></video>` : a.kind === 'audio' ? `<audio src="${esc(mediaUrl(a))}" controls preload="metadata"></audio>` : `<img src="${esc(mediaUrl(a))}" alt="${esc(a.name)}">`;
  const pub = ed && byId(ed.id) ? (ed.version || byId(ed.id).primary?.path) : null;
  $('dAssets').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.title === a?.path); b.classList.toggle('pub', !!pub && b.title === pub); });
}
// Un carrusel se mira lámina por lámina: flechas, contador, miniaturas, ← → y clic en la imagen.
const COMPOSITE = /grilla|grid|contact|preview|sheet|mosaic/i;
function slidesOf(i, assets) {
  if (!isCarousel(i)) return [];
  const own = (i.media || []).filter(a => a.kind !== 'audio');
  return (own.length > 1 ? own : assets).filter(a => a && a.kind !== 'audio' && !COMPOSITE.test(a.name));
}
function showSlide(n) {
  const s = ed?.slides; if (!s?.length) return;
  ed.slide = (n + s.length) % s.length;
  showAsset(s[ed.slide]);
  $('dMedia').insertAdjacentHTML('beforeend', `<button class="slide-nav prev" data-step-slide="-1" aria-label="Lámina anterior">${ICON.left}</button><button class="slide-nav next" data-step-slide="1" aria-label="Lámina siguiente">${ICON.right}</button><span class="slide-count">${ed.slide + 1} / ${s.length}</span>`);
  $('dMedia').querySelectorAll('[data-step-slide]').forEach(b => b.onclick = () => showSlide(ed.slide + Number(b.dataset.stepSlide)));
  const img = $('dMedia').querySelector('img'); if (img) img.onclick = () => showSlide(ed.slide + 1);
  $('dAssets').querySelectorAll('[data-slide]').forEach(b => b.classList.toggle('on', Number(b.dataset.slide) === ed.slide));
  $('dAssets').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function edWhen() { return ed.date && ed.time ? ed.date + 'T' + ed.time : null; }
function edDirty(i) { return edWhen() !== (when(i) ?? null) || !eqSet(ed.nets, nets(i)) || !eqSet(ed.collab, collab(i)) || !eqAcc(ed.accounts, accounts(i)) || (ed.version || null) !== (version(i) || null) || ed.note !== (ch(i)?.note || ''); }

function renderDrawer() {
  const i = byId(ed.id); if (!i) return;
  const meta = [...(BRANDS.length > 1 ? [BRAND_LABEL[i.brand] || i.brand] : []), formatLabel(i), STATUS[i.status]];
  $('dMeta').innerHTML = meta.map(esc).join(' · ') + (ch(i) ? ' <span class="tag accent">Con cambios</span>' : '') + (i.trial ? ' <span class="tag">IG · Reel de prueba</span>' : '');
  const blocks = [];
  // Pausada va primero: es el estado de la pieza y su acción principal.
  if (i.status === 'paused') { const prev = i.pause?.slot_anterior; blocks.push(`<section class="block"><h4>Pausada</h4><p class="hint" style="margin:0 0 10px">${i.pause?.desde ? 'Desde el ' + esc(dayLong(i.pause.desde.slice(0, 10))) : ''}${prev?.fecha ? ` · estaba para el ${esc(dayLong(prev.fecha))} · ${esc(prev.hora || '')}` : ''}</p><div class="pubrow">${ch(i)?.resume ? '<button class="secondary" id="keepPausedBtn">Dejarla pausada</button>' : '<button class="secondary" id="resumeBtn">Volver a Listos</button>'}</div></section>`); }
  if (editable(i) && isVideoPiece(i)) {
    const chosen = ed.version, newer = i.newer_final && chosen !== i.newer_final.path ? i.newer_final : null;
    const name = p => p.split('/').pop();
    blocks.push(`<section class="block"><h4>Versión</h4>
      ${newer ? `<div class="version-alert"><span>Hay una versión más nueva en la carpeta de la pieza: <b>${esc(name(newer.path))}</b>${newer.modified ? ', del ' + esc(new Date(Number(newer.modified) / 1e6).toLocaleString(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '')) : ''}. La que está ${i.status === 'scheduled' ? 'en Postiz' : 'en la cola'} es anterior.</span><button class="secondary" id="useNewer">Traer la última versión</button></div>` : ''}
      <p class="hint" style="margin:0">${chosen ? `Se va a publicar <b>${esc(name(chosen))}</b> en vez de ${esc(name(i.primary.path))}. Guardá para sumarlo a la propuesta.` : `Se publica <b>${esc(i.id.startsWith('queue:') ? name(i.primary.path) + ' (copia en la cola)' : name(i.primary.path))}</b>. Tocá otro video de abajo del reproductor para cambiarla.`}</p>
      <div class="pubrow" style="margin-top:8px">${chosen ? '<button class="ghost" id="versionBack">Volver a la anterior</button>' : ''}<button class="ghost" id="versionRefresh">${ICON.restore} Buscar versión nueva</button></div></section>`);
  }
  const fbFirst = ['review', 'development'].includes(i.status);
  if (fbFirst) blocks.push('<section class="block fb" id="fbBlock"></section>');
  if (editable(i)) {
    const w = edWhen(), orig = i.scheduled;
    const moved = orig && w !== orig;
    blocks.push(`<section class="block"><h4>Cuándo ${noFinal(i) ? '<span class="tag nofinal">Sin final</span>' : ''}<span class="aside">${i.status === 'scheduled' ? 'Hoy en Postiz: ' + esc(whenLabel(orig)) : ''}</span></h4>
      <div class="when-summary">${w ? esc(whenLabel(w)) : '<span class="muted">Sin fecha</span>'}${moved ? `<small><s>${esc(whenLabel(orig))}</s></small>` : ''}</div>
      ${miniCal(i)}
      <div class="time-row"><div class="timefield"><button data-step="-15" aria-label="15 minutos antes">−</button><input id="edTime" value="${esc(ed.time)}" placeholder="--:--" inputmode="numeric" aria-label="Hora (24 h)" maxlength="5"><button data-step="15" aria-label="15 minutos después">+</button></div>
      <div class="chips">${suggestedTimes().map(s => `<button class="chip ${ed.time === s ? 'on' : ''} ${ed.date && isTaken(ed.date, s, i.id) ? 'taken' : ''}" data-slot="${s}" title="${ed.date && isTaken(ed.date, s, i.id) ? 'Hay otra pieza cerca de este horario' : ''}">${s}</button>`).join('')}</div></div>
      ${noFinal(i) ? '<p class="hint">Todavía no tiene archivo final: queda como reserva y se agenda cuando lo tenga.</p>' : w && !i.approved && i.status !== 'scheduled' ? '<p class="hint">Con fecha en el calendario queda aprobada al confirmar.</p>' : ''}</section>`);
    const igOn = ed.nets.includes('instagram'), igAcc = acctOf('instagram', ed.accounts);
    // La cuenta que publica no puede ser su propia collab.
    const opts = collabOptions().filter(o => !igAcc || o.handle !== igAcc.profile);
    const multi = NET_ORDER.filter(n => ed.nets.includes(n) && acctOpts(n).length > 1);
    blocks.push(`<section class="block"><h4>Dónde</h4><div class="netpick">${NET_ORDER.map(n => { const a = acctOf(n, ed.accounts); return `<button class="${ed.nets.includes(n) ? 'on' : ''}" data-net="${n}" aria-pressed="${ed.nets.includes(n)}"><span class="net">${netIcon(n)}</span><span>${netName(n)}<small>${esc(a ? (a.profile ? '@' + a.profile.replace(/^@/, '') : a.label.replace(netName(n), '').trim()) : '')}</small></span><span class="check">${ICON.check}</span></button>`; }).join('')}</div>
      ${ed.nets.length ? '' : '<p class="hint warn">Elegí al menos una red.</p>'}
      ${igOn && canIgMode(i) ? igModeBlock(i) : ''}
      ${multi.map(n => `<div class="sub-label">${netIcon(n).replace('<svg', '<svg style="width:12px;height:12px;fill:currentColor;stroke:none"')} Cuenta de ${netName(n)}</div><div class="segmented acct-pick">${acctOpts(n).map(a => `<button class="${acctOf(n, ed.accounts).id === a.id ? 'on' : ''}" data-acct="${n}" data-acct-id="${esc(a.id)}">${esc(a.brand || a.label.replace(netName(n), '').trim() || a.label)}<small>${a.profile ? '@' + esc(a.profile.replace(/^@/, '')) : ''}</small></button>`).join('')}</div>`).join('')}
      ${opts.length ? `<div class="sub-label">${NET_ICON.instagram.replace('<svg', '<svg style="width:12px;height:12px;fill:currentColor;stroke:none"')} Collab en Instagram</div>
      <div class="chips">${opts.map(o => `<button class="chip text ${ed.collab.includes(collabValue(o)) ? 'on' : ''}" data-collab="${esc(collabValue(o))}" ${!igOn || i.trial ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}<button class="chip text ${!ed.collab.length ? 'on' : ''}" data-collab="" ${!igOn || i.trial ? 'disabled' : ''}>Sin collab</button></div>
      ${i.trial ? '<p class="hint">Es un reel de prueba: Instagram no admite collab en Trial.</p>' : !igOn ? '<p class="hint">Activá Instagram para sumar una collab.</p>' : ''}` : ''}
      </section>`);
    blocks.push(`<section class="block"><h4>Nota para el agendado</h4><textarea id="edNote" class="note" rows="2" placeholder="Algo que tenga que saber al programarla…">${esc(ed.note)}</textarea></section>`);
  }
  if (i.channels?.length) blocks.push(`<section class="block"><h4>Estado en Postiz</h4>${i.channels.map(c => `<div class="channel"><span class="net">${netIcon(normNet(c.network))}</span><span>${esc(c.account || netName(normNet(c.network)))}${c.trial ? ' · prueba' : ''}<small>${c.when ? esc(whenLabel(c.when.slice(0, 16))) : ''}${c.verified ? '' : ' · sin verificar'}</small></span><span class="state ${esc(c.state)}">${esc({ QUEUE: 'En cola', PUBLISHED: 'Publicado', ERROR: 'Error', DRAFT: 'Borrador' }[c.state] || c.state)}</span></div>`).join('')}${i.pending_channels?.length ? '<p class="hint warn">Quedan envíos en cola. Revisalos antes de cancelar o reprogramar.</p>' : ''}</section>`);
  if (i.status === 'scheduled') blocks.push(`<section class="block"><h4>Pausar</h4><div class="pubrow">${ch(i)?.pause ? '<button class="secondary" id="unpauseBtn">Cancelar la pausa</button>' : `<button class="secondary" id="pauseBtn">${ICON.pause} Pausar publicación</button>`}</div><p class="hint">${ch(i)?.pause ? 'Sale de Postiz cuando confirmes la propuesta en el chat.' : 'Sale de Postiz sin perderla y queda en Pausadas hasta que la vuelvas a agendar.'}</p></section>`);
  // «Publicado» es el último estado y desde ahí se vuelve atrás.
  const stageable = STAGES.some(([k]) => k === i.status), postizPub = i.status === 'published' && !i.publication;
  if (stageable || i.status === 'published' || canMark(i)) {
    const locked = !stageable && i.status !== 'published';
    const pubWhen = i.status === 'published' ? (i.history_date ? esc(dayLong(i.history_date)) + (i.history_basis === 'scheduled_reference' ? ' (fecha de agenda)' : '') : 'Sin fecha registrada') + (i.publication ? ' · marcada por vos' : ' · confirmada por Postiz') : '';
    blocks.push(`<section class="block"><h4>Estado</h4><div class="segmented stage-pick">${[...STAGES, ['published', 'Publicado']].map(([k, l]) => `<button class="${i.status === k ? 'on' : ''}" data-stage="${k}" ${(k !== 'published' && locked) || postizPub ? 'disabled' : ''}>${l}</button>`).join('')}</div><p class="hint">${i.status === 'published' ? pubWhen + (i.publication ? '. Elegí otro estado para traerla de vuelta.' : '') : locked ? (i.status === 'scheduled' ? 'Está en Postiz: pausala o quitale la fecha para cambiarle el estado.' : 'Está pausada: volvela a Listos o agendala.') : i.status === 'ready' ? 'Aprobada: se puede agendar.' : 'Pasala a Listos cuando apruebes el final.'}</p></section>`);
  }
  if (canDiscard(i)) blocks.push(`<section class="block"><h4>Descartar</h4><div class="pubrow"><button class="secondary danger" id="discardBtn">${ICON.trash} Descartar pieza</button></div><p class="hint">Deja de aparecer en el panel. No borra ningún archivo; la recuperás desde Tablero → Descartadas.</p></section>`);
  if (i.status === 'discarded') blocks.push(`<section class="block"><h4>Descartada</h4><p class="hint" style="margin:0 0 10px">${i.discard?.discarded_at ? 'El ' + esc(dayLong(i.discard.discarded_at.slice(0, 10))) : ''}${i.discard?.reason ? ' · ' + esc(i.discard.reason) : ''}</p><button class="secondary" id="restoreBtn">${ICON.restore} Recuperar</button></section>`);
  const caption = i.captions?.instagram || i.captions?.tiktok || i.captions?.youtube_description || Object.values(i.captions || {}).find(v => typeof v === 'string') || '';
  if (!fbFirst) blocks.push('<section class="block fb" id="fbBlock"></section>');
  if (caption) blocks.push(`<details class="fold"><summary>Texto</summary><pre id="captionText">${esc(caption)}</pre><button class="ghost" id="copyCaption" style="margin-top:6px">${ICON.copy} Copiar</button></details>`);
  blocks.push(`<details class="fold"><summary>Archivos</summary><div class="doclinks">${(i.documents || []).map(d => `<a class="link" href="${esc(mediaUrl(d.path))}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join('')}</div><div class="path">${esc(i.source || 'Creada en Postiz, sin archivo local')}</div>${i.sidecar ? `<div class="path">${esc(i.sidecar)}</div>` : ''}</details>`);
  $('dBody').innerHTML = blocks.join('');
  renderFeedback();
  $('dFooter').innerHTML = editable(i) ? `${edWhen() ? '<button class="ghost" id="edClear">Quitar fecha</button>' : ''}${ch(i) ? '<button class="ghost danger" id="edRevert">Descartar cambios</button>' : ''}<button class="primary" id="edSave" ${edDirty(i) ? '' : 'disabled'}>Guardar</button>` : '';
  wireDrawer(i);
}

// Se guarda al tocarlo, en la ficha que lee la cola al agendar (no en la propuesta). En Postiz no cambia nada.
function igModeBlock(i) {
  const live = liveIgTrial(i), pending = live !== null && live !== !!i.trial;
  const hint = live === null ? (i.trial ? 'Reel de prueba: lo ven primero quienes no te siguen, sin collab.' : 'Directo al feed, con la collab.') + ' Se aplica al agendar.'
    : pending ? `En Postiz sigue en ${live ? 'Trial' : 'feed'}: se aplica cuando la reagendes, con tu OK en el chat.` : 'Así está en Postiz. Si lo cambiás, se aplica cuando la reagendes.';
  return `<div class="sub-label">${NET_ICON.instagram.replace('<svg', '<svg style="width:12px;height:12px;fill:currentColor;stroke:none"')} Instagram: feed o Trial</div><div class="segmented ig-mode" role="group" aria-label="Instagram: feed o Trial"><button class="${i.trial ? '' : 'on'}" data-igmode="feed" aria-pressed="${!i.trial}">Feed</button><button class="${i.trial ? 'on' : ''}" data-igmode="trial" aria-pressed="${!!i.trial}">Trial</button></div><p class="hint ${pending ? 'warn' : ''}">${esc(hint)}</p>`;
}
function setIgMode(i, trial) {
  if (!!i.trial === trial) return;
  const scheduled = i.status === 'scheduled';
  if (scheduled && !confirm(`Ya está en Postiz. El cambio a ${trial ? 'Trial' : 'feed'} queda guardado en la ficha y se aplica cuando la reagendes; ahora no se mueve nada. ¿Guardar?`)) return;
  if (busy || saveError) return;
  document.querySelectorAll('[data-igmode]').forEach(b => { b.classList.toggle('on', (b.dataset.igmode === 'trial') === trial); b.disabled = true; });
  setSave('Guardando…');
  return remote('instagram-mode', { id: i.id, trial, fingerprint: i.fingerprint, confirm_scheduled: scheduled }, `Instagram: ${trial ? 'Trial' : 'feed directo'}. ${scheduled ? 'Se aplica al reagendarla.' : 'Se aplica al agendar.'}`, () => { const now = byId(i.id); if (now) setIgMode(now, !trial); }, true)
    // Si falló, el panel vuelve a mostrar lo que quedó guardado.
    .then(() => { if ($('saveStatus').textContent === 'Guardando…') setSave(''); if ($('drawer').open && ed?.id === i.id) renderDrawer(); });
}

function miniCal(i) {
  const today = todayStr();
  const counts = {};
  for (const x of timeline([i.id])) { const d = when(x).slice(0, 10); counts[d] = (counts[d] || 0) + 1; }
  const days = Array.from({ length: 14 }, (_, n) => dateAdd(ed.calStart, n));
  const label = fmt(days[0], { month: 'long' }) + (days[0].slice(5, 7) !== days[13].slice(5, 7) ? ' – ' + fmt(days[13], { month: 'long' }) : '');
  return `<div class="minical"><div class="minical-head"><button class="icon" data-cal="-7" aria-label="Semana anterior" ${ed.calStart <= monday(today) ? 'disabled' : ''}>${ICON.left}</button><span>${esc(label)}</span><button class="icon" data-cal="7" aria-label="Semana siguiente">${ICON.right}</button></div><div class="minical-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="dow">${d}</span>`).join('')}${days.map(d => `<button data-day="${d}" class="${d === ed.date ? 'sel' : ''} ${d === today ? 'today' : ''}" ${d < today ? 'disabled' : ''} aria-label="${esc(dayLong(d))}">${Number(d.slice(8))}${counts[d] ? `<i>${'<b></b>'.repeat(Math.min(3, counts[d]))}</i>` : ''}</button>`).join('')}</div></div>`;
}

function wireDrawer(i) {
  const body = $('dBody'), refresh = () => { const top = $('drawer').querySelector('.drawer-scroll').scrollTop; renderDrawer(); $('drawer').querySelector('.drawer-scroll').scrollTop = top; };
  body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { ed.date = b.dataset.day; if (!ed.time || isTaken(ed.date, ed.time, i.id)) ed.time = freeTime(ed.date, i) || ed.time; refresh(); });
  body.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => { ed.calStart = dateAdd(ed.calStart, Number(b.dataset.cal)); refresh(); });
  body.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { ed.time = b.dataset.slot; if (!ed.date) ed.date = todayStr() + 'T' + ed.time > addMinutes(nowLocal(), 30) ? todayStr() : dateAdd(todayStr(), 1); refresh(); });
  body.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const base = parseTime($('edTime').value) || ed.time || slotsCfg()[1] || '18:30'; ed.time = fromMin(Math.round(toMin(base) / 5) * 5 + Number(b.dataset.step)); if (!ed.date) ed.date = dateAdd(todayStr(), 1); refresh(); });
  const t = $('edTime');
  if (t) {
    t.onkeydown = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); body.querySelector(`[data-step="${e.key === 'ArrowUp' ? 15 : -15}"]`).click(); $('edTime').focus(); } if (e.key === 'Enter') { t.blur(); } };
    t.onchange = () => { const v = parseTime(t.value); if (v) { ed.time = v; if (!ed.date) ed.date = dateAdd(todayStr(), 1); } else if (t.value.trim()) toast('Escribí la hora en 24 h, por ejemplo 18:30.'); refresh(); };
  }
  body.querySelectorAll('[data-net]').forEach(b => b.onclick = () => { const n = b.dataset.net; ed.nets = ed.nets.includes(n) ? ed.nets.filter(x => x !== n) : sortNets([...ed.nets, n]); refresh(); });
  body.querySelectorAll('[data-acct]').forEach(b => b.onclick = () => {
    const n = b.dataset.acct, a = acctOpts(n).find(x => x.id === b.dataset.acctId); if (!a) return;
    ed.accounts = normAcc({ ...ed.accounts, [n]: a.id });
    // Instagram: al cambiar de cuenta, la collab pasa a la que tenga configurada esa cuenta (colab_default).
    if (n === 'instagram' && !i.trial && Array.isArray(a.collab)) ed.collab = [...a.collab];
    refresh();
  });
  body.querySelectorAll('[data-igmode]').forEach(b => b.onclick = () => setIgMode(i, b.dataset.igmode === 'trial'));
  body.querySelectorAll('[data-collab]').forEach(b => b.onclick = () => { const v = b.dataset.collab; ed.collab = !v ? [] : ed.collab.includes(v) ? ed.collab.filter(x => x !== v) : [...ed.collab, v]; refresh(); });
  const note = $('edNote'); if (note) note.oninput = () => { ed.note = note.value; $('edSave').disabled = !edDirty(i); };
  if ($('edSave')) $('edSave').onclick = () => {
    const typed = $('edTime') && parseTime($('edTime').value); if (typed) ed.time = typed;
    const patch = { version: ed.version, when: edWhen(), networks: ed.nets, collaborators: ed.nets.includes('instagram') ? ed.collab.filter(v => v !== acctOf('instagram', ed.accounts)?.profile) : [], accounts: normAcc(ed.accounts), note: ed.note };
    if (commit(i, patch, 'Cambio guardado en tu propuesta.')) $('drawer').close();
  };
  if ($('useNewer')) $('useNewer').onclick = () => pickVersion(i.newer_final);
  if ($('versionBack')) $('versionBack').onclick = () => pickVersion(i.primary);
  if ($('versionRefresh')) $('versionRefresh').onclick = async () => { await refreshPostiz(); const now = byId(i.id); if (now && ed?.id === i.id) { toast(now.newer_final ? 'Hay una versión nueva en la carpeta de la pieza.' : 'Ya tenés la última versión.'); openItem(i.id); } };
  if ($('edClear')) $('edClear').onclick = () => { ed.date = ''; ed.time = ''; refresh(); };
  if ($('edRevert')) $('edRevert').onclick = () => { snapshot(); delete draft.changes[i.id]; queueSave(); render(); $('drawer').close(); toast('Volvió a como estaba.', undo); };
  body.querySelectorAll('[data-stage]').forEach(b => b.onclick = async () => {
    const to = b.dataset.stage; if (to === i.status) return;
    if (to === 'published') return setPublication(i.id, 'mark', null, true);
    if (i.status === 'published') { await setPublication(i.id, 'undo', null, true); const now = byId(i.id); if (now && now.status !== to && STAGE_NAME[now.status]) await setStage(i.id, to); return; }
    setStage(i.id, to);
  });
  if ($('discardBtn')) $('discardBtn').onclick = () => setDiscard(i.id, 'discard');
  if ($('pauseBtn')) $('pauseBtn').onclick = () => { if (pauseItem(i)) $('drawer').close(); };
  if ($('resumeBtn')) $('resumeBtn').onclick = () => { if (resumeItem(i)) $('drawer').close(); };
  if ($('unpauseBtn')) $('unpauseBtn').onclick = () => { if (commit(i, { pause: false, when: i.scheduled }, 'Pausa cancelada.')) openItem(i.id); };
  if ($('keepPausedBtn')) $('keepPausedBtn').onclick = () => { if (commit(i, { resume: false }, 'Sigue pausada.')) openItem(i.id); };
  if ($('restoreBtn')) $('restoreBtn').onclick = () => setDiscard(i.id, 'restore');
  if ($('copyCaption')) $('copyCaption').onclick = () => copyText($('captionText').textContent, 'Texto copiado.');
}
// ---------- feedback por video ----------
// Feedback escrito o grabado por pieza, que persiste y se copia para Claude Code con la ubicación del archivo.
// Cada nota se guarda en <pieza>/feedback/; el audio se guarda solo apenas termina la grabación.
let fb = null;
const FB_STATE = { pendiente: ['Pendiente', 'accent'], enviado: ['Enviada', ''], en_curso: ['En curso', 'warn'], aplicado: ['Aplicado', 'ok'] };
const fbOpen = e => !e.estado || e.estado === 'pendiente';
const clock = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const fbVideo = () => $('dMedia').querySelector('video');
async function loadFeedback(id) {
  try { const r = await api('feedback?id=' + encodeURIComponent(id)); if (fb?.id === id) Object.assign(fb, { entries: r.entries, prompt: r.prompt, dir: r.dir }); }
  catch (e) { if (fb?.id === id) fb.error = e.message; }
  if (fb?.id === id) { fb.loading = false; renderFeedback(); }
}
function renderFeedback() {
  const box = $('fbBlock'); if (!box || !fb || fb.id !== ed?.id) return;
  const pending = fb.entries.filter(fbOpen).length;
  const entry = e => `<div class="fb-entry ${e.estado === 'aplicado' ? 'done' : ''}"><div class="fb-head"><span>${esc(new Date(e.created_at).toLocaleString(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span>${e.video_time != null ? `<button class="chip text" data-seek="${e.video_time}" title="Ir a ese momento del video">en ${clock(e.video_time)}</button>` : ''}<span class="tag ${FB_STATE[e.estado]?.[1] ?? 'accent'}" ${e.estado === 'en_curso' && e.tomado_por ? `title="${esc(e.tomado_por)}"` : e.enviado_via ? `title="${esc('Enviada: ' + e.enviado_via)}"` : ''}>${FB_STATE[e.estado]?.[0] ?? 'Pendiente'}</span><button class="icon fb-del" data-fbdel="${esc(e.file)}" aria-label="Borrar nota">${ICON.trash}</button></div>${e.text ? `<p class="fb-text">${esc(e.text)}</p>` : ''}${e.audio ? `<audio src="${esc(mediaUrl(e.audio))}" controls preload="metadata"></audio>` : ''}${e.transcript ? `<p class="hint">«${esc(e.transcript)}»</p>` : ''}${e.cambio ? `<p class="hint">${esc(e.cambio)}</p>` : ''}</div>`;
  const rec = fb.rec, clip = fb.clip;
  box.innerHTML = `<h4>Feedback del video <span class="aside">${fb.loading ? 'Cargando…' : pending ? pending + (pending === 1 ? ' pendiente' : ' pendientes') : ''}</span></h4>
    ${fb.error ? `<p class="hint warn">${esc(fb.error)}</p>` : ''}
    ${fb.entries.length ? `<div class="fb-list">${fb.entries.map(entry).join('')}</div>` : ''}
    <div class="fb-line">
      <input id="fbText" class="fb-input" value="${esc(fb.text)}" placeholder="${rec ? 'Grabando…' : 'Escribí y dale Enter'}" ${fb.saving || rec ? 'disabled' : ''} aria-label="Feedback del video">
      ${rec ? `<button class="secondary rec on" id="fbRec" title="Detener y guardar">${ICON.stop}<span id="fbRecTime">${clock((performance.now() - rec.start) / 1000)}</span></button>` : `<button class="secondary rec" id="fbRec" title="Grabar audio" aria-label="Grabar audio" ${fb.saving ? 'disabled' : ''}>${ICON.mic}</button>`}
      <button class="primary" id="fbCopy" ${fb.prompt ? '' : 'disabled'} title="Copia la ubicación del reel y tus notas pendientes">${ICON.copy} Copiar para Claude Code</button>
    </div>
    ${clip ? `<div class="fb-retry"><audio src="${esc(clip.url)}" controls></audio><button class="secondary" id="fbRetry">Reintentar guardar</button><button class="ghost" id="fbDrop">Descartar</button></div><p class="hint warn">El audio no se guardó todavía.</p>` : ''}`;
  $('fbText').oninput = e => { fb.text = e.target.value; };
  // Enter guarda la nota.
  $('fbText').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (fb.text.trim()) saveFeedback(fb.id, null); } };
  $('fbRec').onclick = () => fb.rec ? fb.rec.rec.stop() : startRec();
  // Copiar marca las notas como enviadas: ya no viajan en «Revisar cambios» y nadie las vuelve a mandar.
  $('fbCopy').onclick = async () => {
    if (!fb.prompt) return; const id = fb.id;
    if (!await copyText(fb.prompt, 'Copiado: pegalo en Claude Code.')) return;
    try { const r = await api('feedback/sent', post({ id })); fbCount(id, r.entries); if (fb?.id === id) { Object.assign(fb, { entries: r.entries, prompt: r.prompt }); renderFeedback(); } } catch {}
  };
  if ($('fbRetry')) $('fbRetry').onclick = () => { const c = fb.clip; fb.clip = null; saveFeedback(fb.id, c); };
  if ($('fbDrop')) $('fbDrop').onclick = () => { if (confirm('¿Descartar este audio sin guardarlo?')) { URL.revokeObjectURL(fb.clip.url); fb.clip = null; renderFeedback(); } };
  box.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => { const v = fbVideo(); if (v) { v.currentTime = Number(b.dataset.seek); v.play().catch(() => {}); } });
  box.querySelectorAll('[data-fbdel]').forEach(b => b.onclick = () => removeFeedback(fb.id, b.dataset.fbdel));
}
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no permite grabar audio.');
  const id = fb.id; let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('No hay permiso para usar el micrófono.'); }
  if (fb?.id !== id) { stream.getTracks().forEach(t => t.stop()); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], start = performance.now();
  fbVideo()?.pause();
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    const mine = fb?.id === id && fb.rec?.rec === rec; if (mine) { clearInterval(fb.rec.timer); fb.rec = null; }
    const type = (rec.mimeType || mime || 'audio/webm');
    // Se guarda aunque el panel ya esté cerrado: el audio no se pierde.
    saveFeedback(id, { blob: new Blob(chunks, { type }), mime: type, seconds: (performance.now() - start) / 1000 });
  };
  rec.start(1000);
  fb.rec = { rec, start, timer: setInterval(() => { const el = $('fbRecTime'); if (el) el.textContent = clock((performance.now() - start) / 1000); }, 250) };
  renderFeedback();
}
const blobB64 = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = fail; r.readAsDataURL(blob); });
async function saveFeedback(id, clip) {
  const mine = () => fb?.id === id;
  const text = mine() ? (fb.text || '').trim() : '';
  if (!text && !clip) return toast('Escribí algo o grabá un audio.');
  const body = { id, text };
  if (clip) { body.audio = await blobB64(clip.blob); body.mime = clip.mime; body.audio_seconds = clip.seconds; }
  if (mine()) { fb.saving = true; renderFeedback(); }
  try {
    const r = await api('feedback', post(body));
    fbCount(id, r.entries);
    if (mine()) { Object.assign(fb, { entries: r.entries, prompt: r.prompt, dir: r.dir, saving: false, error: null }); if (text) fb.text = ''; renderFeedback(); if (text) $('fbText')?.focus(); }
    toast(clip ? 'Audio guardado en la carpeta de la pieza.' : 'Nota guardada en la carpeta de la pieza.');
  } catch (e) {
    if (mine()) { fb.saving = false; if (clip) fb.clip = { ...clip, url: URL.createObjectURL(clip.blob) }; renderFeedback(); }
    toast((clip ? 'No se guardó el audio: ' : 'No se guardó la nota: ') + e.message);
  }
}
function fbCount(id, entries) { const i = byId(id); if (!i) return; const n = entries.filter(fbOpen).length; if (n) i.feedback_pending = n; else delete i.feedback_pending; render(); }
async function removeFeedback(id, file) {
  if (!confirm('¿Borrar esta nota? Queda guardada aparte en feedback/.borradas.')) return;
  try { const r = await api('feedback/remove', post({ id, file })); fbCount(id, r.entries); if (fb?.id === id) { Object.assign(fb, { entries: r.entries, prompt: r.prompt, dir: r.dir }); renderFeedback(); } toast('Nota borrada.'); }
  catch (e) { toast(e.message); }
}
async function copyText(text, ok) { try { await navigator.clipboard.writeText(text); toast(ok); return true; } catch { toast('No se pudo copiar; seleccioná el texto.'); return false; } }

// ---------- marcas manuales y descartes ----------
async function remote(path, body, message, undoFn, keepOpen = false) {
  if (busy || saveError) return;
  busy = true;
  try {
    await saving; if (saveError) return;
    const send = () => api(path, post({ ...body, revision: draft.revision }));
    let r;
    try { r = await send(); }
    catch (e) {
      // El borrador cambió afuera (el agente u otra pestaña) y lo tuyo ya estaba guardado: se toma esa versión y se reintenta.
      if (e.status !== 409) throw e;
      const server = await api('draft'); draft = server; acked = structuredClone(server.changes); undoStack.length = 0;
      r = await send();
    }
    data = r.data; draft = r.draft; acked = structuredClone(draft.changes);
    if ($('drawer').open) { if (keepOpen && byId(body.id)) renderDrawer(); else $('drawer').close(); }
    setSave('Guardado'); toast(message, undoFn);
  } catch (e) { toast(e.message); } finally { busy = false; render(); }
}
const setPublication = (id, action, published_on = null, keepOpen = false) => remote('publication', { id, action, published_on }, action === 'mark' ? 'Pasó a Publicadas.' : 'Volvió del historial.', action === 'mark' ? () => setPublication(id, 'undo', null, keepOpen) : null, keepOpen);
const STAGE_NAME = Object.fromEntries(STAGES);
// Cambiar el estado desde el detalle no lo cierra: puede seguir eligiendo fecha y redes.
function setStage(id, stage) { const prev = byId(id)?.status; return remote('stage', { id, stage }, stage === 'ready' ? 'Aprobada: pasó a Listos.' : `Pasó a ${STAGE_NAME[stage]}.`, prev && STAGE_NAME[prev] ? () => setStage(id, prev) : null, true); }
async function moveToColumn(i, target) {
  if (target === i.status) return;
  if (i.status === 'scheduled') { toast('Está en Postiz: pausala o quitale la fecha primero.'); return; }
  if (i.status === 'paused') { if (target === 'ready') return resumeItem(i); if (target === 'discarded') return setDiscard(i.id, 'discard'); toast('Una pieza pausada vuelve a Listos o se agenda con fecha.'); return; }
  if (target === 'discarded') return setDiscard(i.id, 'discard');
  if (i.status === 'discarded') { await setDiscard(i.id, 'restore'); const now = byId(i.id); if (now && now.status !== target && STAGE_NAME[now.status]) await setStage(i.id, target); return; }
  if (STAGE_NAME[i.status]) return setStage(i.id, target);
  toast('Esta pieza no se puede mover de columna.');
}
const setDiscard = (id, action) => remote('discard', { id, action }, action === 'discard' ? 'Pieza descartada.' : 'Pieza recuperada.', action === 'discard' ? () => setDiscard(id, 'restore') : null);

// ---------- edición rápida de la hora ----------
function openTimePop(i, anchor) {
  const pop = $('timePop'), day = when(i).slice(0, 10), cur = when(i).slice(11, 16);
  pop.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:8px">${esc(dayLong(day))}</div><div class="timefield"><button data-pstep="-15" aria-label="15 minutos antes">−</button><input id="popTime" value="${esc(cur)}" inputmode="numeric" maxlength="5" aria-label="Hora (24 h)"><button data-pstep="15" aria-label="15 minutos después">+</button></div><div class="chips">${suggestedTimes().map(s => `<button class="chip ${s === cur ? 'on' : ''} ${isTaken(day, s, i.id) ? 'taken' : ''}" data-pslot="${s}">${s}</button>`).join('')}</div><div class="row-actions"><button class="ghost" data-popclose>Cancelar</button><button class="primary" data-popsave>Listo</button></div>`;
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;
  pop.style.left = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, r.left - 6)) + 'px';
  pop.style.top = (r.bottom + pop.offsetHeight + 12 > window.innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6) + 'px';
  const input = $('popTime'); input.focus(); input.select();
  const save = v => { const t = parseTime(v); if (!t) { toast('Escribí la hora en 24 h, por ejemplo 18:30.'); return; } pop.hidden = true; if (t !== cur) commit(i, { when: day + 'T' + t }, `Nueva hora: ${whenLabel(day + 'T' + t)}`); };
  pop.onclick = e => {
    const s = e.target.closest('[data-pslot]'); if (s) return save(s.dataset.pslot);
    const st = e.target.closest('[data-pstep]'); if (st) { const base = parseTime(input.value) || cur; input.value = fromMin(Math.round(toMin(base) / 5) * 5 + Number(st.dataset.pstep)); return; }
    if (e.target.closest('[data-popsave]')) return save(input.value);
    if (e.target.closest('[data-popclose]')) pop.hidden = true;
  };
  input.onkeydown = e => { if (e.key === 'Enter') save(input.value); if (e.key === 'Escape') pop.hidden = true; if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); input.value = fromMin(toMin(parseTime(input.value) || cur) + (e.key === 'ArrowUp' ? 15 : -15)); } };
}

// ---------- distribución automática ----------
const STOP = new Set('para como esta este estos estas que con los las del una uno unos unas por mas más sin sus son pero desde hasta cada todo toda todos todas sobre entre cuando donde porque hace hacer tiene tienen tenes tenés vos ese esa eso solo sólo muy bien otra otro ahora aca acá hay ser fue mismo misma video videos reel reels carrusel seguime link perfil comentá comenta dejame'.split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => norm(s).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)).map(w => w.length > 6 ? w.slice(0, 6) : w);
const firstWords = i => norm(i.title).split(/[^a-z0-9ñ]+/).filter(Boolean).slice(0, 4).join(' ');
// Similitud de tema: título y slug pesan más que el caption; un mismo arranque de título es la misma serie.
function topicModel(items) {
  const head = new Map(), body = new Map();
  for (const i of items) {
    const caption = Object.values(i.captions || {}).find(v => typeof v === 'string') || '';
    head.set(i.id, new Set([...tokens(i.title), ...tokens(i.slug), ...tokens((i.source || '').split('/').pop())]));
    body.set(i.id, new Set(tokens(caption.slice(0, 600))));
  }
  const df = new Map();
  for (const m of [head, body]) for (const set of m.values()) for (const w of set) df.set(w, (df.get(w) || 0) + 1);
  const N = items.length || 1;
  const weight = w => { const d = df.get(w) || 1; return d / (2 * N) > 0.4 ? 0 : Math.log(1 + N / d); };
  const overlap = (A, B) => { let inter = 0, a = 0, b = 0; for (const w of A) { const x = weight(w); a += x; if (B.has(w)) inter += x; } for (const w of B) b += weight(w); return Math.min(a, b) ? inter / Math.min(a, b) : 0; };
  const memo = new Map();
  return (x, y) => {
    if (!x || !y || x.id === y.id) return 0;
    const key = x.id < y.id ? x.id + '|' + y.id : y.id + '|' + x.id;
    if (memo.has(key)) return memo.get(key);
    let s = Math.max(overlap(head.get(x.id) || new Set(), head.get(y.id) || new Set()), 0.8 * overlap(body.get(x.id) || new Set(), body.get(y.id) || new Set()));
    if (firstWords(x).split(' ').length === 4 && firstWords(x) === firstWords(y)) s = Math.max(s, 0.85);
    s = Math.min(1, s); memo.set(key, s); return s;
  };
}
function jitterFor(day, slot) { const j = cfg().jitter_minutes || 0; if (!j || !$('autoJitter')?.checked) return 0; return (hash(day + ':' + slot) % (2 * j + 1)) - j; }

function autoPlan() {
  const from = $('autoFrom').value || todayStr();
  const slots = [...document.querySelectorAll('#autoSlots [data-aslot].on')].map(b => b.dataset.aslot);
  const rebalance = $('autoRebalance').checked;
  const soon = addMinutes(nowLocal(), 45);
  let cands = data.items.filter(i => inScope(i) && backlogGroupOf(i) === 'ready');
  if (rebalance) cands = cands.concat(data.items.filter(i => inScope(i) && editable(i) && !noFinal(i) && when(i) && when(i) >= from + 'T00:00' && when(i) > soon));
  const candIds = cands.map(i => i.id);
  const fixed = timeline(candIds).map(i => ({ item: i, when: when(i) }));
  const recent = data.items.filter(i => i.status === 'published' && i.history_date && i.history_date >= dateAdd(from, -4)).map(i => ({ item: i, when: i.history_date + 'T' + ((i.publication_reference || '').slice(11, 16) || '12:00') }));
  const sim = topicModel([...cands, ...fixed.map(f => f.item), ...recent.map(r => r.item)]);
  const free = [];
  if (slots.length) for (let d = from; free.length < cands.length && d <= dateAdd(from, 60); d = dateAdd(d, 1)) {
    for (const s of slots) {
      const t = fromMin(toMin(s) + jitterFor(d, s)), w = d + 'T' + t;
      if (w <= soon || fixed.some(f => minutesBetween(f.when, w) < windowMin())) continue;
      free.push(w);
    }
  }
  free.sort();
  const carousels = cands.filter(isCarousel).length;
  const idealGap = carousels ? Math.max(1, Math.floor(cands.length / carousels)) : 99;
  const rank = new Map([...cands].sort((a, b) => (a.created || '').localeCompare(b.created || '')).map((i, n) => [i.id, n]));
  const placed = []; let pool = [...cands];
  for (const w of free) {
    if (!pool.length) break;
    const seq = [...recent, ...fixed, ...placed].filter(x => x.when < w).sort((a, b) => b.when.localeCompare(a.when));
    const next = [...fixed].filter(x => x.when > w).sort((a, b) => a.when.localeCompare(b.when))[0];
    const sameDay = [...fixed, ...placed].filter(x => x.when.slice(0, 10) === w.slice(0, 10));
    const gap = (() => { const k = seq.findIndex(x => isCarousel(x.item)); return k < 0 ? 99 : k; })();
    let best = null;
    for (const c of pool) {
      const p1 = seq[0]?.item, p2 = seq[1]?.item;
      const p3 = seq[2]?.item;
      // Los temas con más hermanas salen antes para que haya lugar de espaciarlas.
      const crowd = pool.reduce((sum, o) => o === c ? sum : sum + sim(c, o), 0);
      let cost = 10 * sim(c, p1) + 5 * sim(c, p2) + 2 * sim(c, p3) + 6 * sim(c, next?.item) + 3 * Math.max(0, ...sameDay.map(x => sim(c, x.item))) - 2.5 * crowd;
      if (isCarousel(c)) cost += p1 && isCarousel(p1) ? 8 : 0, cost += gap < idealGap ? (idealGap - gap) * 1.5 : -2;
      else if (pool.some(isCarousel) && gap >= idealGap) cost += 1.5;
      if (BRANDS.length > 1 && c.brand !== defaultBrand() && p1?.brand === c.brand) cost += 5;
      if (c.category && p1?.category === c.category) cost += 1.5;
      if (c.kind === 'noticia') cost -= 6;
      if (c.expires && w.slice(0, 10) > c.expires) cost += 50;
      cost += rank.get(c.id) * 0.15;
      if (!best || cost < best.cost) best = { c, cost, near: Math.max(sim(c, p1), sim(c, next?.item)) };
    }
    placed.push({ item: best.c, when: w, near: best.near });
    pool = pool.filter(x => x !== best.c);
  }
  return { placed, left: pool, fixed: fixed.filter(f => placed.length && f.when >= placed[0].when.slice(0, 10) && f.when <= placed[placed.length - 1].when.slice(0, 10) + 'T23:59'), carousels, idealGap };
}

let lastPlan = null;
function openAuto() {
  $('autoFrom').value = todayStr(); $('autoFrom').min = todayStr();
  const j = cfg().jitter_minutes;
  $('autoSlots').innerHTML = slotsCfg().map(s => `<button class="chip on" data-aslot="${s}">${s}</button>`).join('') + (j ? `<label class="toggle" style="margin-left:8px"><input type="checkbox" id="autoJitter" checked> Variar ±${j} min</label>` : '');
  renderAuto(); $('auto').showModal();
}
function renderAuto() {
  lastPlan = autoPlan();
  const { placed, left, fixed } = lastPlan;
  const rows = [...placed.map(p => ({ ...p, isNew: true })), ...fixed.map(f => ({ ...f, isNew: false }))].sort((a, b) => a.when.localeCompare(b.when));
  const days = [...new Set(rows.map(r => r.when.slice(0, 10)))];
  $('autoPreview').innerHTML = days.map(d => `<div class="aday"><div class="aday-head">${esc(dayLong(d))}<small>${rows.filter(r => r.when.startsWith(d) && r.isNew).length} nuevas</small></div>${rows.filter(r => r.when.startsWith(d)).map(r => `<div class="aitem ${r.isNew ? 'new' : 'fixed'}"><span class="t">${r.when.slice(11, 16)}</span>${thumb(r.item)}<span class="aitem-title">${esc(r.item.title)}</span><span class="aitem-why">${BRANDS.length > 1 && r.item.brand !== defaultBrand() ? `<span class="tag">${esc(BRAND_LABEL[r.item.brand] || r.item.brand)}</span>` : ''}${isCarousel(r.item) ? '<span class="tag">Carrusel</span>' : ''}${r.isNew && r.near > 0.3 ? '<span class="tag warn" title="No había otra opción mejor para este horario">Tema cercano</span>' : ''}${r.isNew ? '' : '<span class="tag">ya estaba</span>'}</span></div>`).join('')}</div>`).join('') || '<div class="empty">No hay piezas listas para repartir o no quedan horarios con esta configuración.</div>';
  const first = placed[0]?.when, last = placed[placed.length - 1]?.when;
  $('autoSummary').textContent = placed.length ? `${placed.length} ${placed.length === 1 ? 'pieza' : 'piezas'} del ${dayLong(first.slice(0, 10))} al ${dayLong(last.slice(0, 10))}${lastPlan.carousels > 1 ? ` · carruseles cada ~${lastPlan.idealGap}` : ''}${left.length ? ` · ${left.length} sin lugar` : ''}` : '';
  $('autoApply').disabled = !placed.length;
}
function applyAuto() {
  if (!lastPlan?.placed.length || saveError) return;
  snapshot();
  for (const p of lastPlan.placed) applyChange(p.item, { when: p.when, note: ch(p.item)?.note || '', networks: nets(p.item), collaborators: collab(p.item), accounts: accounts(p.item), version: version(p.item) });
  queueSave(); $('auto').close();
  week = monday(lastPlan.placed[0].when.slice(0, 10)); view = 'week'; render();
  toast(`${lastPlan.placed.length} piezas repartidas en tu propuesta.`, undo);
}

// ---------- propuesta ----------
// Si el archivo o la ficha de una pieza cambió después de editarla, no se agenda hasta que mires la versión nueva.
const staleChange = (i, c) => !c.fingerprint ? '' : JSON.stringify(i.primary) !== JSON.stringify(c.primary) ? 'Cambió el archivo final' : i.fingerprint !== c.fingerprint ? 'Se actualizó su ficha' : '';
function renderProposal() {
  $('proposalResult').hidden = true;
  let stale = 0;
  const rows = Object.entries(draft.changes).map(([id, c]) => {
    const i = byId(id); if (!i) return `<div class="prow"><div class="thumb ph">?</div><div><div class="prow-title">${esc(id)}</div><div class="prow-notes"><span class="tag warn">Ya no está en el tablero</span></div></div><button class="icon" data-revert="${esc(id)}" title="Quitar de la propuesta">${ICON.trash}</button></div>`;
    const notes = [], changed = staleChange(i, c);
    if (changed) { stale++; notes.push(`<span class="tag warn">${changed}</span><button class="link small" data-restamp="${esc(id)}">Usar la versión actual</button>`); }
    if (c.when && noFinal(i)) notes.push('<span class="tag nofinal">Sin final: queda como reserva</span>');
    else if (c.when && !i.approved && i.status !== 'scheduled') notes.push('<span class="tag">Se aprueba al confirmar</span>');
    if (c.when && c.when <= nowLocal()) notes.push('<span class="tag warn">La hora ya pasó</span>');
    if (c.when && timeline([id]).some(j => minutesBetween(when(j), c.when) < 30)) notes.push('<span class="tag warn">Coincide con otra pieza</span>');
    if (c.networks) notes.push(`<span class="tag">Redes: ${c.networks.map(netName).join(', ')}</span>`);
    if (c.collaborators) notes.push(`<span class="tag">Collab: ${c.collaborators.length ? c.collaborators.map(collabLabel).join(', ') : 'ninguna'}</span>`);
    if (c.version) notes.push(`<span class="tag accent">Versión: ${esc(c.version.split('/').pop())}</span>`);
    if (c.accounts) for (const [n, id] of Object.entries(c.accounts)) { const a = acctOpts(n).find(x => x.id === id); if (a) notes.push(`<span class="tag accent">${netName(n)} desde ${esc(a.profile ? '@' + a.profile : a.brand || a.label)}</span>`); }
    if (i.trial && nets(i).includes('instagram')) notes.push('<span class="tag">IG en reel de prueba</span>');
    if (c.note) notes.push(`<span class="tag">Nota: ${esc(c.note.slice(0, 60))}</span>`);
    if (c.pause) notes.unshift('<span class="tag accent">Se pausa: sale de Postiz</span>');
    if (c.resume) notes.unshift('<span class="tag">Sale de la pausa</span>');
    const target = c.pause ? 'Pausada' : c.resume && !c.when ? 'Listo, sin fecha' : whenLabel(c.when);
    const change = c.when === (i.scheduled ?? null) && !c.pause && !c.resume ? esc(whenLabel(c.when)) : `${i.scheduled ? `<s>${esc(whenLabel(i.scheduled))}</s> → ` : ''}<b>${esc(target)}</b>`;
    return { sort: c.when || '9999', html: `<div class="prow"><button class="prow-open" data-open="${esc(id)}" aria-label="Abrir ${esc(i.title)}">${thumb(i)}</button><div style="min-width:0"><button class="prow-title" data-open="${esc(id)}">${esc(i.title)}</button><div class="prow-change">${change}</div>${notes.length ? `<div class="prow-notes">${notes.join('')}</div>` : ''}</div><button class="icon" data-revert="${esc(id)}" title="Quitar de la propuesta">${ICON.trash}</button></div>` };
  }).map(r => typeof r === 'string' ? { sort: '', html: r } : r).sort((a, b) => a.sort.localeCompare(b.sort));
  const fbRows = feedbackItems().map(i => `<div class="prow"><button class="prow-open" data-open="${esc(i.id)}" aria-label="Abrir ${esc(i.title)}">${thumb(i)}</button><div style="min-width:0"><button class="prow-title" data-open="${esc(i.id)}">${esc(i.title)}</button><div class="prow-notes"><span class="tag accent">${i.feedback_pending === 1 ? '1 nota de contenido' : i.feedback_pending + ' notas de contenido'}</span></div></div></div>`);
  $('proposalList').innerHTML = (rows.length ? `<div class="sub-label" style="margin-top:0">Agenda</div>` + rows.map(r => r.html).join('') : '') + (fbRows.length ? `<div class="sub-label"${rows.length ? '' : ' style="margin-top:0"'}>Contenido · feedback sin aplicar</div>` + fbRows.join('') : '') || '<div class="empty">No quedan cambios.</div>';
  $('prepare').disabled = (!rows.length && !fbRows.length) || !!stale || Object.values(draft.changes).some(c => c.when && c.when <= nowLocal());
  $('discardAll').disabled = !rows.length;
}

// ---------- arrastrar ----------
let drag = null, suppressClick = 0;
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-drag]');
  if (!el || e.button !== 0 || e.target.closest('button') || busy || view === 'history') return;
  drag = { id: el.dataset.id, el, x: e.clientX, y: e.clientY, active: false };
});
document.addEventListener('pointermove', e => {
  const d = drag; if (!d) return;
  if (!d.active) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.active = true; d.ghost = d.el.cloneNode(true); d.ghost.classList.add('drag-ghost');
    d.ghost.style.width = Math.min(d.el.offsetWidth, 220) + 'px'; d.offX = Math.min(e.clientX - d.el.getBoundingClientRect().left, 200); d.offY = e.clientY - d.el.getBoundingClientRect().top;
    document.body.append(d.ghost); d.el.classList.add('lifted'); document.body.classList.add('dragging');
    getSelection()?.removeAllRanges();
    d.raf = requestAnimationFrame(edgeScroll);
  }
  e.preventDefault();
  d.lx = e.clientX; d.ly = e.clientY;
  d.ghost.style.left = (e.clientX - d.offX) + 'px'; d.ghost.style.top = (e.clientY - d.offY) + 'px';
  overAt(e.clientX, e.clientY);
}, { passive: false });
function overAt(x, y) {
  const z = document.elementFromPoint(x, y)?.closest('[data-drop]');
  document.querySelectorAll('.drag-over').forEach(el => el !== z && el.classList.remove('drag-over'));
  z?.classList.add('drag-over');
}
// Cerca del borde de la ventana la página se desplaza sola, para soltar en un día o una franja que no se ve.
function edgeScroll() {
  const d = drag; if (!d?.active) return;
  const edge = 80, v = d.ly < edge ? d.ly - edge : d.ly > innerHeight - edge ? d.ly - (innerHeight - edge) : 0;
  if (v) { window.scrollBy(0, Math.round(Math.max(-edge, Math.min(edge, v)) / 4)); overAt(d.lx, d.ly); }
  d.raf = requestAnimationFrame(edgeScroll);
}
function endDrag() { if (!drag) return; cancelAnimationFrame(drag.raf); drag.ghost?.remove(); drag.el.classList.remove('lifted'); document.body.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); drag = null; }
document.addEventListener('pointerup', e => {
  const d = drag; if (!d) return;
  if (!d.active) { drag = null; return; }
  suppressClick = Date.now() + 300;
  const z = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
  endDrag();
  const i = byId(d.id); if (!z || !i) return;
  if (z.dataset.drop === 'pause') { if (i.status !== 'paused') pauseItem(i); return; }
  if (z.dataset.drop.startsWith('stage:')) { moveToColumn(i, z.dataset.drop.slice(6)); return; }
  if (z.dataset.drop === 'unassigned') { if (when(i)) commit(i, { when: null }, `${i.title.slice(0, 40)} quedó sin fecha.`); }
  else if (z.dataset.drop !== when(i)?.slice(0, 10) || !when(i)) dropOn(i, z.dataset.drop);
});
document.addEventListener('pointercancel', endDrag);

// ---------- eventos ----------
document.addEventListener('click', e => {
  const t = e.target;
  if (!$('timePop').hidden && !t.closest('#timePop') && !t.closest('[data-time]')) $('timePop').hidden = true;
  if (t.closest('.close')) { const dlg = t.closest('dialog'); if (dlg.id === 'drawer') closeDrawer(); else dlg.close(); return; }
  const tab = t.closest('.tabs [data-view]'); if (tab) { view = tab.dataset.view; store.set('view', view); render(); return; }
  const wk = t.closest('[data-week]'); if (wk) { week = monday(wk.dataset.week); render(); scrollTo({ top: 0 }); return; }
  const rs = t.closest('[data-restamp]'); if (rs) { const i = byId(rs.dataset.restamp), c = draft.changes[rs.dataset.restamp]; if (i && c) { snapshot(); draft.changes[i.id] = { ...c, fingerprint: i.fingerprint, primary: i.primary }; queueSave(); render(); renderProposal(); } return; }
  const g = t.closest('[data-group]'); if (g) { group = g.dataset.group; store.set('group', group); render(); return; }
  const older = t.closest('[data-older]'); if (older) { showOlder[older.dataset.older] = !showOlder[older.dataset.older]; render(); return; }
  const pg = t.closest('[data-page]'); if (pg) { pages[pg.dataset.page] = Number(pg.dataset.to); render(); return; }
  const mark = t.closest('[data-mark]'); if (mark) { setPublication(mark.dataset.mark, 'mark'); return; }
  const apr = t.closest('[data-approve]'); if (apr) { setStage(apr.dataset.approve, 'ready'); return; }
  const dis = t.closest('[data-discard]'); if (dis) { setDiscard(dis.dataset.discard, 'discard'); return; }
  const res = t.closest('[data-restore]'); if (res) { setDiscard(res.dataset.restore, 'restore'); return; }
  const tm = t.closest('[data-time]'); if (tm) { const i = byId(tm.dataset.time); if (i && when(i)) openTimePop(i, tm); return; }
  const rev = t.closest('[data-revert]'); if (rev) { snapshot(); delete draft.changes[rev.dataset.revert]; queueSave(); render(); renderProposal(); return; }
  const as = t.closest('#autoSlots [data-aslot]'); if (as) { as.classList.toggle('on'); renderAuto(); return; }
  const op = t.closest('[data-open]'); if (op) { openItem(op.dataset.open); return; }
  const item = t.closest('.tile'); if (item && Date.now() > suppressClick && !t.closest('.acts')) openItem(item.dataset.id);
});
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, textarea, select');
  if (e.key === 'Escape' && !$('timePop').hidden) { $('timePop').hidden = true; return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tile')) { e.preventDefault(); openItem(e.target.dataset.id); return; }
  if ($('drawer').open && ed?.slides?.length > 1 && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); showSlide(ed.slide + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  if (typing || document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((view === 'week' || view === 'stories') && e.key === 'ArrowLeft') { week = dateAdd(week, -7); render(); }
  else if ((view === 'week' || view === 'stories') && e.key === 'ArrowRight') { week = dateAdd(week, 7); render(); }
  else if (e.key === 'h') { week = monday(todayStr()); render(); }
  else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
});
$('prev').onclick = () => { week = dateAdd(week, -7); render(); };
$('next').onclick = () => { week = dateAdd(week, 7); render(); };
$('today').onclick = () => { week = monday(todayStr()); render(); };
$('weekTitle').onclick = () => { try { $('jumpDate').showPicker(); } catch { $('jumpDate').focus(); } };
$('jumpDate').onchange = () => { if ($('jumpDate').value) { week = monday($('jumpDate').value); render(); } };
['search', 'brand', 'format', 'age', 'showRefs'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { if (id === 'brand' || id === 'format') store.set(id, $(id).value); render(); }));
// Cerrar el detalle con cambios sin guardar pide confirmación (Esc, clic afuera o la X).
const drawerDirty = () => { const i = ed && byId(ed.id); return !!i && ((editable(i) && edDirty(i)) || (fb?.id === i.id && !!fb.text.trim())); };
function closeDrawer() { if (drawerDirty() && !confirm('Tenés cambios sin guardar en esta pieza. ¿Cerrar igual?')) return; $('drawer').close(); }
$('drawer').addEventListener('cancel', e => { if (drawerDirty()) { e.preventDefault(); closeDrawer(); } });
$('drawer').addEventListener('close', () => { if (fb?.rec) fb.rec.rec.stop(); $('dMedia').querySelectorAll('video,audio').forEach(v => v.pause()); $('dMedia').innerHTML = ''; ed = null; if ($('proposal').open && $('proposalResult').hidden) renderProposal(); });
$('drawer').addEventListener('click', e => { if (e.target === $('drawer')) closeDrawer(); });
['proposal', 'auto'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) $(id).close(); }));
// La propuesta se revisa contra el estado actual de las piezas: si algo cambió en la carpeta o en la cola, se ve acá.
$('review').onclick = async () => {
  await saving; if (saveError) return;
  renderProposal(); $('proposal').showModal();
  try { data = await api('data'); if (pruneChanges()) queueSave(); render(); if ($('proposal').open && $('proposalResult').hidden) renderProposal(); } catch {}
};
$('discardAll').onclick = () => { if (!confirm('¿Deshacer todos tus cambios? Lo que ya está en Postiz queda igual.')) return; snapshot(); draft.changes = {}; queueSave(); render(); renderProposal(); toast('Cambios deshechos.', () => { undo(); renderProposal(); }); };
$('prepare').onclick = async () => {
  await saving; if (saveError) return;
  try {
    $('prepare').disabled = true;
    const r = await api('proposals', post({ revision: draft.revision }));
    $('proposalResult').hidden = false;
    $('proposalResult').innerHTML = `<div class="sub-label" style="margin-top:0"><b>Propuesta ${esc(r.id)} guardada.</b></div><p class="hint" style="margin:0">Pegá este mensaje en Claude Code: programa la agenda y aplica el feedback.</p><textarea readonly aria-label="Mensaje de confirmación">${esc(r.prompt)}</textarea><button class="primary" id="copyConfirm">${ICON.copy} Copiar mensaje</button>`;
    $('copyConfirm').onclick = () => copyText(r.prompt, 'Copiado. Pegalo en el chat.');
    // Las notas incluidas quedan «enviadas»: se actualiza el contador.
    try { data = await api('data'); render(); } catch {}
  } catch (e) {
    toast(e.message); $('prepare').disabled = false;
    // Si una pieza cambió en el servidor, se vuelve a leer para marcarla en la lista.
    if (e.status === 409) try { data = await api('data'); render(); renderProposal(); } catch {}
  }
};
$('autoOpen').onclick = openAuto;
$('autoFrom').onchange = renderAuto; $('autoRebalance').onchange = renderAuto;
$('autoSlots').addEventListener('change', renderAuto);
$('autoApply').onclick = applyAuto;
async function refreshPostiz(quiet = false) {
  const b = $('sync'); if (b.classList.contains('busy')) return;
  b.classList.add('busy'); $('syncLabel').textContent = 'Consultando…';
  try { await saving; data = await api('refresh', post({})); stories.week = null; if (pruneChanges()) queueSave(); if (!quiet) toast('Postiz y producción actualizados.'); }
  catch (e) { if (!quiet) toast(e.message); }
  finally { b.classList.remove('busy'); render(); if ($('drawer').open && ed) renderDrawer(); }
}
$('sync').onclick = () => refreshPostiz();
// Al volver a la pestaña se releen el borrador y las piezas: el agente pudo haber agendado o cambiado algo.
let lastSync = Date.now();
async function syncFromServer() {
  if (document.hidden || busy || drag || saveError || Date.now() - lastSync < 30000 || $('proposal').open || $('auto').open) return;
  lastSync = Date.now();
  try {
    await saving;
    const [server, fresh] = await Promise.all([api('draft'), api('data')]);
    if (busy || drag || dirtyIds().length) return;
    data = fresh; if (view === 'stories') stories.week = null;
    if (server.revision !== draft.revision) { draft = server; acked = structuredClone(server.changes); undoStack.length = 0; }
    if (pruneChanges()) queueSave();
    render(); if ($('drawer').open && ed) renderDrawer();
  } catch {}
}
document.addEventListener('visibilitychange', syncFromServer);
window.addEventListener('focus', syncFromServer);
window.addEventListener('beforeunload', e => { if (saveError || $('saveStatus').textContent === 'Guardando…') { e.preventDefault(); e.returnValue = ''; } });

(async () => {
  try {
    [data, draft] = await Promise.all([api('data'), api('draft')]);
    acked = structuredClone(draft.changes);
    applyConfig();
    const present = [...new Set([...BRANDS, ...data.items.map(i => i.brand).filter(Boolean)])].filter(b => data.items.some(i => i.brand === b));
    $('brand').innerHTML = `<option value="mine">Todas las marcas</option>` + present.map(b => `<option value="${esc(b)}">${esc(BRAND_LABEL[b] || b)}</option>`).join('');
    $('brand').hidden = present.length < 2;
    const sb = store.get('brand', 'mine'); if ([...$('brand').options].some(o => o.value === sb)) $('brand').value = sb;
    $('format').value = store.get('format', 'all');
    if (pruneChanges()) queueSave();
    render();
    setInterval(renderSync, 60000);
    // Una consulta vieja muestra como «En Postiz» lo que ya salió: si tiene más de 30 min, se renueva sola.
    const age = Date.now() - Date.parse(data.postiz_fetched_at || 0);
    if (!(age < 30 * 60000)) refreshPostiz(true);
  } catch (e) {
    if (e.needsSetup) return showSetup(e);
    setSave('No se pudo cargar', true); $('backlogList').innerHTML = `<div class="empty">${esc(e.message)}<br>Recargá para reintentar.</div>`;
  }
})();
// Zona horaria, idioma, marcas y redes de planner.config.json.
function applyConfig() {
  TZ = data.timezone || TZ; LOCALE = cfg().locale || LOCALE;
  BRANDS = cfg().brands || [];
  const nets = (cfg().networks || []).map(n => n.id);
  NET_ORDER = [...PREFERRED_ORDER.filter(n => nets.includes(n)), ...nets.filter(n => !PREFERRED_ORDER.includes(n))];
  week = monday(todayStr());
}
// Todavía no hay config: la app explica qué falta en vez de mostrar un tablero vacío.
function showSetup(e) {
  document.querySelectorAll('main').forEach(m => m.hidden = true);
  document.querySelector('.filters').hidden = true; document.querySelector('.actions').hidden = true; document.querySelector('.tabs').hidden = true;
  const box = document.createElement('main'); box.className = 'setup';
  box.innerHTML = `<h1>Falta terminar la instalación</h1><p>${esc(e.message)}</p><p>Abrí Claude Code en la carpeta del planner y escribí:</p><pre>Instalá el planner de contenido siguiendo INSTALAR.md</pre><p class="muted">Archivo de configuración esperado: ${esc(e.config || 'planner.config.json')}</p><button class="primary" onclick="location.reload()">Ya está, recargar</button>`;
  document.body.insertBefore(box, $('alerts'));
}
