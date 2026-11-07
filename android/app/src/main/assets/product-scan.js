/*
 * Inserimento guidato con 2 foto (e modifica rapida prodotto):
 *   Passo 1: Foto al fronte della confezione -> miniatura a colori, nome e categoria
 *   Passo 2: Foto alla data di scadenza dietro -> data di scadenza
 *   Passo 3: Controlla e salva in 1 tocco (con suggerimenti Open Food Facts + memoria locale)
 */
(function (root) {
  'use strict';

  const doc = root.document;
  if (!doc) return;

  const MAX_SIDE = 1600;
  const THUMB_MAX = 184;
  const EXPIRY_PREVIEW_MAX = 300;

  let mode = 'wizard';     // 'wizard' | 'manual' | 'edit'
  let step = 'pack';       // 'pack' | 'expiry' | 'reading' | 'confirm'
  let returnToConfirm = false;
  let waitingKind = 'pack';
  let shots = { pack: null, expiry: null };
  let packPromise = null;
  let packAnalysis = null;
  let suggestions = [];
  let existingMatch = null;
  let detectedPackQty = null; // es. { qty: 700, unit: 'g' }
  let locationTouched = false;
  let formState = blankForm();

  const ui = () => root.GrocyUI;
  const G = () => root.Grocy;
  const R = () => root.GrocyRecognize;
  const B = () => root.GrocyBarcode;
  const Off = () => root.GrocyOff;
  const esc = v => ui().esc(v);
  const icon = n => ui().icon(n);

  function blankForm(overrides) {
    return Object.assign({
      id: '',
      name: '',
      category: 'Altro',
      location: 'Dispensa',
      expiry: '',
      production: '',
      qty: 1,
      unit: 'pz',
      min: 0,
      barcode: '',
      notes: '',
      thumb: '',
      scan: null
    }, overrides || {});
  }

  // ------------------------------------------------------- Elaborazione foto

  function base64Bytes(text) {
    const raw = root.atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function grayToJpeg(gray, width, height, maxSide) {
    const scale = Math.min(1, (maxSide || THUMB_MAX) / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(height - 1, Math.round(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(width - 1, Math.round(x / scale));
        const v = gray[sy * width + sx];
        const at = (y * w + x) * 4;
        img.data[at] = img.data[at + 1] = img.data[at + 2] = v;
        img.data[at + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    try { return canvas.toDataURL('image/jpeg', 0.74); } catch (e) { return ''; }
  }

  function colorThumbFromImage(img, maxSide, quality) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const canvas = doc.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    try { return canvas.toDataURL('image/jpeg', quality || 0.74); } catch (e) { return ''; }
  }

  function acquirePhoto(kind, source) {
    waitingKind = kind === 'expiry' ? 'expiry' : 'pack';
    if (root.Android && typeof root.Android.capturePhoto === 'function') {
      try {
        // Manteniamo compatibilità col nome "label" o "pack" lato Java
        const nativeKind = waitingKind === 'expiry' ? 'label' : 'pack';
        if (source === 'camera') root.Android.capturePhoto(nativeKind);
        else root.Android.pickPhoto(nativeKind);
        return;
      } catch (e) {
        ui().toast('Fotocamera non disponibile: scegli un file dalla galleria.');
      }
    }
    const input = doc.getElementById('scan2-file');
    if (!input) return;
    input.value = '';
    input.dataset.kind = waitingKind;
    if (source === 'camera') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  function fromFile(file, kind) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { ui().toast('Scegli un’immagine valida.'); return; }
    if (file.size > 16000000) { ui().toast('Immagine troppo pesante: riprova.'); return; }
    const targetKind = kind === 'expiry' ? 'expiry' : 'pack';
    const reader = new FileReader();
    reader.onerror = () => ui().toast('Impossibile leggere la foto.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => ui().toast('Foto non leggibile: riprova.');
      img.onload = () => {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) { ui().toast('Foto vuota: riprova.'); return; }
        const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));
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
        const thumb = colorThumbFromImage(img, targetKind === 'pack' ? THUMB_MAX : EXPIRY_PREVIEW_MAX, 0.74);
        onShotReady(targetKind, { gray, width: w, height: h, thumb });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  root.onNativePhoto = payload => {
    if (!payload) { ui().toast('Scatto annullato.'); return; }
    try {
      const rawKind = payload.kind === 'label' || payload.kind === 'expiry' ? 'expiry' : (waitingKind === 'expiry' ? 'expiry' : 'pack');
      const gray = base64Bytes(payload.data);
      const thumb = (typeof payload.thumb === 'string' && payload.thumb.startsWith('data:image/'))
        ? payload.thumb
        : grayToJpeg(gray, payload.width, payload.height, rawKind === 'pack' ? THUMB_MAX : EXPIRY_PREVIEW_MAX);
      onShotReady(rawKind, { gray, width: payload.width, height: payload.height, thumb });
    } catch (e) {
      ui().toast('Foto non leggibile: riprova.');
    }
  };

  root.onNativePhotoError = message => {
    ui().toast(message || 'Fotocamera non disponibile.');
  };

  // ------------------------------------------------ Riconoscimento 2 foto

  async function analysePackShot(shot) {
    let barcode = '';
    try { barcode = B().decodeGray(shot.gray, shot.width, shot.height, { minVotes: 3 }) || ''; } catch (e) { barcode = ''; }

    let parsed = null;
    try {
      let read = await root.GrocyOcr.read(shot.gray, shot.width, shot.height, { psm: 3, enhance: true });
      if (((read.text || '').match(/[A-Za-zÀ-ÿ]/g) || []).length < 3) {
        const retry = await root.GrocyOcr.read(shot.gray, shot.width, shot.height, { psm: 11, enhance: true });
        if ((retry.text || '').length > (read.text || '').length) read = retry;
      }
      parsed = R().parse(read.text, { role: 'pack', checksum: B().checksum });
    } catch (e) {
      parsed = R().parse('', { role: 'pack', checksum: B().checksum });
    }

    if (barcode) parsed.barcode = barcode;

    // Arricchimento online gratuito con Open Food Facts (se attivo nelle impostazioni)
    let offResult = { match: null, suggestions: [], online: false };
    const onlineEnabled = ui().state().settings.onlineLookup !== false;
    if (Off() && onlineEnabled) {
      offResult = await Off().enrich(parsed, { enabled: true });
    }

    const result = { parsed, offResult };
    packAnalysis = result;
    updateStep2Banner();
    return result;
  }

  async function analyseExpiryShot(shot) {
    if (!shot) return R().parse('', { role: 'expiry', checksum: B().checksum });

    let barcode = '';
    try { barcode = B().decodeGray(shot.gray, shot.width, shot.height, { minVotes: 3 }) || ''; } catch (e) { barcode = ''; }

    let parsed = null;
    try {
      // Prima lettura completa
      const first = await root.GrocyOcr.read(shot.gray, shot.width, shot.height, { psm: 3, enhance: true });
      parsed = R().parse(first.text, { role: 'expiry', checksum: B().checksum });

      // Se la data è piccola o isolata sul retro, secondo passaggio mirato al centro con psm 6 (blocco data)
      if (!parsed.expiry && root.GrocyOcr.cropCenter) {
        const center = root.GrocyOcr.cropCenter(shot.gray, shot.width, shot.height, 0.72);
        const retry = await root.GrocyOcr.read(center.gray, center.width, center.height, { psm: 6, enhance: true });
        const retryParsed = R().parse(first.text + '\n' + retry.text, { role: 'expiry', checksum: B().checksum });
        if (retryParsed.expiry) parsed = retryParsed;
      }
    } catch (e) {
      parsed = R().parse('', { role: 'expiry', checksum: B().checksum });
    }

    if (barcode && !parsed.barcode) parsed.barcode = barcode;
    return parsed;
  }

  async function onShotReady(kind, shot) {
    shots[kind] = shot;

    if (kind === 'pack') {
      formState.thumb = shot.thumb || formState.thumb;
      packAnalysis = null;
      packPromise = analysePackShot(shot);

      if (mode === 'edit' || returnToConfirm) {
        syncFormFromDom();
        step = 'reading';
        renderReading('Leggo il fronte della confezione…');
        const packRes = await packPromise;
        applyPackToForm(packRes, mode === 'edit');
        returnToConfirm = false;
        step = 'confirm';
        renderConfirm();
        return;
      }

      // Avanza subito al Passo 2 mentre la Foto 1 viene analizzata in background!
      step = 'expiry';
      renderStepExpiry();
      return;
    }

    // kind === 'expiry'
    syncFormFromDom();
    const onlyUpdatingDate = mode === 'edit' || returnToConfirm;
    step = 'reading';
    renderReading(onlyUpdatingDate ? 'Leggo la data di scadenza…' : 'Unisco confezione e data di scadenza…');
    await new Promise(r => root.setTimeout(r, 40));

    const [packRes, expiryParsed] = await Promise.all([
      onlyUpdatingDate ? Promise.resolve(packAnalysis) : (packPromise || Promise.resolve(null)),
      analyseExpiryShot(shot)
    ]);

    if (onlyUpdatingDate) {
      if (expiryParsed && expiryParsed.production) formState.production = expiryParsed.production;
      if (expiryParsed && expiryParsed.expiry) {
        formState.expiry = expiryParsed.expiry;
        ui().toast('Data di scadenza letta dalla foto.');
      } else if (expiryParsed && expiryParsed.production) {
        ui().toast('La data letta è già passata: è la data di produzione, non la scadenza.');
      } else {
        ui().toast('Data non nitida: puoi selezionarla qui sotto guardando l’anteprima.');
      }
      returnToConfirm = false;
      step = 'confirm';
      renderConfirm();
      return;
    }

    await buildConfirmationState(packRes, expiryParsed);
    step = 'confirm';
    renderConfirm();
  }

  function applyPackToForm(packRes, preserveExistingFields) {
    if (!packRes || !packRes.parsed) return;
    const p = packRes.parsed;
    const offMatch = packRes.offResult && packRes.offResult.match;
    if (!preserveExistingFields || !formState.name) {
      formState.name = (offMatch && offMatch.name) || p.name || formState.name;
    }
    const cat = (offMatch && offMatch.category && offMatch.category !== 'Altro') ? offMatch.category : p.category;
    if ((!preserveExistingFields || formState.category === 'Altro') && cat && cat !== 'Altro') {
      formState.category = cat;
      if (!locationTouched) formState.location = (offMatch && offMatch.location) || R().locationOf(cat, p.text);
    }
    if (packRes.offResult && Array.isArray(packRes.offResult.suggestions)) {
      suggestions = packRes.offResult.suggestions;
    }
  }

  async function buildConfirmationState(packRes, expiryParsed) {
    const packParsed = (packRes && packRes.parsed) || R().parse('', { role: 'pack' });
    const signal = R().merge(packParsed, expiryParsed);

    // Se il codice a barre era sul retro (Foto 2) e non sul fronte, interroga Open Food Facts col codice esatto
    let offResult = (packRes && packRes.offResult) || { match: null, suggestions: [] };
    if (signal.barcode && (!offResult.match || offResult.match.barcode !== signal.barcode) && Off() && ui().state().settings.onlineLookup !== false) {
      try {
        const byCode = await Off().lookupBarcode(signal.barcode);
        if (byCode) offResult = { match: byCode, suggestions: [byCode, ...(offResult.suggestions || [])] };
      } catch (e) { /* rete assente: prosegue in locale */ }
    }

    const st = ui().state();
    const activeMatches = R().rank(st.products, signal);
    const catalogMatches = R().rank(st.catalog || [], signal);
    const known = (activeMatches[0] && activeMatches[0].score >= 0.72 && activeMatches[0].product)
      || (catalogMatches[0] && catalogMatches[0].score >= 0.72 && catalogMatches[0].product)
      || null;

    existingMatch = (activeMatches[0] && activeMatches[0].score >= 0.75) ? activeMatches[0].product : null;

    const offMatch = offResult.match;
    const chosenName = (known && known.name) || (offMatch && offMatch.name) || signal.name || '';
    const chosenCategory = (known && known.category)
      || (offMatch && offMatch.category && offMatch.category !== 'Altro' ? offMatch.category : '')
      || (signal.category && signal.category !== 'Altro' ? signal.category : '')
      || (offMatch && offMatch.category)
      || 'Altro';
    const chosenLocation = formState.location && locationTouched
      ? formState.location
      : (known && known.location)
        || (offMatch && offMatch.location)
        || signal.location
        || R().locationOf(chosenCategory, signal.text);

    detectedPackQty = (signal.qty && signal.unit && !(signal.qty === 1 && signal.unit === 'pz'))
      ? { qty: signal.qty, unit: signal.unit }
      : (offMatch && offMatch.qty && offMatch.unit ? { qty: offMatch.qty, unit: offMatch.unit } : null);

    // Suggerimenti rapidi (da catalogo locale + Open Food Facts)
    const sugList = [];
    const seen = new Set();
    const pushSug = item => {
      if (!item || !item.name) return;
      const key = item.name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      sugList.push(item);
    };
    if (known) pushSug({ name: known.name, brand: '', category: known.category, location: known.location, source: 'locale' });
    for (const s of (offResult.suggestions || [])) pushSug(s);
    suggestions = sugList.slice(0, 4);

    const brandNote = (offMatch && offMatch.brand) || signal.brand || '';
    const learnedKeywords = R().learnFrom(signal);

    formState = blankForm({
      name: chosenName,
      category: chosenCategory,
      location: chosenLocation,
      expiry: signal.expiry || '',
      production: signal.production || '',
      qty: 1,
      unit: 'pz',
      min: 0,
      barcode: signal.barcode || (offMatch && offMatch.barcode) || '',
      notes: brandNote,
      thumb: (shots.pack && shots.pack.thumb) || formState.thumb || '',
      scan: learnedKeywords.length ? { keywords: learnedKeywords, at: new Date().toISOString() } : null
    });
  }

  // ------------------------------------------------------- Schermate UI

  function stepIndicator(current) {
    if (mode !== 'wizard') return '';
    const s1 = current === 'pack' ? 'active' : 'done';
    const s2 = current === 'pack' ? '' : (current === 'expiry' ? 'active' : 'done');
    const s3 = current === 'confirm' ? 'active' : '';
    return `<div class="wizard-steps" aria-label="Passaggi inserimento">
      <div class="wiz-step ${s1}"><span class="num">${s1 === 'done' ? '✓' : '1'}</span><span>Fronte</span></div>
      <div class="wiz-step ${s2}"><span class="num">${s2 === 'done' ? '✓' : '2'}</span><span>Scadenza</span></div>
      <div class="wiz-step ${s3}"><span class="num">3</span><span>Salva</span></div>
    </div>`;
  }

  function renderStepPack() {
    ui().modal('Aggiungi prodotto', `
      ${stepIndicator('pack')}
      <div class="capture-stage">
        <div class="capture-visual">${icon('camera')}</div>
        <h3>1. Fotografa il fronte</h3>
        <p>Inquadra il davanti della confezione per salvare <b>la miniatura, il prodotto e la categoria</b>.</p>
        <div class="capture-actions">
          <button class="btn full" type="button" data-action="shot-camera" data-kind="pack">
            ${icon('camera')} Scatta foto al fronte
          </button>
          <button class="btn secondary full" type="button" data-action="shot-gallery" data-kind="pack">
            Scegli dalla galleria
          </button>
        </div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <button class="link-btn" type="button" data-action="s2-manual">Oppure inserisci a mano senza foto</button>
      </div>
    `);
  }

  function packBannerText() {
    if (!packAnalysis) return 'Lettura nome e categoria in corso…';
    const offMatch = packAnalysis.offResult && packAnalysis.offResult.match;
    const name = (offMatch && offMatch.name) || (packAnalysis.parsed && packAnalysis.parsed.name) || '';
    const cat = (offMatch && offMatch.category && offMatch.category !== 'Altro') ? offMatch.category
      : (packAnalysis.parsed && packAnalysis.parsed.category) || '';
    if (name) return `${name}${cat ? ' · ' + cat : ''}`;
    return 'Fronte acquisito · ora inquadra la scadenza';
  }

  function updateStep2Banner() {
    const el = doc.getElementById('s2-pack-status');
    if (el) el.textContent = packBannerText();
  }

  function renderStepExpiry() {
    const thumb = shots.pack && shots.pack.thumb;
    ui().modal('Aggiungi prodotto', `
      ${stepIndicator('expiry')}
      <div class="mini-shot-bar">
        ${thumb ? `<img src="${esc(thumb)}" alt="Fronte confezione">` : ''}
        <div class="mini-shot-info">
          <strong>✓ Foto 1: Fronte salvato</strong>
          <small id="s2-pack-status">${esc(packBannerText())}</small>
        </div>
        <button class="btn secondary small" type="button" data-action="s2-back-pack">Rifai</button>
      </div>

      <div class="capture-stage">
        <div class="capture-visual">${icon('clock')}</div>
        <h3>2. Fotografa la scadenza</h3>
        <p>Gira la confezione e inquadra da vicino la <b>data di scadenza</b> sul retro, sul tappo o sul bordo.</p>
        <div class="capture-actions">
          <button class="btn full" type="button" data-action="shot-camera" data-kind="expiry">
            ${icon('camera')} Scatta foto alla scadenza
          </button>
          <div class="capture-sub-actions">
            <button class="btn secondary" type="button" data-action="shot-gallery" data-kind="expiry">Galleria</button>
            <button class="btn secondary" type="button" data-action="s2-skip-expiry">Salta scadenza</button>
          </div>
        </div>
      </div>
    `);
  }

  function renderReading(message) {
    ui().modal('Lettura in corso…', `
      <div class="reading-box">
        <div class="spinner" aria-hidden="true"></div>
        <h3 style="margin:0 0 6px;font-size:17px">${esc(message || 'Sto leggendo le foto…')}</h3>
        <p style="margin:0;font-size:13px;color:var(--muted)">Elaborazione direttamente sul telefono, nessun server esterno.</p>
      </div>
    `);
  }

  function syncFormFromDom() {
    const form = doc.getElementById('s2-confirm-form');
    if (!form) return;
    const fd = new FormData(form);
    if (fd.has('name')) formState.name = String(fd.get('name')).trim();
    if (fd.has('expiry')) formState.expiry = String(fd.get('expiry')).trim();
    if (fd.has('production')) formState.production = String(fd.get('production')).trim();
    if (fd.has('qty')) {
      const q = Number(fd.get('qty'));
      if (Number.isFinite(q) && q >= 0) formState.qty = q;
    }
    if (fd.has('unit')) formState.unit = String(fd.get('unit'));
    if (fd.has('min')) {
      const m = Number(fd.get('min'));
      if (Number.isFinite(m) && m >= 0) formState.min = m;
    }
    if (fd.has('barcode')) formState.barcode = String(fd.get('barcode')).trim();
    if (fd.has('notes')) formState.notes = String(fd.get('notes')).trim();
  }

  function renderConfirm() {
    const isEdit = mode === 'edit';
    const title = isEdit ? 'Modifica prodotto' : (mode === 'manual' ? 'Nuovo prodotto' : 'Controlla e salva');
    const [fallbackIcon, fallbackCls] = ui().foodMeta(formState.category);
    const expShot = shots.expiry && shots.expiry.thumb;

    const statusLine = isEdit
      ? 'Tocca un campo per modificarlo o aggiorna le foto.'
      : (formState.name && formState.expiry
          ? 'Prodotto, categoria e scadenza pronti!'
          : formState.name
            ? 'Confezione letta — controlla o inserisci la scadenza.'
            : 'Completa il nome o scegli un suggerimento qui sotto.');

    const matchBanner = (!isEdit && existingMatch) ? `
      <div class="existing-match-banner">
        <div>
          <strong>Già in dispensa: ${esc(existingMatch.name)}</strong>
          <div style="font-size:12px;color:var(--muted)">Attualmente: ${ui().num(existingMatch.qty)} ${esc(existingMatch.unit)} in ${esc(existingMatch.location)}</div>
        </div>
        <button class="btn soft small" type="button" data-action="s2-quick-restock" data-id="${esc(existingMatch.id)}">+1 Rifornisci</button>
      </div>
    ` : '';

    const sugButtons = suggestions.length ? `
      <div class="suggestions-row" id="s2-suggestions">
        ${suggestions.map((s, idx) => `
          <button class="suggest-pill" type="button" data-action="s2-pick-sug" data-idx="${idx}">
            <span>${esc(s.name)}</span>
            <small>· ${esc(s.category)}</small>
          </button>
        `).join('')}
      </div>
    ` : `<div class="suggestions-row" id="s2-suggestions"></div>`;

    ui().modal(title, `
      ${stepIndicator('confirm')}
      ${matchBanner}
      <form id="s2-confirm-form">
        <div class="confirm-top">
          <div class="confirm-thumb-wrap">
            ${formState.thumb
              ? `<img src="${esc(formState.thumb)}" alt="Miniatura prodotto">`
              : `<span class="food-icon ${fallbackCls}" style="width:100%;height:100%;border-radius:0">${icon(fallbackIcon)}</span>`}
          </div>
          <div class="confirm-meta">
            <strong>${esc(statusLine)}</strong>
            <div class="confirm-retake-row">
              <button class="link-btn" type="button" data-action="s2-retake-pack">${formState.thumb ? 'Rifai foto fronte' : '📷 Scatta foto fronte'}</button>
              <button class="link-btn" type="button" data-action="s2-retake-expiry">${expShot ? 'Rifai foto scadenza' : '📷 Leggi scadenza da foto'}</button>
            </div>
          </div>
        </div>

        <div class="form-stack">
          <div class="field-group">
            <div class="field-label">
              <label for="s2-name">Prodotto *</label>
              ${ui().state().settings.onlineLookup !== false ? `<button class="link-btn" type="button" data-action="s2-search-online">${icon('globe')} Cerca su Open Food Facts</button>` : ''}
            </div>
            <input id="s2-name" name="name" required maxlength="120" autocomplete="off" value="${esc(formState.name)}" placeholder="Es. Latte intero, Passata di pomodoro…">
            ${sugButtons}
          </div>

          <div class="field-group">
            <label class="field-label" for="s2-expiry">Data di scadenza</label>
            ${expShot ? `<div class="expiry-preview-strip">
              <img src="${esc(expShot)}" alt="Foto data di scadenza">
              <span>Foto scadenza acquisita · verifica che la data coincida</span>
            </div>` : ''}
            <input id="s2-expiry" type="date" name="expiry" value="${esc(formState.expiry)}" min="2000-01-01" max="2199-12-31">
            ${formState.production && !formState.expiry ? `<p style="margin:8px 0 0;font-size:12px;color:var(--muted)">La data letta dalla foto (${esc(formState.production)}) è già passata: l’ho salvata come <b>data di produzione</b>, non come scadenza. Se la confezione riporta anche la scadenza, inseriscila qui sopra.</p>` : ''}
            <div class="quick-dates">
              <button class="quick-date-chip" type="button" data-action="s2-date-offset" data-days="3">+3 giorni</button>
              <button class="quick-date-chip" type="button" data-action="s2-date-offset" data-days="7">+1 sett</button>
              <button class="quick-date-chip" type="button" data-action="s2-date-offset" data-days="30">+1 mese</button>
              <button class="quick-date-chip" type="button" data-action="s2-date-clear">Senza scadenza</button>
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">Categoria</span>
            <div class="cat-grid" role="radiogroup" aria-label="Categoria prodotto">
              ${G().CATEGORIES.map(c => {
                const [ic] = ui().foodMeta(c);
                return `<button class="cat-option ${formState.category === c ? 'selected' : ''}" type="button" data-action="s2-set-cat" data-cat="${esc(c)}" aria-pressed="${formState.category === c}">
                  ${icon(ic)}<span>${esc(c)}</span>
                </button>`;
              }).join('')}
            </div>
          </div>

          <div class="field-group">
            <span class="field-label">Dove lo conservi</span>
            <div class="loc-grid" role="radiogroup" aria-label="Luogo di conservazione">
              ${G().LOCATIONS.map(loc => `
                <button class="loc-option ${formState.location === loc ? 'selected' : ''}" type="button" data-action="s2-set-loc" data-loc="${esc(loc)}" aria-pressed="${formState.location === loc}">
                  ${icon(ui().locIcon(loc))}<span>${esc(loc)}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="field-group">
            <div class="field-label">
              <label for="s2-qty">Quantità</label>
              ${detectedPackQty && (formState.qty !== detectedPackQty.qty || formState.unit !== detectedPackQty.unit)
                ? `<button class="link-btn" type="button" data-action="s2-use-pack-qty">Usa formato letto (${ui().num(detectedPackQty.qty)} ${esc(detectedPackQty.unit)})</button>`
                : ''}
            </div>
            <div class="qty-editor">
              <div class="qty-stepper-lg">
                <button type="button" data-action="s2-qty-delta" data-delta="-1" aria-label="Diminuisci quantità">${icon('minus')}</button>
                <input id="s2-qty" type="number" name="qty" min="0" max="999999" step="0.001" inputmode="decimal" value="${formState.qty}" required>
                <button type="button" data-action="s2-qty-delta" data-delta="1" aria-label="Aumenta quantità">${icon('plus')}</button>
              </div>
              <select name="unit" aria-label="Unità di misura">
                ${G().UNITS.map(u => `<option value="${u}" ${u === formState.unit ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
          </div>

          <details class="more-details">
            <summary>Altre opzioni (scorta minima, codice, note)</summary>
            <div class="more-grid">
              <div class="field-group">
                <label class="field-label" for="s2-min">Scorta minima</label>
                <input id="s2-min" type="number" name="min" min="0" max="999999" step="0.001" inputmode="decimal" value="${formState.min}">
              </div>
              <div class="field-group">
                <label class="field-label" for="s2-production">Data di produzione</label>
                <input id="s2-production" type="date" name="production" value="${esc(formState.production)}" min="2000-01-01" max="2199-12-31">
              </div>
              <div class="field-group">
                <label class="field-label" for="s2-barcode">Codice a barre</label>
                <input id="s2-barcode" name="barcode" maxlength="80" autocomplete="off" inputmode="numeric" value="${esc(formState.barcode)}" placeholder="Opzionale">
              </div>
              <div class="field-group wide">
                <label class="field-label" for="s2-notes">Note / Marca</label>
                <input id="s2-notes" name="notes" maxlength="1000" value="${esc(formState.notes)}" placeholder="Marca, formato o promemoria…">
              </div>
            </div>
          </details>
        </div>

        <p id="form-error" class="form-error" role="alert"></p>

        <div class="button-row">
          ${isEdit
            ? `<button class="btn secondary" type="button" data-action="delete-product" data-id="${esc(formState.id)}">${icon('trash')} Elimina</button>`
            : `<button class="btn secondary" type="button" data-action="close">Annulla</button>`}
          <button class="btn" type="submit">${icon('check')} ${isEdit ? 'Salva modifiche' : 'Salva in dispensa'}</button>
        </div>
      </form>
    `);
  }

  async function searchOnlineFromInput() {
    syncFormFromDom();
    const q = formState.name.trim();
    if (q.length < 2) {
      ui().toast('Scrivi almeno 2 lettere del prodotto per cercarlo.');
      const input = doc.getElementById('s2-name');
      if (input) input.focus();
      return;
    }
    if (!Off()) return;
    ui().toast('Ricerca su Open Food Facts…');
    try {
      const found = await Off().searchProducts(q);
      if (!found.length) {
        ui().toast('Nessun risultato trovato online: puoi salvare il nome inserito.');
        return;
      }
      suggestions = found.slice(0, 4);
      renderConfirm();
      ui().toast('Tocca un suggerimento per compilare prodotto e categoria.');
    } catch (e) {
      ui().toast('Connessione non disponibile: puoi continuare in locale.');
    }
  }

  function pickSuggestion(idx) {
    syncFormFromDom();
    const s = suggestions[idx];
    if (!s) return;
    formState.name = s.name;
    if (s.category && G().CATEGORIES.includes(s.category)) {
      formState.category = s.category;
      if (!locationTouched) formState.location = s.location || R().locationOf(s.category, s.name);
    }
    if (s.brand && !formState.notes) formState.notes = s.brand;
    if (s.barcode && !formState.barcode) formState.barcode = s.barcode;
    if (s.qty && s.unit) detectedPackQty = { qty: s.qty, unit: s.unit };
    renderConfirm();
  }

  function resetWizard(initialLocation) {
    mode = 'wizard';
    step = 'pack';
    returnToConfirm = false;
    shots = { pack: null, expiry: null };
    packPromise = null;
    packAnalysis = null;
    suggestions = [];
    existingMatch = null;
    detectedPackQty = null;
    locationTouched = !!initialLocation;
    formState = blankForm({ location: initialLocation || 'Dispensa' });
  }

  function openWizard(opts) {
    resetWizard(opts && opts.location);
    renderStepPack();
  }

  function openManual(opts) {
    resetWizard(opts && opts.location);
    mode = 'manual';
    step = 'confirm';
    renderConfirm();
    root.setTimeout(() => {
      const input = doc.getElementById('s2-name');
      if (input) input.focus();
    }, 40);
  }

  function openEdit(product) {
    if (!product) return;
    resetWizard(product.location);
    mode = 'edit';
    step = 'confirm';
    locationTouched = true;
    formState = blankForm({
      id: product.id,
      name: product.name,
      category: product.category,
      location: product.location,
      expiry: product.expiry || '',
      production: product.production || '',
      qty: product.qty,
      unit: product.unit,
      min: product.min || 0,
      barcode: product.barcode || '',
      notes: product.notes || '',
      thumb: product.thumb || '',
      scan: product.scan || null
    });
    renderConfirm();
  }

  // -------------------------------------------------------------- Eventi

  doc.addEventListener('change', event => {
    const input = event.target;
    if (!input || input.id !== 'scan2-file') return;
    const file = input.files && input.files[0];
    const kind = input.dataset.kind || waitingKind;
    input.value = '';
    if (file) fromFile(file, kind);
  });

  doc.addEventListener('click', async event => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'scan-two':
        openWizard();
        break;
      case 'shot-camera':
        acquirePhoto(el.dataset.kind, 'camera');
        break;
      case 'shot-gallery':
        acquirePhoto(el.dataset.kind, 'gallery');
        break;
      case 's2-manual':
        openManual({ location: formState.location });
        break;
      case 's2-back-pack':
        shots.pack = null;
        packPromise = null;
        packAnalysis = null;
        step = 'pack';
        renderStepPack();
        break;
      case 's2-skip-expiry': {
        step = 'reading';
        renderReading('Preparo la scheda del prodotto…');
        const packRes = await (packPromise || Promise.resolve(null));
        await buildConfirmationState(packRes, R().parse('', { role: 'expiry' }));
        step = 'confirm';
        renderConfirm();
        break;
      }
      case 's2-retake-pack':
        syncFormFromDom();
        returnToConfirm = true;
        acquirePhoto('pack', 'camera');
        break;
      case 's2-retake-expiry':
        syncFormFromDom();
        returnToConfirm = true;
        acquirePhoto('expiry', 'camera');
        break;
      case 's2-set-cat': {
        syncFormFromDom();
        const cat = el.dataset.cat;
        if (G().CATEGORIES.includes(cat)) {
          formState.category = cat;
          if (!locationTouched) formState.location = R().locationOf(cat, formState.name);
          renderConfirm();
        }
        break;
      }
      case 's2-set-loc': {
        syncFormFromDom();
        const loc = el.dataset.loc;
        if (G().LOCATIONS.includes(loc)) {
          formState.location = loc;
          locationTouched = true;
          renderConfirm();
        }
        break;
      }
      case 's2-date-offset': {
        syncFormFromDom();
        const days = Number(el.dataset.days) || 0;
        const d = new Date();
        d.setDate(d.getDate() + days);
        formState.expiry = G().localDate(d);
        renderConfirm();
        break;
      }
      case 's2-date-clear':
        syncFormFromDom();
        formState.expiry = '';
        renderConfirm();
        break;
      case 's2-qty-delta': {
        syncFormFromDom();
        const delta = Number(el.dataset.delta) || 0;
        formState.qty = Math.max(0, Math.round((Number(formState.qty || 0) + delta) * 1000) / 1000);
        const qtyInput = doc.getElementById('s2-qty');
        if (qtyInput) qtyInput.value = String(formState.qty);
        break;
      }
      case 's2-use-pack-qty':
        if (detectedPackQty) {
          syncFormFromDom();
          formState.qty = detectedPackQty.qty;
          formState.unit = detectedPackQty.unit;
          renderConfirm();
        }
        break;
      case 's2-search-online':
        searchOnlineFromInput();
        break;
      case 's2-pick-sug':
        pickSuggestion(Number(el.dataset.idx));
        break;
      case 's2-quick-restock': {
        const id = el.dataset.id;
        const prod = ui().state().products.find(p => p.id === id);
        if (!prod) break;
        const ok = ui().update(s => {
          const target = s.products.find(x => x.id === id);
          if (!target) return;
          if (formState.thumb && !target.thumb) target.thumb = formState.thumb;
          if (formState.expiry && (!target.expiry || formState.expiry < target.expiry)) target.expiry = formState.expiry;
          G().changeQuantity(s, id, 1, 'stock');
        }, `+1 aggiunto a ${prod.name}.`);
        if (ok) ui().closeModal();
        break;
      }
      default:
        return;
    }
  });

  doc.addEventListener('submit', event => {
    const form = event.target;
    if (!form || form.id !== 's2-confirm-form') return;
    event.preventDefault();
    syncFormFromDom();
    try {
      const saved = ui().saveProductRecord(formState, mode !== 'edit');
      if (saved) ui().closeModal();
    } catch (err) {
      const errEl = doc.getElementById('form-error');
      if (errEl) errEl.textContent = err.message || 'Controlla i campi inseriti.';
    }
  });

  root.GrocyScanUI = {
    open: openWizard,
    openManual,
    openEdit,
    reset: () => resetWizard()
  };
})(window);
