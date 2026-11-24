'use strict';
/* FeGest Feria — NÚCLEO: guardado en el celular, nube, sincronización y cálculo de stock.
   Todo lo que se hace queda primero en el celular (IndexedDB) y después se sube a la nube
   cuando hay internet. El stock que se ve = catálogo de la notebook + operaciones nuevas. */

const VERSION = '1.0.21';
const F = {};            // espacio de nombres compartido con app.js

/* ───────────── IndexedDB ───────────── */
let _db = null;
function idb() {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const r = indexedDB.open('fegest-movil', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('ops', { keyPath: 'u' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return _db;
}
function tx(store, modo, fn) {
  return idb().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, modo); const s = t.objectStore(store);
    let out; try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => { s.put(v, k); });
const opPut = o => tx('ops', 'readwrite', s => { s.put(o); });
const opsTodas = () => tx('ops', 'readonly', s => s.getAll());
const opBorrar = u => tx('ops', 'readwrite', s => { s.delete(u); });

/* ───────────── Estado en memoria ───────────── */
const S = F.S = {
  cfg: null,          // {u, t, eq}
  snap: null,         // catálogo publicado por la notebook
  ops: new Map(),     // u -> operación (con seq si la nube ya la numeró)
  lastPull: 0,        // última operación bajada de la nube
  cart: [],
  may: { on: false, pct: null },
  promos: [],
  sync: { estado: 'idle', ultima: '', error: '', enCurso: false },
  derivado: null,
};

function ahora() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function hoyStr() { return ahora().slice(0, 10); }
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}

F.kvSet = kvSet;
F.fechaHace = d => { const x = new Date(Date.now() - d * 86400000), p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };

F.cargar = async function () {
  S.cfg = (await kvGet('cfg')) || null;
  S.snap = (await kvGet('snap')) || null;
  S.lastPull = (await kvGet('lastPull')) || 0;
  S.cart = (await kvGet('cart')) || [];
  for (const x of S.cart) if (!x.combo && x.ofe == null) { x.base = x.base != null ? x.base : x.pr; x.ofe = x.pr; }   // carrito guardado por una versión anterior
  S.may = (await kvGet('may')) || { on: false, pct: null };
  S.promos = (await kvGet('promos')) || [];
  S.fondo = (await kvGet('fondo')) || '';
  S.ultCierre = (await kvGet('ultCierre')) || '';
  S.sync.ultima = (await kvGet('ultimaSync')) || '';
  S.ops = new Map();
  for (const o of await opsTodas()) S.ops.set(o.u, o);
  F.recalcular();
};
F.guardarCfg = async c => { S.cfg = c; await kvSet('cfg', c); };
F.guardarCart = () => kvSet('cart', S.cart);
F.guardarMay = () => kvSet('may', S.may);
F.guardarFondo = v => { S.fondo = v; return kvSet('fondo', v); };

/* Crea una operación (queda guardada en el celular al instante) */
F.nuevaOp = async function (k, p) {
  const op = { u: uuid(), d: S.cfg.eq || 'celular', ts: ahora(), k, p, seq: null };
  S.ops.set(op.u, op);
  await opPut(op);
  F.recalcular();
  F.sincronizarSoon();
  return op;
};

/* ───────────── Nube (Google Apps Script) ───────────── */
async function hub(accion, datos, ms) {
  if (!S.cfg || !S.cfg.u) throw new Error('Falta conectar con la notebook.');
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms || 30000);
  try {
    const r = await fetch(S.cfg.u, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },      // sin preflight (Apps Script no lo soporta)
      body: JSON.stringify(Object.assign({ t: S.cfg.t, a: accion }, datos || {})),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error === 'token' ? 'El enlace de conexión no es válido (token). Pedí uno nuevo en la notebook.' : 'La nube respondió: ' + j.error);
    return j;
  } finally { clearTimeout(to); }
}

let _timer = null;
F.sincronizarSoon = function () { clearTimeout(_timer); _timer = setTimeout(() => F.sincronizar(), 600); };

F.pendientes = () => [...S.ops.values()].filter(o => o.seq == null);

