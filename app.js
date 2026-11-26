'use strict';
/* FeGest Feria — pantallas. La lógica de guardado y sincronización está en nucleo.js */
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mon = n => ((S.snap && S.snap.neg && S.snap.neg.moneda) || '$') + ' ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const r2 = n => Math.round(n * 100) / 100;
const ui = { combo: null, tab: 'vender', q: '', cat: '', pq: '', fq: '', cobro: null };
const ICONO = { 'EFECTIVO': '💵', 'TRANSFERENCIA': '📲', 'QR': '📱', 'DÉBITO': '💳', 'CRÉDITO': '💳' };
const METODOS = () => (S.snap && S.snap.metodos) || ['EFECTIVO', 'TRANSFERENCIA', 'QR', 'DÉBITO', 'CRÉDITO'];
const cap = m => m === 'QR' ? 'QR' : m.charAt(0) + m.slice(1).toLowerCase();
let instalador = null;

/* ───────────── avisos y hojas ───────────── */
let _tAviso = null;
function aviso(txt, tipo) {
  const a = $('#aviso'); a.className = tipo || ''; a.textContent = txt; a.hidden = false;
  clearTimeout(_tAviso); _tAviso = setTimeout(() => { a.hidden = true; }, tipo === 'mal' ? 5000 : 2200);
}
function hoja(html, alCerrar) {
  $('#velo').hidden = false; const h = $('#hoja'); h.hidden = false; h.innerHTML = html; h.scrollTop = 0;
  h._alCerrar = alCerrar || null;
}
function cerrar() {
  $('#velo').hidden = true; const h = $('#hoja'); h.hidden = true; h.innerHTML = '';
  const f = h._alCerrar; h._alCerrar = null; if (f) f();
  ui.cobro = null;
}
const hayHoja = () => !$('#hoja').hidden;
function tituloHoja(t) { return `<h2>${esc(t)}<button type="button" data-act="cerrar" aria-label="Cerrar">✕</button></h2>`; }

/* ───────────── encabezado ───────────── */
F.pintarEstado = function () {
  const [cls, txt] = F.resumenEstado();
  $('#punto').className = cls; $('#estadoTxt').textContent = txt;
};
F.alActualizar = function () {
  if (hayHoja() || !S.cfg || ui.conectando) return;
  const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  render();
};

/* ───────────── pantallas ───────────── */
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  F.pintarEstado();
  if (!S.cfg) { $('#tabs').hidden = true; $('#top').hidden = false; return bienvenida(); }
  $('#tabs').hidden = false;
  ({ vender: rVender, productos: rProductos, ventas: rVentas, fiados: rFiados, caja: rCaja }[ui.tab])();
  barraCarrito();
}

function sinCatalogo() {
  return `<div class="bienvenida"><h1>Esperando el catálogo</h1>
    <p>Todavía no llegaron los productos de la notebook. Conectate a internet y tocá el botón de arriba para sincronizar.</p>
    <p class="nota">Si es la primera vez: la notebook del local tiene que estar prendida (con internet) al menos una vez para publicar los productos. Después ya no hace falta.</p>
    <button class="btn ancho" data-act="sync">Sincronizar ahora</button></div>`;
}

/* ===== Bienvenida / conexión ===== */
function leerEnlace(txt) {
  try {
    const t = String(txt || '').trim(); const h = t.includes('#') ? t.slice(t.indexOf('#') + 1) : t;
    const p = new URLSearchParams(h); const u = p.get('u'), k = p.get('t');
    if (u && k && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/.test(u)) return { u, t: k };
  } catch (e) { /* nada */ }
  return null;
}
function bienvenida() {
  const pre = ui.enlacePre || '';
  $('#main').innerHTML = `<div class="bienvenida">
    <h1>Conectar con la notebook</h1>
    <p class="nota">Una sola vez. Abrí el <b>enlace de conexión</b> que te muestra FeGest en la notebook (Configuración → 📱 Celular / Feria), o pegalo acá.</p>
    <label class="campo">Enlace de conexión</label>
    <textarea id="enlace" class="entrada" rows="3" placeholder="https://…#u=…&t=…">${esc(pre)}</textarea>
    <label class="campo">Nombre de este celular</label>
    <input id="equipo" class="entrada" maxlength="20" placeholder="Ej: Fede" value="${esc((S.cfg && S.cfg.eq) || ui.equipoPre || '')}">
    <p class="nota">Si usás dos celulares, ponele un nombre distinto a cada uno: así se sabe quién hizo cada venta.</p>
    <button class="btn ancho" data-act="conectar">Conectar</button>
    <p id="msgConexion" class="nota"></p></div>`;
  $('#barraCarrito').hidden = true;
}
async function conectar() {
  const l = leerEnlace($('#enlace').value); const eq = $('#equipo').value.trim().replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 20);
  const m = $('#msgConexion');
  if (!l) { m.textContent = 'El enlace no es válido. Tiene que empezar con https:// y tener "#u=" y "&t=".'; return; }
  if (!eq) { m.textContent = 'Poné un nombre para este celular.'; return; }
  m.textContent = 'Conectando…';
  const txt = $('#enlace').value;
  ui.conectando = true;
  await F.guardarCfg({ u: l.u, t: l.t, eq });
  ui.enlacePre = '';
  const ok = await F.sincronizar(true);
  ui.conectando = false;
  if (!ok && /token|enlace/i.test(S.sync.error || '')) {      // enlace equivocado: no se guarda, se vuelve a pedir
    const err = S.sync.error;
    await F.guardarCfg(null);
    ui.enlacePre = txt; ui.equipoPre = eq; render();
    $('#msgConexion').textContent = err;
    return;
  }
  render();
  if (!ok) { aviso('Sin conexión por ahora: ' + (S.sync.error || 'probá de nuevo con internet') + '. El enlace quedó guardado.', 'mal'); return; }
  if (ok && !S.snap) aviso('Conectado. Falta que la notebook publique el catálogo.', 'ok');
  else if (ok) aviso('¡Conectado! ' + S.snap.prods.length + ' productos cargados.', 'ok');
}

