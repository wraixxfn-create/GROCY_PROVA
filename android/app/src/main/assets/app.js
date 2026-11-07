'use strict';
(function () {
  const G = window.Grocy;
  const B = window.GrocyBarcode || { normalize: x => String(x ?? '').trim(), decodeGray: () => null, checksum: () => false };

  const paths = {
    milk: 'M8 3h8v4l3 5v9H5v-9l3-5Z M8 7h8 M5 13h14 M9 17h6',
    vegetable: 'M12 8c-5-6-11 0-9 6 2 8 16 8 18 0 2-6-4-12-9-6Z M12 8V3 M12 6c3-4 6-3 7-3-1 3-4 4-7 3',
    grain: 'M12 22V5 M12 9C7 9 5 6 5 3c5 0 7 3 7 6Z M12 14c-5 0-7-3-7-6 5 0 7 3 7 6Z M12 19c-5 0-7-3-7-6 5 0 7 3 7 6Z M12 12c5 0 7-3 7-6-5 0-7 3-7 6Z M12 17c5 0 7-3 7-6-5 0-7 3-7 6Z',
    fish: 'M3 12c4-7 10-7 15-2l4-3v10l-4-3c-5 5-11 5-15-2Z M8 11h.01 M13 7c-3 3-3 7 0 10',
    can: 'M5 6h14v15H5Z M4 3h16v3H4Z M5 12h14 M5 17h14 M9 9h6',
    bottle: 'M9 3h6v5l3 5v8H6v-8l3-5Z M9 6h6 M6 14h12',
    leaf: 'M20 3C9 3 3 7 3 13a6 6 0 0 0 10 4C17 13 19 8 20 3Z M4 21c1-6 5-10 10-13',
    box: 'm3 7 9-4 9 4-9 4Z M3 7v11l9 4 9-4V7 M12 11v11 M7 5l10 4',
    clock: 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    cart: 'M3 3h2l3 12h11l2-9H6 M9 20h.01 M18 20h.01',
    settings: 'm9 3-.5 3-3 1-2.5-1.5-2 3 2 2.5v3l-2 2.5 2 3 3-1 2 1 1 3h4l1-3 2-1 3 1 2-3-2-2.5v-3L21 9l-2-3-2.5 1.5-3-1L13 3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    plus: 'M12 5v14 M5 12h14',
    minus: 'M5 12h14',
    arrow: 'M4 12h16 m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
    shield: 'm12 3 8 3v6c0 5-5 8-8 10-3-2-8-5-8-10V6Z m-4 9 3 3 5-6',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    fridge: 'M6 2h12v20H6Z M6 10h12 M9 5v2 M9 13v4',
    snow: 'M12 2v20 M3 7l18 10 M3 17 21 7 M9 4l3 3 3-3 M9 20l3-3 3 3',
    download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
    upload: 'M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5',
    edit: 'm4 16-1 5 5-1L20 8l-4-4Z M14 6l4 4',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    close: 'm6 6 12 12 M6 18 18 6',
    reset: 'M3 10a9 9 0 1 1 2 9 M3 3v7h7',
    alert: 'm12 3 10 18H2Z M12 9v5 M12 17h.01',
    camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20'
  };

  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.box}"/></svg>`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 }).format(n);
  const fmtDate = s => {
    if (!s) return 'Senza scadenza';
    const d = new Date(s + 'T12:00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('it-IT', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const navs = [
    ['pantry', 'box', 'Dispensa'],
    ['shopping', 'cart', 'Spesa'],
    ['settings', 'settings', 'Impostazioni']
  ];

  const native = !!(window.Android && typeof Android.loadState === 'function');
  const MAX_ARCHIVE = 12000000;
  const STORAGE = 'grocy-locale-v1';
  const APK_PATH = '/downloads/grocy-locale-v2.1.0.apk';

  let state = G.blank();
  let page = 'pantry';
  let query = '';
  let placeFilter = 'all'; // 'all' | 'expiring' | 'Dispensa' | 'Frigorifero' | 'Congelatore'
  let categoryFilter = '';
  let sort = 'expiry';     // 'expiry' | 'name'
  let toastTimer = null;
  let loadError = false;

  try {
    const raw = native ? Android.loadState() : localStorage.getItem(STORAGE);
    if (raw) state = G.validate(JSON.parse(raw));
  } catch (e) {
    loadError = true;
  }

  const $ = s => document.querySelector(s);

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }

  function persist(next) {
    if (loadError) throw new Error('Archivio non leggibile: esporta i dati originali nelle impostazioni prima di continuare.');
    next.updatedAt = new Date().toISOString();
    const raw = JSON.stringify(next);
    if (raw.length > MAX_ARCHIVE) throw new Error('Archivio pieno: esporta un backup e riduci i prodotti salvati.');
    if (native) {
      if (!Android.saveState(raw)) throw new Error('Salvataggio sul telefono non riuscito.');
    } else {
      localStorage.setItem(STORAGE, raw);
    }
    state = next;
  }

  function update(action, message) {
    try {
      const next = JSON.parse(JSON.stringify(state));
      action(next);
      persist(next);
      render();
      if (message) toast(message);
      return true;
    } catch (e) {
      toast(e.message || 'Salvataggio non riuscito.');
      return false;
    }
  }

  function foodMeta(category) {
    switch (category) {
      case 'Latticini e uova': return ['milk', 'dairy'];
      case 'Verdura e frutta': return ['vegetable', 'vegetable'];
      case 'Pasta e cereali': return ['grain', 'grain'];
      case 'Carne e pesce': return ['fish', 'dairy'];
      case 'Conserve': return ['can', 'grain'];
      case 'Bevande': return ['bottle', 'dairy'];
      case 'Surgelati': return ['snow', 'dairy'];
      default: return ['box', 'grain'];
    }
  }

  const food = p => foodMeta(p && p.category);

  function productVisual(p) {
    if (p.thumb) {
      return `<button class="product-thumb-btn" type="button" data-action="edit" data-id="${esc(p.id)}" aria-label="Apri ${esc(p.name)}"><img class="product-thumb" src="${esc(p.thumb)}" alt="${esc(p.name)}"></button>`;
    }
    const [ic, cls] = foodMeta(p.category);
    return `<button class="food-icon ${cls}" type="button" data-action="edit" data-id="${esc(p.id)}" aria-label="Apri ${esc(p.name)}">${icon(ic)}</button>`;
  }

  function expiryBadge(p) {
    if (!p.expiry) return `<span class="badge neutral">Senza scadenza</span>`;
    const d = G.days(p.expiry);
    if (d < 0) {
      const abs = Math.abs(d);
      return `<span class="badge expired">${icon('alert')} Scaduto da ${abs} ${abs === 1 ? 'giorno' : 'giorni'}</span>`;
    }
    if (d === 0) return `<span class="badge expired">${icon('clock')} Scade oggi</span>`;
    if (d === 1) return `<span class="badge warn">${icon('clock')} Scade domani</span>`;
    if (d <= state.settings.warningDays) return `<span class="badge warn">${icon('clock')} Tra ${d} giorni (${esc(fmtDate(p.expiry))})</span>`;
    return `<span class="badge">${icon('clock')} ${esc(fmtDate(p.expiry))}</span>`;
  }

  function stepSize(p) {
    if (p.unit === 'g' || p.unit === 'ml') return p.qty >= 100 ? 100 : (p.qty >= 25 ? 25 : 10);
    if (p.unit === 'kg' || p.unit === 'l') return Number.isInteger(p.qty) && p.qty >= 1 ? 1 : 0.25;
    return 1;
  }

  function locIcon(loc) {
    return loc === 'Frigorifero' ? 'fridge' : loc === 'Congelatore' ? 'snow' : 'box';
  }

  function navigate(target) {
    if (target === 'expiry') {
      page = 'pantry';
      placeFilter = 'expiring';
    } else if (target === 'home' || !navs.some(n => n[0] === target)) {
      page = 'pantry';
    } else {
      page = target;
    }
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    render();
    window.scrollTo(0, 0);
  }

  function renderNav() {
    const st = G.stats(state);
    const urgent = st.expired + st.expiring;
    for (const sel of ['.top-tabs', '.bottom-nav']) {
      const container = $(sel);
      if (!container) continue;
      container.innerHTML = navs.map(([id, ic, label]) => {
        const badge = id === 'pantry' && urgent
          ? `<span class="nav-badge warn" title="Prodotti in scadenza">${urgent}</span>`
          : id === 'shopping' && st.shopping
          ? `<span class="nav-badge">${st.shopping}</span>`
          : '';
        return `<button class="nav-link ${page === id ? 'active' : ''}" type="button" data-action="navigate" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge}</button>`;
      }).join('');
    }
    const fab = $('.fab');
    if (fab) fab.style.display = page === 'pantry' ? '' : 'none';
  }

  function isUrgent(p) {
    return p.qty > 0 && p.expiry && G.days(p.expiry) <= state.settings.warningDays;
  }

  function filteredProducts() {
    const q = query.trim().toLocaleLowerCase('it');
    return state.products.filter(p => {
      if (placeFilter === 'expiring' && !isUrgent(p)) return false;
      if (G.LOCATIONS.includes(placeFilter) && p.location !== placeFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (q && ![p.name, p.category, p.location, p.barcode, p.notes].some(v => String(v || '').toLocaleLowerCase('it').includes(q))) return false;
      return true;
    }).sort((a, b) => {
      // I prodotti esauriti vanno in fondo così le scorte attive restano sempre pulite in alto.
      if ((a.qty === 0) !== (b.qty === 0)) return a.qty === 0 ? 1 : -1;
      if (sort === 'name') return a.name.localeCompare(b.name, 'it');
      return (G.days(a.expiry) - G.days(b.expiry)) || a.name.localeCompare(b.name, 'it');
    });
  }

  function pantryView() {
    const urgentCount = state.products.filter(isUrgent).length;
    const locCounts = Object.fromEntries(G.LOCATIONS.map(l => [l, state.products.filter(p => p.location === l).length]));

    const banner = !native ? `<div class="apk-banner">
      <div class="apk-banner-text">
        <strong>Usa Grocy Locale direttamente dal telefono</strong>
        <span>Nessun server da installare: scatta le 2 foto e salva tutto in locale sull’app Android.</span>
      </div>
      <a class="btn" href="${APK_PATH}" download>${icon('download')} Scarica APK</a>
    </div>` : '';

    if (!state.products.length) {
      return banner + `<div class="empty-state">
        <div class="empty-icon">${icon('camera')}</div>
        <h2>La tua dispensa è vuota</h2>
        <p>Per inserire un prodotto bastano <b>2 foto</b>: una al <b>fronte della confezione</b> (nome, miniatura e categoria) e una alla <b>data di scadenza dietro</b>.</p>
        <div class="empty-actions">
          <button class="btn" type="button" data-action="scan-two">${icon('camera')} Aggiungi con 2 foto</button>
          <button class="btn secondary" type="button" data-action="demo">Carica esempio</button>
        </div>
      </div>`;
    }

    return banner + `
      <div class="place-bar" role="tablist" aria-label="Filtra per luogo o scadenza">
        <button class="place-pill ${placeFilter === 'all' ? 'active' : ''}" type="button" data-action="place" data-place="all">
          Tutti <b>${state.products.length}</b>
        </button>
        <button class="place-pill urgent ${placeFilter === 'expiring' ? 'active' : ''}" type="button" data-action="place" data-place="expiring">
          ${icon('clock')} In scadenza <b>${urgentCount}</b>
        </button>
        ${G.LOCATIONS.map(loc => `<button class="place-pill ${placeFilter === loc ? 'active' : ''}" type="button" data-action="place" data-place="${loc}">
          ${icon(locIcon(loc))} ${loc} <b>${locCounts[loc]}</b>
        </button>`).join('')}
      </div>

      <div class="filter-bar">
        <label class="search-box">
          ${icon('search')}
          <input id="search" type="search" placeholder="Cerca prodotto o marca…" aria-label="Cerca nella dispensa" value="${esc(query)}">
        </label>
        <select id="sort" class="sort-select" aria-label="Ordina prodotti">
          <option value="expiry" ${sort === 'expiry' ? 'selected' : ''}>Per scadenza</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>Nome A–Z</option>
        </select>
      </div>

      <div class="cat-strip" aria-label="Filtra per categoria">
        <button class="cat-chip ${!categoryFilter ? 'active' : ''}" type="button" data-action="cat" data-cat="">Tutte</button>
        ${G.CATEGORIES.map(c => `<button class="cat-chip ${categoryFilter === c ? 'active' : ''}" type="button" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>

      <div id="inventory-results"></div>
    `;
  }

  function renderInventory() {
    const host = $('#inventory-results');
    if (page !== 'pantry' || !host) return;
    const list = filteredProducts();
    if (!list.length) {
      host.innerHTML = `<div class="empty-state">
        <div class="empty-icon">${icon('search')}</div>
        <h2>Nessun prodotto qui</h2>
        <p>${placeFilter === 'expiring' ? `Ottimo! Nessun prodotto scade entro ${state.settings.warningDays} giorni.` : 'Prova a cambiare filtro o aggiungi un nuovo prodotto con 2 foto.'}</p>
        <div class="empty-actions">
          ${placeFilter !== 'all' || categoryFilter || query ? `<button class="btn secondary" type="button" data-action="clear-filters">Mostra tutti</button>` : ''}
          <button class="btn" type="button" data-action="scan-two">${icon('camera')} Aggiungi con 2 foto</button>
        </div>
      </div>`;
      return;
    }

    host.innerHTML = `
      <div class="list-summary">
        <span>${list.length} ${list.length === 1 ? 'prodotto' : 'prodotti'}</span>
        <button class="btn text small" type="button" data-action="add-manual">+ Inserisci a mano</button>
      </div>
      <div class="product-list">
        ${list.map(p => `
          <article class="product-card ${p.qty === 0 ? 'depleted' : ''}" data-id="${esc(p.id)}">
            ${productVisual(p)}
            <div class="product-body" data-action="edit" data-id="${esc(p.id)}">
              <span class="product-title">${esc(p.name)}</span>
              <div class="product-sub">
                <span>${esc(p.location)}</span>
                <span>·</span>
                <span>${esc(p.category)}</span>
              </div>
              <div class="product-badges">
                ${p.qty === 0 ? `<span class="badge neutral">Esaurito</span>` : expiryBadge(p)}
                ${p.production ? `<span class="badge neutral">Prodotto il ${esc(fmtDate(p.production))}</span>` : ''}
              </div>
            </div>
            <div class="card-right">
              <div class="stepper" role="group" aria-label="Quantità ${esc(p.name)}">
                <button class="step-btn" type="button" data-action="step-down" data-id="${esc(p.id)}" aria-label="Consuma ${esc(p.name)}" ${p.qty <= 0 ? 'disabled' : ''}>${icon('minus')}</button>
                <span class="step-val">${num(p.qty)}<small>${esc(p.unit)}</small></span>
                <button class="step-btn" type="button" data-action="step-up" data-id="${esc(p.id)}" aria-label="Aggiungi ${esc(p.name)}">${icon('plus')}</button>
              </div>
              ${p.qty === 0 ? `<div class="depleted-actions">
                <button class="btn soft small" type="button" data-action="to-shopping" data-id="${esc(p.id)}">+ Spesa</button>
                <button class="btn secondary small" type="button" data-action="quick-delete" data-id="${esc(p.id)}" aria-label="Elimina ${esc(p.name)}">${icon('trash')}</button>
              </div>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function shoppingView() {
    const pending = state.shopping.filter(i => !i.done);
    const done = state.shopping.filter(i => i.done);
    return `
      <div class="page-header">
        <div>
          <h1>Lista della spesa</h1>
          <p>${pending.length ? `${pending.length} ${pending.length === 1 ? 'articolo da comprare' : 'articoli da comprare'}` : 'Tutto segnato!'}</p>
        </div>
      </div>

      <form id="quick-shopping-form" class="quick-shop-form">
        <input name="name" maxlength="120" autocomplete="off" placeholder="Cosa comprare? (es. Pane…)" aria-label="Nuovo articolo della spesa" required>
        <button class="btn" type="submit">${icon('plus')} Aggiungi</button>
      </form>

      <div class="shop-toolbar">
        <button class="btn secondary small" type="button" data-action="shortages">${icon('box')} Aggiungi prodotti finiti</button>
        ${done.length ? `<button class="btn secondary small" type="button" data-action="clear-done">${icon('check')} Rimuovi acquistati (${done.length})</button>` : ''}
      </div>

      <section class="panel">
        <div class="panel-head"><h2>${icon('cart')} Da acquistare (${pending.length})</h2></div>
        ${pending.length ? pending.map(shopRow).join('') : `<div class="panel-body" style="color:var(--muted);font-size:14px">Nessun articolo in attesa.</div>`}
      </section>

      ${done.length ? `<section class="panel">
        <div class="panel-head"><h2>${icon('check')} Nel carrello (${done.length})</h2></div>
        ${done.map(shopRow).join('')}
      </section>` : ''}
    `;
  }

  function shopRow(item) {
    return `<div class="shopping-row ${item.done ? 'done' : ''}">
      <button class="check ${item.done ? 'checked' : ''}" type="button" data-action="toggle-shopping" data-id="${esc(item.id)}" role="checkbox" aria-checked="${item.done}" aria-label="${item.done ? 'Segna da comprare' : 'Segna comprato'}: ${esc(item.name)}">
        ${item.done ? icon('check') : ''}
      </button>
      <div style="flex:1;min-width:0">
        <span class="product-title">${esc(item.name)}</span>
        <small style="color:var(--muted);font-size:12px">${num(item.qty)} ${esc(item.unit)}</small>
      </div>
      <button class="icon-btn" type="button" data-action="delete-shopping" data-id="${esc(item.id)}" aria-label="Rimuovi ${esc(item.name)}">${icon('trash')}</button>
    </div>`;
  }

  function settingsView() {
    const online = state.settings.onlineLookup !== false;
    return `
      <div class="page-header">
        <div>
          <h1>Impostazioni</h1>
          <p>Tutto salvato sul telefono, senza alcun server esterno da gestire.</p>
        </div>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>${icon('camera')} Riconoscimento e scadenze</h2></div>
        <div class="panel-body" style="padding-top:6px;padding-bottom:6px">
          <div class="setting-line">
            <div>
              <strong>Catalogo online gratuito (Open Food Facts)</strong>
              <small>Usa internet dal telefono per migliorare nome e categoria senza chiavi API. Se sei offline usa solo l’OCR locale.</small>
            </div>
            <button class="toggle ${online ? 'on' : ''}" type="button" role="switch" aria-checked="${online}" data-action="toggle-online" aria-label="Attiva ricerca Open Food Facts"></button>
          </div>
          <div class="setting-line">
            <div>
              <strong>Preavviso scadenze</strong>
              <small>Evidenzia i prodotti che scadono entro questi giorni.</small>
            </div>
            <select id="warning-days" aria-label="Giorni di preavviso scadenze">
              ${[1, 3, 7, 14].map(n => `<option value="${n}" ${n === state.settings.warningDays ? 'selected' : ''}>${n} ${n === 1 ? 'giorno' : 'giorni'}</option>`).join('')}
            </select>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>${icon('download')} Backup sul dispositivo</h2></div>
        <div class="panel-body">
          <p style="margin:0;font-size:13px;color:var(--muted)">Esporta o ripristina la tua dispensa (inclusi miniature, scadenze e spesa) in un singolo file JSON sul telefono.</p>
          <div class="settings-actions">
            <button class="btn" type="button" data-action="export">${icon('download')} Esporta backup</button>
            <button class="btn secondary" type="button" data-action="import">${icon('upload')} Importa backup</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>${icon('reset')} Gestione archivio</h2></div>
        <div class="panel-body">
          <p style="margin:0;font-size:13px;color:var(--muted)">Prodotti salvati: <b>${state.products.length}</b> · Prodotti imparati: <b>${(state.catalog || []).length}</b></p>
          <div class="settings-actions">
            ${!state.products.length ? `<button class="btn secondary" type="button" data-action="demo">Carica dispensa di esempio</button>` : ''}
            <button class="btn secondary" type="button" data-action="reset">${icon('trash')} Svuota tutti i dati</button>
          </div>
        </div>
      </section>

      <p style="font-size:12px;color:var(--muted);text-align:center;margin:20px 0 8px">
        Grocy Locale 2.0 · Dati salvati in locale sul telefono · Nessun server richiesto
      </p>
    `;
  }

  function render() {
    renderNav();
    const views = { pantry: pantryView, shopping: shoppingView, settings: settingsView };
    $('#main').innerHTML = (views[page] || pantryView)();
    renderInventory();
    if (loadError) {
      $('#main').insertAdjacentHTML('afterbegin', `<div class="panel" style="border-color:var(--red-ink);padding:14px 16px;margin-bottom:14px">
        <strong>Archivio non leggibile: dati non sovrascritti.</strong>
        <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Esporta il backup originale prima di ripristinare o svuotare i dati dalle impostazioni.</p>
      </div>`);
    }
    document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  }

  function modal(title, body) {
    $('#modal-content').innerHTML = `
      <div class="modal-header">
        <h2 id="modal-title">${title}</h2>
        <button class="icon-btn" type="button" data-action="close" aria-label="Chiudi">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
    `;
    if (!$('#modal').open) $('#modal').showModal();
  }

  function closeModal() {
    if ($('#modal').open) $('#modal').close();
  }

  function confirmModal(title, description, action, label = 'Conferma', danger = false) {
    modal(title, `
      <p style="margin:0 0 18px;font-size:14px;color:var(--muted)">${description}</p>
      <div class="button-row">
        <button class="btn secondary" type="button" data-action="close">Annulla</button>
        <button class="btn ${danger ? 'danger' : ''}" type="button" id="confirm-button">${label}</button>
      </div>
    `);
    $('#confirm-button').addEventListener('click', () => action());
  }

  function exportBackup() {
    try {
      const raw = loadError ? (native ? Android.loadState() : localStorage.getItem(STORAGE)) : JSON.stringify(state, null, 2);
      if (!raw) throw new Error('Nessun dato da esportare.');
      if (native) {
        Android.exportBackup(raw);
      } else {
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `grocy-locale-${G.today()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast('Backup scaricato.');
      }
    } catch (e) {
      toast('Esportazione non riuscita: ' + e.message);
    }
  }

  function importBackup(raw) {
    try {
      if (typeof raw !== 'string' || raw.length > MAX_ARCHIVE) throw new Error('File troppo grande (massimo 12 MB).');
      const next = G.validate(JSON.parse(raw));
      confirmModal(
        'Ripristinare questo backup?',
        `Contiene <b>${next.products.length}</b> prodotti e <b>${next.shopping.length}</b> articoli della spesa. Sostituirà i dati attuali.`,
        () => {
          try {
            loadError = false;
            persist(next);
            closeModal();
            render();
            toast('Backup ripristinato.');
          } catch (e) {
            loadError = true;
            toast(e.message);
          }
        },
        'Ripristina backup',
        true
      );
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Il file non contiene JSON valido.' : e.message);
    }
  }

  function saveProductRecord(product, isNew) {
    const clean = {
      id: product.id || G.id(),
      name: String(product.name || '').trim(),
      qty: Number(product.qty),
      min: Number.isFinite(Number(product.min)) && Number(product.min) >= 0 ? Number(product.min) : 0,
      unit: G.UNITS.includes(product.unit) ? product.unit : 'pz',
      category: G.CATEGORIES.includes(product.category) ? product.category : 'Altro',
      location: G.LOCATIONS.includes(product.location) ? product.location : 'Dispensa',
      expiry: String(product.expiry || '').trim(),
      production: String(product.production || '').trim(),
      barcode: product.barcode ? B.normalize(product.barcode) : '',
      notes: String(product.notes || '').trim()
    };
    if (product.thumb) clean.thumb = product.thumb;
    if (product.scan) clean.scan = product.scan;
    if (!clean.name) throw new Error('Inserisci il nome del prodotto.');
    if (clean.expiry && !G.validDate(clean.expiry)) throw new Error('Data di scadenza non valida.');
    if (clean.production && !G.validDate(clean.production)) throw new Error('Data di produzione non valida.');
    // Correzione: una "scadenza" già passata non è una scadenza ma la data
    // di produzione — la spostiamo lì invece di segnare il prodotto scaduto.
    if (clean.expiry && G.days(clean.expiry) < 0) {
      if (!clean.production) clean.production = clean.expiry;
      clean.expiry = '';
    }

    const test = G.blank();
    test.products = [clean];
    const validated = G.validate(test).products[0];

    const ok = update(s => {
      const idx = s.products.findIndex(x => x.id === validated.id);
      if (idx < 0) s.products.push(validated);
      else s.products[idx] = validated;
      G.learnCatalog(s, validated);
      G.log(s, idx < 0 || isNew ? 'add' : 'edit', validated.name, idx < 0 ? `Aggiunto (${num(validated.qty)} ${validated.unit})` : 'Prodotto aggiornato');
    }, isNew ? `${validated.name} salvato in ${validated.location.toLowerCase()}.` : 'Prodotto aggiornato.');

    return ok ? validated : null;
  }

  window.onNativeBackup = importBackup;
  window.onNativeResult = (ok, message) => toast(message);
  window.handleAndroidBack = () => {
    if ($('#modal').open) { closeModal(); return true; }
    if (page !== 'pantry') { navigate('pantry'); return true; }
    return false;
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    switch (d.action) {
      case 'navigate': navigate(d.page); break;
      case 'close': closeModal(); break;
      case 'place': placeFilter = d.place; render(); break;
      case 'cat': categoryFilter = d.cat || ''; renderInventory(); document.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', (c.dataset.cat || '') === categoryFilter)); break;
      case 'clear-filters': placeFilter = 'all'; categoryFilter = ''; query = ''; render(); break;
      case 'add-manual': if (window.GrocyScanUI) window.GrocyScanUI.openManual({ location: G.LOCATIONS.includes(placeFilter) ? placeFilter : '' }); break;
      case 'edit': {
        const prod = state.products.find(p => p.id === d.id);
        if (prod && window.GrocyScanUI) window.GrocyScanUI.openEdit(prod);
        break;
      }
      case 'step-up': {
        const prod = state.products.find(p => p.id === d.id);
        if (!prod) break;
        const delta = stepSize(prod);
        update(s => G.changeQuantity(s, prod.id, delta, 'stock'));
        break;
      }
      case 'step-down': {
        const prod = state.products.find(p => p.id === d.id);
        if (!prod || prod.qty <= 0) break;
        const delta = Math.min(prod.qty, stepSize(prod));
        update(s => G.changeQuantity(s, prod.id, -delta, 'consume'));
        break;
      }
      case 'to-shopping': {
        const prod = state.products.find(p => p.id === d.id);
        if (!prod) break;
        update(s => {
          const exists = s.shopping.some(i => !i.done && i.name.toLocaleLowerCase('it') === prod.name.toLocaleLowerCase('it'));
          if (!exists) s.shopping.push({ id: G.id(), name: prod.name, qty: 1, unit: prod.unit === 'g' || prod.unit === 'ml' ? 'pz' : prod.unit, done: false });
        }, `${prod.name} aggiunto alla lista della spesa.`);
        break;
      }
      case 'quick-delete': {
        const prod = state.products.find(p => p.id === d.id);
        if (!prod) break;
        update(s => {
          s.products = s.products.filter(x => x.id !== prod.id);
          G.log(s, 'delete', prod.name, 'Rimosso dalla dispensa');
        }, `${prod.name} rimosso.`);
        break;
      }
      case 'delete-product': {
        const prod = state.products.find(p => p.id === d.id);
        if (!prod) break;
        confirmModal('Eliminare il prodotto?', `Vuoi rimuovere <b>${esc(prod.name)}</b> dalla dispensa?`, () => {
          if (update(s => {
            s.products = s.products.filter(x => x.id !== prod.id);
            G.log(s, 'delete', prod.name, 'Rimosso dalla dispensa');
          }, 'Prodotto eliminato.')) closeModal();
        }, 'Elimina', true);
        break;
      }
      case 'demo':
        if (state.products.length) toast('La dispensa contiene già dei prodotti.');
        else update(s => Object.assign(s, G.demo()), 'Dispensa di esempio caricata.');
        break;
      case 'shortages': {
        let n = 0;
        if (update(s => { n = G.addShortages(s); })) {
          toast(n ? `${n} ${n === 1 ? 'prodotto aggiunto' : 'prodotti aggiunti'} alla spesa.` : 'Nessun prodotto finito o sotto scorta.');
        }
        break;
      }
      case 'toggle-shopping':
        update(s => { const item = s.shopping.find(i => i.id === d.id); if (item) item.done = !item.done; });
        break;
      case 'delete-shopping':
        update(s => { s.shopping = s.shopping.filter(i => i.id !== d.id); }, 'Articolo rimosso.');
        break;
      case 'clear-done':
        update(s => { s.shopping = s.shopping.filter(i => !i.done); }, 'Acquistati rimossi.');
        break;
      case 'toggle-online':
        update(s => { s.settings.onlineLookup = s.settings.onlineLookup === false; },
          state.settings.onlineLookup === false ? 'Ricerca Open Food Facts attivata.' : 'Modalità solo offline attivata.');
        break;
      case 'export': exportBackup(); break;
      case 'import':
        if (native) Android.importBackup();
        else { $('#import-file').value = ''; $('#import-file').click(); }
        break;
      case 'reset':
        confirmModal('Svuotare tutta la dispensa?', 'Cancellerà tutti i prodotti e la lista della spesa sul telefono. Esporta prima un backup se vuoi conservarli.', () => {
          try {
            loadError = false;
            persist(G.blank());
            closeModal();
            render();
            toast('Dispensa svuotata.');
          } catch (err) {
            loadError = true;
            toast(err.message);
          }
        }, 'Elimina tutti i dati', true);
        break;
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'search') {
      query = e.target.value;
      renderInventory();
    }
  });

  document.addEventListener('change', async e => {
    if (e.target.id === 'sort') {
      sort = e.target.value;
      renderInventory();
    }
    if (e.target.id === 'warning-days') {
      update(s => { s.settings.warningDays = Number(e.target.value); }, 'Preavviso aggiornato.');
    }
    if (e.target.id === 'import-file') {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > MAX_ARCHIVE) { toast('Il backup supera la dimensione massima.'); return; }
      try { importBackup(await f.text()); } catch { toast('Impossibile leggere il file.'); }
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id === 'quick-shopping-form') {
      e.preventDefault();
      const input = e.target.querySelector('[name="name"]');
      const name = (input && input.value || '').trim();
      if (!name) return;
      if (update(s => { s.shopping.push({ id: G.id(), name, qty: 1, unit: 'pz', done: false }); }, `${name} aggiunto alla spesa.`)) {
        input.value = '';
      }
    }
  });

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h && h !== page) navigate(h);
  });

  $('#modal').addEventListener('click', e => {
    if (e.target === $('#modal')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeModal();
    }
  });

  window.GrocyUI = {
    state: () => state,
    update,
    persist,
    saveProductRecord,
    toast,
    modal,
    closeModal,
    icon,
    esc,
    num,
    fmtDate,
    food,
    foodMeta,
    locIcon,
    navigate
  };

  const initHash = location.hash.slice(1);
  if (initHash === 'shopping' || initHash === 'settings') page = initHash;
  else if (initHash === 'expiry') { page = 'pantry'; placeFilter = 'expiring'; }
  render();
})();
