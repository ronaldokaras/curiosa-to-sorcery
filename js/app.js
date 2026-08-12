(function () {
  'use strict';

  const CABECALHO_LIGA = [
    "Edicao (PTBR)", "Edicao (EN)", "Edicao (Sigla)",
    "Card (PT)", "Card (EN)", "Quantidade",
    "Qualidade (M NM SP MP HP D)", "Idioma (BR EN DE ES FR IT JP KO RU TW)",
    "Raridade", "Cor (C D O E Y F R G L M P W)", "Extras",
    "Card #", "Comentario", "# Cards na Edicao"
  ];

  const MAPA_COLUNAS = {
    card_name: ["card name", "card_name", "name", "card", "cardname"],
    set: ["set", "edition", "expansion", "edicao", "set name"],
    finish: ["finish", "foil", "variant", "printing"],
    quantity: ["quantity", "qty", "count", "quantidade", "qtd"]
  };

  const SETS_BASE_URL = "sets/";
  const LIST_JSON = "list.json";
  const CACHE_KEY = "setsCache";
  const CACHE_VERSION = "v2";

  let curiosaFile = null;
  let setsMap = new Map();
  let setsTotal = 0;
  let setsCarregados = false;
  let resultadoCSV = null;
  let linhasGeradas = [];
  let carregandoSets = false;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const filenameEl = document.getElementById('filename');
  const btnConvert = document.getElementById('btnConvert');
  const resultArea = document.getElementById('resultArea');
  const logEl = document.getElementById('log');
  const statsEl = document.getElementById('stats');
  const btnDownload = document.getElementById('btnDownload');
  const recarregarLink = document.getElementById('recarregarSets');

  function norm(s) {
    return (s || "").trim().toLowerCase();
  }

  function log(msg, type = "") {
    const line = document.createElement("div");
    if (type) line.className = type;
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    logEl.innerHTML = "";
  }

  function parseCSV(text) {
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
    const headersNorm = {};
    headers.forEach((h, idx) => { headersNorm[norm(h)] = idx; });
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
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function gerarCSVString(linhas) {
    const lines = [CABECALHO_LIGA.map(csvEscape).join(",")];
    for (const row of linhas) {
      lines.push(CABECALHO_LIGA.map(col => csvEscape(row[col] || "")).join(","));
    }
    return lines.join("\n");
  }

  async function carregarSets(force = false) {
    if (carregandoSets) return setsCarregados;
    carregandoSets = true;

    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.version === CACHE_VERSION && data.setsTotal > 0) {
            setsMap = new Map(Object.entries(data.map));
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
        throw new Error("Nenhum arquivo listado.");
      }

      let total = 0;
      const newMap = new Map();

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
          newMap.set(`${card}||${set}`, obj);
          total++;
        }
      }

      if (total === 0) throw new Error("Nenhuma carta válida encontrada.");

      setsMap = newMap;
      setsTotal = total;
      setsCarregados = true;

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          version: CACHE_VERSION,
          cachedAt: new Date().toLocaleString("pt-BR"),
          setsTotal: total,
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

  function handleCuriosaFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Selecione um arquivo .csv");
      return;
    }
    curiosaFile = file;
    filenameEl.textContent = file.name;
    dropzone.classList.add("has-file");
    btnConvert.disabled = false;
    resultArea.classList.remove("visible");
    resultadoCSV = null;
    linhasGeradas = [];
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

  recarregarLink.addEventListener("click", async (e) => {
    e.preventDefault();
    setsCarregados = false;
    await carregarSets(true);
  });

  btnConvert.addEventListener("click", async () => {
    if (!curiosaFile) return;

    clearLog();
    resultArea.classList.add("visible");
    btnDownload.style.display = "none";
    statsEl.innerHTML = "";
    log("Lendo arquivo...", "info");

    const text = await curiosaFile.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      log("Arquivo vazio ou inválido.", "err");
      return;
    }

    const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
    log(`Colunas: ${headers.join(", ")}`, "info");

    const colMap = detectarColunas(headers);
    const essenciais = ["card_name", "set", "finish", "quantity"];
    const faltando = essenciais.filter(k => colMap[k] === undefined);

    if (faltando.length) {
      log(`Colunas essenciais não encontradas: ${faltando.join(", ")}`, "err");
      log("O CSV precisa ter colunas como: card name, set, finish, quantity", "warn");
      return;
    }

    log(`Mapeamento OK`, "ok");

    const modo = document.querySelector('input[name="modo"]:checked').value;

    if (modo === "completo") {
      if (!setsCarregados) {
        log("Carregando bases dos sets...", "info");
        const ok = await carregarSets(false);
        if (!ok) {
          log("Não foi possível carregar os sets. Use o modo Simples.", "err");
          return;
        }
      }
      log(`${setsTotal} cartas disponíveis para match`, "ok");
    }

    const linhas = [];
    let matched = 0;
    let unmatched = 0;
    const unmatchedList = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const cardName = (row[colMap.card_name] || "").trim();
      const setName = (row[colMap.set] || "").trim();
      const finish = (row[colMap.finish] || "").trim();
      const quantity = (row[colMap.quantity] || "1").trim() || "1";

      if (!cardName || !setName) continue;

      const extras = ["foil", "true", "1", "yes"].includes(norm(finish)) ? "Foil" : "";

      if (modo === "completo" && setsCarregados) {
        const key = `${cardName}||${setName}`;
        const base = setsMap.get(key);
        if (base) {
          const nova = { ...base };
          nova["Quantidade"] = quantity;
          nova["Extras"] = extras;
          linhas.push(nova);
          matched++;
        } else {
          unmatched++;
          if (unmatchedList.length < 30) {
            unmatchedList.push(`${cardName} [${setName}]`);
          }
        }
      } else {
        const nova = {};
        CABECALHO_LIGA.forEach(c => nova[c] = "");
        nova["Edicao (EN)"] = setName;
        nova["Card (EN)"] = cardName;
        nova["Quantidade"] = quantity;
        nova["Extras"] = extras;
        linhas.push(nova);
        matched++;
      }
    }

    if (linhas.length === 0) {
      log("Nenhuma linha gerada. Verifique o conteúdo do CSV.", "err");
      return;
    }

    linhasGeradas = linhas;
    resultadoCSV = gerarCSVString(linhas);

    statsEl.innerHTML = `
      <div class="stat">
        <div class="stat-value">${matched}</div>
        <div class="stat-label">Convertidas</div>
      </div>
      <div class="stat">
        <div class="stat-value">${unmatched}</div>
        <div class="stat-label">Sem match</div>
      </div>
      <div class="stat">
        <div class="stat-value">${linhas.length}</div>
        <div class="stat-label">Linhas finais</div>
      </div>
    `;

    if (unmatched > 0) {
      log(`${unmatched} carta(s) não encontradas nos sets:`, "warn");
      unmatchedList.forEach(u => log(`  • ${u}`, "warn"));
      if (unmatched > unmatchedList.length) {
        log(`  ... e mais ${unmatched - unmatchedList.length}`, "warn");
      }
    }

    log(`Conversão concluída — ${linhas.length} linhas geradas`, "ok");
    btnDownload.style.display = "inline-flex";
  });

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

  // Carrega sets em background silenciosamente
  carregarSets(false);
})();