/* ===== VENDER ===== */
function filtrarProductos(q, cat) {
  const ws = norm(q).split(/\s+/).filter(Boolean);
  return F.productos().filter(p => (!cat || p.c === cat) && ws.every(w => norm(p.n).includes(w) || (p.cb && p.cb.includes(w))))
    .sort((a, b) => norm(a.n) < norm(b.n) ? -1 : 1);
}
function stockTag(p) {
  const s = p.s; const c = s <= 0 ? 'cero' : s <= 3 ? 'bajo' : '';
  return `<span class="stock ${c}">${s <= 0 ? 'Sin stock' : s + ' u.'}</span>`;
}
/* v1.0.22 — foto chica y botón i (descripción): se tocan y abren la ficha grande */
function fotoSegura(u) { return /^https:\/\/[^\s"'<>`\\]+$/i.test(u || '') ? u : ''; }
function fotoMini(u) { return fotoSegura(u).replace(/([?&])sz=w\d+/, '$1sz=w160'); }
function miniFotoHTML(p, cls) {
  const m = fotoMini(p.im); if (!m || !p.key) return '';
  return `<img class="${cls}" src="${esc(m)}" data-act="info" data-k="${esc(p.key)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.style.display='none'">`;
}
function infoBtnHTML(p) {
  return p.de && p.de.trim() && p.key ? `<span class="infob" role="button" tabindex="0" data-act="info" data-k="${esc(p.key)}" aria-label="Más info">i</span>` : '';
}
function infoProducto(key) {
  const p = S.derivado.P.get(key); if (!p) return;
  const g = fotoSegura(p.im), det = (p.de || '').trim();
  if (!g && !det) return;
  hoja(tituloHoja(p.n) + (g ? `<img class="foto-grande" src="${esc(g)}" referrerpolicy="no-referrer" alt="" onerror="this.style.display='none'">` : '')
    + (det ? `<p class="detalle">${esc(det)}</p>` : '')
    + `<p class="nota" style="margin:4px 0 0">${mon(F.precioOferta(p))} · ${p.s <= 0 ? 'sin stock' : p.s + ' u.'}</p>`
    + `<div class="dos" style="margin-top:10px"><button class="btn sec" data-act="cerrar">Cerrar</button><button class="btn" data-act="addinfo" data-k="${esc(p.key)}">＋ Agregar al carrito</button></div>`);
}
function filaProducto(p, act) {
  const of = F.precioOferta(p) < p.p;
  return `<button class="fila" data-act="${act}" data-k="${esc(p.key)}">${miniFotoHTML(p, 'mini')}
    <div class="nom"><b>${esc(p.n)}${of ? `<span class="oferta">-${p.o[0]}%</span>` : ''}${infoBtnHTML(p)}</b><small>${esc(p.c)}${p.cb ? ' · ' + esc(p.cb) : ''}${p.nuevo ? ' · nuevo' : ''}</small></div>
    <div style="text-align:right"><div class="pre">${mon(F.precioOferta(p))}</div>${stockTag(p)}</div></button>`;
}
function rVender() {
  if (!S.snap) { $('#main').innerHTML = sinCatalogo(); return; }
  const cats = [...new Set(F.productos().map(p => p.c))].sort();
  $('#main').innerHTML = `<div class="buscar"><input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Buscar producto o código…" value="${esc(ui.q)}">
    <button class="btn" data-act="scan" aria-label="Escanear">📷</button><button class="btn sec" data-act="combo" aria-label="Armar combo">🎁</button><button class="btn sec" data-act="manual" aria-label="Producto manual">＋</button></div>
    <div class="chips"><button class="chip ${!ui.cat ? 'on' : ''}" data-act="cat" data-v="">Todos</button>${cats.map(c => `<button class="chip ${ui.cat === c ? 'on' : ''}" data-act="cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="lista"></div>`;
  pintarLista();
}
function pintarLista() {
  const l = filtrarProductos(ui.q, ui.cat);
  $('#lista').innerHTML = l.length ? l.slice(0, 80).map(p => filaProducto(p, 'add')).join('') + (l.length > 80 ? `<p class="nota" style="text-align:center">Mostrando 80 de ${l.length}. Escribí para filtrar.</p>` : '')
    : '<div class="vacio">No hay productos con ese nombre.<br>Podés cargar uno suelto con el botón ＋</div>';
}
/* ---- Carrito: precios (oferta, mayorista, a mano) ---- */
const pctMayGlobal = () => (S.snap && S.snap.neg && S.snap.neg.pctMay) || 0;
const pctMayLinea = x => (S.may.pct != null) ? S.may.pct : (x.pm || pctMayGlobal());
function precioLinea(x) {
  if (x.combo) return x.pr;
  if (x.prOv != null) return x.prOv;
  if (S.may.on && !x.sinMay) return r2(x.base * (1 - pctMayLinea(x) / 100));
  return x.ofe;
}
const totalCarrito = () => r2(S.cart.reduce((a, x) => a + precioLinea(x) * x.c, 0));
const hayMayoristaActivo = () => S.may.on && S.cart.some(x => !x.combo && !x.sinMay && x.prOv == null);
function limpiarMay() { S.may = { on: false, pct: null }; F.guardarMay(); }

function agregarAlCarrito(key, variante) {
  const p = S.derivado.P.get(key); if (!p) return;
  if (p.mv) return aviso('Ese producto se vende por peso: cobralo desde la notebook.', 'mal');
  if (p.vs && p.vs.length && variante == null) return elegirVariante(p);
  const lid = key + (variante ? '|' + variante : '');
  const ex = S.cart.find(x => x.lid === lid);
  if (ex) ex.c++;
  else S.cart.push({ lid, k: key, n: variante ? `${p.n} - ${variante}` : p.n, base: p.p, ofe: F.precioOferta(p), pm: p.pm || 0, c: 1 });
  F.guardarCart(); barraCarrito(); aviso('+ ' + p.n + (variante ? ' (' + variante + ')' : ''));
  if (navigator.vibrate) navigator.vibrate(15);
}
function elegirVariante(p) {
  hoja(tituloHoja(p.n) + `<p class="nota">Elegí la variante:</p>` + p.vs.map(v =>
    `<button class="fila" data-act="addv" data-k="${esc(p.key)}" data-v="${esc(v[0])}"><div class="nom"><b>${esc(v[0])}</b></div><span class="stock ${v[1] <= 0 ? 'cero' : v[1] <= 2 ? 'bajo' : ''}">${v[1] <= 0 ? 'Sin stock' : v[1] + ' u.'}</span></button>`).join(''));
}
function barraCarrito() {
  const b = $('#barraCarrito'); const n = S.cart.reduce((a, x) => a + x.c, 0);
  if (!n || !S.cfg || ui.tab !== 'vender') { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<button type="button" data-act="carrito"><span>🛒 ${n} ${n === 1 ? 'producto' : 'productos'}${hayMayoristaActivo() ? ' · 💼' : ''}</span><span>${mon(totalCarrito())} ›</span></button>`;
}
function lineaCarritoHTML(x, i) {
  if (x.combo) {
    return `<div class="lin"><div class="nom"><b>🎁 ${esc(x.n)}</b><small>${x.cit.map(c => esc(c.n) + ' ×' + c.c).join(' · ')}<br>Lista ${mon(x.lista)}${x.lista > x.pr ? ' · descuento −' + mon(x.lista - x.pr) : ''}</small></div>
      <button class="btn sec chico" data-act="cbedit" data-i="${i}">✎</button>
      <b style="min-width:70px;text-align:right">${mon(x.pr)}</b><button class="btn sec chico" data-act="quitar" data-i="${i}" aria-label="Quitar">✕</button></div>`;
  }
  const pr = precioLinea(x); const dif = Math.abs(pr - x.base) > 0.004;
  const tag = (S.may.on && !x.sinMay && x.prOv == null) ? '<span class="oferta" style="background:#dbeafe;color:#1d4ed8">💼 may.</span>'
    : (x.prOv == null && x.ofe < x.base - 0.004 ? '<span class="oferta">oferta</span>' : '');
  const _pp = S.derivado && S.derivado.P.get(x.k);
  return `<div class="lin">${_pp ? miniFotoHTML(_pp, 'mini') : ''}<div class="nom"><b>${esc(x.n)} ${tag}</b>
      <small><button class="precio-edit" data-act="precio" data-i="${i}">${mon(pr)}</button> c/u${dif ? ` <s>${mon(x.base)}</s>` : ''}</small></div>
      <div class="cant"><button data-act="menos" data-i="${i}">−</button><span>${x.c}</span><button data-act="mas" data-i="${i}">+</button></div>
      <b style="min-width:70px;text-align:right">${mon(pr * x.c)}</b></div>`;
}
function abrirCarrito() {
  if (!S.cart.length) return cerrar();
  const may = hayMayoristaActivo();
  hoja(tituloHoja('Carrito') + S.cart.map(lineaCarritoHTML).join('') +
    `<div class="total-g"><span>Total</span><span>${mon(totalCarrito())}</span></div>
     ${may ? `<div class="nota">💼 Precio mayorista activo${S.may.pct != null ? ' (−' + S.may.pct + '%)' : ''} · <button class="precio-edit" data-act="mayo">cambiar</button></div>` : ''}
     <div class="dos" style="margin-top:8px"><button class="btn sec" data-act="manual">＋ Suelto</button><button class="btn sec" data-act="combo">🎁 Combo</button><button class="btn sec ${may ? 'on' : ''}" data-act="mayo">💼 Mayorista</button></div>
     <div class="dos" style="margin-top:8px"><button class="btn sec" data-act="vaciar">Vaciar</button></div>
     <button class="btn ok ancho" style="margin-top:10px;padding:15px;font-size:17px" data-act="cobrar">Cobrar ${mon(totalCarrito())}</button>`);
}
function cambiarPrecio(i) {
  const x = S.cart[i]; const v = prompt('Precio de "' + x.n + '"', precioLinea(x)); if (v == null) return;
  const n = parseFloat(String(v).replace(',', '.')); if (!(n >= 0)) return aviso('Precio no válido', 'mal');
  x.prOv = r2(n); F.guardarCart(); abrirCarrito(); barraCarrito();
}
function productoManual() {
  hoja(tituloHoja('Producto suelto') + `<p class="nota">Para algo que no está cargado en el sistema. No descuenta stock.</p>
    <label class="campo">Descripción</label><input id="mn" class="entrada" maxlength="80" placeholder="Ej: Perfume varios">
    <div class="dos"><div><label class="campo">Precio</label><input id="mp" class="entrada" inputmode="decimal" placeholder="0"></div>
    <div><label class="campo">Cantidad</label><input id="mc" class="entrada" inputmode="numeric" value="1"></div></div>
    <button class="btn ancho" style="margin-top:14px" data-act="manualok">Agregar al carrito</button>`);
  setTimeout(() => $('#mn') && $('#mn').focus(), 80);
}
function manualOk() {
  const n = $('#mn').value.trim() || 'Producto varios'; const p = parseFloat(String($('#mp').value).replace(',', '.')); const c = parseInt($('#mc').value, 10) || 1;
  if (!(p > 0)) return aviso('Poné el precio', 'mal');
  S.cart.push({ lid: 'L' + Date.now(), k: null, n, base: r2(p), ofe: r2(p), c: Math.max(1, c), libre: true });
  F.guardarCart(); cerrar(); barraCarrito(); aviso('+ ' + n);
}

/* ---- Mayorista ---- */
function abrirMayo() {
  const lineas = S.cart.map((x, i) => ({ x, i })).filter(o => !o.x.combo);
  if (!lineas.length) return aviso('Agregá productos para usar el mayorista', 'mal');
  const glob = pctMayGlobal();
  hoja(tituloHoja('💼 Precio mayorista') + `<p class="nota">Elegí el % de descuento y en qué productos se aplica. Los combos no llevan mayorista.</p>
    <label class="campo">Descuento mayorista (%)</label>
    <input id="mpct" class="entrada" inputmode="decimal" value="${S.may.pct != null ? S.may.pct : ''}" placeholder="${glob ? 'Vacío = el % de cada producto (general ' + glob + '%)' : 'Ej: 10'}">
    <label class="campo">Aplicar a:</label><div id="mlista">${lineas.map(({ x, i }) => `<label class="lin" style="gap:10px"><input type="checkbox" data-mi="${i}" ${x.sinMay ? '' : 'checked'}>
      <span class="nom"><b>${esc(x.n)}</b><small>×${x.c}</small></span><span class="mpr" id="mpr${i}"></span></label>`).join('')}</div>
    <div id="mtot" class="total-g" style="font-size:17px"></div>
    <button class="btn ok ancho" style="margin-top:10px" data-act="mayook">Aplicar mayorista</button>
    ${S.may.on ? '<button class="btn sec ancho" style="margin-top:8px" data-act="mayoquitar">Quitar mayorista</button>' : ''}`);
  mayoPreview();
}
function mayoPreview() {
  const raw = $('#mpct').value.trim(); const manual = raw === '' ? null : Math.min(Math.max(parseFloat(raw.replace(',', '.')) || 0, 0), 100);
  let total = 0, ahorro = 0;
  S.cart.forEach((x, i) => {
    if (x.combo) { total += x.pr * x.c; return; }
    const cb = document.querySelector(`#mlista input[data-mi="${i}"]`); const on = cb ? cb.checked : !x.sinMay;
    const normal = x.prOv != null ? x.prOv : x.ofe; const pct = manual != null ? manual : (x.pm || pctMayGlobal());
    const may = x.prOv != null ? x.prOv : r2(x.base * (1 - pct / 100)); const el = document.getElementById('mpr' + i);
    if (on) { total += may * x.c; ahorro += (normal - may) * x.c; if (el) el.innerHTML = `<s>${mon(normal)}</s> ${mon(may)}`; }
    else { total += normal * x.c; if (el) el.textContent = mon(normal) + ' · sin desc.'; }
  });
  $('#mtot').innerHTML = `<span>Total</span><span>${mon(r2(total))}</span>` + (ahorro > 0.004 ? `<small style="color:#16a34a">−${mon(r2(ahorro))}</small>` : '');
}
function mayoOk() {
  const raw = $('#mpct').value.trim(); let pct = null;
  if (raw !== '') { pct = parseFloat(raw.replace(',', '.')); if (!(pct >= 0 && pct <= 100)) return aviso('Poné un % entre 0 y 100', 'mal'); }
  else if (!pctMayGlobal() && !S.cart.some(x => x.pm)) return aviso('Poné el % de descuento', 'mal');
  const cbs = [...document.querySelectorAll('#mlista input[data-mi]')];
  if (!cbs.some(c => c.checked)) return aviso('Tildá al menos un producto', 'mal');
  cbs.forEach(c => { const x = S.cart[+c.dataset.mi]; if (x) { if (c.checked) delete x.sinMay; else x.sinMay = true; } });
  S.may = { on: true, pct }; F.guardarMay(); F.guardarCart();
  abrirCarrito(); barraCarrito(); aviso('💼 Mayorista activado', 'ok');
}
function mayoQuitar() { limpiarMay(); S.cart.forEach(x => { delete x.sinMay; }); F.guardarCart(); abrirCarrito(); barraCarrito(); aviso('Mayorista quitado'); }

/* ---- Combos y promos ---- */
const cbVacio = () => ({ nombre: '', items: [], modo: 'final', tipo: 'monto', valor: '', n: 0, editando: false });
function cbTotales() {
  const c = ui.combo; const lista = r2(c.items.reduce((a, i) => a + i.lista * i.c, 0)); const costo = r2(c.items.reduce((a, i) => a + (i.co || 0) * i.c, 0));
  const v = parseFloat(String(c.valor).replace(',', '.')) || 0; let desc = 0;
  if (c.modo === 'final') desc = v > 0 ? lista - v : 0;
  else if (c.tipo === 'pct') desc = lista * Math.min(Math.max(v, 0), 100) / 100;
  else desc = Math.min(Math.max(v, 0), lista);
  desc = r2(desc);
  return { lista, costo, desc, precio: r2(lista - desc), sinCosto: c.items.some(i => !(i.co > 0)) };
}
function abrirCombo(pre) {
  ui.combo = pre || cbVacio();
  const promos = S.promos || [];
  hoja(tituloHoja(ui.combo.editando ? 'Editar combo' : '🎁 Armar combo') +
    (promos.length ? `<div class="nota" style="margin-bottom:4px">Promos guardadas (tocá para usar):</div><div class="chips" style="flex-wrap:wrap">${promos.map((p, i) =>
      `<span class="chip" style="display:inline-flex;gap:8px;align-items:center"><span data-act="promousar" data-i="${i}">${esc(p.nombre)} · ${mon(p.precio)}</span><b data-act="promoborrar" data-i="${i}" style="opacity:.6">✕</b></span>`).join('')}</div>` : '') +
    `<label class="campo">Nombre (opcional)</label><input id="cbn" class="entrada" maxlength="60" placeholder="Ej: 2 desodorantes" value="${esc(ui.combo.nombre)}">
     <label class="campo">Agregar productos</label>
     <div class="dos"><input id="cbq" type="search" class="entrada" autocomplete="off" placeholder="Buscar producto o código…"><button class="btn sec" style="flex:none" data-act="cbmanualtoggle">✍ A mano</button></div>
     <div id="cbman" hidden style="background:#f9fafb;border-radius:12px;padding:10px;margin-top:6px"><div class="dos"><input id="cbmn" class="entrada" placeholder="Descripción"><input id="cbmp" class="entrada" inputmode="decimal" placeholder="Precio"></div>
       <div class="dos" style="margin-top:6px"><input id="cbmc" class="entrada" inputmode="decimal" placeholder="Costo (opcional)"><button class="btn sec" data-act="cbmanualok">Agregar</button></div></div>
     <div id="cbres"></div>
     <div id="cbn-hint" class="nota"></div>
     <div id="cblista"></div>
     <div class="metodos" style="grid-template-columns:1fr 1fr"><button id="cbmf" data-act="cbmodo" data-v="final" class="${ui.combo.modo === 'final' ? 'on' : ''}">Precio final</button><button id="cbmd" data-act="cbmodo" data-v="desc" class="${ui.combo.modo === 'desc' ? 'on' : ''}">Descuento</button></div>
     <div class="dos"><select id="cbt" class="entrada" ${ui.combo.modo === 'final' ? 'hidden' : ''}><option value="monto" ${ui.combo.tipo === 'monto' ? 'selected' : ''}>$ de descuento</option><option value="pct" ${ui.combo.tipo === 'pct' ? 'selected' : ''}>% de descuento</option></select>
       <input id="cbv" class="entrada" inputmode="decimal" value="${esc(ui.combo.valor)}" placeholder="${ui.combo.modo === 'final' ? 'Monto final. Ej: 12000' : '0'}"></div>
     <div id="cbtot"></div>
     <button class="btn ok ancho" style="margin-top:12px;padding:14px" data-act="cbagregar">${ui.combo.editando ? 'Guardar cambios' : 'Agregar el combo al carrito'}</button>
     <button class="btn sec ancho" style="margin-top:8px" data-act="promoguardar">⭐ Guardar como promo</button>`);
  cbPintar();
}
function cbPintar() {
  const c = ui.combo; const t = cbTotales();
  $('#cblista').innerHTML = c.items.length ? c.items.map((it, k) => `<div class="lin"><div class="nom"><b>${esc(it.n)}${it.libre ? ' <span class="tag">a mano</span>' : ''}</b><small>${mon(it.lista)} c/u</small></div>
      <div class="cant"><button data-act="cbmenos" data-i="${k}">−</button><span>${it.c}</span><button data-act="cbmas" data-i="${k}">+</button></div>
      <b style="min-width:64px;text-align:right">${mon(it.lista * it.c)}</b></div>`).join('') : '<div class="vacio" style="padding:14px">Todavía no agregaste productos al combo</div>';
  const u = c.items.reduce((a, i) => a + i.c, 0);
  $('#cbn-hint').textContent = c.n ? `Promo de ${c.n} productos: llevás ${u}${u === c.n ? ' ✔' : ''}` : '';
  const gan = t.precio - t.costo;
  $('#cbtot').innerHTML = `<div class="kv"><span>Precio de los productos sueltos</span><b>${mon(t.lista)}</b></div>
    <div class="kv"><span>${t.desc < 0 ? 'Recargo' : 'Descuento'}</span><b style="color:#dc2626">${t.desc > 0 ? '−' : t.desc < 0 ? '+' : ''}${mon(Math.abs(t.desc))}</b></div>
    <div class="total-g"><span>Precio del combo</span><span>${mon(t.precio)}</span></div>
    ${c.items.length && t.costo > 0 ? `<div class="nota">Ganás ${mon(gan)} (lo que te costaron: ${mon(t.costo)})${t.sinCosto ? ' · hay productos sin costo' : ''}</div>` : ''}
    ${c.items.length && t.costo > 0 && gan < 0 ? '<div class="aviso-caja" style="color:#b91c1c;background:#fef2f2;border-color:#fecaca">⚠ Con este precio perdés plata en el combo</div>' : ''}`;
}
function cbBuscar() {
  const q = $('#cbq').value; const box = $('#cbres');
  if (!q.trim()) { box.innerHTML = ''; return; }
  const l = filtrarProductos(q, '').filter(p => !p.mv).slice(0, 6);
  box.innerHTML = l.length ? l.map(p => `<button class="fila" data-act="cbadd" data-k="${esc(p.key)}"><div class="nom"><b>${esc(p.n)}</b><small>${esc(p.c)}</small></div><div class="pre">${mon(F.precioOferta(p))}</div></button>`).join('') : '<div class="nota" style="padding:6px">Sin resultados</div>';
}
function cbAgregar(key, variante) {
  const p = S.derivado.P.get(key); if (!p) return;
  if (p.vs && p.vs.length && variante == null) {
    $('#cbres').innerHTML = `<div class="nota">${esc(p.n)}: elegí la variante</div>` + p.vs.map(v => `<button class="fila" data-act="cbaddv" data-k="${esc(key)}" data-v="${esc(v[0])}"><div class="nom"><b>${esc(v[0])}</b></div><span class="stock">${v[1]} u.</span></button>`).join('');
    return;
  }
  const lid = key + (variante ? '|' + variante : ''); const ex = ui.combo.items.find(i => i.lid === lid);
  if (ex) ex.c++; else ui.combo.items.push({ lid, k: key, n: variante ? `${p.n} - ${variante}` : p.n, c: 1, lista: F.precioOferta(p), co: p.co || 0 });
  $('#cbq').value = ''; $('#cbres').innerHTML = ''; cbPintar();
}
function cbLeerCampos() {
  ui.combo.nombre = $('#cbn').value.trim(); ui.combo.valor = $('#cbv').value; const t = $('#cbt'); if (t) ui.combo.tipo = t.value;
}
function cbValidar() {
  cbLeerCampos(); const c = ui.combo; const t = cbTotales();
  if (!c.items.length) { aviso('Agregá al menos un producto al combo', 'mal'); return null; }
  if (c.modo === 'final' && !(parseFloat(String(c.valor).replace(',', '.')) > 0)) { aviso('Poné el monto final del combo', 'mal'); return null; }
  if (t.precio < 0) { aviso('El descuento es mayor al precio', 'mal'); return null; }
  return t;
}
function cbAlCarrito() {
  const t = cbValidar(); if (!t) return; const c = ui.combo;
  const linea = { lid: 'C' + Date.now(), combo: true, n: c.nombre || 'Combo', cit: c.items.map(i => ({ k: i.k, n: i.n, c: i.c, lista: i.lista, libre: !!i.libre, co: i.co || 0 })), pr: t.precio, lista: t.lista, c: 1 };
  if (c.editando && c.pos != null) S.cart.splice(c.pos, 0, linea); else S.cart.push(linea);
  F.guardarCart(); cerrar(); barraCarrito(); aviso('🎁 Combo agregado · ' + mon(t.precio), 'ok');
}
function cbEditar(i) {
  const x = S.cart[i]; if (!x || !x.combo) return;
  S.cart.splice(i, 1); F.guardarCart(); barraCarrito();
  abrirCombo({ nombre: x.n === 'Combo' ? '' : x.n, items: x.cit.map(c => ({ lid: (c.k || 'L' + Math.random()) + '|' + c.n, k: c.k, n: c.n, c: c.c, lista: c.lista, libre: c.libre, co: c.co })), modo: 'final', tipo: 'monto', valor: String(x.pr), n: 0, editando: true, pos: i });
}
function promoGuardar() {
  const t = cbValidar(); if (!t) return; const c = ui.combo;
  const nombre = prompt('Nombre de la promo', c.nombre || ('Combo ' + mon(t.precio))); if (!nombre) return;
  const fijos = confirm('¿Guardar también los productos elegidos?\n\nAceptar = la promo vuelve a cargar estos mismos productos.\nCancelar = solo guarda el nombre, la cantidad y el precio (después elegís los productos).');
  const promo = { nombre: nombre.trim().slice(0, 40), n: c.items.reduce((a, i) => a + i.c, 0), precio: t.precio };
  if (fijos) promo.items = c.items.map(i => ({ lid: i.lid, k: i.k, n: i.n, c: i.c, libre: !!i.libre, co: i.co || 0, lista: i.lista }));
  S.promos = (S.promos || []).filter(p => p.nombre.toLowerCase() !== promo.nombre.toLowerCase()); S.promos.push(promo); F.kvSet('promos', S.promos);
  aviso('⭐ Promo guardada', 'ok'); abrirCombo(Object.assign(cbVacio(), { nombre: c.nombre, items: c.items, modo: c.modo, tipo: c.tipo, valor: c.valor }));
}
function promoUsar(i) {
  const p = (S.promos || [])[i]; if (!p) return;
  const items = (p.items || []).map(it => {
    const pr = it.k && S.derivado.P.get(it.k); return pr ? Object.assign({}, it, { lista: F.precioOferta(pr), co: pr.co || 0 }) : it;
  });
  abrirCombo(Object.assign(cbVacio(), { nombre: p.nombre, items, modo: 'final', valor: String(p.precio), n: p.items ? 0 : p.n }));
}
function promoBorrar(i) {
  const p = (S.promos || [])[i]; if (!p || !confirm('¿Borrar la promo "' + p.nombre + '"?')) return;
  S.promos.splice(i, 1); F.kvSet('promos', S.promos); const c = ui.combo; cbLeerCampos(); abrirCombo(c);
}

/* ---- Cobro ---- */
function lineaOp(x, pr) {
  if (x.libre) return { id: 0, n: x.n, c: x.c, pr, libre: true };
  const o = { n: x.n, c: x.c, pr };
  if (x.k.startsWith('i:')) o.id = +x.k.slice(2); else o.ref = x.k.slice(2);
  return o;
}
function itemsOp() {
  const items = [], combos = [];
  S.cart.forEach(x => {
    if (!x.combo) { items.push(lineaOp(x, precioLinea(x))); return; }
    const f = x.lista > 0 ? x.pr / x.lista : 0; const idx = combos.length; combos.push(x.n === 'Combo' ? '' : x.n);
    x.cit.forEach(c => { const o = lineaOp(c, Math.round(c.lista * f * 10000) / 10000); o.cb = idx; o.pl = c.lista; if (c.co) o.co = c.co; items.push(o); });
  });
  return { items, combos };
}
function totalCobro() {
  const c = ui.cobro; const base = totalCarrito();
  return c.metodo === 'CRÉDITO' ? r2(base * (1 + (parseFloat(c.rec) || 0) / 100)) : base;
}
function abrirCobro() {
  if (!S.cart.length) return;
  ui.cobro = { metodo: 'EFECTIVO', rec: '', recibido: '', cliente: '', nota: '', dividir: false, pagos: [] };
  pintarCobro();
}
function pintarCobro() {
  const c = ui.cobro; const tot = totalCobro();
  let extra = '';
  if (c.dividir) {
    extra = `<label class="campo">Pago dividido (la suma tiene que dar ${mon(tot)})</label>` +
      c.pagos.map((p, i) => `<div class="dos" style="margin-bottom:6px"><select class="entrada" data-pg="m" data-i="${i}">${METODOS().map(m => `<option ${m === p.metodo ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input class="entrada" inputmode="decimal" data-pg="v" data-i="${i}" value="${esc(p.monto)}" placeholder="Monto"></div>`).join('') +
      `<button class="btn sec chico" data-act="pgmas">＋ Otro medio</button>`;
  } else {
    extra = `<div class="metodos">${METODOS().map(m => `<button data-act="metodo" data-v="${esc(m)}" class="${c.metodo === m ? 'on' : ''}"><b>${ICONO[m] || '💰'}</b>${esc(cap(m))}</button>`).join('')}</div>`;
    if (c.metodo === 'CRÉDITO') extra += `<label class="campo">Recargo por tarjeta (%)</label><input id="rec" class="entrada" inputmode="decimal" value="${esc(c.rec)}" placeholder="0">`;
    if (c.metodo === 'EFECTIVO') {
      const rc = parseFloat(String(c.recibido).replace(',', '.'));
      extra += `<label class="campo">Recibido (para calcular el vuelto)</label><input id="recibido" class="entrada" inputmode="decimal" value="${esc(c.recibido)}" placeholder="${tot}">
        <div id="vuelto" class="nota" style="font-size:16px;font-weight:700;margin-top:6px">${rc > 0 ? (rc >= tot ? 'Vuelto: ' + mon(rc - tot) : 'Faltan ' + mon(tot - rc)) : ''}</div>`;
    }
  }
  hoja(tituloHoja('Cobrar') + `<div class="grande" id="totalCobro" style="text-align:center">${mon(tot)}</div>` + extra +
    `<label class="campo">Cliente (opcional)</label><input id="cliente" class="entrada" maxlength="60" placeholder="Mostrador" value="${esc(c.cliente)}">
     <button class="btn ok ancho" style="margin-top:14px;padding:15px;font-size:17px" data-act="confirmarVenta">✔ Confirmar venta</button>
     <div class="dos" style="margin-top:8px"><button class="btn sec" data-act="dividir">${c.dividir ? 'Un solo medio' : 'Dividir pago'}</button><button class="btn sec" data-act="fiar">📒 Fiar</button></div>`);
}
async function confirmarVenta() {
  const c = ui.cobro; const tot = totalCobro(); const cliente = ($('#cliente').value.trim() || 'Mostrador');
  const io = itemsOp();
  const p = { items: io.items, total: tot, metodo: c.metodo, cliente };
  if (io.combos.length) p.combos = io.combos;
  if (hayMayoristaActivo()) p.may = S.may.pct != null ? S.may.pct : 1;
  if (c.dividir) {
    const pagos = c.pagos.map(x => ({ metodo: x.metodo, monto: r2(parseFloat(String(x.monto).replace(',', '.')) || 0) })).filter(x => x.monto > 0);
    const suma = r2(pagos.reduce((a, x) => a + x.monto, 0));
    if (!pagos.length || Math.abs(suma - tot) > 0.5) return aviso(`La suma (${mon(suma)}) no da el total (${mon(tot)})`, 'mal');
    p.pagos = pagos; p.metodo = pagos[0].metodo;
  }
  await F.nuevaOp('venta', p);
  S.cart = []; limpiarMay(); await F.guardarCart(); cerrar(); barraCarrito(); render();
  aviso('✔ Venta guardada · ' + mon(tot), 'ok');
}
function fiarDesdeCarrito() {
  hoja(tituloHoja('Anotar como fiado') + `<div class="grande" style="text-align:center">${mon(totalCarrito())}</div>
    <label class="campo">Nombre del cliente *</label><input id="fcli" class="entrada" maxlength="60" list="clientes" placeholder="Nombre y apellido">
    <datalist id="clientes">${[...new Set(F.fiadosAbiertos().map(f => f.c))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="dos"><div><label class="campo">Seña hoy (opcional)</label><input id="fsena" class="entrada" inputmode="decimal" placeholder="0"></div>
    <div><label class="campo">Medio de la seña</label><select id="fmet" class="entrada">${['Efectivo', 'Transferencia', 'Débito'].map(m => `<option>${m}</option>`).join('')}</select></div></div>
    <button class="btn ancho" style="margin-top:14px" data-act="fiarok">Guardar fiado</button>`);
}
async function fiarOk() {
  const cli = $('#fcli').value.trim(); if (!cli) return aviso('Falta el nombre del cliente', 'mal');
  const tot = totalCarrito(); const sena = r2(parseFloat(String($('#fsena').value).replace(',', '.')) || 0);
  if (sena < 0 || sena > tot) return aviso('La seña no puede ser mayor al total', 'mal');
  await F.nuevaOp('fiado_nuevo', { ref: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), cliente: cli, items: itemsOp().items, total: tot, pagado: sena, metodo: $('#fmet').value });
  S.cart = []; limpiarMay(); await F.guardarCart(); cerrar(); barraCarrito(); render();
  aviso('📒 Fiado anotado: ' + cli, 'ok');
}

/* ===== PRODUCTOS ===== */
function rProductos() {
  if (!S.snap) { $('#main').innerHTML = sinCatalogo(); return; }
  $('#main').innerHTML = `<div class="buscar"><input id="pq" type="search" autocomplete="off" placeholder="Buscar producto…" value="${esc(ui.pq)}">
    <button class="btn" data-act="pnuevo">＋ Nuevo</button></div><div id="plista"></div>`;
  pintarProductos();
}
function pintarProductos() {
  const l = filtrarProductos(ui.pq, '');
  $('#plista').innerHTML = l.length ? l.slice(0, 80).map(p => filaProducto(p, 'pedit')).join('') : '<div class="vacio">No hay productos con ese nombre.</div>';
}
function categorias() { return [...new Set(F.productos().map(p => p.c))].sort(); }
function editarProducto(key) {
  const p = S.derivado.P.get(key); if (!p) return;
  const conVar = p.vs && p.vs.length;
  hoja(tituloHoja('Editar producto') + `<label class="campo">Nombre</label><input id="en" class="entrada" maxlength="120" value="${esc(p.n)}">
    <div class="dos"><div><label class="campo">Precio</label><input id="ep" class="entrada" inputmode="decimal" value="${p.p}"></div>
    <div><label class="campo">${conVar ? 'Stock total (por variantes)' : 'Stock'}</label><input id="es" class="entrada" inputmode="numeric" value="${p.s}" ${conVar ? 'disabled' : ''}></div></div>
    <label class="campo">Categoría</label><input id="ec" class="entrada" list="cats" maxlength="40" value="${esc(p.c)}"><datalist id="cats">${categorias().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <label class="campo">Código de barras</label><div class="dos"><input id="eb" class="entrada" inputmode="numeric" value="${esc(p.cb)}" ${conVar ? 'disabled' : ''}><button class="btn sec" style="flex:none" data-act="scanpara" data-para="eb">📷</button></div>
    ${conVar ? `<p class="nota">Variantes: ${p.vs.map(v => esc(v[0]) + ' (' + v[1] + ')').join(' · ')}.<br>Las variantes se cambian desde la notebook.</p>` : ''}
    <button class="btn ancho" style="margin-top:14px" data-act="peditok" data-k="${esc(key)}">Guardar cambios</button>`);
}
async function guardarEdicion(key) {
  const p = S.derivado.P.get(key); const campos = {};
  const n = $('#en').value.trim(), pr = parseFloat(String($('#ep').value).replace(',', '.')), cat = $('#ec').value.trim() || 'GENERAL', cb = $('#eb').value.trim();
  if (!n) return aviso('El nombre no puede estar vacío', 'mal'); if (!(pr >= 0)) return aviso('Precio no válido', 'mal');
  if (n !== p.n) campos.nombre = n; if (r2(pr) !== r2(p.p)) campos.precio = r2(pr); if (cat !== p.c) campos.categoria = cat; if (cb !== (p.cb || '')) campos.codigo = cb;
  const op = { campos };
  if (key.startsWith('i:')) op.id = +key.slice(2); else op.ref = key.slice(2);
  if (!(p.vs && p.vs.length)) {
    const sNuevo = parseInt($('#es').value, 10); if (isNaN(sNuevo)) return aviso('Stock no válido', 'mal');
    if (sNuevo !== p.s) { op.stock_antes = p.s; op.stock_nuevo = sNuevo; }
  }
  if (!Object.keys(campos).length && op.stock_nuevo == null) return cerrar();
  await F.nuevaOp('prod_edit', op); cerrar(); render(); aviso('✔ Producto actualizado', 'ok');
}
function nuevoProducto() {
  hoja(tituloHoja('Producto nuevo') + `<label class="campo">Nombre *</label><input id="nn" class="entrada" maxlength="120">
    <div class="dos"><div><label class="campo">Precio *</label><input id="np" class="entrada" inputmode="decimal"></div>
    <div><label class="campo">Costo</label><input id="nc" class="entrada" inputmode="decimal" placeholder="0"></div></div>
    <div class="dos"><div><label class="campo">Stock inicial</label><input id="ns" class="entrada" inputmode="numeric" value="1"></div>
    <div><label class="campo">Categoría</label><input id="nk" class="entrada" list="cats" maxlength="40" placeholder="GENERAL"></div></div>
    <datalist id="cats">${categorias().map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <label class="campo">Código de barras (opcional)</label><div class="dos"><input id="nb" class="entrada" inputmode="numeric"><button class="btn sec" style="flex:none" data-act="scanpara" data-para="nb">📷</button></div>
    <label class="campo">Variantes (opcional, si no tiene código)</label>
    <textarea id="nv" class="entrada" rows="3" placeholder="Una por línea. Ej:&#10;Rojo = 5&#10;Azul = 3"></textarea>
    <button class="btn ancho" style="margin-top:14px" data-act="pnuevook">Guardar producto</button>`);
}
async function guardarNuevo() {
  const n = $('#nn').value.trim(), pr = parseFloat(String($('#np').value).replace(',', '.'));
  if (!n) return aviso('Falta el nombre', 'mal'); if (!(pr >= 0)) return aviso('Falta el precio', 'mal');
  const cb = $('#nb').value.trim();
  if (cb && F.productos().some(p => p.cb === cb)) return aviso('Ya existe un producto con ese código', 'mal');
  const variantes = [];
  if (!cb) for (const l of $('#nv').value.split('\n')) {
    const m = l.trim().match(/^(.+?)\s*(?:=|x|:)\s*(\d+)$/i) || (l.trim() ? [0, l.trim(), '0'] : null);
    if (m) variantes.push({ n: m[1].trim(), s: parseInt(m[2], 10) || 0 });
  }
  await F.nuevaOp('prod_nuevo', { ref: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), nombre: n, precio: r2(pr),
    costo: parseFloat(String($('#nc').value).replace(',', '.')) || 0, stock: parseInt($('#ns').value, 10) || 0,
    categoria: ($('#nk').value.trim() || 'GENERAL').toUpperCase(), codigo: cb, variantes });
  cerrar(); render(); aviso('✔ Producto creado', 'ok');
}

/* ===== VENTAS ===== */
function resumenItems(p) {
  const partes = (p.combos || []).map(n => '🎁 ' + (n || 'Combo'));
  (p.items || []).filter(i => i.cb == null).forEach(i => partes.push(`${i.c}× ${i.n}`));
  return partes.join(', ');
}
function rVentas() {
  if (!S.snap) { $('#main').innerHTML = sinCatalogo(); return; }
  const D = S.derivado; const lim = F.fechaHace(3);
  const l = [...D.ventas.values()].filter(o => o.d === S.cfg.eq && o.ts.slice(0, 10) >= lim).sort((a, b) => a.ts < b.ts ? 1 : -1);
  let dia = '';
  $('#main').innerHTML = `<div class="nota" style="margin:2px 4px 6px">Ventas hechas con este celular (${esc(S.cfg.eq)}), últimos 3 días.</div>` + (l.length ? l.map(o => {
    let h = ''; const d = o.ts.slice(0, 10); if (d !== dia) { dia = d; h = `<div class="nota" style="margin:12px 4px 4px;font-weight:700">${d === hoyStr() ? 'Hoy' : d}</div>`; }
    const anu = D.anuladas.has(o.u); const fi = o.k === 'fiado_nuevo';
    return h + `<button class="fila" data-act="vdet" data-u="${esc(o.u)}" style="${anu ? 'opacity:.55' : ''}">
      <div class="nom"><b style="${anu ? 'text-decoration:line-through' : ''}">${esc(resumenItems(o.p) || 'Venta')}</b>
      <small>${o.ts.slice(11, 16)} · ${esc(o.d)} · ${fi ? '📒 Fiado ' + esc(o.p.cliente) : esc(cap(o.p.metodo || 'EFECTIVO'))}</small></div>
      <div style="text-align:right"><div class="pre">${mon(o.p.total)}</div>${anu ? '<span class="tag mal">Anulada</span>' : o.seq == null ? '<span class="tag pend">Por subir</span>' : '<span class="tag ok">Enviada</span>'}</div></button>`;
  }).join('') : '<div class="vacio">Todavía no hay ventas en los últimos días.</div>');
  $('#barraCarrito').hidden = true;
}
function detalleVenta(u) {
  const o = S.ops.get(u); if (!o) return; const anu = S.derivado.anuladas.has(u); const fi = o.k === 'fiado_nuevo';
  hoja(tituloHoja(fi ? 'Fiado' : 'Venta') + `<p class="nota">${esc(o.ts)} · ${esc(o.d)}</p>` +
    (o.p.combos || []).map((n, k) => { const its = (o.p.items || []).filter(i => i.cb === k); return `<div class="kv"><span>🎁 <b>${esc(n || 'Combo')}</b><br><small class="nota">${its.map(i => i.c + '× ' + esc(i.n)).join(' · ')}</small></span><b>${mon(its.reduce((s, i) => s + i.pr * i.c, 0))}</b></div>`; }).join('') +
    (o.p.items || []).filter(i => i.cb == null).map(i => `<div class="kv"><span>${i.c}× ${esc(i.n)}</span><b>${mon(i.pr * i.c)}</b></div>`).join('') +
    `<div class="total-g"><span>Total</span><span>${mon(o.p.total)}</span></div>
    ${o.p.may ? '<p class="nota">💼 Precio mayorista</p>' : ''}
    <p class="nota">${fi ? 'Cliente: ' + esc(o.p.cliente) + (o.p.pagado ? ' · Seña: ' + mon(o.p.pagado) : '') : 'Pago: ' + (o.p.pagos ? o.p.pagos.map(x => esc(cap(x.metodo)) + ' ' + mon(x.monto)).join(' + ') : esc(cap(o.p.metodo || '')))}
    ${o.seq == null ? '<br>⏳ Todavía no se subió a la nube.' : '<br>✔ Ya está en la nube.'}</p>` +
    (anu ? '<span class="tag mal">Anulada</span>' : fi ? '<p class="nota">Los fiados se anulan desde la notebook.</p>' :
      `<button class="btn mal ancho" data-act="anular" data-u="${esc(u)}">Anular esta venta</button>`));
}
function pedirAnulacion(u) {
  hoja(tituloHoja('Anular venta') + `<p>Se devuelve el stock y la venta queda anulada en la notebook.</p><label class="campo">Motivo</label>
    <input id="motivo" class="entrada" maxlength="100" value="Error de carga"><button class="btn mal ancho" style="margin-top:14px" data-act="anularok" data-u="${esc(u)}">Sí, anular</button>`);
}
async function anularOk(u) {
  if (S.derivado.anuladas.has(u)) return cerrar();
  await F.nuevaOp('venta_anular', { venta_u: u, motivo: $('#motivo').value.trim() || 'Anulada desde el celular' });
  cerrar(); render(); aviso('Venta anulada', 'ok');
}

/* ===== FIADOS ===== */
function rFiados() {
  if (!S.snap) { $('#main').innerHTML = sinCatalogo(); return; }
  $('#main').innerHTML = `<div class="buscar"><input id="fq" type="search" autocomplete="off" placeholder="Buscar cliente…" value="${esc(ui.fq)}"></div><div id="flista"></div>`;
  pintarFiados(); $('#barraCarrito').hidden = true;
}
function pintarFiados() {
  const ws = norm(ui.fq); const l = F.fiadosAbiertos().filter(f => norm(f.c).includes(ws)).sort((a, b) => norm(a.c) < norm(b.c) ? -1 : 1);
  $('#flista').innerHTML = l.length ? l.map(f => `<button class="fila" data-act="fdet" data-k="${esc(f.key)}"><div class="nom"><b>${esc(f.c)}</b><small>Total ${mon(f.t)} · pagó ${mon(f.p)}</small></div>
    <div style="text-align:right"><div class="pre">${mon(f.t - f.p)}</div><small class="nota">debe</small></div></button>`).join('') : '<div class="vacio">No hay fiados pendientes.</div>';
}
function detalleFiado(key) {
  const f = S.derivado.Fi.get(key); if (!f) return; const saldo = r2(f.t - f.p);
  hoja(tituloHoja(f.c) + `<div class="kv"><span>Total</span><b>${mon(f.t)}</b></div><div class="kv"><span>Pagó</span><b>${mon(f.p)}</b></div><div class="kv"><span>Debe</span><b>${mon(saldo)}</b></div>
    <label class="campo">Cobrar ahora</label><input id="fm" class="entrada" inputmode="decimal" value="${saldo}">
    <label class="campo">Medio</label><select id="fmed" class="entrada">${['Efectivo', 'Transferencia', 'Débito'].map(m => `<option>${m}</option>`).join('')}</select>
    <button class="btn ok ancho" style="margin-top:14px" data-act="fpago" data-k="${esc(key)}">Registrar cobro</button>`);
}
async function registrarCobro(key) {
  const f = S.derivado.Fi.get(key); const saldo = r2(f.t - f.p); const m = r2(parseFloat(String($('#fm').value).replace(',', '.')) || 0);
  if (!(m > 0) || m > saldo + 0.01) return aviso('El monto tiene que estar entre 0 y ' + mon(saldo), 'mal');
  const p = { monto: m, metodo: $('#fmed').value }; if (key.startsWith('i:')) p.id = +key.slice(2); else p.ref = key.slice(2);
  await F.nuevaOp('fiado_pago', p); cerrar(); render(); aviso('✔ Cobro registrado', 'ok');
}

/* ===== CAJA ===== */
function periodoCaja() {
  const eq = S.cfg.eq; const desde = S.ultCierre || ''; const D = S.derivado;
  const porMetodo = {}; let nVentas = 0, efFiado = 0, otrosFiado = 0;
  const suma = (m, v) => { porMetodo[m] = r2((porMetodo[m] || 0) + v); };
  for (const o of S.ops.values()) {
    if (o.d !== eq || o.ts <= desde) continue;
    if (o.k === 'venta' && !D.anuladas.has(o.u)) {
      nVentas++;
      if (o.p.pagos) o.p.pagos.forEach(x => suma(x.metodo, x.monto)); else suma(o.p.metodo || 'EFECTIVO', o.p.total);
    } else if (o.k === 'fiado_nuevo' && o.p.pagado > 0) {
      const m = String(o.p.metodo || 'Efectivo').toUpperCase(); suma(m, o.p.pagado); if (m === 'EFECTIVO') efFiado += o.p.pagado; else otrosFiado += o.p.pagado;
    } else if (o.k === 'fiado_pago') {
      const m = String(o.p.metodo || 'Efectivo').toUpperCase(); suma(m, o.p.monto); if (m === 'EFECTIVO') efFiado += o.p.monto; else otrosFiado += o.p.monto;
    }
  }
  return { porMetodo, nVentas, total: r2(Object.values(porMetodo).reduce((a, b) => a + b, 0)), desde };
}
function rCaja() {
  if (!S.snap) { $('#main').innerHTML = sinCatalogo(); return; }
  const c = periodoCaja(); const fondo = parseFloat(String(S.fondo).replace(',', '.')) || 0;
  const esperado = r2(fondo + (c.porMetodo['EFECTIVO'] || 0));
  const cierres = [...S.ops.values()].filter(o => o.k === 'caja_cierre' && o.d === S.cfg.eq).sort((a, b) => a.ts < b.ts ? 1 : -1).slice(0, 5);
  $('#main').innerHTML = `<div class="aviso-caja">Estas ventas se suman <b>mezcladas con la caja de la notebook</b> (en el turno que estaba abierto a esa hora). Acá solo cerrás el control de <b>este celular</b>.</div>
    <div class="tarjeta"><h3>Desde ${c.desde ? c.desde.slice(0, 16) : 'el principio'} · ${esc(S.cfg.eq)}</h3>
      <div class="kv"><span>Ventas</span><b>${c.nVentas}</b></div>
      ${Object.entries(c.porMetodo).map(([m, v]) => `<div class="kv"><span>${ICONO[m] || '💰'} ${esc(cap(m))}</span><b>${mon(v)}</b></div>`).join('') || '<div class="nota">Sin movimientos todavía.</div>'}
      <div class="kv"><span><b>Total cobrado</b></span><b class="grande" style="font-size:20px">${mon(c.total)}</b></div></div>
    <div class="tarjeta"><h3>Cierre de caja</h3>
      <label class="campo">Efectivo con el que empezaste (cambio inicial)</label><input id="cfondo" class="entrada" inputmode="decimal" value="${esc(S.fondo)}" placeholder="0">
      <div class="kv" style="margin-top:8px"><span>Efectivo que debería haber</span><b id="cesp">${mon(esperado)}</b></div>
      <label class="campo">Efectivo que contaste</label><input id="ccont" class="entrada" inputmode="decimal" placeholder="${esperado}">
      <div id="cdif" class="nota" style="font-weight:700;font-size:15px;margin:6px 0"></div>
      <label class="campo">Nota (opcional)</label><input id="cnota" class="entrada" maxlength="120" placeholder="Ej: faltó cambio">
      <button class="btn ancho" style="margin-top:12px" data-act="cerrarcaja">Cerrar caja de la feria</button></div>
    ${cierres.length ? `<div class="tarjeta"><h3>Cierres anteriores</h3>${cierres.map(o => `<div class="kv"><span>${o.ts.slice(0, 16)}</span><b>${mon(o.p.contado)} <small class="nota">(dif. ${mon(o.p.contado - o.p.esperado)})</small></b></div>`).join('')}</div>` : ''}`;
  $('#barraCarrito').hidden = true;
}
function actualizarCaja() {
  const c = periodoCaja(); const fondo = parseFloat(String($('#cfondo').value).replace(',', '.')) || 0;
  const esperado = r2(fondo + (c.porMetodo['EFECTIVO'] || 0)); $('#cesp').textContent = mon(esperado);
  const v = parseFloat(String($('#ccont').value).replace(',', '.'));
  $('#cdif').textContent = isNaN(v) ? '' : (Math.abs(v - esperado) < 0.01 ? '✔ Caja justa' : v > esperado ? 'Sobran ' + mon(v - esperado) : 'Faltan ' + mon(esperado - v));
  F.guardarFondo($('#cfondo').value);
}
async function cerrarCaja() {
  const c = periodoCaja(); const fondo = parseFloat(String($('#cfondo').value).replace(',', '.')) || 0;
  const esperado = r2(fondo + (c.porMetodo['EFECTIVO'] || 0)); const v = parseFloat(String($('#ccont').value).replace(',', '.'));
  if (isNaN(v)) return aviso('Poné cuánto efectivo contaste', 'mal');
  if (!confirm('¿Cerrar la caja de este celular?\nDebería haber ' + mon(esperado) + ' y contaste ' + mon(v) + '.')) return;
  const op = await F.nuevaOp('caja_cierre', { inicial: fondo, esperado, contado: r2(v), ventas: c.porMetodo, desde: c.desde, nota: $('#cnota').value.trim() });
  S.ultCierre = op.ts; await F.kvSet('ultCierre', op.ts); await F.guardarFondo('');
  render(); aviso('✔ Caja cerrada', 'ok');
}

/* ===== AJUSTES ===== */
function ajustes() {
  const n = F.pendientes().length; const sn = S.snap;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  hoja(tituloHoja('Ajustes') + `<div class="tarjeta" style="padding:6px 14px">
    <div class="kv"><span>Celular</span><b>${esc(S.cfg ? S.cfg.eq : '—')}</b></div>
    <div class="kv"><span>Por subir</span><b>${n}</b></div>
    <div class="kv"><span>Última sincronización</span><b>${esc(S.sync.ultima ? S.sync.ultima.slice(5, 16) : 'nunca')}</b></div>
    <div class="kv"><span>Catálogo de la notebook</span><b>${esc(sn ? sn.ts.slice(5, 16) : 'sin catálogo')}</b></div>
    <div class="kv"><span>Versión</span><b>${VERSION}</b></div></div>
    ${S.sync.error ? `<div class="aviso-caja">${esc(S.sync.error)}</div>` : ''}
    <button class="btn ancho" data-act="sync2">🔄 Sincronizar ahora</button>
    ${instalador ? '<button class="btn sec ancho" style="margin-top:8px" data-act="instalar">📲 Instalar como app</button>' : ''}
    <p class="nota">Instalar: en Chrome, Edge y Samsung Internet, menú ⋮ → "Instalar app" o "Agregar a pantalla principal". En Firefox, menú ⋮ → "Instalar". En iPhone (Safari), Compartir → "Agregar a inicio".${ios ? ' <b>Estás en iPhone: usá esa opción.</b>' : ''}</p>
    <label class="campo">Nombre de este celular</label><div class="dos"><input id="aeq" class="entrada" maxlength="20" value="${esc(S.cfg ? S.cfg.eq : '')}"><button class="btn sec" style="flex:none" data-act="aeqok">Guardar</button></div>
    <button class="btn sec ancho" style="margin-top:14px" data-act="reconectar">Conectar con otra notebook</button>`);
}

/* ───────────── escáner de códigos ─────────────
   Chrome/Edge/Samsung usan el detector del propio navegador (rápido). Firefox, Safari y otros
   no lo tienen: ahí se carga una librería (zxing.min.js, viene guardada en la app). */
let _stream = null, _scanOn = false, _zx = null;
function cargarZXing() {
  if (window.ZXing) return Promise.resolve();
  if (_zx) return _zx;
  _zx = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'zxing.min.js'; s.onload = res; s.onerror = () => { _zx = null; rej(new Error('zxing')); }; document.head.appendChild(s); });
  return _zx;
}
async function escanear(alLeer) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return aviso('Este navegador no deja usar la cámara. Usá el buscador.', 'mal');
  const nativo = 'BarcodeDetector' in window; let det = null;
  if (nativo) { try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] }); } catch (e) { det = null; } }
  if (!det) { try { await cargarZXing(); } catch (e) { return aviso('No se pudo cargar el escáner. Usá el buscador.', 'mal'); } }
  const d = document.createElement('div'); d.id = 'escaner'; d.innerHTML = '<video playsinline muted autoplay></video><button type="button">Cerrar</button><p>Apuntá al código de barras</p>';
  document.body.appendChild(d); const v = d.querySelector('video'); _scanOn = true; let reader = null;
  const fin = () => { _scanOn = false; try { if (reader) reader.reset(); } catch (e) { /* nada */ } if (_stream) _stream.getTracks().forEach(t => t.stop()); _stream = null; d.remove(); };
  d.querySelector('button').onclick = fin;
  if (det) {
    try { _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { fin(); return aviso('No se pudo usar la cámara (¿diste el permiso?)', 'mal'); }
    v.srcObject = _stream; await v.play().catch(() => { });
    (async function loop() {
      while (_scanOn) {
        try { const r = await det.detect(v); if (r.length) { const val = r[0].rawValue; fin(); alLeer(val); return; } } catch (e) { /* sigue */ }
        await new Promise(r => setTimeout(r, 220));
      }
    })();
  } else {
    try {
      const Z = window.ZXing; const hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.QR_CODE]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      reader = new Z.BrowserMultiFormatReader(hints, 250);
      await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, v, (res) => { if (res && _scanOn) { const val = res.getText(); fin(); alLeer(val); } });
    } catch (e) { fin(); aviso('No se pudo usar la cámara (¿diste el permiso?)', 'mal'); }
  }
}
function codigoLeido(cod) {
  const p = F.productos().find(x => x.cb === cod);
  if (p) agregarAlCarrito(p.key); else { ui.q = cod; render(); aviso('Código sin producto: ' + cod, 'mal'); }
}

/* ───────────── eventos ───────────── */
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-act],[data-tab]'); if (!t) { if (ev.target.id === 'velo') cerrar(); return; }
  if (t.dataset.tab) { ui.tab = t.dataset.tab; cerrar(); render(); $('#main').scrollTop = 0; return; }
  const a = t.dataset.act, d = t.dataset;
  // acciones que guardan algo: si ya hay una en curso (doble toque) se ignora la segunda
  const ESCRIBE = ['confirmarVenta', 'fiarok', 'pnuevook', 'peditok', 'anularok', 'fpago', 'cerrarcaja', 'conectar'];
  if (ESCRIBE.includes(a)) { if (window._ocupado) return; window._ocupado = true; }
  try { await accion(a, d); } finally { if (ESCRIBE.includes(a)) window._ocupado = false; }
});
async function accion(a, d) {
  switch (a) {
    case 'cerrar': cerrar(); break;
    case 'sync': case 'sync2': { aviso('Sincronizando…'); const ok = await F.sincronizar(true); render(); if (a === 'sync2') ajustes(); aviso(ok ? '✔ Todo al día' : 'No se pudo sincronizar: ' + (S.sync.error || 'sin conexión'), ok ? 'ok' : 'mal'); break; }
    case 'ajustes': ajustes(); break;
    case 'cat': ui.cat = d.v; rVender(); break;
    case 'add': agregarAlCarrito(d.k); break;
    case 'info': infoProducto(d.k); break;
    case 'addinfo': cerrar(); agregarAlCarrito(d.k); break;
    case 'addv': cerrar(); agregarAlCarrito(d.k, d.v); break;
    case 'carrito': abrirCarrito(); break;
    case 'mas': S.cart[+d.i].c++; F.guardarCart(); abrirCarrito(); barraCarrito(); break;
    case 'menos': { const x = S.cart[+d.i]; if (--x.c <= 0) S.cart.splice(+d.i, 1); F.guardarCart(); abrirCarrito(); barraCarrito(); break; }
    case 'precio': cambiarPrecio(+d.i); break;
    case 'vaciar': if (confirm('¿Vaciar el carrito?')) { S.cart = []; limpiarMay(); F.guardarCart(); cerrar(); barraCarrito(); } break;
    case 'quitar': S.cart.splice(+d.i, 1); if (!S.cart.length) limpiarMay(); F.guardarCart(); abrirCarrito(); barraCarrito(); break;
    case 'mayo': abrirMayo(); break;
    case 'mayook': mayoOk(); break;
    case 'mayoquitar': mayoQuitar(); break;
    case 'combo': abrirCombo(); break;
    case 'cbedit': cbEditar(+d.i); break;
    case 'cbadd': cbAgregar(d.k); break;
    case 'cbaddv': cbAgregar(d.k, d.v); break;
    case 'cbmas': ui.combo.items[+d.i].c++; cbPintar(); break;
    case 'cbmenos': { const it = ui.combo.items[+d.i]; if (--it.c <= 0) ui.combo.items.splice(+d.i, 1); cbPintar(); break; }
    case 'cbmodo': cbLeerCampos(); ui.combo.modo = d.v; ui.combo.valor = ''; abrirCombo(ui.combo); break;
    case 'cbmanualtoggle': $('#cbman').hidden = !$('#cbman').hidden; break;
    case 'cbmanualok': {
      const n = $('#cbmn').value.trim() || 'Producto a mano'; const p = parseFloat(String($('#cbmp').value).replace(',', '.')); if (!(p > 0)) return aviso('Poné el precio', 'mal');
      ui.combo.items.push({ lid: 'L' + Date.now(), k: null, n, c: 1, lista: r2(p), co: parseFloat(String($('#cbmc').value).replace(',', '.')) || 0, libre: true });
      $('#cbmn').value = $('#cbmp').value = $('#cbmc').value = ''; $('#cbman').hidden = true; cbPintar(); break; }
    case 'cbagregar': cbAlCarrito(); break;
    case 'promoguardar': promoGuardar(); break;
    case 'promousar': promoUsar(+d.i); break;
    case 'promoborrar': promoBorrar(+d.i); break;
    case 'manual': productoManual(); break;
    case 'manualok': manualOk(); break;
    case 'scan': escanear(codigoLeido); break;
    case 'scanpara': { const id = d.para; escanear(v => { const e = document.getElementById(id); if (e) e.value = v; }); break; }
    case 'cobrar': abrirCobro(); break;
    case 'metodo': ui.cobro.metodo = d.v; ui.cobro.cliente = $('#cliente') ? $('#cliente').value : ''; pintarCobro(); break;
    case 'dividir': ui.cobro.cliente = $('#cliente').value; ui.cobro.dividir = !ui.cobro.dividir;
      if (ui.cobro.dividir) ui.cobro.pagos = [{ metodo: 'EFECTIVO', monto: '' }, { metodo: 'TRANSFERENCIA', monto: '' }]; pintarCobro(); break;
    case 'pgmas': ui.cobro.pagos.push({ metodo: 'EFECTIVO', monto: '' }); ui.cobro.cliente = $('#cliente').value; pintarCobro(); break;
    case 'confirmarVenta': await confirmarVenta(); break;
    case 'fiar': fiarDesdeCarrito(); break;
    case 'fiarok': await fiarOk(); break;
    case 'pnuevo': nuevoProducto(); break;
    case 'pnuevook': await guardarNuevo(); break;
    case 'pedit': editarProducto(d.k); break;
    case 'peditok': await guardarEdicion(d.k); break;
    case 'vdet': detalleVenta(d.u); break;
    case 'anular': pedirAnulacion(d.u); break;
    case 'anularok': await anularOk(d.u); break;
    case 'fdet': detalleFiado(d.k); break;
    case 'fpago': await registrarCobro(d.k); break;
    case 'cerrarcaja': await cerrarCaja(); break;
    case 'conectar': await conectar(); break;
    case 'instalar': if (instalador) { instalador.prompt(); await instalador.userChoice; instalador = null; cerrar(); } break;
    case 'aeqok': { const v = $('#aeq').value.trim().slice(0, 20); if (v) { S.cfg.eq = v; await F.guardarCfg(S.cfg); aviso('Guardado', 'ok'); } break; }
    case 'reconectar':
      if (F.pendientes().length) return aviso('Primero subí lo pendiente (hay ' + F.pendientes().length + ' operaciones sin enviar).', 'mal');
      if (confirm('¿Conectar con otra notebook? Se borran los datos de este celular.')) { await indexedDB.deleteDatabase('fegest-movil'); location.reload(); } break;
  }
}
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q') { ui.q = t.value; pintarLista(); }
  else if (t.id === 'pq') { ui.pq = t.value; pintarProductos(); }
  else if (t.id === 'fq') { ui.fq = t.value; pintarFiados(); }
  else if (t.id === 'rec') { ui.cobro.rec = t.value; $('#totalCobro').textContent = mon(totalCobro()); }
  else if (t.id === 'recibido') { ui.cobro.recibido = t.value; const tot = totalCobro(), rc = parseFloat(String(t.value).replace(',', '.')); $('#vuelto').textContent = rc > 0 ? (rc >= tot ? 'Vuelto: ' + mon(rc - tot) : 'Faltan ' + mon(tot - rc)) : ''; }
  else if (t.id === 'cfondo' || t.id === 'ccont') actualizarCaja();
  else if (t.id === 'mpct') mayoPreview();
  else if (t.id === 'cbq') cbBuscar();
  else if (t.id === 'cbv' || t.id === 'cbn') { cbLeerCampos(); cbPintar(); }
  else if (t.dataset && t.dataset.pg === 'v') ui.cobro.pagos[+t.dataset.i].monto = t.value;
});
document.addEventListener('change', ev => { const t = ev.target; if (t.id === 'cbt') { cbLeerCampos(); cbPintar(); } else if (t.dataset && t.dataset.mi !== undefined) mayoPreview(); if (t.dataset && t.dataset.pg === 'm') ui.cobro.pagos[+t.dataset.i].metodo = t.value; });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.id === 'q') {
    const v = ev.target.value.trim(); const p = F.productos().find(x => x.cb && x.cb === v);
    if (p) { ev.preventDefault(); ui.q = ''; ev.target.value = ''; agregarAlCarrito(p.key); pintarLista(); }
  }
});
window.addEventListener('online', () => F.sincronizar());
window.addEventListener('offline', () => { S.sync.estado = 'off'; F.pintarEstado(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) F.sincronizar(); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalador = e; });
setInterval(() => { if (!document.hidden && S.cfg) F.sincronizar(); }, 30000);

/* ───────────── arranque ───────────── */
(async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  await F.cargar();
  const l = leerEnlace(location.hash);
  if (l) {
    ui.enlacePre = location.href.slice(location.href.indexOf('#'));
    history.replaceState(null, '', location.pathname + location.search);
    if (S.cfg && S.cfg.u === l.u && S.cfg.t === l.t) ui.enlacePre = '';
    else S.cfg = null;            // enlace nuevo: muestra la pantalla de conexión (pide el nombre del celular)
  }
  render();
  if (S.cfg) F.sincronizar();
})();
