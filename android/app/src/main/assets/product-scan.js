/*
 * Riconoscimento del prodotto con due foto: la confezione (fronte) e
 * l'etichetta (retro). Le foto vengono lette sul telefono: codice a barre,
 * testo con il motore OCR incluso nell'app, poi confronto con la dispensa.
 * Niente rete, niente cataloghi online, nessuna immagine salvata.
 *
 * Dipende da: Grocy (modello), GrocyBarcode, GrocyOcr, GrocyRecognize e dal
 * ponte GrocyUI esposto da app.js (modale, form prodotto, aggiornamenti).
 */
(function (root) {
  'use strict';

  const doc = root.document;
  if (!doc) return;

  const MAX_SIDE = 1600;
  let shots = { pack: null, label: null };
  let waiting = '';     // tipo di foto attesa dal telefono
  let pending = null;   // dati imparati, da allegare al prodotto salvato
  let busy = false;

  const ui = () => root.GrocyUI;
  const esc = value => ui().esc(value);
  const icon = name => ui().icon(name);

  function toast(message) { ui().toast(message); }

  // ------------------------------------------------------------------ foto

  function base64Gray(text) {
    const raw = root.atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // Miniatura della foto in scala di grigi: serve solo a mostrare che è stata
  // presa. Non viene conservata né salvata.
  function preview(gray, width, height) {
    const max = 240;
    const scale = Math.min(1, max / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(height - 1, Math.round(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(width - 1, Math.round(x / scale));
        const value = gray[sy * width + sx];
        const at = (y * w + x) * 4;
        image.data[at] = image.data[at + 1] = image.data[at + 2] = value;
        image.data[at + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    try { return canvas.toDataURL('image/jpeg', 0.7); } catch (e) { return ''; }
  }

  function store(kind, gray, width, height) {
    shots[kind] = { gray, width, height, preview: preview(gray, width, height) };
    render();
  }

  function fromFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { toast('Scegli una foto.'); return; }
    if (file.size > 15000000) { toast('Foto troppo grande: usa uno scatto più leggero.'); return; }
    const kind = waiting || 'pack';
    const reader = new FileReader();
    reader.onerror = () => toast('Impossibile leggere la foto.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => toast('Foto non leggibile: riprova.');
      img.onload = () => {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) { toast('Foto non leggibile: riprova.'); return; }
        const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
        const canvas = doc.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const gray = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
          gray[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
        }
        store(kind, gray, w, h);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function acquire(kind, source) {
    waiting = kind;
    if (root.Android && typeof root.Android.capturePhoto === 'function') {
      try {
        if (source === 'camera') root.Android.capturePhoto(kind);
        else root.Android.pickPhoto(kind);
        return;
      } catch (e) {
        toast('Fotocamera non disponibile: scegli una foto dalla galleria.');
      }
    }
    const input = doc.getElementById('scan2-file');
    if (!input) return;
    input.value = '';
    input.dataset.kind = kind;
    if (source === 'camera') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  // Callback native (Android): foto scattata o scelta dalla galleria.
  root.onNativePhoto = payload => {
    if (!payload) { toast('Foto annullata.'); return; }
    try {
      store(payload.kind || waiting || 'pack', base64Gray(payload.data), payload.width, payload.height);
    } catch (e) {
      toast('Foto non leggibile: riprova.');
    }
  };
  root.onNativePhotoError = message => {
    toast(message || 'Foto non disponibile.');
  };

  // ------------------------------------------------------------- interfaccia

  const SLOTS = [
    { kind: 'pack', t: 'Confezione', d: 'Il fronte, dove si legge il nome del prodotto' },
    { kind: 'label', t: 'Etichetta', d: 'Il retro: ingredienti, scadenza e codice a barre' }
  ];

  function slotCard(slot) {
    const shot = shots[slot.kind];
    return `<div class="shot ${shot ? 'ready' : ''}">
      <div class="shot-head"><span class="shot-num">${slot.kind === 'pack' ? 1 : 2}</span>
        <div><strong>${slot.t}</strong><small>${slot.d}</small></div>
        ${shot ? `<span class="badge">${icon('check')} pronta</span>` : ''}</div>
      ${shot && shot.preview ? `<img class="shot-preview" src="${shot.preview}" alt="Anteprima foto ${slot.t.toLowerCase()}">` : ''}
      <div class="shot-actions">
        <button type="button" class="btn small secondary" data-action="shot-camera" data-kind="${slot.kind}">${icon('camera')} Scatta</button>
        <button type="button" class="btn small secondary" data-action="shot-gallery" data-kind="${slot.kind}">Galleria</button>
        ${shot ? `<button type="button" class="btn small text" data-action="shot-clear" data-kind="${slot.kind}">Togli</button>` : ''}
      </div>
    </div>`;
  }

  function render() {
    const ready = !!(shots.pack || shots.label);
    ui().modal('Riconosci con due foto',
      `<div class="scan-intro"><span class="scan-illustration">${icon('camera')}</span>
        <h3>Due foto, un prodotto</h3>
        <p>Fotografa la confezione e l’etichetta: l’app legge nome, scadenza, quantità e codice a barre e confronta tutto con la tua dispensa. Le foto restano nella memoria del telefono per pochi istanti e non vengono salvate.</p></div>
      <div class="shot-slots">${SLOTS.map(slotCard).join('')}</div>
      <p class="form-hint">${root.Android && typeof root.Android.capturePhoto === 'function'
        ? 'Si apre la fotocamera del telefono, oppure scegli una foto già scattata dalla galleria.'
        : 'Nell’app Android si apre la fotocamera o la galleria. Qui puoi scegliere un file immagine.'}</p>
      <p id="form-error" class="form-error" role="alert"></p>
      <div class="button-row">
        <button type="button" class="btn secondary" data-action="close">Chiudi</button>
        <button type="button" class="btn" data-action="s2-run" ${ready ? '' : 'disabled'}>${icon('search')} Riconosci il prodotto</button>
      </div>`);
  }

  // --------------------------------------------------------------- analisi

  function steps(hasPack, hasLabel) {
    const list = [{ key: 'code', label: 'Codice a barre' }, { key: 'engine', label: 'Preparazione del lettore di testo' }];
    if (hasPack) list.push({ key: 'pack', label: 'Lettura del testo — confezione' });
    if (hasLabel) list.push({ key: 'label', label: 'Lettura del testo — etichetta' });
    list.push({ key: 'match', label: 'Confronto con la dispensa' });
    return list;
  }

  function progressView(list) {
    ui().modal('Riconoscimento in corso',
      `<div class="scan-intro"><span class="scan-illustration">${icon('camera')}</span>
        <h3>Sto leggendo le foto</h3>
        <p>Tutto avviene sul telefono: nessuna immagine viene inviata da nessuna parte.</p></div>
      <ol class="s2-steps" id="s2-steps">${list.map(step => `<li class="s2-step" data-step="${step.key}"><span class="s2-dot"></span>${step.label}</li>`).join('')}</ol>
      <div class="s2-track"><div class="s2-fill" id="s2-fill" style="width:4%"></div></div>
      <p class="form-hint" id="s2-note">La prima lettura è la più lenta: il motore di riconoscimento viene caricato in memoria.</p>`);
  }

  function markStep(key, state) {
    const item = doc.querySelector(`#s2-steps [data-step="${key}"]`);
    if (!item) return;
    item.classList.remove('active', 'done', 'failed');
    item.classList.add(state);
    const list = Array.from(doc.querySelectorAll('#s2-steps .s2-step'));
    const done = list.filter(el => el.classList.contains('done')).length;
    const fill = doc.getElementById('s2-fill');
    if (fill) fill.style.width = Math.max(4, Math.round((done / list.length) * 100)) + '%';
  }

  function note(text) {
    const el = doc.getElementById('s2-note');
    if (el) el.textContent = text;
  }

  async function analyse(shot, role) {
    const code = (() => {
      try { return root.GrocyBarcode.decodeGray(shot.gray, shot.width, shot.height, { minVotes: 3 }) || ''; }
      catch (e) { return ''; }
    })();
    let parsed = null, ocrError = '';
    try {
      const read = await root.GrocyOcr.read(shot.gray, shot.width, shot.height, { psm: 3 });
      parsed = root.GrocyRecognize.parse(read.text, { role, checksum: root.GrocyBarcode.checksum });
      parsed.ms = read.ms;
    } catch (error) {
      ocrError = error && error.message ? error.message : String(error);
      parsed = root.GrocyRecognize.parse('', { role, checksum: root.GrocyBarcode.checksum });
    }
    if (code) parsed.barcode = code;
    parsed.fromImage = code;
    parsed.ocrError = ocrError;
    return parsed;
  }

  async function run() {
    if (busy) return;
    const pack = shots.pack, label = shots.label;
    if (!pack && !label) { toast('Serve almeno una foto.'); return; }
    busy = true;
    const list = steps(!!pack, !!label);
    progressView(list);
    await new Promise(done => root.setTimeout(done, 60)); // lascia disegnare la barra

    let packResult = null, labelResult = null;
    try {
      // Codice a barre: veloce, si prova su entrambe le foto.
      markStep('code', 'active');
      note('Cerco un codice a barre stampato sulle foto…');
      await new Promise(done => root.setTimeout(done, 30));
      markStep('code', 'done');

      markStep('engine', 'active');
      note('Carico il motore di lettura incluso nell’app (serve solo la prima volta)…');
      try {
        await root.GrocyOcr.init();
        markStep('engine', 'done');
      } catch (error) {
        markStep('engine', 'failed');
        note('Motore di testo non disponibile: uso solo il codice a barre.');
      }

      if (pack) {
        markStep('pack', 'active');
        note('Leggo il fronte della confezione…');
        packResult = await analyse(pack, 'pack');
        markStep(packResult.ocrError ? 'pack' : 'pack', packResult.ocrError ? 'failed' : 'done');
      }
      if (label) {
        markStep('label', 'active');
        note('Leggo l’etichetta: scadenza, ingredienti, quantità…');
        labelResult = await analyse(label, 'label');
        markStep(labelResult.ocrError ? 'label' : 'label', labelResult.ocrError ? 'failed' : 'done');
      }

      markStep('match', 'active');
      note('Confronto quello che ho letto con la dispensa…');
      const signal = root.GrocyRecognize.merge(packResult, labelResult);
      const results = root.GrocyRecognize.rank(ui().state().products, signal);
      markStep('match', 'done');
      pending = {
        keywords: root.GrocyRecognize.learnFrom(signal),
        at: new Date().toISOString(),
        signal
      };
      result(signal, results, packResult, labelResult);
    } catch (error) {
      busy = false;
      toast(error && error.message ? error.message : 'Riconoscimento non riuscito.');
      render();
      return;
    }
    busy = false;
  }

  // --------------------------------------------------------------- risultato

  const REASON = { barcode: 'codice a barre', nome: 'nome del prodotto', etichetta: 'parole dell’etichetta' };

  function readout(signal, openByDefault) {
    const rows = [];
    const add = (label, value) => { if (value) rows.push(`<div><small>${label}</small><strong>${esc(value)}</strong></div>`); };
    add('Nome', signal.name);
    add('Marca', signal.brand);
    add('Codice a barre', signal.barcode);
    add('Scadenza', signal.expiry ? ui().fmtDate(signal.expiry) : '');
    add('Quantità', signal.qty ? `${ui().num(signal.qty)} ${signal.unit}` : '');
    add('Categoria', signal.category && signal.category !== 'Altro' ? signal.category : '');
    const text = (signal.text || '').trim();
    return `<details class="s2-readout"${openByDefault ? ' open' : ''}><summary>Cosa ho letto nelle foto</summary>
      ${rows.length ? `<div class="detail-grid">${rows.join('')}</div>` : '<p class="form-hint">Nessun dato utile riconosciuto.</p>'}
      ${text ? `<pre class="s2-raw">${esc(text.slice(0, 1200))}</pre>` : ''}
    </details>`;
  }

  function productLine(product, withButton) {
    return `<div class="scan-match"><span class="food-icon ${ui().food(product)[1]}" aria-hidden="true">${icon(ui().food(product)[0])}</span>
      <div class="product-info"><button class="product-name" style="padding:0;text-align:left" data-action="s2-details" data-id="${product.id}">${esc(product.name)}</button>
      <div class="product-meta">${ui().num(product.qty)} ${esc(product.unit)} <span class="dot">·</span> ${esc(product.location)}${product.expiry ? ` <span class="dot">·</span> ${esc(ui().fmtDate(product.expiry))}` : ''}</div></div>
      ${withButton ? `<button class="btn small" data-action="s2-restock" data-id="${product.id}">${icon('plus')} Rifornisci</button>` : ''}</div>`;
  }

  function result(signal, results, packResult, labelResult) {
    const top = results[0];
    const problems = [packResult, labelResult].filter(r => r && r.ocrError);
    const warn = problems.length
      ? `<p class="form-hint">${icon('alert')} Lettura del testo non disponibile su ${problems.length === 2 ? 'entrambe le foto' : 'una foto'}: ${esc(problems[0].ocrError)}.</p>`
      : '';
    if (!top) {
      const hasData = signal.name || signal.barcode || signal.expiry || signal.qty;
      ui().modal('Nessun prodotto riconosciuto',
        `<p class="section-description">Ho letto le foto ma non ho trovato un prodotto corrispondente in dispensa. ${hasData ? 'Controlla i dati qui sotto e crea la scheda: la prossima volta verrà riconosciuto subito.' : 'Avvicina la fotocamera al nome e all’etichetta, evita riflessi e riprova.'}</p>
        ${readout(signal, true)}${warn}
        <div class="button-row">
          <button type="button" class="btn secondary" data-action="s2-again">Riprova</button>
          <button type="button" class="btn" data-action="s2-create">${icon('plus')} Crea prodotto</button>
        </div>`);
      return;
    }
    const confidence = Math.round(top.score * 100);
    const certain = top.score >= 0.85;
    const others = results.slice(1, 3);
    ui().modal(certain ? 'Prodotto riconosciuto' : 'Forse è questo prodotto',
      `<p class="scan-found">${icon('check')}<span><b>${esc(top.product.name)}</b> — ${confidence}% di corrispondenza${top.reasons.length ? ` (${top.reasons.map(r => REASON[r] || r).join(', ')})` : ''}.</span></p>
      ${productLine(top.product, false)}
      ${others.length ? `<p class="form-hint">Altri prodotti simili:</p>${others.map(o => productLine(o.product, true)).join('')}` : ''}
      ${readout(signal)}${warn}
      <div class="button-row">
        <button type="button" class="btn secondary" data-action="close">Chiudi</button>
        <button type="button" class="btn" data-action="s2-restock" data-id="${top.product.id}">${icon('plus')} Rifornimento</button>
      </div>
      <p class="form-hint">Non è il prodotto giusto? <button type="button" class="s2-link" data-action="s2-create">Crea una nuova scheda</button> oppure <button type="button" class="s2-link" data-action="s2-again">rifai le foto</button>.</p>`);
  }

  // ------------------------------------------------------------------ azioni

  function restock(id) {
    const product = ui().state().products.find(p => p.id === id);
    if (!product) return;
    if (pending && pending.keywords && pending.keywords.length) {
      ui().update(state => {
        const target = state.products.find(p => p.id === id);
        if (!target) return;
        const known = (target.scan && target.scan.keywords) || [];
        const keywords = known.slice();
        for (const word of pending.keywords) if (!keywords.includes(word) && keywords.length < 20) keywords.push(word);
        target.scan = { keywords, at: new Date().toISOString() };
      });
    }
    pending = null;
    ui().quantityForm(id, 'stock');
  }

  function createFromScan() {
    const base = { location: 'Dispensa' };
    const signal = (pending && pending.signal) || {};
    const draft = root.GrocyRecognize.draft(signal, base);
    // Le parole chiave vanno allegate solo alla scheda che nasce da questo
    // riconoscimento: dopo due minuti l'invito scade.
    if (pending) {
      pending.armed = true;
      root.setTimeout(() => { if (pending) pending.armed = false; }, 120000);
    }
    ui().productForm(null, draft.barcode || '', draft);
  }

  // app.js chiama questa funzione subito prima di salvare un prodotto nuovo.
  function decorate(product) {
    const pendingCopy = pending;
    if (!pending || !pending.armed || !pending.keywords || !pending.keywords.length) return;
    pending = null; // vale solo per il primo salvataggio dopo il riconoscimento
    if (!product || product.scan) return;
    product.scan = { keywords: pendingCopy.keywords, at: new Date().toISOString() };
  }

  function clear(kind) {
    shots[kind === 'pack' || kind === 'label' ? kind : 'pack'] = null;
  }

  function reset() {
    shots = { pack: null, label: null };
    pending = null;
    busy = false;
  }

  doc.addEventListener('change', event => {
    const input = event.target;
    if (!input || input.id !== 'scan2-file') return;
    const file = input.files && input.files[0];
    if (file) { waiting = input.dataset.kind || waiting; fromFile(file); }
    input.value = '';
  });

  doc.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'shot-camera': acquire(el.dataset.kind, 'camera'); break;
      case 'shot-gallery': acquire(el.dataset.kind, 'gallery'); break;
      case 'shot-clear': clear(el.dataset.kind); render(); break;
      case 'scan-two': reset(); render(); break;
      case 's2-run': run(); break;
      case 's2-again': reset(); render(); break;
      case 's2-create': createFromScan(); break;
      case 's2-restock': restock(el.dataset.id); break;
      case 's2-details': { const id = el.dataset.id; pending = null; ui().details(id); break; }
      default: return;
    }
  });

  root.GrocyScanUI = { open: () => { reset(); render(); }, decorate, reset: () => { reset(); }, _analyse: analyse };
})(window);
