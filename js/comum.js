/* Vitrine Le Helê — funções usadas pela vitrine e pelo painel */
(function () {
  const CFG = window.LEHELE || {};

  const configurado = () =>
    !!window.__MOCK_SUPABASE ||
    (!!CFG.SUPABASE_URL && !/SEU-PROJETO/.test(CFG.SUPABASE_URL) &&
     !!CFG.SUPABASE_ANON_KEY && !/COLE-AQUI/.test(CFG.SUPABASE_ANON_KEY));

  // "Manter conectado": com a opção ligada a sessão fica guardada no aparelho (localStorage);
  // desligada, só vale enquanto a página estiver aberta (sessionStorage).
  const manterConectado = () => { try { return localStorage.getItem("lehele-manter") !== "0"; } catch (e) { return true; } };
  const armazenamento = {
    getItem: k => { try { const v = localStorage.getItem(k); return v != null ? v : sessionStorage.getItem(k); } catch (e) { return null; } },
    setItem: (k, v) => {
      try {
        if (manterConectado()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
        else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
      } catch (e) { }
    },
    removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { } }
  };
  let cliente = null;
  function criarCliente() {
    if (cliente) return cliente;
    cliente = window.__MOCK_SUPABASE ||
      window.supabase.createClient(String(CFG.SUPABASE_URL).replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, ""), CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: armazenamento },
        // o pedido da sacolinha continua sendo enviado mesmo se o WhatsApp abrir por cima da vitrine
        global: { fetch: (u, o) => /\/rpc\/criar_pedido/.test(String(u)) ? fetch(u, Object.assign({}, o, { keepalive: true })).catch(() => fetch(u, o)) : fetch(u, o) }
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
    valorAntigo: r.valor_antigo == null ? null : Number(r.valor_antigo),
    fotos: Array.isArray(r.fotos) ? r.fotos.filter(f => f && (f.full || f.thumb)) : [],
    arquivada: !!r.arquivada, criadoEm: Date.parse(r.criado_em) || 0, atualizadoEm: Date.parse(r.atualizado_em) || 0,
    linha: r.linha === "ouro" ? "ouro" : "semijoias"
  });
  const pecaToRow = d => ({
    nome: d.nome, codigo: d.codigo || "", categoria: d.categoria || "", banho: d.banho || "",
    valor: d.valor == null ? null : Math.round(d.valor), descricao: d.descricao || "",
    ...(colunas.valorAntigo ? { valor_antigo: d.valorAntigo == null ? null : Math.round(d.valorAntigo) } : {}),
    fotos: (d.fotos || []).map(f => Object.assign({ full: f.full, thumb: f.thumb || f.full }, f.w && f.h ? { w: f.w, h: f.h } : {})),
    arquivada: !!d.arquivada,
    linha: d.linha === "ouro" ? "ouro" : "semijoias",
    criado_em: new Date(d.criadoEm || Date.now()).toISOString(),
    atualizado_em: new Date().toISOString()
  });
  const rowToConfig = r => ({
    colecao: (r && r.colecao) || "", whatsapp: (r && r.whatsapp) || "", instagram: (r && r.instagram) || "",
    ordemCats: (r && Array.isArray(r.ordem_cats)) ? r.ordem_cats : [], atualizadoEm: r ? Date.parse(r.atualizado_em) || 0 : 0,
    // peça escolhida como foto de destaque de cada linha (null = automático)
    destaques: (r && r.destaques && typeof r.destaques === "object") ? r.destaques : {},
    temDestaques: !!(r && "destaques" in r),
    // pagamento mostrado na vitrine (Pix com desconto e parcelas sem juros)
    pixDesconto: r && r.pix_desconto != null ? Number(r.pix_desconto) : 0,
    parcelasMax: r && r.parcelas_max != null ? Number(r.parcelas_max) : 0,
    parcelaMin: r && r.parcela_min != null ? Number(r.parcela_min) : 0,
    temPagamento: !!(r && "pix_desconto" in r)
  });
  const configToRow = c => Object.assign({
    colecao: c.colecao || "", whatsapp: c.whatsapp || "", instagram: c.instagram || "",
    ordem_cats: c.ordemCats || [], atualizado_em: new Date().toISOString()
  }, c.temDestaques ? { destaques: c.destaques || {} } : {},
    c.temPagamento ? { pix_desconto: Number(c.pixDesconto) || 0, parcelas_max: Math.max(0, Math.round(c.parcelasMax || 0)), parcela_min: Math.max(0, Math.round(c.parcelaMin || 0)) } : {});

  // linhas da vitrine (a ordem aqui é a ordem em que aparecem para a cliente)
  // colunas novas que só existem depois de rodar o SQL correspondente
  const colunas = { valorAntigo: false };

  // preço no Pix e parcelas sem juros, conforme os Ajustes
  function pagamento(cfg, valor) {
    if (valor == null) return null;
    const pix = cfg && cfg.pixDesconto > 0 ? Math.round(valor * (1 - cfg.pixDesconto)) : null;
    let n = 0;
    if (cfg && cfg.parcelasMax > 1) {
      n = cfg.parcelaMin > 0 ? Math.min(cfg.parcelasMax, Math.floor(valor / cfg.parcelaMin)) : cfg.parcelasMax;
      if (n < 2) n = 0;
    }
    return { pix, pixPct: cfg ? cfg.pixDesconto : 0, parcelas: n, parcela: n ? Math.ceil(valor / n) : null };
  }
  const pctTxt = x => String(+(x * 100).toFixed(1)).replace(".", ",") + "%";

  const LINHAS = [{ id: "semijoias", nome: "Semijoias" }, { id: "ouro", nome: "Ouro" }];
  const nomeLinha = id => (LINHAS.find(l => l.id === id) || LINHAS[0]).nome;

  function fotoURL(path) {
    if (!path) return "";
    return criarCliente().storage.from("fotos").getPublicUrl(path).data.publicUrl;
  }

  // CPF e WhatsApp (mesmas regras do banco)
  const soDig = t => String(t ?? "").replace(/\D/g, "");
  function cpfValido(c) {
    const d = soDig(c);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  // devolve 55 + DDD + número, ou null se não for um telefone do Brasil
  function whatsNormal(t) {
    let d = soDig(t);
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return null;
    if (+d.slice(0, 2) < 11) return null;
    if (d.length === 11 && d[2] !== "9") return null;
    return "55" + d;
  }
  const fmtCPF = c => { const d = soDig(c).slice(0, 11); return d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)}.${d.slice(3)}` : d.length <= 9 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`; };
  const fmtWhats = t => { let d = soDig(t); if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2); d = d.slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : ""; const n = d.slice(2); return `(${d.slice(0, 2)}) ${n.length > (d.length === 11 ? 5 : 4) ? n.slice(0, d.length === 11 ? 5 : 4) + "-" + n.slice(d.length === 11 ? 5 : 4) : n}`; };

  window.LH = { soDig, cpfValido, whatsNormal, fmtCPF, fmtWhats, colunas, pagamento, pctTxt, LINHAS, nomeLinha, CFG, configurado, criarCliente, manterConectado, esc, brl, mesAno, catOf, norm, rankCat, ordenarCats, ordenar, whatsLink, rowToPeca, pecaToRow, rowToConfig, configToRow, fotoURL };
})();
