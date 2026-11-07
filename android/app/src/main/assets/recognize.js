/*
 * Riconoscimento del prodotto dalle due foto:
 *   Foto 1 (pack):   fronte confezione -> nome prodotto, marca, categoria, luogo consigliato
 *   Foto 2 (label/expiry): retro/tappo -> data di scadenza (ed eventuale codice/peso)
 *
 * Tutte le funzioni sono pure e senza accesso al DOM, testabili in Node.
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

  const STOPWORDS = new Set(['DELLA', 'DELLE', 'DELLO', 'DEGLI', 'CON', 'PER', 'DEL', 'DEI', 'AL', 'ALLA', 'ALLE',
    'NELLA', 'NELLE', 'PRODOTTO', 'PRODOTTI', 'ITALIA', 'ITALIANO', 'ITALIANA', 'INGREDIENTI', 'INGREDIENTE',
    'VALORI', 'MEDI', 'MEDIO', 'ENERGIA', 'CONSERVARE', 'CONSUMARSI', 'PREFERIBILMENTE', 'SCADENZA', 'ENTRO',
    'PESO', 'NETTO', 'NETTA', 'CONFEZIONATO', 'STABILIMENTO', 'SOCIETA', 'QUESTO', 'QUESTA', 'DOPO', 'APERTURA',
    'LUOGO', 'FRESCO', 'ASCIUTTO', 'FORMATO', 'CONTENUTO', 'TOTALE', 'SENZA', 'CONSIGLIATO', 'USO', 'MAGGIORE',
    'MINORE', 'OGNI', 'SERVIRE', 'FREDDO', 'CUOCERE', 'COTTURA', 'MINUTI', 'PARTE', 'ALTRO', 'FINE', 'BUONO',
    'DICHIARAZIONE', 'NUTRIZIONALE', 'ALLERGENI', 'SMALTIMENTO', 'RICICLA', 'RACCOLTA', 'DIFFERENZIATA',
    'CONFEZIONE', 'MARCHIO', 'PROPRIETARIO', 'RISERVATI', 'DIRITTI', 'DEPOSITATO', 'BREVETTO',
    'KCAL', 'CODICE', 'BARRE', 'EAN', 'GRASSI', 'PROTEINE', 'CARBOIDRATI', 'ZUCCHERI', 'DICHIARATI', 'MEDIA',
    'PORZIONE', 'PORZIONI', 'CONFEZIONI', 'VETRO', 'PLASTICA', 'CARTA', 'UMIDO', 'SECCO', 'LOTTO']);

  const CATEGORY_WORDS = [
    ['Surgelati', /\b(SURGELAT\w*|CONGELAT\w*|GELAT[OI]|GHIACCIOL\w*|SOFFICINI|BASTONCINI|MINESTRONE SURGELATO)\b/],
    ['Latticini e uova', /\b(LATTE|LATTICINI|YOGURT|YOGHURT|KEFIR|PANNA|BURRO|FORMAGGI\w*|PARMIGIANO|GRANA|PECORINO|MOZZARELLA|BURRATA|STRACCIATELLA|RICOTTA|UOVA|UOVO|MASCARPONE|STRACCHINO|CRESCENZA|ROBIOLA|GORGONZOLA|PROVOLA|SCAMORZA|ASIAGO|FONTINA|TALEEGIO|TALEGGIO|CACIOTTA|BRIE|CAMEMBERT|FETA|FIOCCHI DI LATTE|SOTTILETTE|PHILADELPHIA|CERTOSA|PRIMO SALE|PRIMOSALE)\b/],
    ['Pasta e cereali', /\b(PASTA|SPAGHETTI|SPAGHETTINI|BUCATINI|LINGUINE|TAGLIATELLE|FETTUCCINE|PAPPARDELLE|LASAGNE|CANNELLONI|PENNE|PENNETTE|RIGATONI|TORTIGLIONI|MACCHERONI|SEDANINI|MEZZE MANICHE|FUSILLI|FARFALLE|CONCHIGLIE|ORECCHIETTE|PACCHERI|TROFIE|PASTINA|STELLINE|DITALINI|RISO|CARNAROLI|ARBORIO|BASMATI|FARINA|SEMOLA|PANE|PANBAULETTO|PANCARRE|TRAMEZZINI|PIADINA|FOCACCIA|TARALLI|FRISELLE|CROSTINI|PANGATTATO|PANGRATTATO|BISCOTT\w*|FROLLINI|GOCCIOLE|MACINE|SAVOIARDI|WAFER|CORNETTI|BRIOCHE|CROISSANT|MERENDIN\w*|PLUMCAKE|TORTA|CEREALI|MUESLI|AVENA|FETTE BISCOTTATE|GRISSINI|ORZO|FARRO|QUINOA|COUS\s*COUS|COUS|MAIS|POLENTA|CRACKER|CRACKERS|GALLETTE|PIZZA|GNOCCHI|TORTELLINI|TORTELLONI|RAVIOLI|AGNOLOTTI|CAPPELLETTI)\b/],
    ['Carne e pesce', /\b(POLLO|MANZO|BOVINO|VITELLO|MAIALE|SUINO|TACCHINO|CONIGLIO|AGNELLO|HAMBURGER|SVIZZERA|POLPETTE|COTOLETTA|COTOLETTE|WURSTEL|PROSCIUTTO|SALAME|SALSICCIA|MORTADELLA|BRESAOLA|SPECK|PANCETTA|GUANCIALE|COPPA|CULATELLO|LONZA|PORCHETTA|AFFETTAT\w*|ARROSTO|TONNO|SALMONE|PESCE|GAMBERI|GAMBERETTI|MERLUZZO|PLATESSA|ORATA|BRANZINO|SPIGOLA|PESCE SPADA|CALAMARI|SEPPIE|POLPO|COZZE|VONGOLE|ACCIUGHE|ALICI|SGOMBRO|SARDINE|SURIMI|BASTONCINI DI PESCE)\b/],
    ['Bevande', /\b(SUCCO|SUCCHI|ACQUA|BIRRA|VINO|PROSECCO|SPUMANTE|ARANCIATA|LIMONATA|GAZZOSA|COLA|BIBITA|SPREMUTA|NETTARE|NECTAR|CHINOTTO|CEDRATA|TONICA|THE|TE FREDDO|TISANA|CAMOMILLA|CAFFE|ESPRESSO|ORZO SOLUBILE|CACAO|SCIROPPO|APERITIVO|BEVANDA|AVENA DRINK|SOIA DRINK|MANDORLA DRINK)\b/],
    ['Verdura e frutta', /\b(INSALATA|LATTUGA|RUCOLA|VALERIANA|SONCINO|INDIVIA|RADICCHIO|POMODORI|POMODORIN\w*|CILIEGINO|DATTERINO|MELA|MELE|BANANA|BANANE|PATATE|PATATA|LIMONE|LIMONI|CAROTE|ZUCCHINE|MELANZANE|PEPERONI|CETRIOLI|CIPOLLA|CIPOLLE|AGLIO|SPINACI|BIETOLE|BROCCOLI|CAVOLFIORE|CAVOLO|VERZA|FINOCCHI|SEDANO|ASPARAGI|CARCIOFI|FUNGHI|ZUCCA|FRUTTA|VERDURA|ORTAGGI|MINESTRONE|ARANCIA|ARANCE|MANDARINI|CLEMENTINE|PERA|PERE|PESCA|PESCHE|ALBICOCCA|ALBICOCCHE|PRUGNE|SUSINE|UVA|FRAGOLE|MIRTILLI|LAMPONI|MORE|KIWI|ANANAS|AVOCADO|MELONE|ANGURIA|CILIEGIE)\b/],
    ['Conserve', /\b(PASSATA|PELATI|POLPA DI POMODORO|SUGO|PESTO|RAGU|CONCENTRATO|SOTTACETI|SOTTOLIO|GIARDINIERA|CAPPERI|OLIVE|MAIONESE|KETCHUP|SENAPE|SALSA|ACETO|GLASSA|BRODO|DADO|LEGUMI|FAGIOLI|BORLOTTI|CANNELLINI|CECI|LENTICCHIE|PISELLI|FAVE|MARMELLATA|CONFETTURA|COMPOSTA|CREMA SPALMABILE|NUTELLA|MIELE|ZUCCHERO|SALE|OLIO|PEPE|SPEZIE|ORIGANO|ROSMARINO|LIEVITO)\b/]
  ];

  const BRANDS = ['MUTTI', 'BARILLA', 'FERRERO', 'NUTELLA', 'KINDER', 'GRANAROLO', 'PARMALAT', 'GALBANI',
    'RIO MARE', 'FINDUS', 'BUITONI', 'DE CECCO', 'DIVINEA', 'SELECTO', 'MULINO BIANCO', 'ESSELUNGA', 'COOP',
    'CONAD', 'LAVAZZA', 'ILLY', 'SAN BENEDETTO', 'COCA-COLA', 'COCA', 'PEPSI', 'DANONE', 'ACTIVIA', 'YOPLAIT',
    'SANPELLEGRINO', 'LEVISSIMA', 'FAGE', 'ALPRO', 'CALVE', 'PONTI', 'HEINZ', 'KNORR', 'STAR', 'VITASNELLA',
    'PLASMON', 'NESTLE', 'MISURA', 'FERRARELLE', 'PANZANI', 'VOIELLO', 'GAROFALO', 'RUMMO', 'MOLINO', 'CIRIO',
    'LA DORIA', 'VALFRUTTA', 'BONDUELLE', 'OROGEL', 'AIA', 'AMADORI', 'BERETTA', 'ROVAGNATI', 'NEGRONI', 'CITTERIO',
    'NONNO NANNI', 'SANTA LUCIA', 'VALLELATA', 'STERILGARDA', 'ARBOREA', 'MULLER', 'VIPITENO', 'MILA', 'ZUEGG',
    'RIGONI DI ASIAGO', 'NOVI', 'LOACKER', 'BAULI', 'BALOCCO', 'PAVESI', 'GENTILINI', 'SCOTTI', 'GALLO',
    'MONINI', 'CARAPELLI', 'BERIO', 'DE SANTIS', 'RANA', 'EUROSPIN', 'LIDL', 'CARREFOUR', 'SELEX', 'DESPAR'];

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

  function smartTitle(text) {
    const flat = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
    return flat.charAt(0).toUpperCase() + flat.slice(1);
  }

  function brandCase(text) {
    const flat = String(text).replace(/\s+/g, ' ').trim();
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
      score += block.length > 1 ? 0.45 : 0;
      score -= block[0].index * 0.18;
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
      const upper = line.toUpperCase();
      const known = BRANDS.find(b => new RegExp(`(?:^|[^A-Z])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Z])`).test(upper));
      if (known) return brandCase(known);
    }
    return '';
  }

  const MONTHS = {
    GEN: 1, GENNAIO: 1, FEB: 2, FEBBRAIO: 2, FEBR: 2, MAR: 3, MARZO: 3, APR: 4, APRILE: 4,
    MAG: 5, MAGGIO: 5, GIU: 6, GIUGNO: 6, LUG: 7, LUGLIO: 7, AGO: 8, AGOSTO: 8,
    SET: 9, SETTEMBRE: 9, SEPT: 9, OTT: 10, OTTOBRE: 10, NOV: 11, NOVEMBRE: 11, DIC: 12, DICEMBRE: 12,
    JAN: 1, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, DEC: 12
  };
  const MONTH_NAMES_RE = /\b(?:(\d{1,2})\s*[/.\-\s]\s*)?(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE|GEN|FEB|FEBR|MAR|APR|MAG|GIU|LUG|AGO|SET|SEPT|OTT|NOV|DIC|JAN|MAY|JUN|JUL|AUG|SEP|OCT|DEC)\.?(?:\s*[/.\-\s]\s*(\d{2,4}))?\b/i;

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
    const s = String(raw).trim();
    const n = Number(s);
    if (s.length === 4) return n;
    if (s.length === 2) return n < 70 ? 2000 + n : 1900 + n;
    return NaN;
  }

  // Corregge scambi tipici dei timbri a getto d'inchiostro (O->0, I/l->1) solo dentro token simili a date.
  function fixDateDigits(line) {
    return String(line || '')
      .replace(/(?<=\d)[Oo](?=[\d/.\-\s]|$)/g, '0')
      .replace(/(?:^|(?<=[\s:/.\-]))[Oo](?=\d)/g, '0')
      .replace(/(?:^|(?<=[\s:/.\-]))[Il](?=\d[/.\-])/g, '1');
  }

  function inferYearForDayMonth(day, month, nowDate) {
    const ref = nowDate instanceof Date && !isNaN(nowDate) ? nowDate : new Date();
    const curYear = ref.getFullYear();
    let candidate = iso(curYear, month, day);
    if (!candidate) candidate = iso(curYear + 1, month, day);
    if (!candidate) return '';
    const diffDays = (Date.parse(candidate + 'T12:00:00Z') - ref.getTime()) / 86400000;
    if (diffDays < -60) {
      const next = iso(curYear + 1, month, day);
      if (next) return next;
    }
    return candidate;
  }

  function pickExpiry(lines, options) {
    const opts = options || {};
    const ref = opts.now ? new Date(opts.now) : new Date();
    const curYear = ref.getFullYear();
    const isExpiryShot = opts.role === 'expiry' || opts.role === 'label';
    const candidates = [];
    const KEY = /(SCAD|ENTRO|CONSUMARSI|PREFERIBIL|TMC|TERMINE MINIMO|DA USARE|DA CONSUMARE|EXP|BBE|BEST BEFORE)/i;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = fixDateDigits(rawLine);
      const before = (lines[i - 1] || '') + ' ' + rawLine;
      const after = (lines[i + 1] || '');
      const boost = KEY.test(rawLine) ? 3.1 : KEY.test(before) ? 2.9 : KEY.test(after) ? 1.5 : (isExpiryShot ? 0.5 : 0);
      let match;

      // 1) ISO: 2027-04-18 / 2027.04.18 / 2027/04/18
      if ((match = /(?<!\d)(20\d{2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?!\d)/.exec(line))) {
        const value = iso(Number(match[1]), Number(match[2]), Number(match[3]));
        if (value) { candidates.push({ value, weight: (boost ? boost : 1.5) }); continue; }
      }

      // 2) GG/MM/AAAA o GG/MM/AA (anche separati da punti, trattini o spazi sui timbri inkjet: "18 04 27")
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)/.exec(line))
        || (match = /(?<!\d)(\d{2})\s+(\d{2})\s+(20\d{2}|\d{2})(?!\d)/.exec(line))) {
        const day = Number(match[1]), month = Number(match[2]), year = expandYear(match[3]);
        const value = iso(year, month, day) || iso(year, day, month);
        if (value && year >= curYear - 2) {
          candidates.push({ value, weight: boost ? boost + 0.2 : 1.7 });
          continue;
        }
      }

      // 3) Giorno facoltativo + mese testuale + anno facoltativo ("18 APR 2027", "DIC 2028", "14 NOV")
      if ((match = MONTH_NAMES_RE.exec(line))) {
        const dayRaw = match[1] ? Number(match[1]) : 0;
        const monthKey = match[2].toUpperCase();
        const month = MONTHS[monthKey] || MONTHS[monthKey.slice(0, 3)];
        if (month) {
          if (match[3]) {
            const year = expandYear(match[3]);
            const day = dayRaw || lastDayOf(year, month);
            const value = iso(year, month, day);
            if (value) { candidates.push({ value, weight: boost ? boost + 0.1 : 1.3 }); continue; }
          } else if (dayRaw >= 1 && dayRaw <= 31 && (boost > 0 || isExpiryShot)) {
            const value = inferYearForDayMonth(dayRaw, month, ref);
            if (value) { candidates.push({ value, weight: boost ? boost - 0.1 : 1.1 }); continue; }
          }
        }
      }

      // 4) MM/AAAA o MM AAAA ("05/2027", "05.2027", "05 2027")
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-\s]\s*(20\d{2})(?!\d)/.exec(line))) {
        const month = Number(match[1]), year = Number(match[2]);
        const value = iso(year, month, lastDayOf(year, month));
        if (value) { candidates.push({ value, weight: boost ? boost + 0.1 : 1.6 }); continue; }
      }

      // 5) Due numeri: A/B o A.B -> distingue intelligentemente MM/AA ("03.27") da GG/MM dei freschi ("18/11", "10/11")
      if ((match = /(?<!\d)(\d{1,2})\s*[/.\-]\s*(\d{2})(?![/.\-\d])/.exec(line))) {
        const a = Number(match[1]), b = Number(match[2]);
        const yyMin = (curYear - 2) % 100;
        const yyMax = (curYear + 12) % 100;
        if (a >= 1 && a <= 12 && b >= yyMin && b <= yyMax) {
          // Es. "03.27" o "12/26" -> mese/anno a fine mese
          const year = 2000 + b;
          const value = iso(year, a, lastDayOf(year, a));
          if (value) candidates.push({ value, weight: boost ? boost - 0.1 : 1.1 });
        } else if (a >= 1 && a <= 31 && b >= 1 && b <= 12 && (a > 12 || 2000 + b < curYear - 2)) {
          // Es. "18/11" oppure "10/11" nel 2026 (non può essere novembre 2011 -> è 10 novembre!)
          if (!/\b(24\s*\/\s*24|100)\b/.test(line)) {
            const value = inferYearForDayMonth(a, b, ref);
            if (value) candidates.push({ value, weight: boost ? boost - 0.15 : (isExpiryShot ? 1.15 : 0.75) });
          }
        } else if (a >= 1 && a <= 12 && b > 12) {
          const year = expandYear(match[2]);
          const value = iso(year, a, lastDayOf(year, a));
          if (value) candidates.push({ value, weight: boost ? boost - 0.2 : 0.9 });
        }
      }
    }

    if (!candidates.length) return null;
    const limit = curYear + 12;
    const usable = candidates.filter(c => {
      const y = Number(c.value.slice(0, 4));
      return y >= curYear - 2 && y <= limit;
    });
    const pool = usable.length ? usable : candidates.filter(c => Number(c.value.slice(0, 4)) <= limit);
    if (!pool.length) return null;
    pool.sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value));
    return { value: pool[0].value, confidence: Math.min(0.97, 0.32 + pool[0].weight * 0.19) };
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
      if (/(PER|VALORI|MEDI|MEDIO|ENERGIA|KCAL|KJ|DI CUI|DICHIARATI?)\s*$/.test(before)) continue;
      const weighted = /(PESO|NETTO|NETTA|CONTENUTO|CONFEZIONE DA|E )/.test(before);
      candidates.push({ qty: raw, unit, weight: weighted ? 2.5 : 1, at: match.index });
    }
    const multipack = /(\d{1,2})\s*[x×]\s*\d{1,3}(?:[.,]\d{1,3})?\s*(?:g|gr|ml|cl)\b/i.exec(text);
    if (multipack) candidates.push({ qty: Number(multipack[1]), unit: 'pz', weight: 3.2, at: multipack.index });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.weight - a.weight || a.at - b.at);
    const best = candidates[0];
    if (best.unit === 'cl') return { qty: Math.round(best.qty * 10 * 1000) / 1000, unit: 'ml', confidence: 0.6 };
    if (!UNITS.includes(best.unit)) return null;
    return { qty: best.qty, unit: best.unit, confidence: best.weight >= 2 ? 0.8 : 0.5 };
  }

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
      patterns.push(/(?<!\d)(\d[\d ]{9,20}\d)(?!\d)/g);
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

  const NON_FOOD = /\b(DETERSIV|DETERGENT|SAPONE|SAPONETTA|AMMORBIDENTE|CANDEGGINA|DISINFETTANT|SHAMPOO|BAGNOSCHIUMA|DENTIFRICIO|DEODORANTE|PANNO|SPUGNA|SCOPOLIN|SACCHETTI|CANDELA|PILA|BATTERIA|CARTA IGIENICA|TOVAGLIOLI)\w*/;

  function categoryOf(text) {
    const upper = String(text || '').toUpperCase();
    if (NON_FOOD.test(upper)) return 'Altro';
    for (const [category, pattern] of CATEGORY_WORDS) {
      if (pattern.test(upper)) return category;
    }
    return 'Altro';
  }

  function locationOf(category, text) {
    const upper = String(text || '').toUpperCase();
    if (category === 'Surgelati' || /\b(SURGELAT|CONGELAT|FREEZER|-18\s*°?C)\w*/.test(upper)) return 'Congelatore';
    if (/\b(UHT|LUNGA CONSERVAZIONE|LUOGO FRESCO E ASCIUTTO|SCATOLA|ALL'OLIO|AL NATURALE)\b/.test(upper)
      && category !== 'Verdura e frutta') {
      return 'Dispensa';
    }
    if (/\b(FRIGORIFERO|PASTA FRESCA|SFOGLIA FRESCA|\+?\s*[0246]\s*°\s*C)\b/.test(upper)) return 'Frigorifero';
    if (category === 'Latticini e uova' || category === 'Carne e pesce' || category === 'Verdura e frutta') {
      return 'Frigorifero';
    }
    return 'Dispensa';
  }

  const truthy = value => (typeof value === 'string' && value.trim() ? value.trim() : '');

  function parse(text, options) {
    const opts = options || {};
    const checksum = typeof opts.checksum === 'function' ? opts.checksum : () => false;
    const role = opts.role || 'pack';
    const lines = linesOf(text);
    const joined = lines.join('\n');
    const expiry = pickExpiry(lines, { role, now: opts.now });
    const quantity = pickQuantity(joined.replace(/\n/g, ' '));
    const barcode = pickBarcode(joined, checksum);
    const name = pickName(lines);
    const brand = pickBrand(lines);
    const category = categoryOf(joined + ' ' + (name || ''));
    return {
      role,
      lines,
      name: truthy(name),
      brand,
      expiry: expiry ? expiry.value : '',
      expiryConfidence: expiry ? expiry.confidence : 0,
      qty: quantity ? quantity.qty : null,
      unit: quantity ? quantity.unit : '',
      qtyConfidence: quantity ? quantity.confidence : 0,
      barcode,
      category,
      location: locationOf(category, joined + ' ' + (name || '')),
      keywords: keywordsOf(joined + ' ' + (name || '') + ' ' + brand),
      text: joined
    };
  }

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

  const NAME_MATCH = 0.55;
  const MIN_SCORE = 0.6;

  function merge(pack, label) {
    const p = pack || null, l = label || null;
    const barcode = (p && p.barcode) || (l && l.barcode) || '';
    const fromLabel = l && l.expiry && (l.expiryConfidence || 0) >= ((p && p.expiryConfidence) || 0);
    const withQty = [p, l].filter(x => x && x.qty).sort((a, b) => (b.qtyConfidence || 0) - (a.qtyConfidence || 0))[0];
    const name = (p && p.name) || (l && l.name) || '';
    const brand = (p && p.brand) || (l && l.brand) || '';
    const category = (p && p.category && p.category !== 'Altro') ? p.category
      : (l && l.category && l.category !== 'Altro') ? l.category : 'Altro';
    const combinedText = [p && p.text, l && l.text].filter(Boolean).join('\n');
    const keywords = [];
    for (const source of [p, l]) {
      for (const word of (source && source.keywords) || []) if (!keywords.includes(word)) keywords.push(word);
    }
    return {
      name,
      brand,
      barcode,
      expiry: fromLabel ? l.expiry : (p && p.expiry) || (l && l.expiry) || '',
      expirySource: fromLabel ? 'label' : (p && p.expiry ? 'pack' : ''),
      qty: withQty ? withQty.qty : null,
      unit: withQty ? withQty.unit : '',
      category,
      location: locationOf(category, combinedText + ' ' + name),
      keywords: keywords.slice(0, 30),
      text: combinedText,
      pack: p,
      label: l
    };
  }

  function learnFrom(signal) {
    const words = (signal && signal.keywords) || [];
    return words.filter(w => typeof w === 'string' && w.length >= 4 && w.length <= 20).slice(0, 20);
  }

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
      const storedKw = (product.scan && product.scan.keywords) || product.keywords || [];
      const productWords = new Set(keywordsOf(product.name, 20).concat(storedKw));
      let shared = 0;
      for (const word of signalWords) if (productWords.has(word)) shared++;
      const keywordScore = shared ? shared / Math.max(2, Math.min(6, signalWords.size)) : 0;
      if (nameScore >= NAME_MATCH) {
        score = Math.max(score, Math.min(0.98, 0.5 + 0.5 * nameScore));
        reasons.push('nome');
      }
      if (keywordScore >= 0.4) {
        score = Math.max(score, Math.min(0.94, 0.42 + 0.5 * Math.min(1, keywordScore)));
        reasons.push('etichetta');
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

  function draft(signal, fallback) {
    const base = fallback || {};
    const unit = truthy(signal && signal.unit);
    const brand = truthy(signal && signal.brand);
    const category = (signal && signal.category) || 'Altro';
    const inferredLoc = (signal && signal.location) || locationOf(category, (signal && signal.text) || '');
    return {
      name: truthy(signal && signal.name) || '',
      qty: signal && Number.isFinite(signal.qty) && signal.qty > 0 ? signal.qty : 1,
      unit: UNITS.includes(unit) ? unit : 'pz',
      min: base.min === undefined ? 1 : base.min,
      category,
      location: base.location || inferredLoc || 'Dispensa',
      expiry: (signal && signal.expiry) || '',
      barcode: (signal && signal.barcode) || '',
      notes: brand ? brand : '',
      scan: { keywords: learnFrom(signal) }
    };
  }

  // Costruisce una query di ricerca pulita per Open Food Facts dal fronte della confezione.
  function searchQueryOf(signal) {
    if (!signal) return '';
    const parts = [];
    if (signal.brand) parts.push(signal.brand);
    if (signal.name) {
      const brandUp = (signal.brand || '').toUpperCase();
      const cleaned = signal.name.split(/\s+/).filter(w => !brandUp || !brandUp.includes(w.toUpperCase())).join(' ');
      if (cleaned) parts.push(cleaned);
    } else if (Array.isArray(signal.keywords) && signal.keywords.length) {
      parts.push(signal.keywords.slice(0, 3).map(smartTitle).join(' '));
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  }

  const api = {
    UNITS, parse, merge, rank, draft, learnFrom, similarity, keywordsOf, categoryOf, locationOf, searchQueryOf,
    pickExpiry, pickQuantity, pickName, pickBrand, pickBarcode, smartTitle, brandCase, linesOf,
    NAME_MATCH, MIN_SCORE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrocyRecognize = api;
})(typeof window !== 'undefined' ? window : globalThis);
