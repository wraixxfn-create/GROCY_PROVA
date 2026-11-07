/*
 * Riconoscimento locale del prodotto dalle due foto: la confezione (fronte) e
 * l'etichetta (retro). Nessuna rete, nessun catalogo online: tutto quello che
 * serve viene letto sul telefono e confrontato con la dispensa già presente.
 *
 * Ogni foto produce un testo (letto dal motore OCR incluso nell'app), un codice
 * a barre se è stampato e un insieme di parole chiave. Le due foto si uniscono
 * in un solo "segnale" che viene confrontato con i prodotti salvati:
 *   1. codice a barre, se combacia è una certezza;
 *   2. somiglianza del nome con quello dei prodotti;
 *   3. parole chiave della confezione, imparate al salvataggio.
 * Non c'è una "impronta visiva": un confronto di pixel cambia troppo con lo
 * scatto (distanza, luce, inclinazione) e rischierebbe di indicare il prodotto
 * sbagliato. Meglio un riconoscimento che a volte si astiene.
 *
 * Tutte le funzioni sono pure: nessun accesso al DOM, così i test le usano
 * direttamente in Node.
 */
(function (root) {
  'use strict';

  const UNITS = ['pz', 'kg', 'g', 'l', 'ml', 'conf'];
  const UNIT_ALIASES = {
    g: 'g', gr: 'g', grs: 'g', grammi: 'g', grammo: 'g',
    kg: 'kg', kgs: 'kg', chili: 'kg', chilogrammi: 'kg',
    ml: 'ml', millilitri: 'ml',
    cl: 'cl', centilitri: 'cl',
    l: 'l', lt: 'l', ltr: 'l', litri: 'l', litro: 'l',
    pz: 'pz', pezzi: 'pz', pezzo: 'pz', conf: 'conf', confezione: 'conf', confezioni: 'conf'
  };

  // Parole che non aiutano a riconoscere un prodotto.
  const STOPWORDS = new Set(['DELLA', 'DELLE', 'DELLO', 'DEGLI', 'CON', 'PER', 'DEL', 'DEI', 'AL', 'ALLA', 'ALLE',
    'NELLA', 'NELLE', 'PRODOTTO', 'PRODOTTI', 'ITALIA', 'ITALIANO', 'ITALIANA', 'INGREDIENTI', 'INGREDIENTE',
    'VALORI', 'MEDI', 'MEDIO', 'ENERGIA', 'CONSERVARE', 'CONSUMARSI', 'PREFERIBILMENTE', 'SCADENZA', 'ENTRO',
    'PESO', 'NETTO', 'NETTA', 'CONFEZIONATO', 'STABILIMENTO', 'SOCIETA', 'QUESTO', 'QUESTA', 'DOPO', 'APERTURA',
    'LUOGO', 'FRESCO', 'ASCIUTTO', 'FORMATO', 'CONTENUTO', 'TOTALE', 'SENZA', 'CONSIGLIATO', 'USO', 'MAGGIORE',
    'MINORE', 'OGNI', 'SERVIRE', 'FREDDO', 'CUOCERE', 'COTTURA', 'MINUTI', 'PARTE', 'ALTRO', 'FINE', 'BUONO',
    'DICHIARAZIONE', 'NUTRIZIONALE', 'ALLERGENI', 'SMALTIMENTO', 'RICICLA', 'RACCOLTA', 'DIFFERENZIATA',
    'CONFEZIONE', 'CONTENUTO', 'MARCHIO', 'PROPRIETARIO', 'RISERVATI', 'DIRITTI', 'DEPOSITATO', 'BREVETTO',
    'KCAL', 'CODICE', 'BARRE', 'EAN', 'GRASSI', 'PROTEINE', 'CARBOIDRATI', 'ZUCCHERI', 'DICHIARATI', 'MEDIA',
    'PORZIONE', 'PORZIONI', 'CONFEZIONI', 'VETRO', 'PLASTICA', 'CARTA', 'UMIDO', 'SECCO', 'RACCOLTA']);

  // Parole chiave per la categoria: l'ordine conta (prima le più specifiche).
  const CATEGORY_WORDS = [
    ['Surgelati', /\b(SURGELAT|CONGELAT|GELATO)\w*/],
    ['Latticini e uova', /\b(LATTE|LATTICINI|YOGURT|YOGHURT|PANNA|BURRO|FORMAGGI?|PARMIGIANO|GRANA|MOZZARELLA|RICOTTA|UOVA?|MASCARPONE|STRACCHINO|GORGONZOLA)\b/],
    ['Pasta e cereali', /\b(PASTA|SPAGHETTI|PENNE|RIGATONI|FUSILLI|RISI?O|FARINA|PANE|BISCOTTI?|CEREALI|FETTE|GRISSINI|ORZO|COUS|MAIS|POLENTA|CRACKER|PIZZA|GNOCCHI|TORTELLINI|RAVIOLI)\b/],
    ['Carne e pesce', /\b(POLLO|MANZO|MAIALE|TACCHINO|PROSCIUTTO|SALAME|SALSICCIA|MORTADELLA|BRESAOLA|TONNO|SALMONE|PESCE|GAMBERI|MERLUZZO|COZZE)\b/],
    ['Bevande', /\b(SUCCO|SUCCHI|ACQUA|BIRRA|VINO|ARANCIATA|COLA|BIBITA|SPREMUTA|NECTAR|CHINOTTO|THE|CAFFE)\b/],
    ['Verdura e frutta', /\b(INSALATA|POMODORI|POMODORINO|MELA|MELE|BANANA|BANANE|PATATE|PATATA|LIMONE|LIMONI|CAROTE|ZUCCHINE|CIPOLLA|SPINACI|BROCCOLI|FRUTTA|VERDURA|ARANCIA|PERA|UVA|FRAGOLE)\b/],
    ['Conserve', /\b(PASSATA|PELATI|SUGO|CONCENTRATO|SOTTACETI|SOTTOLIO|OLIVE|MAIONESE|KETCHUP|SENAPE|LEGUMI|FAGIOLI|CECI|LENTICCHIE|PISELLI|SARDINE|MARMELLATA|CONFETTURA|MIELE|SALE|OLIO)\b/]
  ];

  const BRANDS = ['MUTTI', 'BARILLA', 'FERRERO', 'NUTELLA', 'KINDER', 'GRANAROLO', 'PARMALAT', 'GALBANI',
    'RIO MARE', 'FINDUS', 'BUITONI', 'DE CECCO', 'DIVINEA', 'SELECTO', 'MULINO BIANCO', 'ESSELUNGA', 'COOP',
    'CONAD', 'LAVAZZA', 'ILLY', 'SAN BENEDETTO', 'COCA', 'PEPSI', 'DANONE', 'ACTIVIA', 'YOPLAIT', 'SANPELLEGRINO',
    'LEVISSIMA', 'FAGE', 'ALPRO', 'CALVE', 'PONTI', 'HEINZ', 'KNORR', 'STAR', 'VITASNELLA', 'PLASMON', 'NESTLE',
    'MISURA', 'FERRARELLE', 'PANZANI', 'Voiello'.toUpperCase(), 'MOLINO', 'CIRIO', 'LA DORIA', 'DELIZIE'];

  // ---------------------------------------------------------------- testo

  function clean(text) {
    return String(text || '')
      .replace(/[«»“”„]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/[’‘`]/g, "'")
      .replace(/[|¦]/g, 'I')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n');
  }

  function linesOf(text) {
    return clean(text).split('\n').map(l => l.trim()).filter(l => l.length > 1);
  }

  const letters = s => (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  function upperRatio(s) {
    const l = s.match(/[A-Za-zÀ-ÿ]/g) || [];
    if (!l.length) return 0;
    return l.filter(c => c === c.toUpperCase()).length / l.length;
  }

  const COMPANY = /\b(?:S\.?\s?P\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?N\.?C\.?|SPA|SRL|SAS|SCARL)\b/i;
  const NOISE = /\b(INGREDIENTI|VALORI|CONSERVARE|PRODOTTO IN|PRODOTTO DA|STABILIMENTO|WWW\.|HTTP|TEL\.|E-?MAIL|LOTTO|CONSUMARSI|PREFERIBILMENTE|ENTRO|SCADENZA|NUTRIZIONALE|ALLERGENI|SMALTIMENTO|RICICLA)\b/i;

  // "PASSATA DI POMODORO" diventa "Passata di pomodoro": l'OCR restituisce il
  // titolo in maiuscolo, in dispensa si legge meglio la frase normale.
  function smartTitle(text) {
    const flat = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
    return flat.charAt(0).toUpperCase() + flat.slice(1);
  }

  // Per la marca invece ogni parola resta con la maiuscola: "Mutti S.p.A.".
  function brandCase(text) {
    const flat = String(text).replace(/\s+/g, ' ').trim();
    // Se la confezione usa già minuscole la grafia è quella vera: non toccarla.
    if (/[a-zà-ÿ]/.test(flat)) return flat;
    return flat.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (all, space, letter) => space + letter.toUpperCase());
  }

  function nameCandidate(line) {
    const value = line.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/[^A-Za-zÀ-ÿ0-9.!'%°\s-]+$/, '').trim();
    if (value.length < 3 || value.length > 46) return null;
    if (letters(value) < 3) return null;
    if (/[%:;{}<>]/.test(value)) return null;
    if (NOISE.test(value) || COMPANY.test(value)) return null;
    if (/\b\d{1,2}\s*[/.\-]\s*\d{2,4}\b/.test(value)) return null;
    if ((value.match(/\d/g) || []).length > 3) return null;
    if (/\b(PESO|NETTO|GR|KG|ML|CL|LT)\b/i.test(value) && /\d/.test(value)) return null;
    return value;
  }

  // Il nome può stare su più righe ("PASSATA" + "DI POMODORO"): si valutano
  // i blocchi di righe consecutive che sembrano un titolo.
  function pickName(lines) {
    const blocks = [];
    let current = [];
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const candidate = nameCandidate(lines[i]);
      if (!candidate) {
        if (current.length) { blocks.push(current); current = []; }
        continue;
      }
      current.push({ index: i, text: candidate });
    }
    if (current.length) blocks.push(current);
    let best = null, bestScore = 0;
    for (const block of blocks) {
      const words = block.map(b => b.text).join(' ').split(/\s+/);
      const joined = block.map(b => b.text).join(' ');
      if (joined.length > 46 || words.length > 6) continue;
      const upper = upperRatio(joined);
      let score = 1;
      score += upper > 0.75 ? 0.8 : 0;
      score += words.length >= 2 && words.length <= 4 ? 0.7 : 0;
      score += joined.length >= 6 && joined.length <= 28 ? 0.4 : 0;
      score += block.length > 1 ? 0.45 : 0;              // un titolo su due righe è comune
      score -= block[0].index * 0.18;                    // il nome sta in alto
      if (score > bestScore) { bestScore = score; best = joined; }
    }
    if (!best) return null;
    const name = smartTitle(best.replace(/\s+/g, ' ').trim());
    return name.length >= 3 ? name : null;
  }

  function pickBrand(lines) {
    for (const line of lines) {
      const match = line.match(/^([A-Za-zÀ-ÿ'’.&\s]{2,40}?)[\s,]*\b(?:S\.?\s?P\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?N\.?C\.?)\b/i);
      if (match) {
        const brand = match[1].replace(/[.,;:]$/, '').trim();
        if (letters(brand) >= 2 && !NOISE.test(brand)) return brandCase(brand);
      }
      const produced = line.match(/\b(?:PRODOTTO|PRODOTTA|DISTRIBUITO)\s+(?:DA|IN ITALIA DA)\s+([A-Za-zÀ-ÿ'’.\s&]{2,40})/i);
      if (produced) return brandCase(produced[1].trim());
      const known = BRANDS.find(b => line.toUpperCase().includes(b));
      if (known) return brandCase(known);
    }
    return '';
  }

  const MONTHS = { GEN: 1, GENNAIO: 1, FEB: 2, FEBBRAIO: 2, FEBR: 2, MAR: 3, MARZO: 3, APR: 4, APRILE: 4, MAG: 5,
    MAGGIO: 5, GIU: 6, GIUGNO: 6, LUG: 7, LUGLIO: 7, AGO: 8, AGOSTO: 8, SET: 9, SETTEMBRE: 9, SEPT: 9, OTT: 10,
    OTTOBRE: 10, NOV: 11, NOVEMBRE: 11, DIC: 12, DICEMBRE: 12, JAN: 1, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, DEC: 12 };

  function lastDayOf(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function iso(year, month, day) {
    if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) return '';
    const max = lastDayOf(year, month);
    if (!(day >= 1 && day <= max)) return '';
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function expandYear(raw) {
    const n = Number(raw);
    if (String(raw).length === 4) return n;
    if (String(raw).length === 2) return n < 70 ? 2000 + n : 1900 + n;
    return NaN;
  }

  /*
   * Scadenze: "05/2027" o "05.27" sono termini minimi (fine mese), "12/03/2027"
   * è un giorno preciso. Le righe vicine a SCADENZA/ENTRO/CONSUMARSI valgono di
   * più di un numero qualsiasi stampato sull'etichetta.
   */
  function pickExpiry(lines) {
    const candidates = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // La parola chiave conta di più se è sulla stessa riga o su quella sopra
      // ("Da consumarsi preferibilmente entro:" e poi la data).
      const KEY = /(SCAD|ENTRO|CONSUMARSI|PREFERIBIL|TMC|TERMINE MINIMO|DA USARE|DA CONSUMARE)/i;
      const before = (lines[i - 1] || '') + ' ' + line, after = (lines[i + 1] || '');
      const weightOf = () => (KEY.test(line) ? 3 : KEY.test(before) ? 2.9 : KEY.test(after) ? 1.5 : 0);
      const boost = weightOf();
      let match;
      if ((match = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(line))) {
        const value = iso(Number(match[1]), Number(match[2]), Number(match[3]));
        if (value) candidates.push({ value, weight: boost ? boost - 0.2 : 1.3 });
        continue;
      }
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)/.exec(line))) {
        const day = Number(match[1]), month = Number(match[2]), year = expandYear(match[3]);
        const value = iso(year, month, day) || iso(year, day, month);
        if (value) candidates.push({ value, weight: boost || 1.4 });
        continue;
      }
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{4})(?!\d)/.exec(line))) {
        const month = Number(match[1]), year = Number(match[2]);
        const value = iso(year, month, lastDayOf(year, month));
        if (value) candidates.push({ value, weight: boost ? boost + 0.1 : 1.6 });
        continue;
      }
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{2})(?!\d)/.exec(line))) {
        const month = Number(match[1]), year = expandYear(match[2]);
        const value = iso(year, month, lastDayOf(year, month));
        if (value) candidates.push({ value, weight: boost ? boost - 0.2 : 0.9 });
        continue;
      }
      if ((match = /\b(GEN|FEB|MAR|APR|MAG|GIU|LUG|AGO|SET|OTT|NOV|DIC|JAN|MAY|JUN|JUL|AUG|SEP|OCT|DEC)[A-Z]*\.?\s*(\d{2,4})\b/i.exec(line))) {
        const month = MONTHS[match[1].toUpperCase()];
        const year = expandYear(match[2]);
        const value = iso(year, month, lastDayOf(year, month));
        if (value) candidates.push({ value, weight: boost ? boost - 0.1 : 1.1 });
      }
    }
    if (!candidates.length) return null;
    const limit = new Date().getFullYear() + 12;
    const usable = candidates.filter(c => Number(c.value.slice(0, 4)) <= limit);
    if (!usable.length) return null;
    usable.sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));
    return { value: usable[0].value, confidence: Math.min(0.95, 0.3 + usable[0].weight * 0.19) };
  }

  function pickQuantity(text) {
    const candidates = [];
    const pattern = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|kgs|gr|g|grammi|ml|cl|lt|l|litri|pz|pezzi|conf|confezioni)\b/gi;
    let match;
    while ((match = pattern.exec(text))) {
      const raw = Number(match[1].replace(',', '.'));
      const unit = UNIT_ALIASES[match[2].toLowerCase()];
      if (!unit || !Number.isFinite(raw) || raw <= 0 || raw > 99999) continue;
      const before = text.slice(Math.max(0, match.index - 24), match.index).toUpperCase();
      // "per 100 g", "valori medi", "energia 105 kj / 25 kcal": non è la quantità.
      if (/(PER|VALORI|MEDI|MEDIO|ENERGIA|KCAL|KJ|DI CUI|DICHIARATI?)\s*$/.test(before)) continue;
      const weighted = /(PESO|NETTO|NETTA|CONTENUTO|CONFEZIONE DA|E )/.test(before);
      candidates.push({ qty: raw, unit, weight: weighted ? 2.5 : 1, at: match.index });
    }
    // "6 x 125 g": la confezione contiene sei pezzi.
    const multipack = /(\d{1,2})\s*[x×]\s*\d{1,3}(?:[.,]\d{1,3})?\s*(?:g|gr|ml|cl)\b/i.exec(text);
    if (multipack) candidates.push({ qty: Number(multipack[1]), unit: 'pz', weight: 3.2, at: multipack.index });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.weight - a.weight || a.at - b.at);
    const best = candidates[0];
    if (best.unit === 'cl') return { qty: Math.round(best.qty * 10 * 1000) / 1000, unit: 'ml', confidence: 0.6 };
    if (!UNITS.includes(best.unit)) return null;
    return { qty: best.qty, unit: best.unit, confidence: best.weight >= 2 ? 0.8 : 0.5 };
  }

  /*
   * Il codice stampato si accetta solo se è una sequenza completa sulla stessa
   * riga e se il carattere di controllo torna. Le cifre sparse di una tabella
   * nutrizionale ("100 g", "105 kJ", "25 kcal") non devono diventare un codice.
   */
  function pickBarcode(text, checksum) {
    const NUTRITION = /(VALORI|MEDI|KCAL|KJ|ENERGIA|INGREDIENTI|CARBOIDRATI|PROTEINE|GRASSI|ZUCCHERI|SALE)/i;
    const LABELLED = /(CODICE|BARRE|EAN|UPC|BARCODE)/i;
    const found = [];
    for (const rawLine of String(text).split('\n')) {
      const line = rawLine.trim();
      if (!line || NUTRITION.test(line)) continue;
      const labelled = LABELLED.test(line);
      const digitsOnly = /^[\d\s]+$/.test(line);
      const patterns = [/(?<!\d)(\d{13})(?!\d)/g, /(?<!\d)(\d{12})(?!\d)/g];
      if (labelled || digitsOnly) patterns.push(/(?<!\d)(\d{8})(?!\d)/g);
      patterns.push(/(?<!\d)(\d[\d ]{9,20}\d)(?!\d)/g); // cifre separate da spazi
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(line))) {
          const value = match[1].replace(/\s/g, '');
          const normalized = value.length === 13 && value[0] === '0' ? value.slice(1) : value;
          if (![8, 12, 13].includes(normalized.length)) continue;
          if (normalized.length === 8 && !(labelled || digitsOnly)) continue;
          if (!checksum(normalized)) continue;
          found.push({ code: normalized, weight: labelled ? 3 : normalized.length >= 12 ? 2 : 1, at: match.index });
        }
      }
    }
    if (!found.length) return '';
    found.sort((a, b) => b.weight - a.weight || b.code.length - a.code.length);
    return found[0].code;
  }

  function keywordsOf(text, limit) {
    const counts = new Map();
    const words = String(text || '').toUpperCase().replace(/[^A-ZÀ-Ý0-9\s]/g, ' ').split(/\s+/);
    for (const word of words) {
      if (word.length < 4 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    return Array.from(counts.keys()).slice(0, limit || 24);
  }

  const NON_FOOD = /\b(DETERSIV|DETERGENT|SAPONE|SAPONETTA|AMMORBIDENTE|CANDEGGINA|DISINFETTANT|SHAMPOO|BAGNOSCHIUMA|DENTIFRICIO|DEODORANTE|PANNO|SPUGNA|SCOPOLIN|SACCHETTI|CANDELA|PILA|BATTERIA)\w*/;

  function categoryOf(text) {
    const upper = String(text || '').toUpperCase();
    if (NON_FOOD.test(upper)) return 'Altro';
    for (const [category, pattern] of CATEGORY_WORDS) {
      if (pattern.test(upper)) return category;
    }
    return 'Altro';
  }

  const truthy = value => (typeof value === 'string' && value.trim() ? value.trim() : '');

  /*
   * Analizza il testo di una singola foto.
   * role: 'pack' (fronte) oppure 'label' (retro, ingredienti e scadenza).
   */
  function parse(text, options) {
    const opts = options || {};
    const checksum = typeof opts.checksum === 'function' ? opts.checksum : () => false;
    const lines = linesOf(text);
    const joined = lines.join('\n');
    const expiry = pickExpiry(lines);
    const quantity = pickQuantity(joined.replace(/\n/g, ' '));
    const barcode = pickBarcode(joined, checksum);
    const name = pickName(lines);
    const brand = pickBrand(lines);
    return {
      role: opts.role || 'pack',
      lines,
      name: truthy(name),
      brand,
      expiry: expiry ? expiry.value : '',
      expiryConfidence: expiry ? expiry.confidence : 0,
      qty: quantity ? quantity.qty : null,
      unit: quantity ? quantity.unit : '',
      qtyConfidence: quantity ? quantity.confidence : 0,
      barcode,
      category: categoryOf(joined + ' ' + (name || '')),
      keywords: keywordsOf(joined + ' ' + (name || '') + ' ' + brand),
      text: joined
    };
  }

  // ------------------------------------------------------------- confronto

  function dice(a, b) {
    if (a === b) return 1;
    if (!a || !b || a.length < 2 || b.length < 2) return 0;
    const grams = new Map();
    for (let i = 0; i < a.length - 1; i++) {
      const g = a.slice(i, i + 2);
      grams.set(g, (grams.get(g) || 0) + 1);
    }
    let hits = 0, total = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b.slice(i, i + 2);
      const n = grams.get(g) || 0;
      if (n > 0) { hits++; grams.set(g, n - 1); }
      total++;
    }
    return (2 * hits) / (a.length - 1 + total);
  }

  const normalize = value => String(value || '').toUpperCase().replace(/[^A-ZÀ-Ý0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  function similarity(a, b) {
    const left = normalize(a), right = normalize(b);
    if (!left || !right) return 0;
    const tokensA = new Set(keywordsOf(left, 40)), tokensB = new Set(keywordsOf(right, 40));
    let shared = 0;
    for (const t of tokensA) {
      for (const u of tokensB) {
        if (t === u || (t.length > 4 && u.length > 4 && (t.startsWith(u) || u.startsWith(t)))) { shared++; break; }
      }
    }
    const tokenScore = shared / Math.max(1, Math.max(tokensA.size, tokensB.size));
    return Math.max(tokenScore, dice(left, right) * 0.9, tokenScore * 0.6 + dice(left, right) * 0.4);
  }

  const NAME_MATCH = 0.55;   // somiglianza minima del nome
  const MIN_SCORE = 0.6;     // sotto questa soglia l'app non propone nulla

  /*
   * Unisce le due foto in un solo segnale.
   * pack/label: risultato di parse() con in più il codice letto dall'immagine.
   */
  function merge(pack, label) {
    const p = pack || null, l = label || null;
    const barcode = (p && p.barcode) || (l && l.barcode) || '';
    const fromLabel = l && l.expiry && (l.expiryConfidence || 0) >= ((p && p.expiryConfidence) || 0);
    const withQty = [l, p].filter(x => x && x.qty).sort((a, b) => (b.qtyConfidence || 0) - (a.qtyConfidence || 0))[0];
    const name = (p && p.name) || (l && l.name) || '';
    const category = (p && p.category && p.category !== 'Altro') ? p.category
      : (l && l.category && l.category !== 'Altro') ? l.category : 'Altro';
    const keywords = [];
    for (const source of [l, p]) {
      for (const word of (source && source.keywords) || []) if (!keywords.includes(word)) keywords.push(word);
    }
    return {
      name,
      brand: (p && p.brand) || (l && l.brand) || '',
      barcode,
      expiry: fromLabel ? l.expiry : (p && p.expiry) || (l && l.expiry) || '',
      expirySource: fromLabel ? 'label' : (p && p.expiry ? 'pack' : ''),
      qty: withQty ? withQty.qty : null,
      unit: withQty ? withQty.unit : '',
      category,
      keywords: keywords.slice(0, 30),
      text: [p && p.text, l && l.text].filter(Boolean).join('\n'),
      pack: p, label: l
    };
  }

  // Parole chiave imparate al salvataggio: restano piccole e viaggiano nei backup.
  function learnFrom(signal) {
    const words = (signal && signal.keywords) || [];
    return words.filter(w => typeof w === 'string' && w.length >= 4 && w.length <= 20).slice(0, 20);
  }

  /*
   * Confronta il segnale con la dispensa e restituisce i candidati, dal più
   * probabile. Un prodotto senza codice e senza parole in comune non compare.
   */
  function rank(products, signal) {
    const results = [];
    if (!signal) return results;
    const wanted = String(signal.barcode || '').replace(/\s/g, '');
    const signalWords = new Set((signal.keywords || []).concat(keywordsOf(signal.name || '', 40)));
    for (const product of products || []) {
      const reasons = [];
      let score = 0;
      const storedCode = String(product.barcode || '').replace(/\s/g, '');
      if (wanted && storedCode && wanted === storedCode) {
        score = 1;
        reasons.push('barcode');
      }
      const nameScore = similarity(signal.name || '', product.name);
      const productWords = new Set(keywordsOf(product.name, 20).concat((product.scan && product.scan.keywords) || []));
      let shared = 0;
      for (const word of signalWords) if (productWords.has(word)) shared++;
      const keywordScore = shared ? shared / Math.max(2, Math.min(6, signalWords.size)) : 0;
      if (nameScore >= NAME_MATCH) {
        score = Math.max(score, Math.min(0.98, 0.5 + 0.5 * nameScore));
        reasons.push('nome');
      }
      if (keywordScore >= 0.4) {
        score = Math.max(score, Math.min(0.94, 0.42 + 0.5 * Math.min(1, keywordScore)));
        if (!reasons.includes('nome')) reasons.push('etichetta');
        else reasons.push('etichetta');
      }
      if (reasons.length > 1) score = Math.min(0.99, score + 0.05);
      if (reasons.length && score >= MIN_SCORE) {
        results.push({
          product, score: Math.round(score * 1000) / 1000, reasons,
          nameScore: Math.round(nameScore * 1000) / 1000, keywordScore: Math.round(keywordScore * 1000) / 1000
        });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Valori proposti nel modulo "nuovo prodotto"; l'utente conferma o corregge.
  function draft(signal, fallback) {
    const base = fallback || {};
    const unit = truthy(signal && signal.unit);
    const brand = truthy(signal && signal.brand);
    return {
      name: truthy(signal && signal.name) || '',
      qty: signal && Number.isFinite(signal.qty) && signal.qty > 0 ? signal.qty : 1,
      unit: UNITS.includes(unit) ? unit : 'pz',
      min: base.min === undefined ? 1 : base.min,
      category: (signal && signal.category) || 'Altro',
      location: base.location || 'Dispensa',
      expiry: (signal && signal.expiry) || '',
      barcode: (signal && signal.barcode) || '',
      notes: brand ? brand : '',
      scan: { keywords: learnFrom(signal) }
    };
  }

  const api = {
    UNITS, parse, merge, rank, draft, learnFrom, similarity, keywordsOf, categoryOf,
    pickExpiry, pickQuantity, pickName, pickBrand, pickBarcode, smartTitle, brandCase, linesOf,
    NAME_MATCH, MIN_SCORE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrocyRecognize = api;
})(typeof window !== 'undefined' ? window : globalThis);
