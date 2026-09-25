/* Vitrine Le Helê — funções usadas pela vitrine e pelo painel */
(function () {
  const CFG = window.LEHELE || {};

  const configurado = () =>
    !!window.__MOCK_SUPABASE ||
    (!!CFG.SUPABASE_URL && !/SEU-PROJETO/.test(CFG.SUPABASE_URL) &&
     !!CFG.SUPABASE_ANON_KEY && !/COLE-AQUI/.test(CFG.SUPABASE_ANON_KEY));

  let cliente = null;
  function criarCliente() {
    if (cliente) return cliente;
    cliente = window.__MOCK_SUPABASE ||
      window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    return cliente;
  }

  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  // formato brasileiro sem depender do idioma do aparelho: R$ 1.234,50
  const brl = c => {
    if (c == null || c === "" || isNaN(c)) return "";
    const v = Math.round(Number(c)), neg = v < 0, a = Math.abs(v);
    const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + "R$ " + int + "," + String(a % 100).padStart(2, "0");
  };
  const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
  const mesAno = (d = new Date()) => `${MESES[d.getMonth()]} · ${d.getFullYear()}`;
  const catOf = p => (p.categoria || "").trim();
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  function rankCat(cfg, c) {
    if (!c) return Infinity;
    const i = ((cfg && cfg.ordemCats) || []).findIndex(x => norm(x) === norm(c));
    return i >= 0 ? i : 100000;
  }
  const ordenarCats = (cfg, cats) => [...cats].sort((a, b) => (rankCat(cfg, a) - rankCat(cfg, b)) || a.localeCompare(b, "pt-BR"));
  function ordenar(cfg, pecas) {
    return [...pecas].sort((a, b) => {
      const ca = catOf(a), cb = catOf(b);
      const r = rankCat(cfg, ca) - rankCat(cfg, cb);
      if (r) return r;
      return (ca || "￿").localeCompare(cb || "￿", "pt-BR") || (a.criadoEm || 0) - (b.criadoEm || 0);
    });
  }

  function whatsLink(num, msg) {
    let d = String(num || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.length <= 11) d = "55" + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
  }

  const rowToPeca = r => ({
    id: r.id, nome: r.nome || "", codigo: r.codigo || "", categoria: r.categoria || "", banho: r.banho || "",
    valor: r.valor == null ? null : Number(r.valor), descricao: r.descricao || "",
    fotos: Array.isArray(r.fotos) ? r.fotos.filter(f => f && (f.full || f.thumb)) : [],
    arquivada: !!r.arquivada, criadoEm: Date.parse(r.criado_em) || 0, atualizadoEm: Date.parse(r.atualizado_em) || 0
  });
  const pecaToRow = d => ({
    nome: d.nome, codigo: d.codigo || "", categoria: d.categoria || "", banho: d.banho || "",
    valor: d.valor == null ? null : Math.round(d.valor), descricao: d.descricao || "",
    fotos: (d.fotos || []).map(f => Object.assign({ full: f.full, thumb: f.thumb || f.full }, f.w && f.h ? { w: f.w, h: f.h } : {})),
    arquivada: !!d.arquivada,
    criado_em: new Date(d.criadoEm || Date.now()).toISOString(),
    atualizado_em: new Date().toISOString()
  });
  const rowToConfig = r => ({
    colecao: (r && r.colecao) || "", whatsapp: (r && r.whatsapp) || "", instagram: (r && r.instagram) || "",
    ordemCats: (r && Array.isArray(r.ordem_cats)) ? r.ordem_cats : [], atualizadoEm: r ? Date.parse(r.atualizado_em) || 0 : 0
  });
  const configToRow = c => ({
    colecao: c.colecao || "", whatsapp: c.whatsapp || "", instagram: c.instagram || "",
    ordem_cats: c.ordemCats || [], atualizado_em: new Date().toISOString()
  });

  function fotoURL(path) {
    if (!path) return "";
    return criarCliente().storage.from("fotos").getPublicUrl(path).data.publicUrl;
  }

  window.LH = { CFG, configurado, criarCliente, esc, brl, mesAno, catOf, norm, rankCat, ordenarCats, ordenar, whatsLink, rowToPeca, pecaToRow, rowToConfig, configToRow, fotoURL };
})();