F.sincronizar = async function (manual) {
  if (S.sync.enCurso || !S.cfg || !S.cfg.u) return false;
  S.sync.enCurso = true; S.sync.estado = 'sync'; F.pintarEstado && F.pintarEstado();
  let huboCambio = false;
  try {
    // 1) subir lo pendiente (de a 40)
    for (;;) {
      const pend = F.pendientes().sort((a, b) => a.ts < b.ts ? -1 : 1).slice(0, 40);
      if (!pend.length) break;
      const r = await hub('push', { ops: pend.map(o => ({ u: o.u, d: o.d, ts: o.ts, k: o.k, p: o.p })) });
      for (const x of r.res || []) {
        const o = S.ops.get(x.u); if (o) { o.seq = x.seq; await opPut(o); }
      }
      huboCambio = true;
    }
    // 2) operaciones nuevas (la respuesta también avisa si la notebook publicó un catálogo nuevo)
    let avisoSnap = null;
    for (;;) {
      const r = await hub('pull', { since: S.lastPull, limit: 200 });
      if (avisoSnap === null) avisoSnap = r;
      const lista = r.ops || [];
      for (const o of lista) {
        const ya = S.ops.get(o.u);
        const nuevo = ya ? Object.assign(ya, { seq: o.seq }) : { u: o.u, d: o.d, ts: o.ts, k: o.k, p: o.p, seq: o.seq };
        S.ops.set(o.u, nuevo); await opPut(nuevo);
        S.lastPull = Math.max(S.lastPull, o.seq);
      }
      await kvSet('lastPull', S.lastPull);
      if (lista.length) huboCambio = true;
      if (lista.length < 200) break;
    }
    // 3) catálogo nuevo de la notebook (solo si cambió)
    if (avisoSnap && avisoSnap.snapPartes > 0 && avisoSnap.snapTs && avisoSnap.snapTs !== (S.snap ? S.snap.ts : '')) {
      const g = await hub('snap_get', null, 60000);
      if (g.json) {
        const sn = JSON.parse(g.json);
        S.snap = sn; await kvSet('snap', sn);
        if (S.lastPull < sn.seq) { S.lastPull = sn.seq; await kvSet('lastPull', S.lastPull); }
        huboCambio = true;
      }
    }
    await podar();
    S.sync.estado = 'ok'; S.sync.error = ''; S.sync.ultima = ahora(); await kvSet('ultimaSync', S.sync.ultima);
    if (huboCambio) F.recalcular();
    return true;
  } catch (e) {
    S.sync.estado = (navigator.onLine === false || /fetch|network|Failed|abort/i.test(String(e))) ? 'off' : 'error';
    S.sync.error = (e && e.name === 'AbortError') ? 'La conexión tardó demasiado.' : String(e && e.message || e);
    return false;
  } finally {
    S.sync.enCurso = false;
    F.pintarEstado && F.pintarEstado();
    F.alActualizar && F.alActualizar();
  }
};

/* borra operaciones ya numeradas con más de 21 días (para no crecer sin fin) */
async function podar() {
  const lim = new Date(Date.now() - 21 * 86400000); const p = n => String(n).padStart(2, '0');
  const corte = `${lim.getFullYear()}-${p(lim.getMonth() + 1)}-${p(lim.getDate())}`;
  for (const o of [...S.ops.values()]) if (o.seq != null && o.ts.slice(0, 10) < corte) { S.ops.delete(o.u); await opBorrar(o.u); }
}

/* ───────────── Cálculo de stock, precios y fiados ───────────── */
F.precioOferta = function (p) {
  if (p.o && p.o[0] > 0 && (!p.o[1] || p.o[1] >= hoyStr())) return Math.round(p.p * (1 - p.o[0] / 100) * 100) / 100;
  return p.p;
};

