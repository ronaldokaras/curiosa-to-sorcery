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

  // Cabeçalhos para exportação
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
  let setsList = [];          // lista completa de cartas dos sets (array de objetos)
  let setsMap = new Map();    // chave "CardEN||SetEN" → objeto
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
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  /**
   * Gera o CSV de saída conforme o modo selecionado.
   * @param {Array} linhas - array de objetos (linhas finais com campos do CABECALHO_LIGA)
   * @param {string} modo - "minhas" ou "completos"
   * @returns {string} conteúdo CSV
   */
  function gerarCSVString(linhas, modo) {
    const ehCompleto = modo === "completos";
    const cabecalho = ehCompleto ? CABECALHO_COMPLETO : CABECALHO_SIMPLES;
    const lines = [cabecalho.map(csvEscape).join(",")];

    for (const row of linhas) {
      const cardName = row["Card (EN)"] || row["Card (PT)"] || "";
      const quantity = row["Quantidade"] ?? "";

      if (ehCompleto) {
        const set = row["Edicao (EN)"] || "";
        const finish = row["Extras"] || "";
        const product = row["Comentario"] || ""; // ou deixar vazio se não houver informação
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
  // CARREGAMENTO DOS SETS
  // ============================================================

  async function carregarSets(force = false) {
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
      } catch (_) {
        // localStorage pode estar cheio — ignora
      }

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
  // PROCESSAMENTO DO ARQUIVO DO USUÁRIO
  // ============================================================

  function processarArquivoUsuario(rows, colMap) {
    // Retorna um Map: chave "card||set" → array de { quantity, extras }
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

  // ============================================================
  // GERAÇÃO DAS LINHAS FINAIS
  // ============================================================

  function gerarLinhas(atualizacoes) {
    // Agora ambos os modos usam a mesma lógica: só as cartas do arquivo.
    const linhas = [];
    const processadas = new Set();
    const naoEncontradas = [];

    for (const [key, entradas] of atualizacoes.entries()) {
      const base = setsMap.get(key);

      if (base) {
        // Match com a base: enriquece os dados
        for (const entrada of entradas) {
          const nova = { ...base };
          nova["Quantidade"] = entrada.quantity;
          nova["Extras"] = entrada.extras;
          linhas.push(nova);
        }
        processadas.add(key);
      } else {
        // Sem match: gera linha básica com os dados do arquivo
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
      alert("Selecione um arquivo .csv");
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

  recarregarLink.addEventListener("click", async (e) => {
    e.preventDefault();
    setsCarregados = false;
    log("Recarregando bases dos sets...", "info");
    const ok = await carregarSets(true);
    if (ok) {
      log(`Bases recarregadas: ${setsTotal} cartas`, "ok");
    } else {
      log("Falha ao recarregar as bases", "err");
    }
  });

  // ============================================================
  // CONVERSÃO PRINCIPAL
  // ============================================================

  btnConvert.addEventListener("click", async () => {
    if (!curiosaFile) return;

    clearLog();
    resultArea.classList.add("visible");
    btnDownload.style.display = "none";
    statsEl.innerHTML = "";

    log("Lendo arquivo do Curiosa...", "info");

    const text = await curiosaFile.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      log("Arquivo vazio ou inválido.", "err");
      return;
    }

    const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
    log(`Colunas encontradas: ${headers.join(", ")}`, "info");

    const colMap = detectarColunas(headers);

    // Só exige card_name e quantity
    if (colMap.card_name === undefined) {
      log("Coluna obrigatória não encontrada: card name", "err");
      log("O CSV precisa ter pelo menos: card name e quantity", "warn");
      return;
    }
    if (colMap.quantity === undefined) {
      log("Coluna obrigatória não encontrada: quantity", "err");
      log("O CSV precisa ter pelo menos: card name e quantity", "warn");
      return;
    }

    log("Colunas essenciais OK", "ok");

    if (colMap.set === undefined) {
      log("Coluna 'set' não encontrada — match com bases ficará limitado", "warn");
    }
    if (colMap.finish === undefined) {
      log("Coluna 'finish' não encontrada — cartas serão tratadas como non-foil", "warn");
    }

    const modo = document.querySelector('input[name="modo"]:checked').value;

    // Carrega sets se necessário
    if (!setsCarregados) {
      log("Carregando bases dos sets...", "info");
      const ok = await carregarSets(false);
      if (!ok) {
        log("Não foi possível carregar as bases dos sets.", "err");
        log("Continuando sem enriquecimento dos sets...", "warn");
        // Não interrompe: ainda é possível converter sem as bases
      } else {
        log(`${setsTotal} cartas carregadas das bases`, "ok");
      }
    } else {
      log(`${setsTotal} cartas disponíveis nas bases`, "ok");
    }

    // Processa o arquivo do usuário
    const atualizacoes = processarArquivoUsuario(rows, colMap);
    log(`${atualizacoes.size} combinações únicas (carta + set) encontradas`, "ok");

    if (atualizacoes.size === 0) {
      log("Nenhuma carta válida encontrada no arquivo.", "err");
      return;
    }

    // Gera as linhas finais (somente as cartas do arquivo)
    const { linhas, processadas, naoEncontradas } = gerarLinhas(atualizacoes);

    if (linhas.length === 0) {
      log("Nenhuma linha gerada.", "err");
      return;
    }

    // Gera o CSV conforme o modo (apenas muda o formato das colunas)
    resultadoCSV = gerarCSVString(linhas, modo);

    // Estatísticas
    statsEl.innerHTML = `
      <div class="stat">
        <div class="stat-value">${processadas.size}</div>
        <div class="stat-label">Com match</div>
      </div>
      <div class="stat">
        <div class="stat-value">${naoEncontradas.length}</div>
        <div class="stat-label">Sem match</div>
      </div>
      <div class="stat">
        <div class="stat-value">${linhas.length}</div>
        <div class="stat-label">Linhas finais</div>
      </div>
    `;

    if (naoEncontradas.length > 0) {
      log(`${naoEncontradas.length} carta(s) sem match nas bases:`, "warn");
      naoEncontradas.slice(0, 30).forEach(k => {
        const [card, set] = k.split("||");
        log(`  • ${card}${set ? ` [${set}]` : ""}`, "warn");
      });
      if (naoEncontradas.length > 30) {
        log(`  ... e mais ${naoEncontradas.length - 30}`, "warn");
      }
    }

    log(`Conversão concluída — ${linhas.length} linhas geradas (formato ${modo === "completos" ? "completo" : "simples"})`, "ok");
    btnDownload.style.display = "inline-flex";
  });

  // ============================================================
  // DOWNLOAD
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
  // INIT
  // ============================================================

  carregarSets(false);
})();