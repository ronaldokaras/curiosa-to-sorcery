(function () {
  'use strict';

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const CABECALHO_LIGA = [
    "Edicao (PTBR)", "Edicao (EN)", "Edicao (Sigla)",
    "Card (PT)", "Card (EN)", "Quantidade",
    "Qualidade (M NM SP MP HP D)", "Idioma (BR EN DE ES FR IT JP KO RU TW)",
    "Raridade", "Cor (C D O E Y F R G L M P W)", "Extras",
    "Card #", "Comentario", "# Cards na Edicao"
  ];

  const CABECALHO_SIMPLES = ["card name", "quantity"];
  const CABECALHO_COMPLETO = ["card name", "set", "finish", "product", "quantity", "notes"];

  const MAPA_COLUNAS = {
    card_name: ["card name", "card_name", "name", "card", "cardname"],
    set: ["set", "edition", "expansion", "edicao", "set name"],
    finish: ["finish", "foil", "variant", "printing"],
    quantity: ["quantity", "qty", "count", "quantidade", "qtd"]
  };

  const SETS_BASE_URL = "sets/";
  const LIST_JSON = "list.json";
  const CACHE_KEY = "setsCache";
  const CACHE_VERSION = "v3";

  // ============================================================
  // ESTADO
  // ============================================================

  let curiosaFile = null;
  let setsList = [];
  let setsMap = new Map();
  let setsTotal = 0;
  let setsCarregados = false;
  let resultadoCSV = null;
  let carregandoSets = false;

  // ============================================================
  // DOM
  // ============================================================

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const filenameEl = document.getElementById('filename');
  const btnConvert = document.getElementById('btnConvert');
  const resultArea = document.getElementById('resultArea');
  const logEl = document.getElementById('log');
  const statsEl = document.getElementById('stats');
  const btnDownload = document.getElementById('btnDownload');
  const recarregarLink = document.getElementById('recarregarSets');

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  // Função auxiliar para tradução (usa a global window.t definida em i18n.js)
  function _(key, params) {
    return window.t ? window.t(key, params) : key;
  }

  function norm(s) {
    return (s || "").trim().toLowerCase();
  }

  function log(key, params = {}, type = "") {
    const line = document.createElement("div");
    if (type) line.className = type;
    line.textContent = _(key, params);
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    logEl.innerHTML = "";
  }

  function parseCSV(text) {
    // ... (exatamente igual ao original) ...
    const rows = [];
    let i = 0;
    const len = text.length;

    function readField() {
      let field = "";
      if (text[i] === '"') {
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += text[i++];
          }
        }
      } else {
        while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          field += text[i++];
        }
      }
      return field;
    }

    while (i < len) {
      const row = [];
      while (i < len) {
        row.push(readField());
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "\r") i++;
        if (text[i] === "\n") { i++; break; }
        break;
      }
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        rows.push(row);
      }
    }
    return rows;
  }

  function detectarColunas(headers) {
    // ... igual ...
    const headersNorm = {};
    headers.forEach((h, idx) => {
      headersNorm[norm(h)] = idx;
    });

    const map = {};
    for (const [key, possiveis] of Object.entries(MAPA_COLUNAS)) {
      for (const p of possiveis) {
        if (p in headersNorm) {
          map[key] = headersNorm[p];
          break;
        }
      }
    }
    return map;
  }

  function csvEscape(val) {
    // ... igual ...
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function gerarCSVString(linhas, modo) {
    // ... igual ...
    const ehCompleto = modo === "completos";
    const cabecalho = ehCompleto ? CABECALHO_COMPLETO : CABECALHO_SIMPLES;
    const lines = [cabecalho.map(csvEscape).join(",")];

    for (const row of linhas) {
      const cardName = row["Card (EN)"] || row["Card (PT)"] || "";
      const quantity = row["Quantidade"] ?? "";

      if (ehCompleto) {
        const set = row["Edicao (EN)"] || "";
        const finish = row["Extras"] || "";
        const product = row["Comentario"] || "";
        const notes = "";
        lines.push([
          csvEscape(cardName),
          csvEscape(set),
          csvEscape(finish),
          csvEscape(product),
          csvEscape(quantity),
          csvEscape(notes)
        ].join(","));
      } else {
        lines.push([csvEscape(cardName), csvEscape(quantity)].join(","));
      }
    }
    return lines.join("\n");
  }

  function criarLinhaVazia() {
    const obj = {};
    CABECALHO_LIGA.forEach(c => obj[c] = "");
    return obj;
  }

  // ============================================================
  // CARREGAMENTO DOS SETS (inalterado)
  // ============================================================

  async function carregarSets(force = false) {
    // ... exatamente igual ao original ...
    if (carregandoSets) return setsCarregados;
    carregandoSets = true;

    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.version === CACHE_VERSION && data.setsTotal > 0) {
            setsList = data.list || [];
            setsMap = new Map(Object.entries(data.map || {}));
            setsTotal = data.setsTotal;
            setsCarregados = true;
            carregandoSets = false;
            return true;
          }
        }
      } catch (_) {}
    }

    try {
      const respList = await fetch(SETS_BASE_URL + LIST_JSON);
      if (!respList.ok) throw new Error(`HTTP ${respList.status}`);
      const arquivos = await respList.json();

      if (!Array.isArray(arquivos) || arquivos.length === 0) {
        throw new Error("Nenhum arquivo listado em list.json");
      }

      const newList = [];
      const newMap = new Map();
      let total = 0;

      for (const nome of arquivos) {
        const resp = await fetch(SETS_BASE_URL + nome);
        if (!resp.ok) continue;

        const texto = await resp.text();
        const rows = parseCSV(texto);
        if (rows.length < 2) continue;

        const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
        const idxCard = headers.indexOf("Card (EN)");
        const idxSet = headers.indexOf("Edicao (EN)");
        if (idxCard === -1 || idxSet === -1) continue;

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const card = (row[idxCard] || "").trim();
          const set = (row[idxSet] || "").trim();
          if (!card || !set) continue;

          const obj = {};
          CABECALHO_LIGA.forEach((col) => {
            const idx = headers.indexOf(col);
            obj[col] = (idx >= 0 ? row[idx] : "").trim();
          });

          newList.push(obj);
          newMap.set(`${card}||${set}`, obj);
          total++;
        }
      }

      if (total === 0) throw new Error("Nenhuma carta válida encontrada nos sets");

      setsList = newList;
      setsMap = newMap;
      setsTotal = total;
      setsCarregados = true;

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          version: CACHE_VERSION,
          cachedAt: new Date().toLocaleString("pt-BR"),
          setsTotal: total,
          list: newList,
          map: Object.fromEntries(newMap)
        }));
      } catch (_) {}

      carregandoSets = false;
      return true;
    } catch (err) {
      console.error(err);
      setsCarregados = false;
      carregandoSets = false;
      return false;
    }
  }

  // ============================================================
  // PROCESSAMENTO (inalterado)
  // ============================================================

  function processarArquivoUsuario(rows, colMap) {
    // ... igual ...
    const atualizacoes = new Map();
    const temSet = colMap.set !== undefined;
    const temFinish = colMap.finish !== undefined;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const cardName = (row[colMap.card_name] || "").trim();
      if (!cardName) continue;

      const setName = temSet ? (row[colMap.set] || "").trim() : "";
      const finish = temFinish ? (row[colMap.finish] || "").trim() : "";
      const quantity = (row[colMap.quantity] || "1").trim() || "1";

      const extras = ["foil", "true", "1", "yes"].includes(norm(finish)) ? "Foil" : "";
      const key = `${cardName}||${setName}`;

      if (!atualizacoes.has(key)) {
        atualizacoes.set(key, []);
      }
      atualizacoes.get(key).push({ quantity, extras, cardName, setName });
    }
    return atualizacoes;
  }

  function gerarLinhas(atualizacoes) {
    // ... igual ...
    const linhas = [];
    const processadas = new Set();
    const naoEncontradas = [];

    for (const [key, entradas] of atualizacoes.entries()) {
      const base = setsMap.get(key);

      if (base) {
        for (const entrada of entradas) {
          const nova = { ...base };
          nova["Quantidade"] = entrada.quantity;
          nova["Extras"] = entrada.extras;
          linhas.push(nova);
        }
        processadas.add(key);
      } else {
        for (const entrada of entradas) {
          const nova = criarLinhaVazia();
          nova["Card (EN)"] = entrada.cardName;
          nova["Edicao (EN)"] = entrada.setName;
          nova["Quantidade"] = entrada.quantity;
          nova["Extras"] = entrada.extras;
          linhas.push(nova);
        }
        naoEncontradas.push(key);
      }
    }
    return { linhas, processadas, naoEncontradas };
  }

  // ============================================================
  // EVENTOS DE ARQUIVO
  // ============================================================

  function handleCuriosaFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert(_('alert.invalid_file'));
      return;
    }
    curiosaFile = file;
    filenameEl.textContent = file.name;
    dropzone.classList.add("has-file");
    btnConvert.disabled = false;
    resultArea.classList.remove("visible");
    resultadoCSV = null;
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      handleCuriosaFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) handleCuriosaFile(fileInput.files[0]);
  });

  // ============================================================
  // CONVERSÃO PRINCIPAL (com logs traduzidos)
  // ============================================================

  btnConvert.addEventListener("click", async () => {
    if (!curiosaFile) return;

    clearLog();
    resultArea.classList.add("visible");
    btnDownload.style.display = "none";
    statsEl.innerHTML = "";

    log('log.reading');

    const text = await curiosaFile.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      log('log.empty', {}, 'err');
      return;
    }

    const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
    log('log.columns', { cols: headers.join(", ") }, 'info');

    const colMap = detectarColunas(headers);

    if (colMap.card_name === undefined) {
      log('log.missing_card', {}, 'err');
      log('log.missing_columns', {}, 'warn');
      return;
    }
    if (colMap.quantity === undefined) {
      log('log.missing_quantity', {}, 'err');
      log('log.missing_columns', {}, 'warn');
      return;
    }

    log('log.columns_ok', {}, 'ok');

    if (colMap.set === undefined) {
      log('log.warn_set', {}, 'warn');
    }
    if (colMap.finish === undefined) {
      log('log.warn_finish', {}, 'warn');
    }

    const modo = document.querySelector('input[name="modo"]:checked').value;

    if (!setsCarregados) {
      log('log.loading_sets', {}, 'info');
      const ok = await carregarSets(false);
      if (!ok) {
        log('log.loading_error', {}, 'err');
        log('log.loading_continue', {}, 'warn');
      } else {
        log('log.loaded_sets', { total: setsTotal }, 'ok');
      }
    } else {
      log('log.available_sets', { total: setsTotal }, 'ok');
    }

    const atualizacoes = processarArquivoUsuario(rows, colMap);
    log('log.unique_combinations', { count: atualizacoes.size }, 'ok');

    if (atualizacoes.size === 0) {
      log('log.no_cards', {}, 'err');
      return;
    }

    const { linhas, processadas, naoEncontradas } = gerarLinhas(atualizacoes);

    if (linhas.length === 0) {
      log('log.no_lines', {}, 'err');
      return;
    }

    resultadoCSV = gerarCSVString(linhas, modo);

    // Estatísticas com tradução
    statsEl.innerHTML = `
      <div class="stat">
        <div class="stat-value">${processadas.size}</div>
        <div class="stat-label">${_('log.match_stats_label')}</div>
      </div>
      <div class="stat">
        <div class="stat-value">${naoEncontradas.length}</div>
        <div class="stat-label">${_('log.unmatched_label')}</div>
      </div>
      <div class="stat">
        <div class="stat-value">${linhas.length}</div>
        <div class="stat-label">${_('log.final_lines_label')}</div>
      </div>
    `;

    if (naoEncontradas.length > 0) {
      log('log.unmatched_list', { count: naoEncontradas.length }, 'warn');
      naoEncontradas.slice(0, 30).forEach(k => {
        const [card, set] = k.split("||");
        log(`  • ${card}${set ? ` [${set}]` : ""}`, {}, 'warn');
      });
      if (naoEncontradas.length > 30) {
        log('log.unmatched_more', { count: naoEncontradas.length - 30 }, 'warn');
      }
    }

    const modeLabel = modo === "completos" ? _('mode.complete') : _('mode.simple');
    log('log.conversion_done', { total: linhas.length, mode: modeLabel }, 'ok');
    btnDownload.style.display = "inline-flex";
  });

  // ============================================================
  // DOWNLOAD (inalterado)
  // ============================================================

  btnDownload.addEventListener("click", () => {
    if (!resultadoCSV) return;
    const blob = new Blob(["\uFEFF" + resultadoCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ligaSorcery.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ============================================================
  // RECARREGAR BASES
  // ============================================================

  recarregarLink.addEventListener("click", async (e) => {
    e.preventDefault();
    setsCarregados = false;
    log('log.reloading', {}, 'info');
    const ok = await carregarSets(true);
    if (ok) {
      log('log.reloaded', { total: setsTotal }, 'ok');
    } else {
      log('log.reload_failed', {}, 'err');
    }
  });

  // ============================================================
  // INIT
  // ============================================================

  carregarSets(false);
})();