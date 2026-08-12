// ============================================================
// INTERNACIONALIZAÇÃO
// ============================================================

const TRANSLATIONS = {
  pt: {
    // Interface
    'badge': 'Ferramenta da comunidade',
    'app.title': 'CSV Converter',
    'upload.title': 'ARQUIVO CSV',
    'upload.label': 'Arraste ou clique para selecionar',
    'mode.title': 'MODO DE CONVERSÃO',
    'mode.option1.label': 'Só as cartas que eu tenho',
    'mode.option1.desc': 'Gera apenas as cartas do seu CSV. Enriquece com dados dos sets quando possível. Recomendado para importar.',
    'mode.option2.label': 'Sets completos',
    'mode.option2.desc': 'Mantém todas as cartas das bases e atualiza as quantidades das que você possui.',
    'convert.button': 'Converter CSV',
    'download.button': 'Baixar ligaSorcery.csv',
    'footer.text': 'Feito para a comunidade Sorcery BR',
    'footer.reload': 'Recarregar bases',
    'mode.complete': 'completo',
    'mode.simple': 'simples',

    // Mensagens de log
    'log.reading': 'Lendo arquivo do Curiosa...',
    'log.empty': 'Arquivo vazio ou inválido.',
    'log.columns': 'Colunas encontradas: {cols}',
    'log.missing_card': 'Coluna obrigatória não encontrada: card name',
    'log.missing_quantity': 'Coluna obrigatória não encontrada: quantity',
    'log.missing_columns': 'O CSV precisa ter pelo menos: card name e quantity',
    'log.columns_ok': 'Colunas essenciais OK',
    'log.warn_set': 'Coluna \'set\' não encontrada — match com bases ficará limitado',
    'log.warn_finish': 'Coluna \'finish\' não encontrada — cartas serão tratadas como non-foil',
    'log.loading_sets': 'Carregando bases dos sets...',
    'log.loading_error': 'Não foi possível carregar as bases dos sets.',
    'log.loading_continue': 'Continuando sem enriquecimento dos sets...',
    'log.loaded_sets': '{total} cartas carregadas das bases',
    'log.available_sets': '{total} cartas disponíveis nas bases',
    'log.unique_combinations': '{count} combinações únicas (carta + set) encontradas',
    'log.no_cards': 'Nenhuma carta válida encontrada no arquivo.',
    'log.no_lines': 'Nenhuma linha gerada.',
    'log.match_stats_label': 'Com match',
    'log.unmatched_label': 'Sem match',
    'log.final_lines_label': 'Linhas finais',
    'log.unmatched_list': '{count} carta(s) sem match nas bases:',
    'log.unmatched_more': '... e mais {count}',
    'log.conversion_done': 'Conversão concluída — {total} linhas geradas (formato {mode})',
    'log.reloading': 'Recarregando bases dos sets...',
    'log.reloaded': 'Bases recarregadas: {total} cartas',
    'log.reload_failed': 'Falha ao recarregar as bases',
    'alert.invalid_file': 'Selecione um arquivo .csv',
  },
  en: {
    'badge': 'Community tool',
    'app.title': 'CSV Converter',
    'upload.title': 'CSV FILE',
    'upload.label': 'Drag or click to select',
    'mode.title': 'CONVERSION MODE',
    'mode.option1.label': 'Only the cards I have',
    'mode.option1.desc': 'Generates only the cards from your CSV. Enriches with set data when possible. Recommended for importing.',
    'mode.option2.label': 'Complete sets',
    'mode.option2.desc': 'Keeps all cards from the bases and updates quantities for the ones you own.',
    'convert.button': 'Convert CSV',
    'download.button': 'Download ligaSorcery.csv',
    'footer.text': 'Made for the Sorcery BR community',
    'footer.reload': 'Reload bases',
    'mode.complete': 'complete',
    'mode.simple': 'simple',

    'log.reading': 'Reading Curiosa file...',
    'log.empty': 'Empty or invalid file.',
    'log.columns': 'Columns found: {cols}',
    'log.missing_card': 'Required column not found: card name',
    'log.missing_quantity': 'Required column not found: quantity',
    'log.missing_columns': 'The CSV needs at least: card name and quantity',
    'log.columns_ok': 'Essential columns OK',
    'log.warn_set': 'Column \'set\' not found — match with bases will be limited',
    'log.warn_finish': 'Column \'finish\' not found — cards will be treated as non-foil',
    'log.loading_sets': 'Loading set bases...',
    'log.loading_error': 'Could not load set bases.',
    'log.loading_continue': 'Continuing without set enrichment...',
    'log.loaded_sets': '{total} cards loaded from bases',
    'log.available_sets': '{total} cards available in bases',
    'log.unique_combinations': '{count} unique combinations (card + set) found',
    'log.no_cards': 'No valid cards found in the file.',
    'log.no_lines': 'No lines generated.',
    'log.match_stats_label': 'Matched',
    'log.unmatched_label': 'Unmatched',
    'log.final_lines_label': 'Final lines',
    'log.unmatched_list': '{count} card(s) without match in bases:',
    'log.unmatched_more': '... and {count} more',
    'log.conversion_done': 'Conversion completed — {total} lines generated ({mode} mode)',
    'log.reloading': 'Reloading set bases...',
    'log.reloaded': 'Bases reloaded: {total} cards',
    'log.reload_failed': 'Failed to reload bases',
    'alert.invalid_file': 'Please select a .csv file',
  }
};

// Idioma atual (padrão: detecta navegador)
let currentLang = navigator.language?.startsWith('en') ? 'en' : 'pt';

// Função de tradução (exposta globalmente)
window.t = function(key, params = {}) {
  let text = TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['pt'][key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
};

// Aplica traduções nos elementos com data-i18n
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = window.t(key);
    // Se contiver HTML, usa innerHTML, senão textContent
    if (translation.includes('<')) {
      el.innerHTML = translation;
    } else {
      el.textContent = translation;
    }
  });
  document.documentElement.lang = currentLang;
}

// Função para mudar o idioma (exposta globalmente)
window.setLanguage = function(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  applyTranslations();
  // Opcional: recarregar a página ou atualizar logs, mas não faremos para não perder estado.
  // Se quiser, pode adicionar um evento para reaplicar traduções nos logs já gerados.
};

// Aplica traduções assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', applyTranslations);