F.recalcular = function () {
  const sn = S.snap;
  if (!sn) { S.derivado = null; return; }
  const refs = sn.refs || {};
  const P = new Map(), Fi = new Map();
  for (const p of sn.prods) P.set('i:' + p.i, Object.assign({}, p, { key: 'i:' + p.i, vs: p.vs ? p.vs.map(x => [x[0], x[1]]) : null }));
  for (const f of sn.fiados) Fi.set('i:' + f.i, Object.assign({}, f, { key: 'i:' + f.i }));
  const kP = it => {
    if (it.id) return 'i:' + it.id;
    if (it.ref) { const r = refs[it.ref]; return (r && r[0] === 'prod') ? 'i:' + r[1] : 'r:' + it.ref; }
    return null;
  };
  const kF = it => {
    if (it.id) return 'i:' + it.id;
    if (it.ref) { const r = refs[it.ref]; return (r && r[0] === 'fiado') ? 'i:' + r[1] : 'r:' + it.ref; }
    return null;
  };
  const todas = [...S.ops.values()];
  const ventas = new Map();                          // u -> venta/fiado (para anular y listar)
  for (const o of todas) if (o.k === 'venta' || o.k === 'fiado_nuevo') ventas.set(o.u, o);
  const anuladas = new Set(todas.filter(o => o.k === 'venta_anular').map(o => o.p.venta_u));
  // solo se vuelven a aplicar las operaciones que el catálogo todavía no incluye
  const aplicar = todas.filter(o => o.seq == null || o.seq > sn.seq)
    .sort((a, b) => (a.seq == null ? 1e12 : a.seq) - (b.seq == null ? 1e12 : b.seq) || (a.ts < b.ts ? -1 : 1));

  const mover = (items, signo) => {                // signo -1 = vender, +1 = devolver
    for (const it of items || []) {
      if (it.libre) continue;
      const p = P.get(kP(it)); if (!p) continue;
      p.s += signo * (it.c || 0);
      if (p.vs && it.n && it.n.startsWith(p.n + ' - ')) {
        const nom = it.n.slice(p.n.length + 3); const v = p.vs.find(x => x[0] === nom);
        if (v) v[1] += signo * (it.c || 0);
      }
    }
  };
  for (const o of aplicar) {
    const p = o.p || {};
    if (o.k === 'venta') mover(p.items, -1);
    else if (o.k === 'venta_anular') { const v = ventas.get(p.venta_u); if (v) mover(v.p.items, +1); }
    else if (o.k === 'prod_nuevo') {
      const real = refs[p.ref || o.u]; if (real && P.has('i:' + real[1])) continue;
      const vs = (p.variantes || []).filter(v => v.n).map(v => [v.n, +v.s || 0]);
      const k = 'r:' + (p.ref || o.u);
      P.set(k, { key: k, i: 0, ref: p.ref || o.u, n: p.nombre, p: +p.precio || 0, s: vs.length ? vs.reduce((a, v) => a + v[1], 0) : (+p.stock || 0),
        cb: p.codigo || '', c: p.categoria || 'GENERAL', vs: vs.length ? vs : null, nuevo: true });
    } else if (o.k === 'prod_edit') {
      const x = P.get(kP(p)); if (!x) continue; const c = p.campos || {};
      if ('nombre' in c) x.n = c.nombre; if ('precio' in c) x.p = +c.precio; if ('categoria' in c) x.c = c.categoria; if ('codigo' in c) x.cb = c.codigo;
      if (p.stock_nuevo != null && p.stock_antes != null) x.s += (+p.stock_nuevo) - (+p.stock_antes);
    } else if (o.k === 'fiado_nuevo') {
      mover(p.items, -1);
      const k = 'r:' + (p.ref || o.u);
      if (!(refs[p.ref || o.u] && Fi.has('i:' + refs[p.ref || o.u][1])))
        Fi.set(k, { key: k, c: p.cliente, t: +p.total || 0, p: +p.pagado || 0, nuevo: true });
    } else if (o.k === 'fiado_pago') {
      const f = Fi.get(kF(p)); if (f) f.p += (+p.monto || 0);
    }
  }
  S.derivado = { P, Fi, ventas, anuladas, kP };
};

F.productos = () => S.derivado ? [...S.derivado.P.values()] : [];
F.fiadosAbiertos = () => S.derivado ? [...S.derivado.Fi.values()].filter(f => f.t - f.p > 0.009) : [];

/* Texto de estado para el botón de arriba */
F.resumenEstado = function () {
  const n = F.pendientes().length;
  if (S.sync.estado === 'sync') return ['sync', 'Sincronizando…'];
  if (S.sync.estado === 'off' || navigator.onLine === false) return ['off', n ? `Sin internet · ${n} por subir` : 'Sin internet'];
  if (S.sync.estado === 'error') return ['off', n ? `Error · ${n} por subir` : 'Error de conexión'];
  if (n) return ['pend', `${n} por subir`];
  return ['ok', 'Al día'];
};

window.F = F;
