// Título de las conversaciones que nacen de un mensaje copiado del planner. La primera línea de cada mensaje es
// «[Etiqueta] qué se está haciendo» y .claude/hooks/titulo_desde_planner.py la vuelve el título de la conversación, en vez
// de uno armado con los ids de la propuesta. Las etiquetas válidas están en ese hook. Los ids siguen en el cuerpo, que es
// donde los necesita quien aplica el mensaje. public/ui.js tiene la misma versión para los mensajes que arma el navegador.
export type EtiquetaMensaje = 'Feedback' | 'Planificación' | 'Agenda' | 'Producción' | 'Anuncios';

const MAX_TITULO = 90;
const cortar = (t: string, max: number) => {
  const c = [...t];
  if (c.length <= max) return t;
  const s = c.slice(0, max - 1).join(''), e = s.lastIndexOf(' ');
  return (e > max * 0.6 ? s.slice(0, e) : s).trimEnd() + '…';
};
// Sin «@»: al pegarlo en Claude Code abre el selector de archivos.
const limpio = (t: any) => String(t ?? '').split('\n')[0].replace(/@/g, '').replace(/\s+/g, ' ').trim();

export const tituloMensaje = (etiqueta: EtiquetaMensaje, descripcion: string) => `[${etiqueta}] ${cortar(limpio(descripcion), MAX_TITULO)}`;
export const conTitulo = (titulo: string, cuerpo: string) => `${titulo}\n\n${cuerpo}`;
export const tieneTitulo = (mensaje: string) => /^\[[^\]\n]+\] /.test(mensaje);
export const nombreMensaje = (t: any, max = 48) => { const x = limpio(t); return x ? `«${cortar(x, max)}»` : ''; };
export const cantidad = (n: number, uno: string, varios = uno + 's') => `${n} ${n === 1 ? uno : varios}`;
export const listaNatural = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] || '';
export const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const fmtDia = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
export const diaCorto = (fecha: string) => fmtDia.format(new Date(String(fecha).slice(0, 10) + 'T12:00:00Z')).replace(/[.,]/g, '').replace(/\s+de\s+/, ' ');
// «del 6 nov», «del 6 al 8 nov» o «del 30 oct al 2 nov».
export function diasMensaje(fechas: string[]) {
  const dias = [...new Set(fechas.map(f => String(f).slice(0, 10)))].sort();
  if (!dias.length) return '';
  const a = diaCorto(dias[0]), b = diaCorto(dias[dias.length - 1]);
  if (a === b) return `del ${a}`;
  return a.split(' ')[1] === b.split(' ')[1] ? `del ${a.split(' ')[0]} al ${b}` : `del ${a} al ${b}`;
}

// «Editar el video «X»», «Cambiar el copy de «X»» o los dos. `pieza`: «el video», «el carrusel», «el guion», «la pieza».
export function editarDesc(titulo: any, copy: boolean, otras: boolean, pieza: string) {
  const n = nombreMensaje(titulo);
  if (copy && otras) return `Editar ${pieza} y el copy de ${n}`;
  return copy ? `Cambiar el copy de ${n}` : `Editar ${pieza} ${n}`;
}
