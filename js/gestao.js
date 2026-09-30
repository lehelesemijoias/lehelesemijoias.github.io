/* =========================================================
   LE HELÊ — GESTÃO
   Estoque, vendas, perdas, financeiro, precificação,
   fornecedores, tráfego pago e resumo (dashboard).
   Tudo salvo no Supabase, visível só para administradores.
   ========================================================= */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const { esc, brl, norm, catOf } = LH;

  const G = {
    pecas: [], custos: new Map(), forn: [], vendas: [], perdas: [], fin: [], traf: [], cfg: null,
    aba: "resumo", f: { ano: "", mes: "", canal: "", linha: "", regiao: "", pag: "" },
    busca: { estoque: "", vendas: "", perdas: "", fin: "" }, mesLista: { vendas: "", perdas: "", fin: "", traf: "" }
  };
  let sb = null;

  /* ---------- formatos ---------- */
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_L = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const milhar = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const pct = (x, casas = 1) => (x == null || !isFinite(x)) ? "—" : (x * 100).toFixed(casas).replace(".", ",") + "%";
  const pctIn = x => x == null ? "" : String(+(x * 100).toFixed(4)).replace(".", ",");
  const din = c => c == null ? "—" : brl(c);
  const dinCurto = c => {
    if (c == null) return "—";
    const v = c / 100, a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + "R$ " + (a / 1e6).toFixed(1).replace(".", ",") + " mi";
    if (a >= 1e4) return s + "R$ " + (a / 1e3).toFixed(1).replace(".", ",") + " mil";
    return brl(c);
  };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dataBR = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
  const anoDe = s => s ? +s.slice(0, 4) : 0;
  const mesDe = s => s ? +s.slice(5, 7) : 0;
  function parseDin(s) {
    s = String(s ?? "").replace(/[^\d,.-]/g, "");
    if (!s) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    const n = Math.round(parseFloat(s) * 100);
    return isFinite(n) ? n : null;
  }
  const dinIn = c => c == null ? "" : (c / 100).toFixed(2).replace(".", ",");
  const parsePct = s => { s = String(s ?? "").replace(",", ".").replace(/[^\d.-]/g, ""); if (!s) return null; const n = parseFloat(s) / 100; return isFinite(n) ? n : null; };
  const parseNum = s => { s = String(s ?? "").replace(",", ".").replace(/[^\d.-]/g, ""); if (!s) return null; const n = parseFloat(s); return isFinite(n) ? n : null; };
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------- parâmetros ---------- */
  const LISTAS_PADRAO = {
    canais: ["Instagram", "WhatsApp", "TikTok Shop", "Shopee", "Mercado Livre"],
    regioes: ["Nordeste", "Sudeste", "Sul", "Centro-Oeste", "Norte"],
    tiposPerda: ["Devolução com Reembolso", "Peça com Defeito", "Extravio/Perda", "Avaria no Transporte", "Furto", "Compra de Sócio", "Outro"],
    categoriasFin: ["Vendas", "Aporte de Capital", "Compra de Estoque", "Embalagens", "Tráfego Pago", "Taxas de Cartão", "Frete e Correios", "Ferramentas e Assinaturas", "Retirada de Lucro", "Outros"]
  };
  const PLANO_PADRAO = [
    { fase: "Pré-lançamento", periodo: "Dias 1-30", objetivo: "Nenhum — foco em fotos e catálogo", orcamento: 0 },
    { fase: "Fase 1 — Teste", periodo: "Dias 31-40", objetivo: "Tráfego / Mensagens", orcamento: 15000 },
    { fase: "Fase 2 — Otimização", periodo: "Dias 41-65", objetivo: "Conversão (criativo vencedor)", orcamento: 35000 },
    { fase: "Fase 3 — Escala", periodo: "Dias 66-90", objetivo: "Conversão (lookalike)", orcamento: 50000 }
  ];
  function lerCfg(r) {
    r = r || {};
    const l = r.listas || {};
    const lista = k => Array.isArray(l[k]) && l[k].length ? l[k] : LISTAS_PADRAO[k];
    const tx = (r.taxas && Object.keys(r.taxas).length) ? r.taxas : { "Pix": 0, "Dinheiro": 0, "Cartão de Débito": 0.0075, "Cartão de Crédito": 0.0269, "Cartão de Crédito Parcelado": 0.0899 };
    return {
      mult: r.multiplicador != null ? Number(r.multiplicador) : 2.75,
      mkt: r.taxa_marketplace != null ? Number(r.taxa_marketplace) : 0,
      emb: r.embalagem != null ? Number(r.embalagem) : 250,
      formaPreco: r.forma_taxa_preco || "Cartão de Crédito",
      taxas: comPix(tx),
      minimo: r.estoque_minimo != null ? Number(r.estoque_minimo) : 0,
      listas: { canais: lista("canais"), regioes: lista("regioes"), tiposPerda: lista("tiposPerda"), categoriasFin: lista("categoriasFin") },
      plano: Array.isArray(r.plano_trafego) && r.plano_trafego.length ? r.plano_trafego : PLANO_PADRAO
    };
  }
  // Pix é sempre uma forma de pagamento (e vem primeiro na lista)
  function comPix(t) { const o = { "Pix": Number((t || {}).Pix || 0) }; Object.keys(t || {}).forEach(k => { if (k !== "Pix") o[k] = t[k]; }); return o; }
  const cfgParaLinha = c => ({
    multiplicador: c.mult, taxa_marketplace: c.mkt, embalagem: c.emb, forma_taxa_preco: c.formaPreco,
    taxas: comPix(c.taxas), listas: c.listas, plano_trafego: c.plano, estoque_minimo: c.minimo, atualizado_em: new Date().toISOString()
  });
  const formas = () => [...Object.keys(G.cfg.taxas), "Marketplace"];
  const taxaDe = forma => forma === "Marketplace" ? G.cfg.mkt : Number(G.cfg.taxas[forma] || 0);
  const arred = x => Math.round(Math.round(x * 1e4) / 1e4); // evita 0,4999… virar para baixo
  const precoSugerido = custo => custo == null ? null : arred(custo * G.cfg.mult * (1 + G.cfg.mkt + taxaDe(G.cfg.formaPreco)) + G.cfg.emb);
  const custoDe = id => { const c = G.custos.get(id); return c && c.custo != null ? c.custo : null; };
  const qtdDe = id => { const c = G.custos.get(id); return c && c.quantidade != null ? c.quantidade : null; };
  // situação do estoque de uma peça: null = quantidade não informada
  const situacao = q => q == null ? null : q <= 0 ? "esgotada" : q <= G.cfg.minimo ? "acabando" : "ok";
  const un = q => q == null ? "—" : `${q} ${Math.abs(q) === 1 ? "unidade" : "unidades"}`;
  const pecaDe = id => G.pecas.find(p => p.id === id);
  const fornDe = id => G.forn.find(f => f.id === id);

  /* ---------- contas (as mesmas fórmulas da planilha) ---------- */
  function contaVenda(v) {
    const total = (v.quantidade || 0) * (v.preco_unit || 0);
    const custoT = v.custo_unit == null ? null : (v.quantidade || 0) * v.custo_unit;
    const taxa = Math.round(total * (Number(v.taxa_pct) || 0));
    const lucro = custoT == null ? null : total - custoT - taxa;
    return { total, custoT, taxa, lucro, margem: lucro == null || !total ? null : lucro / total };
  }
  function contaPerda(p) {
    const custoPerda = p.retorna ? 0 : (p.quantidade || 0) * (p.custo_unit || 0);
    const reemb = p.reembolso || 0;
    const taxa = p.reembolso ? Math.round(p.reembolso * (Number(p.taxa_pct) || 0)) : 0;
    return { custoPerda, reemb, taxa, prejuizo: custoPerda + reemb + taxa };
  }

  /* ---------- dados ---------- */
  async function carregar() {
    const q = (t, ord) => { let x = sb.from(t).select("*"); if (ord) x = x.order(ord, { ascending: true }); return x; };
    const rs = await Promise.all([
      q("pecas", "criado_em"), q("pecas_custos"), q("fornecedores", "criado_em"), q("vendas", "data"),
      q("perdas", "data"), q("financeiro", "data"), q("trafego", "data"), sb.from("gestao_config").select("*").eq("id", 1).maybeSingle()
    ]);
    const erro = rs.find(r => r.error);
    if (erro) throw erro.error;
    G.pecas = (rs[0].data || []).map(LH.rowToPeca);
    G.custos = new Map((rs[1].data || []).map(r => [r.peca_id, r]));
    G.forn = rs[2].data || [];
    G.vendas = rs[3].data || []; G.perdas = rs[4].data || []; G.fin = rs[5].data || []; G.traf = rs[6].data || [];
    G.cfg = lerCfg(rs[7].data);
  }
  async function gravar(tabela, id, linha) {
    if (id) { const { error } = await sb.from(tabela).update(linha).eq("id", id); if (error) throw error; return id; }
    const { data, error } = await sb.from(tabela).insert(linha).select("id").single();
    if (error) throw error; return data.id;
  }
  async function apagar(tabela, id) { const { error } = await sb.from(tabela).delete().eq("id", id); if (error) throw error; }
  async function salvarCusto(pecaId, custo, fornecedorId, quantidade) {
    const { error } = await sb.from("pecas_custos").upsert({ peca_id: pecaId, custo, fornecedor_id: fornecedorId || null, quantidade: quantidade ?? null, atualizado_em: new Date().toISOString() }, { onConflict: "peca_id" });
    if (error) throw error;
  }
  // soma/tira unidades do estoque (peça sem quantidade informada fica sem controle)
  async function mover(pecaId, delta) {
    if (!pecaId || !delta || qtdDe(pecaId) == null) return;
    const { error } = await sb.rpc("ajustar_estoque", { p_peca: pecaId, p_delta: delta });
    if (error) throw error;
    G.custos.get(pecaId).quantidade += delta;
  }
  async function salvarCfg() {
    const { error } = await sb.from("gestao_config").update(cfgParaLinha(G.cfg)).eq("id", 1);
    if (error) throw error;
  }
  async function recarregar() { try { await carregar(); desenhar(); } catch (e) { console.error(e); } }
  const falhou = e => { console.error(e); toast(/relation|does not exist|schema cache|PGRST20/i.test((e && (e.message || e.code)) || "") ? "Falta rodar o gestao.sql no Supabase." : "Não foi possível salvar. Verifique a internet."); };

  /* ---------- gráficos (barras em HTML; linhas e colunas em SVG) ---------- */
  function barras(itens, { fmt = dinCurto, vazio = "Sem dados no período.", max: lim = 10, foto = false } = {}) {
    itens = itens.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
    if (!itens.length) return `<p class="vazio-g">${esc(vazio)}</p>`;
    if (itens.length > lim) { const resto = itens.slice(lim - 1); itens = itens.slice(0, lim - 1).concat([{ rotulo: `Outros (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0) }]); }
    const max = Math.max(...itens.map(i => i.valor));
    return `<ul class="barras${foto ? " com-foto" : ""}">${itens.map(i => `<li data-tip="${esc(i.rotulo)} · ${esc(fmt(i.valor))}${i.sub ? " · " + esc(i.sub) : ""}">
      ${foto ? (i.foto ? `<img src="${esc(i.foto)}" alt="" loading="lazy">` : '<span class="semfoto"></span>') : ""}
      <span class="r">${esc(i.rotulo)}</span>
      <span class="v">${esc(fmt(i.valor))}</span>
      <span class="trilho"><i style="width:${Math.max(2, i.valor / max * 100).toFixed(1)}%"></i></span></li>`).join("")}</ul>`;
  }
  function barrasDuplas(itens, nomeA, nomeB, fmt = dinCurto) {
    const max = Math.max(1, ...itens.flatMap(i => [i.a, i.b]));
    return `<div class="legenda"><span><i class="s1"></i>${esc(nomeA)}</span><span><i class="s2"></i>${esc(nomeB)}</span></div>
      <ul class="barras duplas">${itens.map(i => `<li data-tip="${esc(i.rotulo)} · ${esc(nomeA)}: ${esc(fmt(i.a))} · ${esc(nomeB)}: ${esc(fmt(i.b))}">
        <span class="r">${esc(i.rotulo)}</span><span class="v">${esc(fmt(i.a))} <small>/ ${esc(fmt(i.b))}</small></span>
        <span class="trilho"><i class="s1" style="width:${(i.a / max * 100).toFixed(1)}%"></i></span>
        <span class="trilho"><i class="s2" style="width:${(i.b / max * 100).toFixed(1)}%"></i></span></li>`).join("")}</ul>`;
  }
  function escala(maxV, minV = 0) {
    const span = Math.max(1, maxV - minV), bruto = span / 4, p = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / p;
    const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    const lo = Math.floor(minV / passo) * passo, hi = Math.ceil(maxV / passo) * passo || passo;
    const ticks = []; for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(v);
    return { lo, hi, ticks };
  }
  // séries por mês (12 pontos), linhas finas com marcador no fim e dica ao passar o dedo
  function linhasMes(series, { fmt = dinCurto, colunas = false } = {}) {
    const W = 360, H = 190, L = 46, R = 10, T = 12, B = 26;
    const todos = series.flatMap(s => s.valores);
    if (!todos.some(v => v)) return `<p class="vazio-g">Sem dados no período.</p>`;
    const { lo, hi, ticks } = escala(Math.max(0, ...todos), Math.min(0, ...todos));
    const x = i => L + (W - L - R) * (colunas ? (i + 0.5) / 12 : i / 11);
    const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grade${t === 0 ? " zero" : ""}"/><text x="${L - 6}" y="${(y(t) + 3.5).toFixed(1)}" class="eixo" text-anchor="end">${esc(dinCurto(t * 1).replace("R$ ", ""))}</text>`).join("");
    g += MESES.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="eixo" text-anchor="middle">${m}</text>`).join("");
    let marcas = "";
    if (colunas) {
      const bw = ((W - L - R) / 12 - 4) / series.length;
      series.forEach((s, k) => s.valores.forEach((v, i) => {
        if (!v) return;
        const x0 = x(i) - (bw * series.length) / 2 + k * bw + 1, yv = y(v), y0 = y(0);
        marcas += `<rect class="${s.cls}" x="${x0.toFixed(1)}" y="${Math.min(yv, y0).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(1, Math.abs(y0 - yv)).toFixed(1)}" rx="2"/>`;
      }));
    } else {
      // meses depois do último com movimento (ex.: meses que ainda não chegaram) ficam sem linha
      let fim = 0; series.forEach(s => s.valores.forEach((v, i) => { if (v) fim = Math.max(fim, i); }));
      series.forEach(s => {
        const pts = s.valores.slice(0, fim + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        marcas += `<polyline class="ln ${s.cls}" points="${pts}"/>`;
        let ult = -1; s.valores.forEach((v, i) => { if (v) ult = i; });
        if (ult >= 0) marcas += `<circle class="pt ${s.cls}" cx="${x(ult).toFixed(1)}" cy="${y(s.valores[ult]).toFixed(1)}" r="4"/>`;
      });
    }
    const alvos = MESES.map((m, i) => `<rect class="alvo" x="${(x(i) - (W - L - R) / 24).toFixed(1)}" y="${T}" width="${((W - L - R) / 12).toFixed(1)}" height="${H - T - B}" data-tip="${esc(MESES_L[i])} · ${series.map(s => `${s.nome}: ${fmt(s.valores[i])}`).join(" · ")}"/>`).join("");
    const leg = series.length > 1 ? `<div class="legenda">${series.map(s => `<span><i class="${s.cls}"></i>${esc(s.nome)}</span>`).join("")}</div>` : "";
    return `${leg}<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.nome).join(" e "))} por mês">${g}${marcas}${alvos}</svg>`;
  }
  function linhaSaldo(pontos) {
    if (pontos.length < 2) return `<p class="vazio-g">${pontos.length ? "Lance mais uma movimentação para ver a linha do saldo." : "Sem movimentações ainda."}</p>`;
    const W = 360, H = 180, L = 46, R = 10, T = 12, B = 24;
    const vs = pontos.map(p => p.saldo), { lo, hi, ticks } = escala(Math.max(0, ...vs), Math.min(0, ...vs));
    const x = i => L + (W - L - R) * i / (pontos.length - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grade${t === 0 ? " zero" : ""}"/><text x="${L - 6}" y="${(y(t) + 3.5).toFixed(1)}" class="eixo" text-anchor="end">${esc(dinCurto(t).replace("R$ ", ""))}</text>`).join("");
    g += `<text x="${L}" y="${H - 6}" class="eixo">${dataBR(pontos[0].data)}</text><text x="${W - R}" y="${H - 6}" class="eixo" text-anchor="end">${dataBR(pontos[pontos.length - 1].data)}</text>`;
    const pts = pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(" ");
    const n = pontos.length - 1;
    const alvos = pontos.map((p, i) => `<rect class="alvo" x="${(x(i) - (W - L - R) / n / 2).toFixed(1)}" y="${T}" width="${((W - L - R) / n).toFixed(1)}" height="${H - T - B}" data-tip="${dataBR(p.data)} · saldo ${esc(din(p.saldo))}"/>`).join("");
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo de caixa ao longo do tempo">${g}<polyline class="ln s1" points="${pts}"/><circle class="pt s1" cx="${x(n).toFixed(1)}" cy="${y(pontos[n].saldo).toFixed(1)}" r="4"/>${alvos}</svg>`;
  }
  // dica flutuante para gráficos
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; document.body.appendChild(tip);
  function mostrarDica(e) {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.getAttribute("data-tip"); tip.hidden = false;
    const pt = e.touches ? e.touches[0] : e, w = tip.offsetWidth;
    tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, pt.clientX - w / 2)) + "px";
    tip.style.top = Math.max(8, pt.clientY - tip.offsetHeight - 14) + "px";
  }
  document.addEventListener("pointermove", mostrarDica);
  document.addEventListener("pointerdown", mostrarDica);
  document.addEventListener("scroll", () => tip.hidden = true, { passive: true });

  /* ---------- formulário genérico ---------- */
  let FM = null;
  function opcoesDe(c, vals) { return typeof c.opcoes === "function" ? c.opcoes(vals) : c.opcoes; }
  function campoHTML(c, v) {
    const id = "fm_" + c.k, req = c.obrig ? ' <span class="req">*</span>' : "";
    const lab = `<label for="${id}">${esc(c.rotulo)}${req}</label>`;
    const dica = c.dica ? `<p class="hint">${c.dica}</p>` : "";
    let inp = "";
    if (c.tipo === "lista") {
      const ops = opcoesDe(c, FM.vals);
      inp = `<select id="${id}">${c.vazio !== false ? `<option value="">${esc(c.vazio || "Escolher…")}</option>` : ""}${ops.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v ?? "") ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select>`;
    } else if (c.tipo === "seg") {
      return `<div class="field ${c.meia ? "meia" : ""}"><span class="lbl">${esc(c.rotulo)}${req}</span><div class="seg" role="radiogroup">${c.opcoes.map(o => `<label><input type="radio" name="${id}" value="${esc(o.v)}" ${String(o.v) === String(v) ? "checked" : ""}><span>${esc(o.t)}</span></label>`).join("")}</div>${dica}</div>`;
    } else if (c.tipo === "area") inp = `<textarea id="${id}" maxlength="500">${esc(v ?? "")}</textarea>`;
    else if (c.tipo === "data") inp = `<input id="${id}" type="date" value="${esc(v || "")}">`;
    else if (c.tipo === "dinheiro") inp = `<div class="money"><span>R$</span><input id="${id}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(dinIn(v))}"></div>`;
    else if (c.tipo === "pct") inp = `<div class="money sufixo"><input id="${id}" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(pctIn(v))}"><span>%</span></div>`;
    else if (c.tipo === "numero") inp = `<input id="${id}" inputmode="numeric" autocomplete="off" value="${esc(v ?? "")}">`;
    else inp = `<input id="${id}" autocomplete="off" maxlength="120" value="${esc(v ?? "")}" ${c.lista ? `list="dl_${c.k}"` : ""}>${c.lista ? `<datalist id="dl_${c.k}">${c.lista.map(o => `<option value="${esc(o)}">`).join("")}</datalist>` : ""}`;
    return `<div class="field ${c.meia ? "meia" : ""}">${lab}${inp}${dica}</div>`;
  }
  function lerCampo(c) {
    if (c.tipo === "seg") { const r = document.querySelector(`input[name="fm_${c.k}"]:checked`); return r ? r.value : null; }
    const el = $("#fm_" + c.k); if (!el) return null;
    const s = el.value;
    if (c.tipo === "dinheiro") return parseDin(s);
    if (c.tipo === "pct") return parsePct(s);
    if (c.tipo === "numero") { const n = parseNum(s); return n == null ? null : Math.round(n); }
    return s.trim();
  }
  function lerForm() { const o = {}; FM.campos.forEach(c => o[c.k] = lerCampo(c)); return o; }
  function desenharForm() {
    $("#fmCampos").innerHTML = FM.campos.map(c => campoHTML(c, FM.vals[c.k])).join("");
    atualizarCalc();
  }
  function atualizarCalc() {
    if (!FM.calcular) { $("#fmCalc").hidden = true; return; }
    const linhas = FM.calcular(Object.assign({}, FM.vals, lerForm()));
    $("#fmCalc").hidden = !linhas.length;
    $("#fmCalc").innerHTML = linhas.filter(Boolean).map(l => `<div class="${l.destaque ? "dest" : ""}${l.alerta ? " alerta" : ""}"><span>${esc(l.r)}</span><b>${esc(l.v)}</b></div>`).join("");
  }
  function abrirForm(o) {
    FM = Object.assign({ vals: {} }, o);
    $("#fmTitulo").textContent = o.titulo;
    $("#fmExtra").innerHTML = o.extra || ""; $("#fmExtra").hidden = !o.extra;
    desenharForm();
    rodapeForm();
    $("#fm").hidden = false; document.body.style.overflow = "hidden";
    $("#fmCampos").scrollTop = 0;
    if (o.aoAbrir) o.aoAbrir();
  }
  function rodapeForm() {
    $("#fmRodape").innerHTML = `${FM.excluir ? '<button class="btn danger" type="button" id="fmExcluir">Excluir</button>' : ""}<button class="btn primary" type="button" id="fmSalvar">${esc(FM.textoSalvar || "Salvar")}</button>`;
    if (FM.excluir) $("#fmExcluir").onclick = () => {
      $("#fmRodape").innerHTML = `<div class="confirm" style="flex:1">${esc(FM.textoExcluir || "Excluir este registro?")}</div><button class="btn ghost" id="fmNao" type="button">Manter</button><button class="btn primary" id="fmSim" type="button" style="flex:none;background:var(--danger);border-color:var(--danger);color:#fff">Excluir</button>`;
      $("#fmNao").onclick = rodapeForm;
      $("#fmSim").onclick = async () => { const f = FM; try { await f.excluir(); fecharForm(); await recarregar(); toast("Excluído"); } catch (e) { falhou(e); if (FM === f) rodapeForm(); } };
    };
    $("#fmSalvar").onclick = async () => {
      const v = Object.assign({}, FM.vals, lerForm());
      const falta = FM.campos.find(c => c.obrig && (v[c.k] == null || v[c.k] === ""));
      if (falta) { toast(`Preencha: ${falta.rotulo}`); const el = $("#fm_" + falta.k); if (el) el.focus(); return; }
      const b = $("#fmSalvar"), f = FM; b.disabled = true; b.textContent = "Salvando…";
      try { await f.salvar(v); fecharForm(); await recarregar(); toast(f.textoOk || "Salvo"); }
      catch (e) { falhou(e); b.disabled = false; b.textContent = f.textoSalvar || "Salvar"; }
    };
  }
  function fecharForm() { $("#fm").hidden = true; document.body.style.overflow = ""; FM = null; }
  $("#fmFechar").onclick = fecharForm;
  $("#fmCampos").addEventListener("input", e => {
    if (!FM) return;
    const c = FM.campos.find(c => e.target.id === "fm_" + c.k || e.target.name === "fm_" + c.k);
    if (c && FM.aoMudar) {
      const antes = Object.assign({}, FM.vals, lerForm());
      const muda = FM.aoMudar(c.k, antes);
      if (muda) { FM.vals = Object.assign(antes, muda); desenharForm(); return; }
    }
    atualizarCalc();
  });
  $("#fmCampos").addEventListener("change", e => { if (FM && e.target.tagName === "SELECT") $("#fmCampos").dispatchEvent(new Event("input", { bubbles: true })); });
  $("#fmCampos").addEventListener("blur", e => {
    const c = FM && FM.campos.find(c => e.target.id === "fm_" + c.k);
    if (c && c.tipo === "dinheiro") e.target.value = dinIn(parseDin(e.target.value));
  }, true);

  /* ---------- componentes ---------- */
  const kpi = (rot, val, sub = "", cls = "") => `<div class="kpi ${cls}"><span class="lbl">${esc(rot)}</span><b>${esc(val)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  const cartao = (titulo, corpo, sub = "") => `<section class="cartao"><div class="sec-t"><h3>${esc(titulo)}</h3>${sub ? `<span>${esc(sub)}</span>` : ""}</div>${corpo}</section>`;
  const fotoDe = p => { const f = p && p.fotos && p.fotos[0]; return f ? LH.fotoURL(f.thumb || f.full) : ""; };
  const opcoesPecas = () => {
    const ativas = G.pecas.filter(p => !p.arquivada), arq = G.pecas.filter(p => p.arquivada);
    const ord = a => a.slice().sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
    return [...ord(ativas), ...ord(arq)].map(p => ({ v: p.id, t: `${p.nome}${p.codigo ? " · " + p.codigo : ""}${p.arquivada ? " (arquivada)" : ""}` }));
  };
  const ops = arr => arr.map(x => ({ v: x, t: x }));
  const seletorMes = (lista, chave) => {
    const meses = [...new Set(lista.map(r => (r.data || "").slice(0, 7)).filter(Boolean))].sort().reverse();
    return `<select class="sel-mes" data-mes="${chave}" aria-label="Filtrar por mês"><option value="">Todos os meses</option>${meses.map(m => `<option value="${m}" ${G.mesLista[chave] === m ? "selected" : ""}>${MESES_L[+m.slice(5, 7) - 1]} de ${m.slice(0, 4)}</option>`).join("")}</select>`;
  };
  const noMes = (lista, chave) => G.mesLista[chave] ? lista.filter(r => (r.data || "").startsWith(G.mesLista[chave])) : lista;

  /* =========================================================
     ABAS
     ========================================================= */
  const ABAS = [
    { id: "resumo", nome: "Resumo" }, { id: "estoque", nome: "Estoque" }, { id: "vendas", nome: "Vendas" },
    { id: "perdas", nome: "Perdas" }, { id: "financeiro", nome: "Financeiro" }, { id: "precos", nome: "Preços" },
    { id: "fornecedores", nome: "Fornecedores" }, { id: "trafego", nome: "Tráfego" }
  ];
  const ACOES = {
    vendas: ["Nova venda", () => formVenda()], perdas: ["Nova perda", () => formPerda()], financeiro: ["Nova movimentação", () => formFin()],
    fornecedores: ["Novo fornecedor", () => formForn()], trafego: ["Nova campanha", () => formTraf()]
  };

  /* ---------- RESUMO ---------- */
  function vendasFiltradas() {
    const f = G.f;
    return G.vendas.filter(v => (!f.ano || anoDe(v.data) === +f.ano) && (!f.mes || mesDe(v.data) === +f.mes) && (!f.canal || v.canal === f.canal) &&
      (!f.linha || v.linha === f.linha) && (!f.regiao || v.regiao === f.regiao) && (!f.pag || v.pagamento === f.pag));
  }
  const noPeriodo = lista => lista.filter(r => (!G.f.ano || anoDe(r.data) === +G.f.ano) && (!G.f.mes || mesDe(r.data) === +G.f.mes));
  function abaResumo() {
    const f = G.f, anos = [...new Set([...G.vendas, ...G.fin, ...G.perdas, ...G.traf].map(r => anoDe(r.data)).filter(Boolean).concat([new Date().getFullYear()]))].sort();
    const sel = (k, rot, lista, todos = "Todos") => `<label class="filtro"><span>${rot}</span><select data-f="${k}">${`<option value="">${todos}</option>`}${lista.map(o => `<option value="${esc(o.v)}" ${String(f[k]) === String(o.v) ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select></label>`;
    const filtros = `<div class="filtros">
      ${sel("ano", "Ano", anos.map(a => ({ v: a, t: a })))}
      ${sel("mes", "Mês", MESES_L.map((m, i) => ({ v: i + 1, t: m })))}
      ${sel("canal", "Canal", ops(G.cfg.listas.canais))}
      ${sel("linha", "Linha", LH.LINHAS.map(l => ({ v: l.id, t: l.nome })), "Todas")}
      ${sel("regiao", "Região", ops(G.cfg.listas.regioes), "Todas")}
      ${sel("pag", "Pagamento", ops(formas()))}
    </div>`;
    const vs = vendasFiltradas(), cs = vs.map(v => ({ v, c: contaVenda(v) }));
    const receita = cs.reduce((s, x) => s + x.c.total, 0), lucro = cs.reduce((s, x) => s + (x.c.lucro || 0), 0);
    const taxas = cs.reduce((s, x) => s + x.c.taxa, 0), pecasV = vs.reduce((s, v) => s + (v.quantidade || 0), 0);
    const semCusto = vs.filter(v => v.custo_unit == null).length;
    const prej = noPeriodo(G.perdas).reduce((s, p) => s + contaPerda(p).prejuizo, 0);
    const finP = noPeriodo(G.fin), ent = finP.filter(r => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0), sai = finP.filter(r => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
    const trP = noPeriodo(G.traf), inv = trP.reduce((s, r) => s + (r.investido || 0), 0), recT = trP.reduce((s, r) => s + (r.receita || 0), 0);
    const ativasL = G.pecas.filter(p => !p.arquivada), ativas = ativasL.length;
    const unidades = ativasL.reduce((s, p) => s + Math.max(0, qtdDe(p.id) || 0), 0);
    const valorEst = ativasL.reduce((s, p) => s + Math.max(0, qtdDe(p.id) || 0) * (custoDe(p.id) || 0), 0);
    const nEsg = ativasL.filter(p => situacao(qtdDe(p.id)) === "esgotada").length, nAcab = ativasL.filter(p => situacao(qtdDe(p.id)) === "acabando").length;
    const periodo = (f.mes ? MESES_L[f.mes - 1] + " " : "") + (f.ano || (f.mes ? "(todos os anos)" : "todo o período"));
    const kpisV = `<div class="kpis k4">
      ${kpi("Receita total", din(receita))}
      ${kpi("Lucro líquido", din(lucro), "depois do custo e das taxas", lucro < 0 ? "neg" : "")}
      ${kpi("Margem média", pct(receita ? lucro / receita : null))}
      ${kpi("Ticket médio", din(vs.length ? Math.round(receita / vs.length) : null))}
      ${kpi("Peças vendidas", milhar(pecasV))}
      ${kpi("Nº de vendas", milhar(vs.length))}
      ${kpi("Taxas de maquininha", din(taxas))}
      ${kpi("Unidades em estoque", milhar(unidades), `${dinCurto(valorEst)} a preço de custo · agora`)}
    </div>${nEsg || nAcab ? `<p class="aviso-est"><span>${[nEsg ? `${nEsg} ${nEsg === 1 ? "peça esgotada" : "peças esgotadas"}` : "", nAcab ? `${nAcab} acabando` : ""].filter(Boolean).join(" · ")}</span><button class="linkbtn" type="button" data-ir="estoque">Ver no estoque</button></p>` : ""}${semCusto ? `<p class="aviso-s">${semCusto} ${semCusto === 1 ? "venda está" : "vendas estão"} sem custo da peça, então o lucro dela${semCusto === 1 ? "" : "s"} não entra na conta. Informe o custo em Estoque.</p>` : ""}`;
    const kpisO = `<div class="kpis k3">
      ${kpi("Prejuízo com perdas", din(prej))}
      ${kpi("Resultado após perdas", din(lucro - prej), "", lucro - prej < 0 ? "neg" : "")}
      ${kpi("Saldo de caixa do período", din(ent - sai), `entradas ${dinCurto(ent)} · saídas ${dinCurto(sai)}`, ent - sai < 0 ? "neg" : "")}
      ${kpi("Investido em tráfego", din(inv))}
      ${kpi("ROAS do tráfego", inv ? (recT / inv).toFixed(2).replace(".", ",") + "×" : "—", "receita gerada ÷ investido")}
    </div>`;
    // gráficos: mês a mês ignora o filtro de mês
    const baseMes = G.vendas.filter(v => (!f.ano || anoDe(v.data) === +f.ano) && (!f.canal || v.canal === f.canal) && (!f.linha || v.linha === f.linha) && (!f.regiao || v.regiao === f.regiao) && (!f.pag || v.pagamento === f.pag));
    const rm = Array(12).fill(0), lm = Array(12).fill(0);
    baseMes.forEach(v => { const c = contaVenda(v), m = mesDe(v.data) - 1; rm[m] += c.total; lm[m] += c.lucro || 0; });
    const finAno = G.fin.filter(r => !f.ano || anoDe(r.data) === +f.ano), em = Array(12).fill(0), sm = Array(12).fill(0);
    finAno.forEach(r => { (r.tipo === "entrada" ? em : sm)[mesDe(r.data) - 1] += r.valor; });
    const soma = (chave, rot) => { const m = new Map(); cs.forEach(({ v, c }) => { const k = chave(v) || "Não informado"; m.set(k, (m.get(k) || 0) + c.total); }); return [...m].map(([r, val]) => ({ rotulo: rot ? rot(r) : r, valor: val })); };
    const top = new Map(); cs.forEach(({ v, c }) => { const k = v.peca_id || v.peca_nome; const o = top.get(k) || { rotulo: v.peca_nome || "Peça", valor: 0, foto: fotoDe(pecaDe(v.peca_id)) }; o.valor += c.total; top.set(k, o); });
    return filtros + `<p class="nota">Período: ${esc(periodo)}. Perdas, financeiro e tráfego seguem só o ano e o mês.</p>` +
      cartao("Vendas", kpisV) + cartao("Resultado", kpisO) +
      cartao("Receita e lucro por mês", linhasMes([{ nome: "Receita", cls: "s1", valores: rm }, { nome: "Lucro", cls: "s2", valores: lm }]), f.ano ? String(f.ano) : "todos os anos") +
      `<div class="duas">` +
      cartao("Receita por canal", barras(soma(v => v.canal))) +
      cartao("Receita por linha", barras(soma(v => v.linha, r => LH.LINHAS.some(l => l.id === r) ? LH.nomeLinha(r) : r))) +
      cartao("Receita por forma de pagamento", barras(soma(v => v.pagamento))) +
      cartao("Receita por região", barras(soma(v => v.regiao))) +
      `</div>` +
      cartao("Top 10 peças por receita", barras([...top.values()], { foto: true })) +
      cartao("Fluxo de caixa — entradas × saídas", linhasMes([{ nome: "Entradas", cls: "s1", valores: em }, { nome: "Saídas", cls: "s2", valores: sm }], { colunas: true }), f.ano ? String(f.ano) : "todos os anos");
  }

  /* ---------- ESTOQUE ---------- */
  function abaEstoque() {
    const q = norm(G.busca.estoque), fe = G.fEst || "";
    const passa = p => !fe || (fe === "sem" ? qtdDe(p.id) == null : situacao(qtdDe(p.id)) === fe || (fe === "baixo" && situacao(qtdDe(p.id)) !== "ok" && qtdDe(p.id) != null));
    const lista = G.pecas.filter(p => (!q || norm(p.nome).includes(q) || norm(p.codigo).includes(q)) && passa(p) && (!fe || !p.arquivada))
      .sort((a, b) => (a.arquivada - b.arquivada) || a.nome.localeCompare(b.nome, "pt-BR"));
    const ativas = G.pecas.filter(p => !p.arquivada), comCusto = ativas.filter(p => custoDe(p.id) != null);
    const unidades = ativas.reduce((s, p) => s + Math.max(0, qtdDe(p.id) || 0), 0);
    const valorCusto = ativas.reduce((s, p) => s + Math.max(0, qtdDe(p.id) || 0) * (custoDe(p.id) || 0), 0);
    const valorVitrine = ativas.reduce((s, p) => s + Math.max(0, qtdDe(p.id) || 0) * (p.valor || 0), 0);
    const nEsg = ativas.filter(p => situacao(qtdDe(p.id)) === "esgotada").length, nAcab = ativas.filter(p => situacao(qtdDe(p.id)) === "acabando").length;
    const semQtd = ativas.filter(p => qtdDe(p.id) == null).length;
    const porCat = new Map(); ativas.forEach(p => { const c = catOf(p) || "Sem categoria"; porCat.set(c, (porCat.get(c) || 0) + 1); });
    const itens = lista.map(p => {
      const c = custoDe(p.id), sug = precoSugerido(c), fo = fornDe((G.custos.get(p.id) || {}).fornecedor_id);
      const mult = c && p.valor ? p.valor / c : null, qt = qtdDe(p.id), st = situacao(qt);
      return `<li class="reg com-qtd${p.arquivada ? " fora" : ""}" data-peca="${esc(p.id)}" tabindex="0" role="button">
        ${fotoDe(p) ? `<img src="${esc(fotoDe(p))}" alt="" loading="lazy">` : '<span class="semfoto"></span>'}
        <div class="meio"><b>${esc(p.nome)}</b><span>${esc([p.codigo, LH.nomeLinha(p.linha), catOf(p), p.arquivada ? "arquivada" : ""].filter(Boolean).join(" · "))}</span>
          <span>${fo ? esc(fo.nome) : '<em class="falta">sem fornecedor</em>'}</span>
          <span class="precos">${c == null ? '<em class="falta">sem custo</em>' : `custo <b>${esc(din(c))}</b>`}${sug != null ? ` · sugerido ${esc(din(sug))}` : ""}${p.valor != null ? ` · vitrine ${esc(din(p.valor))}${mult ? ` (${mult.toFixed(1).replace(".", ",")}×)` : ""}` : ""}</span></div>
        <div class="qtd ${st || "nc"}" title="${esc(qt == null ? "Quantidade não informada" : un(qt))}"><b>${qt == null ? "—" : esc(String(qt))}</b><small>${st === "esgotada" ? "esgotada" : st === "acabando" ? "acabando" : qt == null ? "sem qtd." : "em estoque"}</small></div></li>`;
    }).join("");
    const chip = (v, t, n) => `<button type="button" data-fest="${v}" aria-pressed="${fe === v}">${esc(t)}${n != null ? ` <b>${n}</b>` : ""}</button>`;
    return `<div class="kpis k3">${kpi("Unidades em estoque", milhar(unidades), "peças ativas")}${kpi("Valor em estoque", din(valorCusto), "a preço de custo")}${kpi("Valor de venda do estoque", din(valorVitrine), "a preço da vitrine")}${kpi("Esgotadas", milhar(nEsg), "peças ativas", nEsg ? "neg" : "")}${kpi("Acabando", G.cfg.minimo ? milhar(nAcab) : "—", G.cfg.minimo ? `${G.cfg.minimo} ${G.cfg.minimo === 1 ? "unidade" : "unidades"} ou menos` : "ligue o aviso na engrenagem", nAcab ? "alerta" : "")}${kpi("Sem custo informado", milhar(ativas.length - comCusto.length), "peças ativas", ativas.length - comCusto.length ? "alerta" : "")}</div>
      <p class="nota">As peças são as mesmas da vitrine; para cadastrar uma nova, use o painel. Aqui você informa custo, fornecedor e quantidade. <b>A quantidade só aparece aqui na gestão — a vitrine das clientes não mostra.</b> Ela baixa sozinha quando você lança uma venda ou uma perda.</p>
      ${cartao("Peças por categoria", barras([...porCat].map(([r, v]) => ({ rotulo: r, valor: v })), { fmt: n => milhar(n) + (n === 1 ? " peça" : " peças") }))}
      <div class="chips" role="group" aria-label="Filtrar estoque">${chip("", "Todas")}${chip("baixo", "Repor", nEsg + nAcab)}${chip("esgotada", "Esgotadas", nEsg)}${chip("acabando", "Acabando", nAcab)}${chip("sem", "Sem quantidade", semQtd)}</div>
      <div class="busca"><input type="search" data-busca="estoque" placeholder="Buscar por nome ou código" value="${esc(G.busca.estoque)}" aria-label="Buscar peça"></div>
      <ul class="regs">${itens || '<li class="vazio-g">Nenhuma peça encontrada.</li>'}</ul>`;
  }
  function formCusto(id) {
    const p = pecaDe(id), atual = G.custos.get(id) || {};
    abrirForm({
      titulo: "Estoque da peça",
      extra: `<div class="peca-topo">${fotoDe(p) ? `<img src="${esc(fotoDe(p))}" alt="">` : ""}<div><b>${esc(p.nome)}</b><span>${esc([p.codigo, LH.nomeLinha(p.linha), catOf(p)].filter(Boolean).join(" · "))}</span></div></div>`,
      campos: [
        { k: "quantidade", rotulo: "Quantidade", tipo: "numero", meia: true, dica: "Unidades em estoque. Só a gestão vê. Deixe vazio para não controlar." },
        { k: "custo", rotulo: "Custo unitário", tipo: "dinheiro", meia: true },
        { k: "fornecedor_id", rotulo: "Fornecedor", tipo: "lista", opcoes: () => G.forn.map(f => ({ v: f.id, t: f.nome })), vazio: "Sem fornecedor" }
      ],
      vals: { custo: atual.custo ?? null, fornecedor_id: atual.fornecedor_id || "", quantidade: atual.quantidade ?? null },
      calcular: v => {
        const sug = precoSugerido(v.custo);
        return v.custo == null ? [] : [
          { r: "Preço sugerido", v: din(sug), destaque: true },
          ...(v.quantidade != null ? [{ r: `Estoque a preço de custo (${un(v.quantidade)})`, v: din(Math.max(0, v.quantidade) * v.custo) }] : []),
          { r: `Conta: custo × ${String(G.cfg.mult).replace(".", ",")} + taxas + embalagem`, v: "" },
          { r: "Preço na vitrine hoje", v: din(p.valor) },
          { r: "Vitrine ÷ custo", v: p.valor ? (p.valor / v.custo).toFixed(2).replace(".", ",") + "×" : "—" }
        ];
      },
      salvar: v => salvarCusto(id, v.custo, v.fornecedor_id, v.quantidade),
      textoOk: "Peça salva",
      aoAbrir: () => {
        const box = document.createElement("div"); box.className = "acao-extra";
        box.innerHTML = `<button class="btn sm" type="button" id="usarSug">Usar o preço sugerido na vitrine</button><p class="hint">Troca o valor da peça na vitrine pelo preço sugerido. As clientes veem na hora.</p>`;
        $("#fmCalc").after(box);
        $("#usarSug").onclick = async () => {
          const v = lerForm(), sug = precoSugerido(v.custo);
          if (sug == null) { toast("Informe o custo primeiro."); return; }
          try {
            const { error } = await sb.from("pecas").update({ valor: sug, atualizado_em: new Date().toISOString() }).eq("id", id);
            if (error) throw error;
            await salvarCusto(id, v.custo, v.fornecedor_id, v.quantidade);
            fecharForm(); await recarregar(); toast(`Preço na vitrine: ${din(sug)}`);
          } catch (e) { falhou(e); }
        };
      }
    });
  }

  // linha do cálculo que mostra como o estoque da peça fica depois de salvar
  function estoqueDepois(pecaId, delta, desfazer) {
    if (!pecaId) return null;
    let q = qtdDe(pecaId);
    if (q == null) return { r: "Estoque", v: "quantidade não informada" };
    desfazer.forEach(([pid, d]) => { if (pid === pecaId) q += d; });
    const fica = q + delta;
    if (!delta) return { r: "Estoque", v: `${un(q)} (não muda)` };
    return { r: fica < 0 ? "Estoque — não há unidades suficientes" : "Estoque", v: `${q} → ${fica}`, alerta: fica < 0 || situacao(fica) !== "ok" };
  }

  /* ---------- VENDAS ---------- */
  function abaVendas() {
    const q = norm(G.busca.vendas);
    const lista = noMes(G.vendas, "vendas").filter(v => !q || norm(v.peca_nome).includes(q) || norm(v.canal).includes(q)).slice().sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.criado_em || "").localeCompare(a.criado_em || ""));
    const cs = lista.map(v => contaVenda(v));
    const tot = cs.reduce((s, c) => s + c.total, 0), luc = cs.reduce((s, c) => s + (c.lucro || 0), 0), tx = cs.reduce((s, c) => s + c.taxa, 0);
    const porCanal = new Map(); lista.forEach((v, i) => porCanal.set(v.canal || "Não informado", (porCanal.get(v.canal || "Não informado") || 0) + cs[i].total));
    const itens = lista.map((v, i) => { const c = cs[i]; return `<li class="reg" data-venda="${esc(v.id)}" tabindex="0" role="button">
      ${fotoDe(pecaDe(v.peca_id)) ? `<img src="${esc(fotoDe(pecaDe(v.peca_id)))}" alt="" loading="lazy">` : '<span class="semfoto"></span>'}
      <div class="meio"><b>${esc(v.quantidade > 1 ? v.quantidade + "× " : "")}${esc(v.peca_nome || "Peça")}</b><span>${esc([dataBR(v.data), v.canal, v.pagamento, v.regiao].filter(Boolean).join(" · "))}</span></div>
      <div class="dir"><b>${esc(din(c.total))}</b><small class="${c.lucro != null && c.lucro < 0 ? "neg" : ""}">${c.lucro == null ? "sem custo" : "lucro " + esc(din(c.lucro))}</small>${c.margem != null ? `<small>${esc(pct(c.margem))}</small>` : ""}</div></li>`; }).join("");
    return `<div class="kpis k3">${kpi("Total vendido", din(tot))}${kpi("Lucro líquido", din(luc), "", luc < 0 ? "neg" : "")}${kpi("Taxas de maquininha", din(tx))}${kpi("Ticket médio", din(lista.length ? Math.round(tot / lista.length) : null))}${kpi("Margem média", pct(tot ? luc / tot : null))}${kpi("Nº de vendas", milhar(lista.length))}</div>
      ${cartao("Vendas por canal", barras([...porCanal].map(([r, v]) => ({ rotulo: r, valor: v }))))}
      <div class="busca">${seletorMes(G.vendas, "vendas")}<input type="search" data-busca="vendas" placeholder="Buscar peça ou canal" value="${esc(G.busca.vendas)}" aria-label="Buscar venda"></div>
      <ul class="regs">${itens || `<li class="vazio-g">${G.vendas.length ? "Nenhuma venda encontrada." : "Nenhuma venda registrada ainda. Toque em “Nova venda”."}</li>`}</ul>`;
  }
  function formVenda(id) {
    const v0 = id ? G.vendas.find(v => v.id === id) : null;
    const ultimo = G.vendas.slice().sort((a, b) => (b.criado_em || "").localeCompare(a.criado_em || ""))[0] || {};
    abrirForm({
      titulo: v0 ? "Editar venda" : "Nova venda",
      campos: [
        { k: "data", rotulo: "Data", tipo: "data", obrig: true, meia: true },
        { k: "canal", rotulo: "Canal", tipo: "lista", obrig: true, meia: true, opcoes: () => ops(G.cfg.listas.canais) },
        { k: "peca_id", rotulo: "Peça", tipo: "lista", obrig: true, opcoes: opcoesPecas },
        { k: "quantidade", rotulo: "Quantidade", tipo: "numero", obrig: true, meia: true },
        { k: "preco_unit", rotulo: "Preço unitário", tipo: "dinheiro", obrig: true, meia: true, dica: "Vem da vitrine; mude se deu desconto." },
        { k: "pagamento", rotulo: "Forma de pagamento", tipo: "lista", obrig: true, meia: true, opcoes: () => formas().map(fm => ({ v: fm, t: `${fm} (${pct(taxaDe(fm), 2)})` })) },
        { k: "regiao", rotulo: "Região", tipo: "lista", meia: true, opcoes: () => ops(G.cfg.listas.regioes), vazio: "Não informada" },
        { k: "obs", rotulo: "Observações", tipo: "area" }
      ],
      vals: v0 ? Object.assign({}, v0) : { data: hoje(), quantidade: 1, canal: ultimo.canal || "", pagamento: ultimo.pagamento || "Pix", regiao: ultimo.regiao || "" },
      aoMudar: (k, v) => { if (k === "peca_id") { const p = pecaDe(v.peca_id); if (p && p.valor != null) return { preco_unit: p.valor }; } },
      calcular: v => {
        const mesmaPeca = v0 && v0.peca_id === v.peca_id, mesmaForma = v0 && v0.pagamento === v.pagamento;
        const custo = mesmaPeca && v0.custo_unit != null ? v0.custo_unit : custoDe(v.peca_id);
        const taxa = mesmaForma ? Number(v0.taxa_pct) : taxaDe(v.pagamento);
        if (!v.peca_id || !v.quantidade) return [];
        const c = contaVenda({ quantidade: v.quantidade, preco_unit: v.preco_unit || 0, custo_unit: custo, taxa_pct: taxa });
        const p = pecaDe(v.peca_id);
        return [
          { r: "Valor total", v: din(c.total), destaque: true },
          { r: "Custo unitário", v: custo == null ? "não informado" : din(custo) },
          { r: "Custo total", v: din(c.custoT) },
          { r: `Taxa da maquininha (${pct(taxa, 2)})`, v: din(c.taxa) },
          { r: "Lucro líquido", v: din(c.lucro), destaque: true },
          { r: "Margem", v: pct(c.margem) },
          { r: "Linha · categoria", v: p ? `${LH.nomeLinha(p.linha)} · ${catOf(p) || "—"}` : "—" },
          estoqueDepois(v.peca_id, -(v.quantidade || 0), v0 ? [[v0.peca_id, v0.quantidade]] : [])
        ];
      },
      salvar: async v => {
        const p = pecaDe(v.peca_id), mesmaPeca = v0 && v0.peca_id === v.peca_id, mesmaForma = v0 && v0.pagamento === v.pagamento;
        await gravar("vendas", id, {
          data: v.data, canal: v.canal, peca_id: v.peca_id || null, peca_nome: p ? p.nome : (v0 && v0.peca_nome) || "",
          linha: p ? p.linha : "semijoias", categoria: p ? catOf(p) : "", quantidade: v.quantidade, preco_unit: v.preco_unit || 0,
          custo_unit: mesmaPeca && v0.custo_unit != null ? v0.custo_unit : custoDe(v.peca_id),
          pagamento: v.pagamento, taxa_pct: mesmaForma ? Number(v0.taxa_pct) : taxaDe(v.pagamento), regiao: v.regiao || "", obs: v.obs || ""
        });
        if (v0) await mover(v0.peca_id, v0.quantidade || 0);   // desfaz a baixa antiga
        await mover(v.peca_id, -(v.quantidade || 0));
      },
      textoOk: v0 ? "Venda atualizada" : "Venda registrada",
      excluir: v0 ? async () => { await apagar("vendas", id); await mover(v0.peca_id, v0.quantidade || 0); } : null, textoExcluir: "Excluir esta venda? A peça volta para o estoque."
    });
  }

  /* ---------- PERDAS ---------- */
  function abaPerdas() {
    const lista = noMes(G.perdas, "perdas").slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const cs = lista.map(contaPerda), prej = cs.reduce((s, c) => s + c.prejuizo, 0), reemb = cs.reduce((s, c) => s + c.reemb, 0);
    const porTipo = new Map(); lista.forEach((p, i) => porTipo.set(p.tipo || "Outro", (porTipo.get(p.tipo || "Outro") || 0) + cs[i].prejuizo));
    const itens = lista.map((p, i) => `<li class="reg" data-perda="${esc(p.id)}" tabindex="0" role="button">
      ${fotoDe(pecaDe(p.peca_id)) ? `<img src="${esc(fotoDe(pecaDe(p.peca_id)))}" alt="" loading="lazy">` : '<span class="semfoto"></span>'}
      <div class="meio"><b>${esc(p.quantidade > 1 ? p.quantidade + "× " : "")}${esc(p.peca_nome || "Peça")}</b><span>${esc([dataBR(p.data), p.tipo, p.estoque_mov > 0 ? "voltou ao estoque" : p.estoque_mov < 0 ? "baixou do estoque" : ""].filter(Boolean).join(" · "))}</span></div>
      <div class="dir"><b class="neg">${esc(din(cs[i].prejuizo))}</b><small>prejuízo</small></div></li>`).join("");
    return `<div class="kpis k3">${kpi("Ocorrências", milhar(lista.length))}${kpi("Prejuízo total", din(prej))}${kpi("Reembolsado a clientes", din(reemb))}</div>
      ${cartao("Prejuízo por tipo", barras([...porTipo].map(([r, v]) => ({ rotulo: r, valor: v }))))}
      <div class="busca">${seletorMes(G.perdas, "perdas")}</div>
      <ul class="regs">${itens || '<li class="vazio-g">Nenhuma perda registrada.</li>'}</ul>`;
  }
  function formPerda(id) {
    const p0 = id ? G.perdas.find(p => p.id === id) : null;
    abrirForm({
      titulo: p0 ? "Editar perda" : "Nova perda",
      campos: [
        { k: "data", rotulo: "Data", tipo: "data", obrig: true, meia: true },
        { k: "tipo", rotulo: "Tipo de perda", tipo: "lista", obrig: true, meia: true, opcoes: () => ops(G.cfg.listas.tiposPerda) },
        { k: "peca_id", rotulo: "Peça", tipo: "lista", obrig: true, opcoes: opcoesPecas },
        { k: "quantidade", rotulo: "Quantidade", tipo: "numero", obrig: true, meia: true },
        { k: "retorna", rotulo: "Peça volta ao estoque?", tipo: "seg", meia: true, opcoes: [{ v: "nao", t: "Não" }, { v: "sim", t: "Sim" }] },
        { k: "reembolso", rotulo: "Valor reembolsado à cliente", tipo: "dinheiro", meia: true, dica: "Deixe vazio se não houve reembolso." },
        { k: "pagamento", rotulo: "Forma de pagamento da venda", tipo: "lista", meia: true, opcoes: () => formas().map(fm => ({ v: fm, t: fm })), vazio: "Não se aplica" },
        { k: "pedido", rotulo: "Pedido relacionado", tipo: "texto", meia: true },
        { k: "estoque_mov", rotulo: "Efeito no estoque", tipo: "seg", opcoes: [{ v: "-1", t: "Baixa" }, { v: "0", t: "Não mexe" }, { v: "1", t: "Devolve" }],
          dica: "Baixa: a peça saiu do estoque (defeito, extravio, furto, uso próprio). Devolve: voltou de uma cliente. Não mexe: já tinha saído na venda." },
        { k: "obs", rotulo: "Observações", tipo: "area" }
      ],
      vals: p0 ? Object.assign({}, p0, { retorna: p0.retorna ? "sim" : "nao", estoque_mov: String(p0.estoque_mov || 0) }) : { data: hoje(), quantidade: 1, retorna: "nao", estoque_mov: "-1" },
      aoMudar: (k, v) => { if (k === "tipo" || k === "retorna") return { estoque_mov: String(movPadrao(v.tipo, v.retorna === "sim")) }; },
      calcular: v => {
        if (!v.peca_id || !v.quantidade) return [];
        const custo = p0 && p0.peca_id === v.peca_id && p0.custo_unit != null ? p0.custo_unit : custoDe(v.peca_id);
        const c = contaPerda({ quantidade: v.quantidade, retorna: v.retorna === "sim", custo_unit: custo, reembolso: v.reembolso, taxa_pct: v.pagamento ? taxaDe(v.pagamento) : 0 });
        return [
          { r: "Custo unitário", v: custo == null ? "não informado" : din(custo) },
          { r: "Custo da perda", v: din(c.custoPerda) },
          { r: "Reembolso", v: din(c.reemb) },
          { r: "Taxa retida pela operadora", v: din(c.taxa) },
          { r: "Prejuízo total", v: din(c.prejuizo), destaque: true },
          estoqueDepois(v.peca_id, Number(v.estoque_mov || 0) * (v.quantidade || 0), p0 ? [[p0.peca_id, -(p0.estoque_mov || 0) * (p0.quantidade || 0)]] : [])
        ];
      },
      salvar: async v => {
        const p = pecaDe(v.peca_id), mov = Number(v.estoque_mov || 0);
        await gravar("perdas", id, {
          data: v.data, tipo: v.tipo, peca_id: v.peca_id || null, peca_nome: p ? p.nome : (p0 && p0.peca_nome) || "", quantidade: v.quantidade,
          retorna: v.retorna === "sim", custo_unit: p0 && p0.peca_id === v.peca_id && p0.custo_unit != null ? p0.custo_unit : custoDe(v.peca_id),
          reembolso: v.reembolso, pagamento: v.pagamento || "", taxa_pct: v.pagamento ? taxaDe(v.pagamento) : 0, pedido: v.pedido || "", obs: v.obs || "", estoque_mov: mov
        });
        if (p0) await mover(p0.peca_id, -(p0.estoque_mov || 0) * (p0.quantidade || 0));
        await mover(v.peca_id, mov * (v.quantidade || 0));
      },
      textoOk: "Perda salva",
      excluir: p0 ? async () => { await apagar("perdas", id); await mover(p0.peca_id, -(p0.estoque_mov || 0) * (p0.quantidade || 0)); } : null, textoExcluir: "Excluir este registro de perda? O estoque volta como estava."
    });
  }

  // sugestão de efeito no estoque conforme o tipo de perda
  function movPadrao(tipo, retorna) {
    if (retorna) return 1;
    if (/devolu/i.test(tipo || "")) return 0;
    return -1;
  }

  /* ---------- FINANCEIRO ---------- */
  function abaFinanceiro() {
    const ord = G.fin.slice().sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.criado_em || "").localeCompare(b.criado_em || ""));
    let saldo = 0; const comSaldo = ord.map(r => { saldo += r.tipo === "entrada" ? r.valor : -r.valor; return Object.assign({}, r, { saldo }); });
    const ent = G.fin.filter(r => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0), sai = G.fin.filter(r => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
    const visiveis = noMes(comSaldo, "fin").slice().reverse();
    const porCat = new Map(); noMes(G.fin, "fin").filter(r => r.tipo === "saida").forEach(r => porCat.set(r.categoria || "Outros", (porCat.get(r.categoria || "Outros") || 0) + r.valor));
    const itens = visiveis.map(r => `<li class="reg sem-foto" data-fin="${esc(r.id)}" tabindex="0" role="button">
      <span class="sinal ${r.tipo}">${r.tipo === "entrada" ? "+" : "−"}</span>
      <div class="meio"><b>${esc(r.descricao || r.categoria || (r.tipo === "entrada" ? "Entrada" : "Saída"))}</b><span>${esc([dataBR(r.data), r.categoria].filter(Boolean).join(" · "))}</span></div>
      <div class="dir"><b class="${r.tipo === "saida" ? "neg" : ""}">${r.tipo === "saida" ? "−" : ""}${esc(din(r.valor))}</b><small>saldo ${esc(din(r.saldo))}</small></div></li>`).join("");
    return `<div class="kpis k3">${kpi("Total de entradas", din(ent))}${kpi("Total de saídas", din(sai))}${kpi("Saldo atual", din(ent - sai), "", ent - sai < 0 ? "neg" : "")}</div>
      ${cartao("Saldo de caixa ao longo do tempo", linhaSaldo(comSaldo.map(r => ({ data: r.data, saldo: r.saldo }))))}
      ${cartao("Saídas por categoria", barras([...porCat].map(([r, v]) => ({ rotulo: r, valor: v })), { vazio: "Nenhuma saída no período." }))}
      <div class="busca">${seletorMes(G.fin, "fin")}</div>
      <ul class="regs">${itens || '<li class="vazio-g">Nenhuma movimentação registrada. Toque em “Nova movimentação”.</li>'}</ul>`;
  }
  function formFin(id) {
    const r0 = id ? G.fin.find(r => r.id === id) : null;
    abrirForm({
      titulo: r0 ? "Editar movimentação" : "Nova movimentação",
      campos: [
        { k: "tipo", rotulo: "Tipo", tipo: "seg", obrig: true, opcoes: [{ v: "entrada", t: "Entrada" }, { v: "saida", t: "Saída" }] },
        { k: "data", rotulo: "Data", tipo: "data", obrig: true, meia: true },
        { k: "valor", rotulo: "Valor", tipo: "dinheiro", obrig: true, meia: true },
        { k: "categoria", rotulo: "Categoria", tipo: "lista", obrig: true, opcoes: () => ops(G.cfg.listas.categoriasFin) },
        { k: "descricao", rotulo: "Descrição", tipo: "texto" }
      ],
      vals: r0 ? Object.assign({}, r0) : { tipo: "saida", data: hoje() },
      salvar: v => gravar("financeiro", id, { data: v.data, tipo: v.tipo, categoria: v.categoria, descricao: v.descricao || "", valor: Math.abs(v.valor || 0) }),
      textoOk: "Movimentação salva", excluir: r0 ? () => apagar("financeiro", id) : null, textoExcluir: "Excluir esta movimentação?"
    });
  }

  /* ---------- PREÇOS ---------- */
  let calcCusto = 3000;
  function abaPrecos() {
    const c = G.cfg;
    const taxas = Object.entries(c.taxas).map(([k, v]) => `<div class="tx"><span>${esc(k)}</span><div class="money sufixo"><input data-taxa="${esc(k)}" inputmode="decimal" value="${esc(pctIn(v))}" aria-label="Taxa ${esc(k)}"><span>%</span></div>${k === "Pix" ? '<span class="x fixa" title="O Pix fica sempre na lista"></span>' : `<button type="button" class="x" data-rmtaxa="${esc(k)}" aria-label="Remover ${esc(k)}">×</button>`}</div>`).join("");
    const ref = [["Bijuteria", 1500], ["Semijoia entrada", 3000], ["Semijoia média", 6000]];
    return `${cartao("Calculadora rápida", `
        <div class="field"><label for="calcCusto">Custo da peça</label><div class="money"><span>R$</span><input id="calcCusto" inputmode="decimal" value="${esc(dinIn(calcCusto))}"></div></div>
        <div class="calc" id="calcBox">${calcLinhas(c)}</div>
        <p class="hint">A conta usa os parâmetros abaixo (mesmo antes de salvar).</p>`)}
      ${cartao("Parâmetros gerais", `
        <div class="grade2">
          <div class="field"><label for="pMult">Multiplicador padrão</label><div class="money sufixo"><input id="pMult" inputmode="decimal" value="${esc(String(c.mult).replace(".", ","))}"><span>×</span></div></div>
          <div class="field"><label for="pMkt">Taxa média de marketplace</label><div class="money sufixo"><input id="pMkt" inputmode="decimal" value="${esc(pctIn(c.mkt))}"><span>%</span></div></div>
          <div class="field"><label for="pEmb">Custo médio de embalagem</label><div class="money"><span>R$</span><input id="pEmb" inputmode="decimal" value="${esc(dinIn(c.emb))}"></div></div>
          <div class="field"><label for="pForma">Taxa de maquininha usada no preço</label><select id="pForma">${Object.keys(c.taxas).map(k => `<option ${k === c.formaPreco ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></div>
        </div>`)}
      ${cartao("Taxas por forma de pagamento", `<div class="taxas">${taxas}</div>
        <div class="nova-tx"><input id="novaForma" placeholder="Nova forma de pagamento" maxlength="40"><button class="btn sm" type="button" id="addForma">Adicionar</button></div>
        <p class="hint">Confira as taxas do seu contrato. “Marketplace” usa a taxa média de marketplace acima.</p>`)}
      <div class="salvar-linha"><button class="btn primary" type="button" id="salvarPrecos">Salvar parâmetros</button></div>
      ${cartao("Referência do plano de negócio", `<div class="tabela"><table><thead><tr><th>Categoria</th><th>Custo exemplo</th><th>Preço ×2,5</th><th>Preço ×3</th></tr></thead><tbody>${ref.map(([n, v]) => `<tr><td>${n}</td><td>${din(v)}</td><td>${din(v * 2.5)}</td><td>${din(v * 3)}</td></tr>`).join("")}</tbody></table></div>`, "multiplicador ×2,5 a ×3")}`;
  }
  // mesma conta da planilha: custo × multiplicador, + marketplace e maquininha sobre o preço base, + embalagem
  function calcLinhas(c) {
    const mp = Number(c.taxas[c.formaPreco] || 0), custo = calcCusto || 0;
    const base = arred(custo * c.mult), mk = arred(base * c.mkt), maq = arred(base * mp), fim = arred(custo * c.mult * (1 + c.mkt + mp) + c.emb);
    return [["Preço base (custo × " + String(c.mult).replace(".", ",") + ")", base], ["Taxa de marketplace (" + pct(c.mkt, 2) + ")", mk], ["Embalagem", c.emb], ["Taxa de maquininha (" + pct(mp, 2) + ")", maq]]
      .map(([r, v]) => `<div><span>${esc(r)}</span><b>${esc(din(v))}</b></div>`).join("") + `<div class="dest"><span>Preço final sugerido</span><b>${esc(din(fim))}</b></div>`;
  }
  function lerPrecos() {
    const c = G.cfg;
    const mult = parseNum($("#pMult").value), mkt = parsePct($("#pMkt").value), emb = parseDin($("#pEmb").value);
    const taxas = {}; $$("[data-taxa]").forEach(i => { taxas[i.dataset.taxa] = parsePct(i.value) || 0; });
    return { mult: mult > 0 ? mult : c.mult, mkt: mkt ?? 0, emb: emb ?? 0, formaPreco: $("#pForma").value, taxas };
  }

  /* ---------- FORNECEDORES ---------- */
  function abaFornecedores() {
    const conf = G.forn.filter(f => f.nota_fiscal && !/a confirmar/i.test(f.nota_fiscal)).length;
    const itens = G.forn.map(f => {
      const n = [...G.custos.values()].filter(c => c.fornecedor_id === f.id).length;
      return `<li class="reg sem-foto" data-forn="${esc(f.id)}" tabindex="0" role="button"><span class="sinal forn">${esc((f.nome || "?").slice(0, 1).toUpperCase())}</span>
        <div class="meio"><b>${esc(f.nome)}</b><span>${esc([f.cidade, f.contato && !/a confirmar/i.test(f.contato) ? f.contato : ""].filter(Boolean).join(" · "))}</span>${f.obs ? `<span>${esc(f.obs)}</span>` : ""}</div>
        <div class="dir"><b>${n}</b><small>${n === 1 ? "peça" : "peças"}</small></div></li>`;
    }).join("");
    return `<div class="kpis k3">${kpi("Fornecedores cadastrados", milhar(G.forn.length))}${kpi("Condições confirmadas", milhar(conf), "nota fiscal definida")}</div>
      <ul class="regs">${itens || '<li class="vazio-g">Nenhum fornecedor cadastrado.</li>'}</ul>`;
  }
  function formForn(id) {
    const f0 = id ? G.forn.find(f => f.id === id) : null;
    abrirForm({
      titulo: f0 ? "Editar fornecedor" : "Novo fornecedor",
      campos: [
        { k: "nome", rotulo: "Nome", tipo: "texto", obrig: true },
        { k: "cidade", rotulo: "Cidade", tipo: "texto", meia: true }, { k: "contato", rotulo: "Contato", tipo: "texto", meia: true },
        { k: "cnpj", rotulo: "CNPJ", tipo: "texto", meia: true }, { k: "nota_fiscal", rotulo: "Emite nota fiscal?", tipo: "texto", meia: true, lista: ["Sim", "Não", "A confirmar"] },
        { k: "pedido_minimo", rotulo: "Pedido mínimo", tipo: "texto", meia: true }, { k: "prazo", rotulo: "Prazo de produção", tipo: "texto", meia: true },
        { k: "trocas", rotulo: "Condições de troca", tipo: "texto" }, { k: "obs", rotulo: "Observações", tipo: "area" }
      ],
      vals: f0 ? Object.assign({}, f0) : {},
      salvar: v => gravar("fornecedores", id, { nome: v.nome, cidade: v.cidade || "", contato: v.contato || "", cnpj: v.cnpj || "", nota_fiscal: v.nota_fiscal || "", pedido_minimo: v.pedido_minimo || "", prazo: v.prazo || "", trocas: v.trocas || "", obs: v.obs || "" }),
      textoOk: "Fornecedor salvo", excluir: f0 ? () => apagar("fornecedores", id) : null, textoExcluir: "Excluir este fornecedor? As peças dele ficam sem fornecedor."
    });
  }

  /* ---------- TRÁFEGO ---------- */
  function abaTrafego() {
    const lista = noMes(G.traf, "traf").slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const inv = G.traf.reduce((s, r) => s + (r.investido || 0), 0), rec = G.traf.reduce((s, r) => s + (r.receita || 0), 0);
    const plan = G.cfg.plano.reduce((s, p) => s + (p.orcamento || 0), 0);
    const fases = G.cfg.plano.map(p => ({ rotulo: p.fase, a: G.traf.filter(r => r.fase === p.fase).reduce((s, r) => s + (r.investido || 0), 0), b: p.orcamento || 0 }));
    const plano = `<div class="tabela"><table><thead><tr><th>Fase</th><th>Período</th><th>Objetivo</th><th class="n">Orçamento</th></tr></thead><tbody>${G.cfg.plano.map((p, i) => `<tr data-fase="${i}" tabindex="0" role="button"><td>${esc(p.fase)}</td><td>${esc(p.periodo)}</td><td>${esc(p.objetivo)}</td><td class="n">${esc(din(p.orcamento))}</td></tr>`).join("")}<tr class="tot"><td colspan="3">Total planejado</td><td class="n">${esc(din(plan))}</td></tr></tbody></table></div><p class="hint">Toque numa fase para editar.</p>`;
    const itens = lista.map(r => `<li class="reg sem-foto" data-traf="${esc(r.id)}" tabindex="0" role="button"><span class="sinal forn">${esc(String(r.fase || "?").replace(/\D/g, "").slice(0, 1) || "•")}</span>
      <div class="meio"><b>${esc(r.fase || "Campanha")}</b><span>${esc([dataBR(r.data), r.cliques ? milhar(r.cliques) + " cliques" : "", r.mensagens ? milhar(r.mensagens) + " contatos" : "", r.vendas ? milhar(r.vendas) + " vendas" : ""].filter(Boolean).join(" · "))}</span></div>
      <div class="dir"><b>${esc(din(r.investido))}</b><small>receita ${esc(din(r.receita))}</small><small>ROAS ${r.investido ? (r.receita / r.investido).toFixed(2).replace(".", ",") + "×" : "—"}</small></div></li>`).join("");
    return `<div class="kpis k4">${kpi("Investido (real)", din(inv))}${kpi("Receita gerada", din(rec))}${kpi("ROAS geral", inv ? (rec / inv).toFixed(2).replace(".", ",") + "×" : "—", "receita ÷ investido")}${kpi("Orçamento planejado", din(plan))}</div>
      ${cartao("Plano de orçamento", plano)}
      ${cartao("Investido × planejado por fase", barrasDuplas(fases, "Investido", "Planejado"))}
      <div class="busca">${seletorMes(G.traf, "traf")}</div>
      <ul class="regs">${itens || '<li class="vazio-g">Nenhuma campanha registrada. Toque em “Nova campanha”.</li>'}</ul>`;
  }
  function formTraf(id) {
    const r0 = id ? G.traf.find(r => r.id === id) : null;
    abrirForm({
      titulo: r0 ? "Editar campanha" : "Nova campanha",
      campos: [
        { k: "data", rotulo: "Data", tipo: "data", obrig: true, meia: true },
        { k: "fase", rotulo: "Fase", tipo: "lista", obrig: true, meia: true, opcoes: () => ops(G.cfg.plano.map(p => p.fase)) },
        { k: "investido", rotulo: "Valor investido", tipo: "dinheiro", obrig: true, meia: true },
        { k: "receita", rotulo: "Receita gerada", tipo: "dinheiro", meia: true },
        { k: "cliques", rotulo: "Cliques", tipo: "numero", meia: true }, { k: "mensagens", rotulo: "Mensagens / contatos", tipo: "numero", meia: true },
        { k: "vendas", rotulo: "Vendas geradas", tipo: "numero", meia: true }
      ],
      vals: r0 ? Object.assign({}, r0) : { data: hoje() },
      calcular: v => v.investido ? [{ r: "ROAS", v: ((v.receita || 0) / v.investido).toFixed(2).replace(".", ",") + "×", destaque: true }] : [],
      salvar: v => gravar("trafego", id, { data: v.data, fase: v.fase, investido: v.investido || 0, receita: v.receita || 0, cliques: v.cliques || 0, mensagens: v.mensagens || 0, vendas: v.vendas || 0 }),
      textoOk: "Campanha salva", excluir: r0 ? () => apagar("trafego", id) : null, textoExcluir: "Excluir esta campanha?"
    });
  }
  function formFase(i) {
    const p = G.cfg.plano[i];
    abrirForm({
      titulo: "Fase do plano",
      campos: [{ k: "fase", rotulo: "Fase", tipo: "texto", obrig: true }, { k: "periodo", rotulo: "Período", tipo: "texto", meia: true }, { k: "orcamento", rotulo: "Orçamento planejado", tipo: "dinheiro", meia: true }, { k: "objetivo", rotulo: "Objetivo de campanha", tipo: "texto" }],
      vals: Object.assign({}, p),
      salvar: async v => { const antigo = p.fase; G.cfg.plano[i] = { fase: v.fase, periodo: v.periodo || "", objetivo: v.objetivo || "", orcamento: v.orcamento || 0 }; await salvarCfg(); if (antigo !== v.fase) for (const r of G.traf.filter(r => r.fase === antigo)) await gravar("trafego", r.id, { fase: v.fase }); },
      textoOk: "Plano atualizado"
    });
  }

  /* ---------- AJUSTES (listas + importar planilha) ---------- */
  function abrirAjustesG() {
    const L = G.cfg.listas;
    abrirForm({
      titulo: "Ajustes da gestão",
      campos: [
        { k: "minimo", rotulo: "Avisar “acabando” quando o estoque chegar a", tipo: "numero", dica: "Em unidades. 0 = só avisa quando esgotar; 1 = avisa também quando sobrar a última peça." },
        { k: "canais", rotulo: "Canais de venda", tipo: "area", dica: "Um por linha." },
        { k: "regioes", rotulo: "Regiões", tipo: "area" },
        { k: "tiposPerda", rotulo: "Tipos de perda", tipo: "area" },
        { k: "categoriasFin", rotulo: "Categorias do financeiro", tipo: "area" }
      ],
      vals: { minimo: G.cfg.minimo, canais: L.canais.join("\n"), regioes: L.regioes.join("\n"), tiposPerda: L.tiposPerda.join("\n"), categoriasFin: L.categoriasFin.join("\n") },
      extra: `<div class="imp"><span class="lbl">Dados da planilha</span><p class="hint">Traz da planilha antiga: custo e fornecedor de cada peça, fornecedores, perdas, parâmetros de preço, taxas e plano de tráfego. Pode rodar de novo: o que já existe não é duplicado.</p><button class="btn sm" type="button" id="btnImpPlan">Importar arquivo da planilha (.json)</button><input type="file" id="arqPlan" accept=".json,application/json" hidden></div>`,
      salvar: async v => {
        const lin = s => String(s || "").split(/\n/).map(x => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i);
        G.cfg.listas = { canais: lin(v.canais), regioes: lin(v.regioes), tiposPerda: lin(v.tiposPerda), categoriasFin: lin(v.categoriasFin) };
        if (v.minimo != null && v.minimo >= 0) G.cfg.minimo = v.minimo;
        await salvarCfg();
      },
      textoSalvar: "Salvar ajustes", textoOk: "Ajustes salvos",
      aoAbrir: () => {
        $("#btnImpPlan").onclick = () => $("#arqPlan").click();
        $("#arqPlan").onchange = async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; fecharForm(); await importarPlanilha(f); };
      }
    });
  }
  async function importarPlanilha(arquivo) {
    let d;
    try { d = JSON.parse(await arquivo.text()); if (d.formato !== "lehele-gestao") throw 0; }
    catch (e) { toast("Este arquivo não é o da planilha Le Helê."); return; }
    const dig = s => String(s || "").replace(/\D/g, "");
    const limpa = s => norm(s).replace(/banh?o?\s*ouro\s*18\s*k|banho/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const acharPeca = (codigo, nome) => {
      const cod = norm(codigo).replace(/[^a-z0-9]/g, ""), c = dig(codigo);
      if (cod) { const m = G.pecas.find(p => norm(p.codigo).replace(/[^a-z0-9]/g, "") === cod); if (m) return m; }
      if (c) { const ms = G.pecas.filter(p => dig(p.codigo) === c); if (ms.length === 1) return ms[0]; }
      const n = limpa(nome);
      return n ? G.pecas.find(p => { const pn = limpa(p.nome); return pn && (n.includes(pn) || pn.includes(n)); }) : null;
    };
    const res = { forn: 0, custos: 0, semPeca: [], perdas: 0 };
    try {
      if (d.parametros) { G.cfg.mult = Number(d.parametros.multiplicador) || G.cfg.mult; G.cfg.mkt = Number(d.parametros.taxaMarketplace) || 0; G.cfg.emb = d.parametros.embalagem ?? G.cfg.emb; if (d.parametros.formaTaxaPreco) G.cfg.formaPreco = d.parametros.formaTaxaPreco; }
      if (d.taxas && Object.keys(d.taxas).length) G.cfg.taxas = comPix(d.taxas);
      if (d.listas) { const L = d.listas; G.cfg.listas = { canais: L.canais || G.cfg.listas.canais, regioes: L.regioes || G.cfg.listas.regioes, tiposPerda: L.tiposPerda || G.cfg.listas.tiposPerda, categoriasFin: L.categoriasFinanceiro || G.cfg.listas.categoriasFin }; }
      if (Array.isArray(d.planoTrafego) && d.planoTrafego.length) G.cfg.plano = d.planoTrafego;
      await salvarCfg();
      for (const f of d.fornecedores || []) {
        if (!f.nome || G.forn.some(x => norm(x.nome) === norm(f.nome))) continue;
        const id = await gravar("fornecedores", null, { nome: f.nome, cidade: f.cidade || "", contato: f.contato || "", cnpj: f.cnpj || "", nota_fiscal: f.nf || "", pedido_minimo: f.moq || "", prazo: f.prazo || "", trocas: f.trocas || "", obs: f.obs || "" });
        G.forn.push({ id, nome: f.nome }); res.forn++;
      }
      for (const e of d.estoque || []) {
        const p = acharPeca(e.codigo, e.nome);
        if (!p) { res.semPeca.push(e.codigo || e.nome); continue; }
        const fo = G.forn.find(x => norm(x.nome) === norm(e.fornecedor));
        const qt = qtdDe(p.id) ?? (e.quantidade ?? null);   // não troca uma contagem que já existe
        await salvarCusto(p.id, e.custo, fo ? fo.id : null, qt);
        G.custos.set(p.id, { peca_id: p.id, custo: e.custo, fornecedor_id: fo ? fo.id : null, quantidade: qt }); res.custos++;
      }
      for (const pe of d.perdas || []) {
        const p = acharPeca("", pe.peca);
        if (G.perdas.some(x => x.data === pe.data && x.tipo === pe.tipo && norm(x.peca_nome) === norm(p ? p.nome : pe.peca))) continue;
        await gravar("perdas", null, { data: pe.data, tipo: pe.tipo || "", peca_id: p ? p.id : null, peca_nome: p ? p.nome : pe.peca, quantidade: pe.quantidade || 1, retorna: !!pe.retorna, custo_unit: p ? custoDe(p.id) : null, reembolso: pe.reembolso ?? null, pagamento: pe.pagamento || "", taxa_pct: pe.pagamento ? taxaDe(pe.pagamento) : 0, pedido: pe.pedido || "", obs: pe.obs || "", estoque_mov: movPadrao(pe.tipo, !!pe.retorna) });
        // a quantidade da planilha já considera essa perda, então aqui o estoque não é mexido
        res.perdas++;
      }
      await recarregar();
      toast(`Importado: ${res.custos} peças com custo e quantidade, ${res.forn} fornecedores, ${res.perdas} perdas${res.semPeca.length ? ` · ${res.semPeca.length} sem peça na vitrine` : ""}`);
    } catch (e) { falhou(e); }
  }

  /* ---------- desenhar ---------- */
  function desenhar() {
    if (!G.cfg) return;
    $("#abasG").innerHTML = ABAS.map(a => `<button type="button" role="tab" aria-selected="${a.id === G.aba}" data-aba="${a.id}">${a.nome}</button>`).join("");
    const fn = { resumo: abaResumo, estoque: abaEstoque, vendas: abaVendas, perdas: abaPerdas, financeiro: abaFinanceiro, precos: abaPrecos, fornecedores: abaFornecedores, trafego: abaTrafego }[G.aba];
    const foco = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.busca;
    $("#conteudo").innerHTML = `<div class="summary"><h2>${esc(ABAS.find(a => a.id === G.aba).nome)}</h2></div>` + fn();
    if (foco) { const el = document.querySelector(`[data-busca="${foco}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
    const ac = ACOES[G.aba];
    $("#dockG").hidden = !ac; if (ac) $("#acaoG").textContent = ac[0];
    document.body.classList.toggle("com-dock", !!ac);
  }
  $("#abasG").addEventListener("click", e => { const b = e.target.closest("[data-aba]"); if (!b) return; G.aba = b.dataset.aba; G.fEst = ""; try { localStorage.setItem("lehele-gestao-aba", G.aba); } catch (x) { } desenhar(); window.scrollTo(0, 0); b.scrollIntoView({ inline: "center", block: "nearest" }); });
  $("#acaoG").onclick = () => ACOES[G.aba] && ACOES[G.aba][1]();
  $("#btnAjG").onclick = abrirAjustesG;
  const abrirPor = (sel, fn) => $("#conteudo").addEventListener("click", e => { const el = e.target.closest(sel); if (el) fn(el); });
  abrirPor("[data-peca]", el => formCusto(el.dataset.peca));
  abrirPor("[data-venda]", el => formVenda(el.dataset.venda));
  abrirPor("[data-perda]", el => formPerda(el.dataset.perda));
  abrirPor("[data-fin]", el => formFin(el.dataset.fin));
  abrirPor("[data-forn]", el => formForn(el.dataset.forn));
  abrirPor("[data-traf]", el => formTraf(el.dataset.traf));
  abrirPor("[data-fase]", el => formFase(+el.dataset.fase));
  abrirPor("[data-fest]", el => { G.fEst = el.dataset.fest; desenhar(); });
  abrirPor("[data-ir]", el => { G.aba = el.dataset.ir; G.fEst = "baixo"; desenhar(); window.scrollTo(0, 0); });
  abrirPor("[data-rmtaxa]", el => { const k = el.dataset.rmtaxa; if (k === "Pix" || Object.keys(G.cfg.taxas).length < 2) return; const t = lerPrecos(); delete t.taxas[k]; if (t.formaPreco === k) t.formaPreco = Object.keys(t.taxas)[0]; Object.assign(G.cfg, t); desenhar(); toast("Removida. Toque em Salvar parâmetros para confirmar."); });
  $("#conteudo").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[role=button]")) e.target.click(); });
  $("#conteudo").addEventListener("change", e => {
    const f = e.target.dataset.f; if (f !== undefined) { G.f[f] = e.target.value; desenhar(); return; }
    const m = e.target.dataset.mes; if (m !== undefined) { G.mesLista[m] = e.target.value; desenhar(); }
  });
  let buscaT;
  $("#conteudo").addEventListener("input", e => {
    const b = e.target.dataset.busca; if (b !== undefined) { G.busca[b] = e.target.value; clearTimeout(buscaT); buscaT = setTimeout(desenhar, 150); return; }
    if (G.aba === "precos" && (e.target.id === "calcCusto" || /^p(Mult|Mkt|Emb|Forma)$/.test(e.target.id) || e.target.dataset.taxa !== undefined)) {
      calcCusto = parseDin($("#calcCusto").value) || 0;
      $("#calcBox").innerHTML = calcLinhas(Object.assign({}, G.cfg, lerPrecos()));
    }
  });
  $("#conteudo").addEventListener("click", async e => {
    if (e.target.id === "addForma") {
      const n = $("#novaForma").value.trim(); if (!n) return;
      const t = lerPrecos(); t.taxas[n] = 0; Object.assign(G.cfg, t); desenhar(); toast("Informe a taxa e toque em Salvar parâmetros.");
    }
    if (e.target.id === "salvarPrecos") {
      const antes = JSON.stringify([G.cfg.mult, G.cfg.mkt, G.cfg.emb, G.cfg.formaPreco, G.cfg.taxas]);
      Object.assign(G.cfg, lerPrecos());
      try { await salvarCfg(); desenhar(); toast("Parâmetros salvos. Os preços sugeridos já usam os novos valores."); }
      catch (x) { falhou(x); try { Object.assign(G.cfg, (([mult, mkt, emb, formaPreco, taxas]) => ({ mult, mkt, emb, formaPreco, taxas }))(JSON.parse(antes))); } catch (y) { } }
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && FM) fecharForm(); });

  /* ---------- login e início ---------- */
  function mostrarGate(qual) {
    $("#gate").hidden = !qual;
    ["gateCarregando", "gateConfig", "gateLogin", "gateErro", "gateSemAcesso", "gateSemTabela"].forEach(id => { const el = $("#" + id); if (el) el.hidden = id !== qual; });
  }
  let iniciado = false;
  async function entrar(session) {
    let r = await sb.rpc("is_admin");
    if (r.error) { await new Promise(s => setTimeout(s, 1500)); r = await sb.rpc("is_admin"); }
    if (r.error) { mostrarGate("gateErro"); return; }
    if (!r.data) { mostrarGate("gateSemAcesso"); return; }
    if (iniciado) return; iniciado = true;
    try { await carregar(); }
    catch (e) { console.error(e); mostrarGate("gateSemTabela"); iniciado = false; return; }
    mostrarGate(null);
    $("#contaG").textContent = (session && session.user && session.user.email) || "";
    try { const a = localStorage.getItem("lehele-gestao-aba"); if (a && ABAS.some(x => x.id === a)) G.aba = a; } catch (e) { }
    desenhar();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !FM) recarregar(); });
  }
  async function boot() {
    if (!LH.configurado()) { mostrarGate("gateConfig"); return; }
    sb = LH.criarCliente();
    sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_IN" && s) entrar(s); if (ev === "SIGNED_OUT") location.reload(); });
    const { data } = await sb.auth.getSession();
    if (data && data.session) entrar(data.session); else mostrarGate("gateLogin");
  }
  $("#fLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#lEmail").value.trim(), senha = $("#lSenha").value;
    if (!email || !senha) { $("#lErro").textContent = "Preencha e-mail e senha."; return; }
    try { localStorage.setItem("lehele-manter", $("#lManter").checked ? "1" : "0"); } catch (x) { }
    const b = $("#lEntrar"); b.disabled = true; b.textContent = "Entrando…";
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    b.disabled = false; b.textContent = "Entrar";
    if (error) $("#lErro").textContent = /invalid/i.test(error.message || "") ? "E-mail ou senha incorretos." : "Não foi possível entrar. Verifique a internet.";
  });
  $("#btnSairG").onclick = () => sb.auth.signOut();
  $$("[data-sair]").forEach(b => b.onclick = () => sb.auth.signOut());
  $$("[data-recarregar]").forEach(b => b.onclick = () => location.reload());
  window.__gestao = { G, recarregar, contaVenda, contaPerda, precoSugerido, importarPlanilha };
  boot();
})();
