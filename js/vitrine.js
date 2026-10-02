/* =========================================================
   VITRINE LE HELÊ — página das clientes
   Uma página por vez, navegação só pelos botões.
   Lê as peças do Supabase e se atualiza sozinha.
   ========================================================= */
(function () {
  const { esc, brl, catOf, ordenar, whatsLink, rowToPeca, rowToConfig, fotoURL, configurado, criarCliente, pagamento } = LH;
  const PW = 405, PH = 720;
  const C = { taupe: "#D0BFA8", cream: "#EBDECA", gold: "#C8A96A", deep: "#A9823E", ink: "#4A3A22", soft: "#8A7150", paper: "#F4ECDF", cat: "#6E5122" };
  const app = document.getElementById("app");
  const V = { pecas: [], cfg: {}, novDesde: 0, pronto: false, desejadas: new Set() };
  const n2 = v => Math.round(v * 100) / 100;
  const U = v => `calc(var(--u)*${n2(v)})`;

  /* ---------- medida de texto (mesma fonte do PDF) ---------- */
  const ctx = document.createElement("canvas").getContext("2d");
  const FONTE = '"LH Didot","GFS Didot",Didot,serif';
  function largura(s, size, cs = 0) { ctx.font = `${size}px ${FONTE}`; return ctx.measureText(s).width + cs * Math.max(0, s.length - 1); }
  function linhas(texto, size, maxW, maxL) {
    const out = [];
    for (const par of String(texto || "").split(/\n/)) {
      let linha = "";
      for (const w of par.split(/\s+/).filter(Boolean)) {
        const t = linha ? linha + " " + w : w;
        if (largura(t, size) <= maxW || !linha) linha = t; else { out.push(linha); linha = w; }
      }
      out.push(linha);
    }
    while (out.length > 1 && out[out.length - 1] === "") out.pop();
    if (maxL && out.length > maxL) {
      const ls = out.slice(0, maxL); let last = ls[maxL - 1];
      while (last.length && largura(last + "…", size) > maxW) last = last.slice(0, -1);
      ls[maxL - 1] = last.replace(/[\s,.;:]+$/, "") + "…";
      return ls;
    }
    return out;
  }

  /* ---------- peças de desenho (espelham o PDF) ---------- */
  // texto posicionado pela linha de base (y), como no PDF
  function T(s, x, y, o = {}) {
    const { size = 10, color = C.ink, cs = 0, align = "left", bold = false, href = null, ext = false, nav = null, cls = "" } = o;
    const top = y - 0.91 * size;
    let pos;
    if (align === "center") pos = `left:0;width:${U(PW)};text-align:center`;
    else if (align === "right") pos = `right:${U(PW - x)};text-align:right`;
    else pos = `left:${U(x)}`;
    const st = `${pos};top:${U(top)};font-size:${U(size)};color:${color};${cs ? `letter-spacing:${U(cs)};` : ""}${bold ? `--sw:${U(size * 0.045)};` : ""}`;
    const c = `t${bold ? " b" : ""}${href ? " nav" : ""} ${cls}`;
    if (href) {
      if (align === "center") {
        // link centralizado: caixa só do tamanho do texto
        const w = largura(s, size, cs) + 8;
        return `<a class="${c}" style="left:${U((PW - w) / 2)};width:${U(w)};text-align:center;top:${U(top)};font-size:${U(size)};color:${color};${cs ? `letter-spacing:${U(cs)};` : ""}${bold ? `--sw:${U(size * 0.045)};` : ""}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}${nav ? ` data-nav="${nav}"` : ""}>${esc(s)}</a>`;
      }
      return `<a class="${c}" style="${st}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}${nav ? ` data-nav="${nav}"` : ""}>${esc(s)}</a>`;
    }
    return `<div class="${c}" style="${st}pointer-events:none">${esc(s)}</div>`;
  }
  const box = (x, y, w, h) => `left:${U(x)};top:${U(y)};width:${U(w)};height:${U(h)}`;
  const rect = (x, y, w, h, { fill = null, stroke = null, lw = 0.5, r = 0 } = {}) =>
    `<div style="${box(x - (stroke ? lw / 2 : 0), y - (stroke ? lw / 2 : 0), w + (stroke ? lw : 0), h + (stroke ? lw : 0))};${fill ? `background:${fill};` : ""}${stroke ? `border:max(${U(lw)},.5px) solid ${stroke};` : ""}${r ? `border-radius:${U(r)};` : ""}pointer-events:none"></div>`;
  const hline = (x1, x2, y, cor, lw = 0.4) => `<div style="${box(Math.min(x1, x2), y - lw / 2, Math.abs(x2 - x1), lw)};min-height:.5px;background:${cor};pointer-events:none"></div>`;
  const estrela = (cx, cy, r, cor) => {
    const p = []; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * 0.3 : r; p.push(n2(cx + rr * Math.cos(a)) + "," + n2(cy + rr * Math.sin(a))); }
    return `<svg viewBox="0 0 ${PW} ${PH}" style="left:0;top:0;width:100%;height:100%;pointer-events:none"><polygon points="${p.join(" ")}" fill="${cor}"/></svg>`;
  };
  const divisor = (cx, y, w, cor = C.deep) => hline(cx - w / 2, cx - 9, y, cor) + hline(cx + 9, cx + w / 2, y, cor) + estrela(cx, y, 4.2, cor);
  const moldura = (cor = C.gold) => rect(14, 14, PW - 28, PH - 28, { stroke: cor, lw: 0.6 }) + rect(18, 18, PW - 36, PH - 36, { stroke: cor, lw: 0.25 });
  const link = (x, y, w, h, href, o = {}) => `<a class="hit" style="${box(x, y, w, h)}" href="${esc(href)}"${o.ext ? ' target="_blank" rel="noopener"' : ""}${o.nav ? ` data-nav="${o.nav}"` : ""}${o.zap ? ` data-zap="${esc(o.zap)}"` : ""} aria-label="${esc(o.label || "")}"></a>`;
  const img = (src, x, y, w, h, cls = "im", extra = "") => `<img class="${cls}" src="${esc(src)}" alt="" style="${box(x, y, w, h)};${extra}" loading="eager" decoding="async">`;
  const SELOS = { novidade: ["NOVIDADE", C.deep, C.paper], oferta: ["OFERTA", C.ink, C.paper], desejada: ["MAIS DESEJADA", C.gold, C.ink] };
  const selo = (x, y, tipo = "novidade") => { const [t, bg, cor] = SELOS[tipo]; const w = largura(t, 6, 1.6) + 16;
    return `<div class="pill t b" style="${box(x, y, w, 13)};background:${bg};color:${cor};font-size:${U(6)};letter-spacing:${U(1.6)};--sw:${U(0.25)};z-index:2">${t}</div>`; };
  const emOferta = p => p.valorAntigo != null && p.valor != null && p.valorAntigo > p.valor;
  // até "max" selos empilhados no canto da foto
  function selosDe(p, x, y, { novidade = true, max = 2 } = {}) {
    const l = [];
    if (emOferta(p)) l.push("oferta");
    if (novidade && ehNova(p)) l.push("novidade");
    if (V.desejadas.has(p.id)) l.push("desejada");
    return l.slice(0, max).map((t, i) => selo(x, y + i * 16, t)).join("");
  }

  // botão de navegação em pílula (passar página). lado: "esq" | "dir" | "centro"; cheio = dourado preenchido
  const NAV_S = 10, NAV_CS = 2, NAV_H = 30, NAV_PAD = 15;
  function botao(rotulo, x, yMeio, { lado = "esq", href, nav = null, cheio = false, label = "" } = {}) {
    const w = largura(rotulo, NAV_S, NAV_CS) + NAV_PAD * 2;
    const x0 = lado === "dir" ? x - w : lado === "centro" ? (PW - w) / 2 : x, y0 = yMeio - NAV_H / 2;
    let h = rect(x0, y0, w, NAV_H, cheio ? { fill: C.deep, r: NAV_H / 2 } : { fill: C.paper, stroke: C.deep, lw: 0.9, r: NAV_H / 2 });
    h += T(rotulo, x0 + NAV_PAD, yMeio + 0.36 * NAV_S, { size: NAV_S, color: cheio ? C.paper : C.ink, cs: NAV_CS, bold: true });
    h += link(x0 - 4, y0 - 6, w + 8, NAV_H + 12, href, { nav, label: label || rotulo.replace(/[‹›]/g, "").trim() });
    return { h, x0, w };
  }

  /* ---------- sacolinha (fica guardada só neste aparelho) ---------- */
  const SAC_KEY = "lehele-sacola";
  let sacMem = [];
  function sacola() {
    let l = sacMem;
    try { const t = localStorage.getItem(SAC_KEY); if (t) l = JSON.parse(t); } catch (e) { }
    if (!Array.isArray(l)) l = [];
    const ok = new Set(ativas().map(p => p.id));
    return l.filter(i => i && ok.has(i.id)).map(i => ({ id: i.id, q: Math.max(1, Math.min(20, i.q | 0 || 1)) }));
  }
  function salvarSacola(l) { sacMem = l; try { localStorage.setItem(SAC_KEY, JSON.stringify(l)); } catch (e) { } }
  const usaSacola = () => !!V.cfg.whatsapp;
  const qtdSacola = () => sacola().reduce((s, i) => s + i.q, 0);
  const naSacola = id => sacola().some(i => i.id === id);
  function mudarSacola(id, delta, zerar = false) {
    let l = sacola(); const i = l.find(x => x.id === id);
    if (i) { i.q = zerar ? 0 : i.q + delta; l = l.filter(x => x.q > 0); }
    else if (delta > 0) l.push({ id, q: delta });
    salvarSacola(l.map(x => ({ id: x.id, q: Math.min(20, x.q) })));
  }
  // ícone de sacola (desenhado), cor do traço
  const iconeSacola = (x, y, w, cor) => `<svg viewBox="0 0 24 24" style="${box(x, y, w, w)};pointer-events:none" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>`;
  // botão redondo da sacola com o número de peças (canto de cima, à direita)
  function botaoSacola(x, y, D = 34) {
    const n = qtdSacola();
    if (!usaSacola() || !n) return "";
    let h = rect(x, y, D, D, { fill: C.deep, r: D / 2 }) + iconeSacola(x + D * 0.24, y + D * 0.2, D * 0.52, C.paper);
    const bd = 15, bx = x + D - bd + 3, by = y - 3;
    h += rect(bx, by, bd, bd, { fill: C.ink, r: bd / 2 });
    h += `<div class="t b" style="${box(bx, by + 0.5, bd, bd)};display:flex;align-items:center;justify-content:center;font-size:${U(7.5)};color:${C.paper};--sw:${U(0.2)};pointer-events:none">${n > 9 ? "9+" : n}</div>`;
    h += link(x - 6, y - 6, D + 12, D + 12, "#sacola", { label: `Ver sacola (${n} ${n === 1 ? "peça" : "peças"})` });
    return h;
  }
  // linha com Pix e parcelas para um valor
  function linhaPagamento(valor) {
    const pg = pagamento(V.cfg, valor);
    if (!pg) return "";
    const partes = [];
    if (pg.pix != null) partes.push(`${brl(pg.pix)} NO PIX`);
    if (pg.parcelas) partes.push(`${partes.length ? "OU " : ""}${pg.parcelas}X DE ${brl(pg.parcela)} SEM JUROS`);
    return partes.join("  ·  ");
  }
  const T_CENTRO_AJUSTADO = (txt, y, size, cor, maxW = 340, cs = 1.4) => { let sz = size; while (sz > 5.5 && largura(txt, sz, cs) > maxW) sz -= 0.25; return T(txt, PW / 2, y, { size: sz, color: cor, cs, align: "center" }); };

  /* ---------- dados ---------- */
  const ativas = () => ordenar(V.cfg, V.pecas.filter(p => !p.arquivada));
  const daLinha = id => ativas().filter(p => p.linha === id);
  const ehLinha = m => LH.LINHAS.some(l => l.id === m);
  const ehNova = p => p.criadoEm > V.novDesde;
  const thumbDe = p => { const f = p.fotos[0]; return f ? fotoURL(f.thumb || f.full) : ""; };

  /* ---------- plano do índice (mesmo do PDF) ---------- */
  const M = 31.5, GAP = 14, colW = (PW - 2 * M - GAP) / 2, cardH = colW + 46, ROWGAP = 16, CATH = 30, LIM = PH - 60;
  function planoIndice(lista) {
    const usarCats = lista.some(p => catOf(p));
    const cats = []; for (const p of lista) { const c = catOf(p) || "Outras peças"; if (!cats.includes(c)) cats.push(c); }
    const pags = []; let pg = { items: [] }, y = usarCats ? 176 : 184; pags.push(pg);
    const onde = new Map();
    const nova = () => { pg = { items: [] }; pags.push(pg); y = 74; };
    for (const c of cats) {
      const grupo = lista.filter(p => (catOf(p) || "Outras peças") === c);
      for (let i = 0; i < grupo.length; i += 2) {
        const row = grupo.slice(i, i + 2), cab = usarCats && i === 0;
        if (y + (cab ? CATH : 0) + cardH > LIM) nova();
        if (cab) { pg.items.push({ type: "cat", nome: c, y }); y += CATH; }
        else if (usarCats && pg.items.length === 0) { pg.items.push({ type: "cat", nome: c + " (cont.)", y }); y += CATH; }
        row.forEach((p, k) => { pg.items.push({ type: "peca", p, x: M + k * (colW + GAP), y }); onde.set(p.id, pags.length); });
        y += cardH + ROWGAP;
      }
    }
    return { pags, onde };
  }

  /* ---------- páginas ---------- */
  function paginaCapa() {
    const lista = ativas(), cfg = V.cfg, novas = lista.filter(ehNova);
    const cw = 470, ch = cw * 864 / 1100;
    let h = img("assets/capa.jpg", (PW - cw) / 2, 128, cw, ch, "im") + moldura(C.deep);
    h += T("VITRINE VIRTUAL", PW / 2, 62, { size: 8, color: C.deep, cs: 4, align: "center" });
    h += divisor(PW / 2, 78, 120);
    const mes = LH.mesAno();
    let yc = 128 + ch + 22;
    if (cfg.colecao) { h += T(cfg.colecao, PW / 2, yc, { size: 19, color: C.ink, align: "center" }); yc += 20; }
    h += T(mes, PW / 2, yc, { size: 7.5, color: C.deep, cs: 3, align: "center" });
    h += T(`${lista.length} ${lista.length === 1 ? "PEÇA" : "PEÇAS"} SELECIONADAS`, PW / 2, yc + 15, { size: 7, color: C.soft, cs: 2.5, align: "center" });
    if (novas.length && novas.length < lista.length) {
      const s = `${novas.length} ${novas.length === 1 ? "NOVIDADE" : "NOVIDADES"} PARA VOCÊ  ›`;
      const w = largura(s, 8.5, 2) + 34, x = (PW - w) / 2, yb = PH - 154;
      h += rect(x, yb, w, 26, { fill: C.deep, r: 13 });
      h += estrela(x + 14, yb + 13, 4.5, C.paper);
      h += T(s, x + 24, yb + 16.5, { size: 8.5, color: C.paper, cs: 2, bold: true });
      h += link(x, yb, w, 26, "#novidades-1", { label: "Ver novidades" });
    }
    // botão principal: dourado cheio, maior, com um brilho suave pulsando
    const bw = 262, bh = 48, bx = (PW - bw) / 2, by = PH - 112;
    h += `<div class="cta" style="${box(bx, by, bw, bh)};background:${C.deep};border-radius:${U(bh / 2)};pointer-events:none"></div>`;
    h += T("ENTRAR NA VITRINE  ›", PW / 2, by + bh / 2 + 0.36 * 12.5, { size: 12.5, color: C.paper, cs: 3, align: "center", bold: true });
    h += link(bx, by, bw, bh, "#linhas", { label: "Entrar na vitrine", nav: "next" });
    return { bg: C.taupe, html: h };
  }

  // escolha da linha: Semijoias ou Ouro
  function paginaLinhas() {
    const cfg = V.cfg;
    let h = moldura();
    h += img("assets/emblema.jpg", PW / 2 - 29, 34, 58, 54, "im");
    h += `<div style="${box(PW / 2 - 33, 28, 66, 66)};border:max(${U(0.5)},.5px) solid ${C.gold};border-radius:50%;pointer-events:none"></div>`;
    h += T("Vitrine", PW / 2, 126, { size: 30, color: C.ink, align: "center" });
    h += T("ESCOLHA UMA LINHA", PW / 2, 143, { size: 7.5, color: C.deep, cs: 3, align: "center" });
    h += botaoSacola(PW - 30 - 34, 30);
    h += divisor(PW / 2, 157, 150);
    const cx = M, cw = PW - 2 * M, top0 = 180, alt = 224, gap = 18, fotoH = 162;
    LH.LINHAS.forEach((l, i) => {
      const y = top0 + i * (alt + gap), itens = daLinha(l.id);
      const escolhida = V.cfg.destaques && V.cfg.destaques[l.id];
      const capa = itens.find(p => p.id === escolhida) || itens.slice().sort((a, b) => b.criadoEm - a.criadoEm)[0];
      const f = capa && capa.fotos[0];
      if (f) h += img(fotoURL(f.full || f.thumb), cx, y, cw, fotoH, "im", `object-position:50% 38%;background:${C.taupe}`);
      else {
        h += rect(cx, y, cw, fotoH, { fill: C.taupe });
        h += img("assets/emblema.jpg", PW / 2 - 40, y + fotoH / 2 - 38, 80, 75, "im", "opacity:.55");
      }
      h += rect(cx + 5, y + 5, cw - 10, fotoH - 10, { stroke: "#FFFFFF", lw: 0.4 });
      h += rect(cx, y + fotoH, cw, alt - fotoH, { fill: C.paper });
      h += rect(cx, y, cw, alt, { stroke: C.gold, lw: 0.6 });
      h += hline(cx, cx + cw, y + fotoH, C.gold, 0.4);
      if (itens.some(ehNova)) h += selo(cx + 9, y + 9, "novidade");
      h += T(l.nome, PW / 2, y + fotoH + 31, { size: 24, color: C.ink, align: "center" });
      h += T(itens.length ? `${itens.length} ${itens.length === 1 ? "PEÇA" : "PEÇAS"}  ›` : "EM BREVE", PW / 2, y + fotoH + 50, { size: 8, color: itens.length ? C.deep : C.soft, cs: 3, align: "center", bold: !!itens.length });
      if (itens.length) h += link(cx, y, cw, alt, `#${l.id}-1`, { label: `Ver ${l.nome}` });
    });
    const FY = PH - 38;
    h += botao("‹  CAPA", M, FY, { href: "#capa", nav: "prev" }).h;
    if (cfg.whatsapp || cfg.instagram) h += botao("ATENDIMENTO  ›", PW - M, FY, { lado: "dir", href: "#atendimento" }).h;
    return { bg: C.cream, html: h };
  }

  // modo = "novidades" ou o id da linha ("semijoias" / "ouro")
  function paginaIndice(m, modo) {
    const lista = modo === "novidades" ? ativas().filter(ehNova) : daLinha(modo);
    const { pags } = planoIndice(lista);
    m = Math.max(0, Math.min(m, pags.length - 1));
    const base = modo === "novidades" ? "#novidades-" : `#${modo}-`;
    const titulo = modo === "novidades" ? "Novidades" : LH.nomeLinha(modo);
    const cfg = V.cfg;
    let h = moldura();
    if (m === 0) {
      h += img("assets/emblema.jpg", PW / 2 - 29, 34, 58, 54, "im");
      h += `<div style="${box(PW / 2 - 33, 28, 66, 66)};border:max(${U(0.5)},.5px) solid ${C.gold};border-radius:50%;pointer-events:none"></div>`;
      h += T(titulo, PW / 2, 126, { size: 30, color: C.ink, align: "center" });
      h += T(modo === "novidades" ? "DESDE A SUA ÚLTIMA VISITA" : (cfg.colecao || "Le Helê Semi Joias").toUpperCase(), PW / 2, 143, { size: 7.5, color: C.deep, cs: 3, align: "center" });
      h += divisor(PW / 2, 157, 150);
      h += T("TOQUE EM UMA PEÇA PARA VER OS DETALHES", PW / 2, 172, { size: 5.8, color: C.soft, cs: 2, align: "center" });
      h += botaoSacola(PW - 30 - 34, 30);
    } else {
      h += T(titulo.toUpperCase(), M, 46, { size: 8, color: C.deep, cs: 3.5 });
      const ns = qtdSacola();
      if (usaSacola() && ns) h += T(`SACOLA (${ns})  ›`, PW - M, 46, { size: 8.5, color: C.deep, cs: 2.5, align: "right", bold: true, href: "#sacola" });
      else h += T("LE HELÊ", PW - M, 46, { size: 8, color: C.deep, cs: 3.5, align: "right" });
      h += hline(M, PW - M, 54, C.gold, 0.3);
    }
    if (!lista.length) {
      h += T("Em breve, novas peças.", PW / 2, 330, { size: 16, color: C.soft, align: "center" });
    }
    for (const it of (pags[m] || { items: [] }).items) {
      if (it.type === "cat") {
        const nome = it.nome.toUpperCase(), w = largura(nome, 10.5, 3);
        h += T(nome, PW / 2, it.y + 15, { size: 10.5, color: C.cat, cs: 3, align: "center" });
        h += hline(M, PW / 2 - w / 2 - 12, it.y + 11.5, C.gold, 0.35) + hline(PW / 2 + w / 2 + 12, PW - M, it.y + 11.5, C.gold, 0.35);
        continue;
      }
      const p = it.p, src = thumbDe(p);
      h += src ? img(src, it.x, it.y, colW, colW, "im", `background:${C.taupe}`) : rect(it.x, it.y, colW, colW, { fill: C.taupe });
      h += rect(it.x, it.y, colW, colW, { stroke: C.gold, lw: 0.5 }) + rect(it.x + 5, it.y + 5, colW - 10, colW - 10, { stroke: "#FFFFFF", lw: 0.4 });
      h += selosDe(p, it.x + 9, it.y + 9, { novidade: modo !== "novidades" });
      const nl = linhas(p.nome, 11.5, colW - 6, 2);
      nl.forEach((l, i) => { h += `<div class="t" style="left:${U(it.x)};width:${U(colW)};text-align:center;top:${U(it.y + colW + 16 + i * 13 - 0.91 * 11.5)};font-size:${U(11.5)};color:${C.ink}">${esc(l)}</div>`; });
      if (p.codigo) h += `<div class="t" style="left:${U(it.x)};width:${U(colW)};text-align:center;top:${U(it.y + colW + 16 + nl.length * 13 + 1 - 0.91 * 6.5)};font-size:${U(6.5)};color:${C.deep};letter-spacing:${U(1.8)}">${esc(p.codigo.toUpperCase())}</div>`;
      h += link(it.x, it.y, colW, cardH - 4, `#peca-${p.id}`, { label: p.nome });
    }
    const FY = PH - 38;
    const esq = m === 0 ? (modo === "novidades" ? ["‹  CAPA", "#capa"] : ["‹  LINHAS", "#linhas"]) : ["‹  ANTERIOR", base + m];
    const bE = botao(esq[0], M, FY, { href: esq[1], nav: "prev" }); h += bE.h;
    const temContato = !!(cfg.whatsapp || cfg.instagram);
    let dir = null;
    const outra = modo === "novidades" ? null : LH.LINHAS.find(l => l.id !== modo && daLinha(l.id).length);
    if (m < pags.length - 1) dir = ["PRÓXIMA  ›", base + (m + 2)];
    else if (modo === "novidades") dir = ["VITRINE COMPLETA  ›", "#linhas"];
    else if (outra) dir = [outra.nome.toUpperCase() + "  ›", `#${outra.id}-1`];
    else if (temContato) dir = ["ATENDIMENTO  ›", "#atendimento"];
    let bD = null;
    if (dir) { bD = botao(dir[0], PW - M, FY, { lado: "dir", href: dir[1], nav: "next", cheio: true }); h += bD.h; }
    // número da página só se couber entre os dois botões
    const num = `${m + 1} / ${pags.length}`, nw = largura(num, 8, 1.5) / 2 + 6;
    if (pags.length > 1 && bE.x0 + bE.w < PW / 2 - nw && (!bD || bD.x0 > PW / 2 + nw)) h += T(num, PW / 2, FY + 3, { size: 8, color: C.soft, cs: 1.5, align: "center" });
    return { bg: C.cream, html: h };
  }

  function paginaPeca(id) {
    const alvo = ativas().find(p => p.id === id);
    if (!alvo) return null;
    const lista = daLinha(alvo.linha), idx = lista.findIndex(p => p.id === id);
    const p = lista[idx], fotos = p.fotos, cfg = V.cfg;
    const { onde } = planoIndice(lista);
    let h = moldura();
    h += T("‹  ÍNDICE", 30, 44, { size: 11.5, color: C.deep, cs: 2.2, bold: true, href: `#${p.linha}-${onde.get(p.id) || 1}` });
    h += T(`${String(idx + 1).padStart(2, "0")} / ${String(lista.length).padStart(2, "0")}`, PW / 2, 44, { size: 7.5, color: C.soft, cs: 1.5, align: "center" });
    const ant = lista[idx - 1], seg = lista[idx + 1];
    // setas em círculos: dourado cheio quando dá para ir, apagado quando não dá
    const D = 34, cy = 40, xS = PW - 28 - D, xA = xS - 10 - D;
    const seta = (x, ativo, ch) => rect(x, cy - D / 2, D, D, ativo ? { fill: C.deep, r: D / 2 } : { stroke: C.taupe, lw: 0.8, r: D / 2 }) +
      `<svg viewBox="0 0 24 24" style="${box(x + D * 0.27, cy - D * 0.23, D * 0.46, D * 0.46)};pointer-events:none" fill="none" stroke="${ativo ? C.paper : C.taupe}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ch === ">" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}"/></svg>`;
    h += seta(xA, !!ant, "<") + seta(xS, !!seg, ">");
    if (seg) h += link(xS - 4, cy - D / 2 - 4, D + 8, D + 8, `#peca-${seg.id}`, { label: "Próxima peça", nav: "next" });
    if (ant) h += link(xA - 4, cy - D / 2 - 4, D + 8, D + 8, `#peca-${ant.id}`, { label: "Peça anterior", nav: "prev" });

    const DESC_W = 300, DESC_S = 10, DESC_LH = 14.5;
    const descLs = p.descricao ? linhas(p.descricao, DESC_S, DESC_W) : [];
    const nomeLs = linhas(p.nome, 22, 320, 2);
    const zap = cfg.whatsapp ? whatsLink(cfg.whatsapp, `Olá! Vi a vitrine Le Helê e tenho interesse na peça ${p.nome}${p.codigo ? " (" + p.codigo + ")" : ""}.`) : null;
    const temThumbs = fotos.length > 1;
    let fotoMax = 292 - Math.max(0, descLs.length - 3) * DESC_LH - (nomeLs.length - 1) * 25;
    fotoMax = Math.max(215, Math.min(292, fotoMax));
    const boxW = PW - 72, top = 64, f0 = fotos[0];
    let fw = boxW, fh = fotoMax, conhecido = false;
    if (f0 && f0.w && f0.h) { const k = Math.min(boxW / f0.w, fotoMax / f0.h); fw = f0.w * k; fh = f0.h * k; conhecido = true; }
    const fx = (PW - fw) / 2;
    if (f0) {
      h += img(fotoURL(f0.full), fx, top, fw, fh, "ct", `background:transparent`);
      h += `<button type="button" class="hit" style="${box(fx, top, fw, fh)}" data-zoom="${esc(fotoURL(f0.full))}" aria-label="Ampliar foto"></button>`;
      // compartilhar a peça (com a foto) — canto de cima, à direita da foto
      const sd = 30, sx = fx + fw - sd - 7, sy = top + 7;
      h += rect(sx, sy, sd, sd, { fill: "rgba(244,236,223,.92)", r: sd / 2 });
      h += `<svg viewBox="0 0 24 24" style="${box(sx + 7, sy + 7, sd - 14, sd - 14)};pointer-events:none" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;
      h += `<button type="button" class="hit" style="${box(sx - 5, sy - 5, sd + 10, sd + 10)};z-index:4" data-share="${esc(p.id)}" aria-label="Compartilhar esta peça"></button>`;
      h += `<div class="fr-foto" data-auto="${conhecido ? 0 : 1}" style="${box(fx - 5, top - 5, fw + 10, fh + 10)};border:max(${U(0.5)},.5px) solid ${C.gold};pointer-events:none"></div>`;
    } else h += rect(fx, top, fw, fh, { fill: C.taupe });
    h += selosDe(p, fx + 6, top + 6, { max: 3 });
    let yy = top + fh + 5;
    if (temThumbs) {
      const n = Math.min(fotos.length, 7), s = 36, g = 8, tw = n * s + (n - 1) * g; let tx = (PW - tw) / 2; const ty = yy + 12;
      for (let i = 0; i < n; i++) {
        h += img(fotoURL(fotos[i].thumb || fotos[i].full), tx, ty, s, s, "im", `background:${C.taupe}`);
        h += rect(tx, ty, s, s, { stroke: i === 0 ? C.deep : C.gold, lw: i === 0 ? 1 : 0.4 });
        if (i > 0) h += link(tx, ty, s, s, `#peca-${p.id}-foto-${i + 1}`, { label: `Ampliar foto ${i + 1}` });
        tx += s + g;
      }
      yy = ty + s + 4;
      h += T("TOQUE NA FOTO OU NAS MINIATURAS PARA AMPLIAR", PW / 2, yy + 8, { size: 5.5, color: C.soft, cs: 1.6, align: "center" });
      yy += 10;
    }
    let ty = yy + 26;
    if (catOf(p)) { h += T(catOf(p).toUpperCase(), PW / 2, ty, { size: 9.5, color: C.cat, cs: 3, align: "center" }); ty += 26; } else ty += 6;
    nomeLs.forEach((l, i) => { h += T(l, PW / 2, ty + i * 25, { size: 22, color: C.ink, align: "center" }); });
    ty += (nomeLs.length - 1) * 25 + 16;
    if (p.codigo) { h += T("REF. " + p.codigo.toUpperCase(), PW / 2, ty, { size: 7, color: C.soft, cs: 2, align: "center" }); ty += 14; }
    h += divisor(PW / 2, ty, 110); ty += 26;
    if (emOferta(p)) {
      // "de R$ antigo" riscado ao lado do preço atual
      const de = brl(p.valorAntigo), por = brl(p.valor), wd = largura(de, 12), wp = largura(por, 21), x0 = (PW - (wd + 12 + wp)) / 2;
      h += T(de, x0, ty - 1, { size: 12, color: C.soft });
      h += hline(x0 - 1, x0 + wd + 1, ty - 5, C.soft, 0.8);
      h += T(por, x0 + wd + 12, ty, { size: 21, color: C.deep });
    } else h += T(brl(p.valor) || "Sob consulta", PW / 2, ty, { size: p.valor != null ? 21 : 15, color: C.deep, align: "center" });
    ty += 17;
    const lp = linhaPagamento(p.valor);
    if (lp) { h += T_CENTRO_AJUSTADO(lp, ty + 1, 7.5, C.ink); ty += 15; }
    if (p.banho) {
      // peça de ouro não tem banho: mostra só o material (ex.: OURO 18K)
      const mat = p.banho.toUpperCase().replace(/^BANHO\s+(DE\s+)?/, "");
      const bt = p.linha === "ouro" ? mat : "BANHO · " + mat; let bs = 9.5;
      while (bs > 6.5 && largura(bt, bs, 2) > 330) bs -= 0.5;
      h += T(bt, PW / 2, ty + 2, { size: bs, color: C.ink, cs: 2, align: "center" }); ty += 17;
    }
    ty += 12;
    const limite = zap ? PH - 118 : PH - 44;
    const cabem = Math.max(0, Math.floor((limite - ty) / DESC_LH) + 1);
    if (descLs.length) {
      const ls = descLs.length > cabem ? linhas(p.descricao, DESC_S, DESC_W, cabem) : descLs;
      ls.forEach((l, i) => { h += T(l, PW / 2, ty + i * DESC_LH, { size: DESC_S, color: C.ink, align: "center" }); });
    }
    if (zap) {
      const w = 250, hh = 42, x = (PW - w) / 2, yb = PH - 104, dentro = naSacola(p.id);
      h += `<div class="${dentro ? "" : "cta"}" style="${box(x, yb, w, hh)};background:${dentro ? C.paper : C.deep};${dentro ? `border:max(${U(0.9)},.5px) solid ${C.deep};` : ""}border-radius:${U(hh / 2)};pointer-events:none"></div>`;
      if (dentro) {
        h += T("✓  NA SACOLA · VER SACOLA  ›", PW / 2, yb + hh / 2 + 3.8, { size: 10, color: C.ink, cs: 2, align: "center", bold: true });
        h += link(x, yb, w, hh, "#sacola", { label: "Ver sacola" });
      } else {
        h += iconeSacola(x + 22, yb + 11, 20, C.paper);
        h += T("ADICIONAR À SACOLA", PW / 2 + 12, yb + hh / 2 + 3.8, { size: 10.5, color: C.paper, cs: 2.4, align: "center", bold: true });
        h += `<button type="button" class="hit" style="${box(x, yb, w, hh)}" data-add="${esc(p.id)}" aria-label="Adicionar à sacola"></button>`;
      }
      // linha de baixo: pedir só esta peça (e ver a sacola, se já tiver peças)
      const n = qtdSacola(), yl = yb + hh + 22;
      const a = "PEDIR SÓ ESTA PELO WHATSAPP  ›", b = `VER SACOLA (${n})  ›`;
      const wa = largura(a, 7.5, 1.6), wb = n && !dentro ? largura(b, 7.5, 1.6) : 0, gapL = wb ? 26 : 0, x0 = (PW - wa - wb - gapL) / 2;
      if (wb) { h += T(b, x0, yl, { size: 7.5, color: C.deep, cs: 1.6, bold: true, href: "#sacola" }); h += T("·", x0 + wb + gapL / 2 - 2, yl, { size: 7.5, color: C.soft }); }
      h += `<a class="t b nav" style="left:${U(x0 + wb + gapL)};top:${U(yl - 0.91 * 7.5)};font-size:${U(7.5)};color:${C.ink};letter-spacing:${U(1.6)};--sw:${U(0.3)}" href="${esc(zap)}" target="_blank" rel="noopener" data-zap="${esc(p.id)}">${esc(a)}</a>`;
    }
    // pré-carrega a próxima peça
    if (seg && seg.fotos[0]) { const i = new Image(); i.src = fotoURL(seg.fotos[0].full); }
    return { bg: C.cream, html: h };
  }

  function paginaFoto(id, k) {
    const lista = ativas(), p = lista.find(x => x.id === id);
    if (!p || k < 2 || k > p.fotos.length) return null;
    const f = p.fotos[k - 1];
    let h = moldura(C.deep);
    h += T("‹  VOLTAR À PEÇA", 30, 43, { size: 9, color: C.ink, cs: 2.2, bold: true, href: `#peca-${p.id}` });
    h += T(`FOTO ${k} DE ${p.fotos.length}`, PW - 30, 42, { size: 7, color: C.ink, cs: 1.8, align: "right" });
    h += T("TOQUE NA FOTO E USE DOIS DEDOS PARA APROXIMAR", PW / 2, PH - 74, { size: 5.5, color: C.ink, cs: 1.6, align: "center" });
    h += T(linhas(p.nome, 17, 320, 1)[0], PW / 2, 80, { size: 17, color: C.ink, align: "center" });
    h += divisor(PW / 2, 94, 90);
    const maxW = PW - 64, maxH = PH - 118 - 92;
    let gw = maxW, gh = maxH, conhecido = false;
    if (f.w && f.h) { const kk = Math.min(maxW / f.w, maxH / f.h); gw = f.w * kk; gh = f.h * kk; conhecido = true; }
    const gx = (PW - gw) / 2, gy = 118 + (maxH - gh) / 2;
    h += img(fotoURL(f.full), gx, gy, gw, gh, "ct");
    h += `<button type="button" class="hit" style="${box(gx, gy, gw, gh)}" data-zoom="${esc(fotoURL(f.full))}" aria-label="Ampliar foto"></button>`;
    h += `<div class="fr-foto" data-auto="${conhecido ? 0 : 1}" style="${box(gx - 5, gy - 5, gw + 10, gh + 10)};border:max(${U(0.6)},.5px) solid ${C.cream};pointer-events:none"></div>`;
    const prev = k === 2 ? `#peca-${p.id}` : `#peca-${p.id}-foto-${k - 1}`;
    h += botao("‹  ANTERIOR", 30, PH - 46, { href: prev, nav: "prev" }).h;
    if (k < p.fotos.length) h += botao("PRÓXIMA  ›", PW - 30, PH - 46, { lado: "dir", href: `#peca-${p.id}-foto-${k + 1}`, nav: "next", cheio: true }).h;
    else h += botao("VOLTAR À PEÇA  ›", PW - 30, PH - 46, { lado: "dir", href: `#peca-${p.id}`, nav: "next", cheio: true }).h;
    return { bg: C.taupe, html: h };
  }

  function paginaAtendimento() {
    const cfg = V.cfg;
    let h = moldura(C.deep);
    h += img("assets/emblema.jpg", PW / 2 - 55, 150, 110, 103, "im");
    h += T("Atendimento", PW / 2, 300, { size: 28, color: C.ink, align: "center" });
    h += divisor(PW / 2, 318, 130);
    let yk = 360;
    if (cfg.whatsapp) {
      h += T("WHATSAPP", PW / 2, yk, { size: 7.5, color: C.deep, cs: 3, align: "center" });
      h += T(cfg.whatsapp, PW / 2, yk + 24, { size: 17, color: C.ink, align: "center", href: whatsLink(cfg.whatsapp, "Olá! Vi a vitrine Le Helê e gostaria de atendimento."), ext: true });
      yk += 64;
    }
    if (cfg.instagram) {
      const hd = cfg.instagram.replace(/^@/, "");
      h += T("INSTAGRAM", PW / 2, yk, { size: 7.5, color: C.deep, cs: 3, align: "center" });
      h += T("@" + hd, PW / 2, yk + 24, { size: 17, color: C.ink, align: "center", href: "https://instagram.com/" + encodeURIComponent(hd), ext: true });
    }
    h += T("Para a mais bela das belas.", PW / 2, PH - 110, { size: 13, color: C.deep, align: "center" });
    h += botao("‹  VOLTAR À VITRINE", 0, PH - 62, { lado: "centro", href: "#linhas", nav: "prev" }).h;
    return { bg: C.taupe, html: h };
  }

  function paginaSacola(m) {
    const cfg = V.cfg, l = sacola(), por = 5;
    const pags = Math.max(1, Math.ceil(l.length / por)); m = Math.max(0, Math.min(m, pags - 1));
    let h = moldura();
    h += iconeSacola(PW / 2 - 13, 34, 26, C.deep);
    h += T("Sua sacola", PW / 2, 92, { size: 28, color: C.ink, align: "center" });
    h += divisor(PW / 2, 108, 130);
    const voltar = V.ultimaLista || "#linhas";
    if (!l.length) {
      h += T("Sua sacola está vazia.", PW / 2, 300, { size: 16, color: C.soft, align: "center" });
      h += T("TOQUE EM “ADICIONAR À SACOLA” NAS PEÇAS QUE GOSTAR", PW / 2, 324, { size: 6.5, color: C.soft, cs: 1.6, align: "center" });
      h += botao("VER A VITRINE  ›", 0, PH - 62, { lado: "centro", href: voltar, cheio: true }).h;
      return { bg: C.cream, html: h };
    }
    const itens = l.map(i => ({ ...i, p: ativas().find(p => p.id === i.id) }));
    let y = 126; const RH = 70;
    for (const it of itens.slice(m * por, m * por + por)) {
      const p = it.p, src = thumbDe(p), sx = M;
      h += src ? img(src, sx, y, 56, 56, "im", `background:${C.taupe}`) : rect(sx, y, 56, 56, { fill: C.taupe });
      h += rect(sx, y, 56, 56, { stroke: C.gold, lw: 0.5 });
      h += link(sx, y, 56, 56, `#peca-${p.id}`, { label: p.nome });
      const nl = linhas(p.nome, 10.5, 170, 2);
      nl.forEach((t, i) => { h += T(t, sx + 66, y + 13 + i * 12.5, { size: 10.5, color: C.ink }); });
      const sub = [p.codigo ? "REF. " + p.codigo.toUpperCase() : "", p.valor != null ? brl(p.valor) + " CADA" : "SOB CONSULTA"].filter(Boolean).join("  ·  ");
      const ySub = y + 13 + nl.length * 12.5 + 3;
      h += T(sub, sx + 66, ySub, { size: 6.5, color: C.soft, cs: 1.2 });
      if (p.valor != null) h += T(brl(p.valor * it.q), PW - M, y + 14, { size: 13, color: C.deep, align: "right" });
      // quantidade: −  2  +
      const qy = y + 32, qd = 22, qx = PW - M - 3 * qd - 4;
      h += rect(qx, qy, qd, qd, { stroke: C.deep, lw: 0.8, r: qd / 2 }) + T("−", qx + qd / 2 - 3.3, qy + 15.5, { size: 13, color: C.ink });
      h += T(String(it.q), qx + qd + 2 + (qd - largura(String(it.q), 11)) / 2, qy + 15, { size: 11, color: C.ink });
      h += rect(qx + 2 * qd + 4, qy, qd, qd, { fill: C.deep, r: qd / 2 }) + T("+", qx + 2 * qd + 4 + qd / 2 - 3.6, qy + 15.5, { size: 13, color: C.paper });
      h += `<button type="button" class="hit" style="${box(qx - 4, qy - 4, qd + 6, qd + 8)}" data-menos="${esc(p.id)}" aria-label="Tirar uma"></button>`;
      h += `<button type="button" class="hit" style="${box(qx + 2 * qd + 2, qy - 4, qd + 6, qd + 8)}" data-mais="${esc(p.id)}" aria-label="Mais uma"></button>`;
      h += `<button type="button" class="hit t" style="${box(sx + 66, ySub + 4, 60, 14)};font-size:${U(6.5)};letter-spacing:${U(1.4)};color:${C.soft};text-align:left;text-decoration:underline" data-tirar="${esc(p.id)}">REMOVER</button>`;
      y += RH;
      h += hline(M, PW - M, y - 7, C.gold, 0.3);
    }
    if (pags > 1) {
      if (m > 0) h += T("‹  ANTERIORES", M, y + 8, { size: 7.5, color: C.deep, cs: 1.6, bold: true, href: `#sacola-${m}` });
      if (m < pags - 1) h += T("MAIS PEÇAS  ›", PW - M, y + 8, { size: 7.5, color: C.deep, cs: 1.6, bold: true, align: "right", href: `#sacola-${m + 2}` });
    }
    // total, Pix e parcelas
    const n = l.reduce((s, i) => s + i.q, 0), semPreco = itens.some(i => i.p.valor == null);
    const total = itens.reduce((s, i) => s + (i.p.valor || 0) * i.q, 0);
    const yt = PH - 168;
    h += hline(M, PW - M, yt - 18, C.deep, 0.5);
    h += T(`TOTAL · ${n} ${n === 1 ? "PEÇA" : "PEÇAS"}`, M, yt, { size: 8, color: C.ink, cs: 2.2, bold: true });
    h += T(brl(total) + (semPreco ? " +" : ""), PW - M, yt + 2, { size: 19, color: C.deep, align: "right" });
    const lp = linhaPagamento(total);
    if (lp) h += T_CENTRO_AJUSTADO(lp, yt + 22, 7.5, C.ink);
    if (semPreco) h += T("ALGUMAS PEÇAS SÃO SOB CONSULTA", PW / 2, yt + 36, { size: 6, color: C.soft, cs: 1.4, align: "center" });
    // mensagem do pedido
    const pg = pagamento(cfg, total);
    const msg = ["Olá! Vi a vitrine Le Helê e quero fazer este pedido:", "",
      ...itens.map(i => `• ${i.q}× ${i.p.nome}${i.p.codigo ? " (" + i.p.codigo + ")" : ""} — ${i.p.valor != null ? brl(i.p.valor * i.q) : "sob consulta"}`), "",
      `Total: ${brl(total)}${semPreco ? " + peças sob consulta" : ""}`,
      ...(pg && pg.pix != null ? [`No Pix: ${brl(pg.pix)} (${LH.pctTxt(pg.pixPct)} de desconto)`] : []),
      ...(pg && pg.parcelas ? [`Ou ${pg.parcelas}x de ${brl(pg.parcela)} sem juros`] : [])].join("\n");
    const zap = whatsLink(cfg.whatsapp, msg);
    const w = 286, hh = 44, x = (PW - w) / 2, yb = PH - 110;
    h += `<div class="cta" style="${box(x, yb, w, hh)};background:${C.deep};border-radius:${U(hh / 2)};pointer-events:none"></div>`;
    h += T("ENVIAR PEDIDO NO WHATSAPP  ›", PW / 2, yb + hh / 2 + 4, { size: 10.5, color: C.paper, cs: 2.2, align: "center", bold: true });
    h += `<a class="hit" style="${box(x, yb, w, hh)}" href="${esc(zap)}" target="_blank" rel="noopener" data-pedido="1" aria-label="Enviar pedido no WhatsApp"></a>`;
    h += botao("‹  CONTINUAR VENDO", M, PH - 40, { href: voltar, nav: "prev" }).h;
    h += `<button type="button" class="hit t" style="${box(PW - M - 90, PH - 50, 90, 20)};font-size:${U(7)};letter-spacing:${U(1.6)};color:${C.soft};text-align:right;text-decoration:underline" data-esvaziar="1">ESVAZIAR SACOLA</button>`;
    return { bg: C.cream, html: h };
  }

  /* ---------- ampliar foto com dois dedos ---------- */
  function abrirZoom(src) {
    const ov = document.createElement("div");
    ov.className = "zoom";
    ov.innerHTML = `<img alt="" src="${esc(src)}" draggable="false"><button type="button" class="zoom-x" aria-label="Fechar">×</button><p class="zoom-dica">Use dois dedos para aproximar · toque duas vezes para ampliar</p>`;
    document.body.appendChild(ov);
    const im = ov.querySelector("img"), pts = new Map();
    let s = 1, tx = 0, ty = 0, base = null, ultimoToque = 0;
    const limitar = () => {
      s = Math.min(5, Math.max(1, s));
      const r = ov.getBoundingClientRect(), mw = (im.offsetWidth * s - r.width) / 2, mh = (im.offsetHeight * s - r.height) / 2;
      tx = Math.max(-Math.max(0, mw), Math.min(Math.max(0, mw), tx)); ty = Math.max(-Math.max(0, mh), Math.min(Math.max(0, mh), ty));
      if (s === 1) { tx = 0; ty = 0; }
    };
    const aplicar = () => { limitar(); im.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; };
    const fechar = () => { ov.remove(); document.removeEventListener("keydown", tecla, true); };
    const tecla = e => { if (e.key === "Escape") { e.stopPropagation(); fechar(); } else if (e.key.startsWith("Arrow")) e.stopPropagation(); };
    document.addEventListener("keydown", tecla, true);
    ov.querySelector(".zoom-x").onclick = fechar;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const meio = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
    im.addEventListener("pointerdown", e => {
      im.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) base = { d: dist(), s, tx, ty, m: meio() };
      else if (pts.size === 1) {
        const agora = Date.now();
        if (agora - ultimoToque < 300) { // toque duplo
          if (s > 1) { s = 1; } else { const r = ov.getBoundingClientRect(); s = 2.5; tx = (r.width / 2 - e.clientX) * 1.5; ty = (r.height / 2 - e.clientY) * 1.5; }
          aplicar(); ultimoToque = 0; return;
        }
        ultimoToque = agora; base = { x: e.clientX, y: e.clientY, tx, ty };
      }
    });
    im.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && base && base.d) { const m2 = meio(); s = base.s * dist() / base.d; tx = base.tx + (m2.x - base.m.x); ty = base.ty + (m2.y - base.m.y); aplicar(); }
      else if (pts.size === 1 && base && s > 1) { tx = base.tx + (e.clientX - base.x); ty = base.ty + (e.clientY - base.y); aplicar(); }
    });
    const solta = e => { pts.delete(e.pointerId); if (pts.size === 1) { const [p] = [...pts.values()]; base = { x: p.x, y: p.y, tx, ty }; } else if (!pts.size) base = null; };
    im.addEventListener("pointerup", solta); im.addEventListener("pointercancel", solta);
    ov.addEventListener("wheel", e => { e.preventDefault(); s *= e.deltaY < 0 ? 1.15 : 1 / 1.15; aplicar(); }, { passive: false });
  }

  /* ---------- compartilhar a peça com a foto ---------- */
  const fotoPronta = new Map();   // id -> File (já baixado, para o compartilhamento abrir na hora)
  function prepararFoto(p) {
    if (!p || !p.fotos[0] || fotoPronta.has(p.id) || !navigator.canShare) return;
    fotoPronta.set(p.id, null);
    fetch(fotoURL(p.fotos[0].full)).then(r => r.ok ? r.blob() : null).then(b => {
      if (!b) return;
      const nome = (p.nome || "peca").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "peca";
      fotoPronta.set(p.id, new File([b], `le-hele-${nome}.jpg`, { type: b.type || "image/jpeg" }));
    }).catch(() => { });
  }
  async function compartilhar(id) {
    const p = ativas().find(x => x.id === id); if (!p) return;
    const url = location.href.split("#")[0] + "#peca-" + id;
    const texto = `${p.nome}${p.valor != null ? " — " + brl(p.valor) : ""}\nLe Helê Semijoias: ${url}`;
    const f = fotoPronta.get(id);
    try {
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: texto }); return; }
      if (navigator.share) { await navigator.share({ title: p.nome, text: texto, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(texto); avisar("Link da peça copiado. É só colar na conversa."); }
    catch (e) { avisar(url); }
  }

  /* ---------- rotas ---------- */
  function rota() {
    const hsh = decodeURIComponent(location.hash.replace(/^#/, ""));
    let m;
    if (!hsh || hsh === "capa") return { tipo: "capa" };
    if (hsh === "linhas" || /^indice-\d+$/.test(hsh)) return { tipo: "linhas" };
    if ((m = hsh.match(/^(semijoias|ouro)-(\d+)$/))) return { tipo: "indice", linha: m[1], n: +m[2] - 1 };
    if ((m = hsh.match(/^novidades-(\d+)$/))) return { tipo: "novidades", n: +m[1] - 1 };
    if ((m = hsh.match(/^peca-(.+)-foto-(\d+)$/))) return { tipo: "foto", id: m[1], k: +m[2] };
    if ((m = hsh.match(/^peca-(.+)$/))) return { tipo: "peca", id: m[1] };
    if (hsh === "atendimento") return { tipo: "atendimento" };
    if ((m = hsh.match(/^sacola(?:-(\d+))?$/))) return { tipo: "sacola", n: m[1] ? +m[1] - 1 : 0 };
    return { tipo: "capa" };
  }
  function desenhar() {
    if (!V.pronto) return;
    const r = rota();
    let pg = null;
    if (r.tipo === "capa") pg = paginaCapa();
    else if (r.tipo === "linhas") pg = paginaLinhas();
    else if (r.tipo === "indice") pg = daLinha(r.linha).length ? paginaIndice(r.n, r.linha) : null;
    else if (r.tipo === "novidades") pg = ativas().some(ehNova) ? paginaIndice(r.n, "novidades") : null;
    else if (r.tipo === "peca") { pg = paginaPeca(r.id); if (pg) registrar("peca", r.id); }
    else if (r.tipo === "foto") pg = paginaFoto(r.id, r.k);
    else if (r.tipo === "atendimento") pg = (V.cfg.whatsapp || V.cfg.instagram) ? paginaAtendimento() : null;
    else if (r.tipo === "sacola") pg = usaSacola() ? paginaSacola(r.n) : null;
    if (r.tipo === "indice" || r.tipo === "novidades") V.ultimaLista = location.hash;
    if (r.tipo === "peca") prepararFoto(ativas().find(p => p.id === r.id));
    if (!pg) { location.replace("#linhas"); return; }
    app.style.background = pg.bg;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", pg.bg);
    app.innerHTML = `<div class="st" style="background:${pg.bg}">${pg.html}</div>`;
    ajustarMolduras();
  }
  // moldura justa em volta da foto quando o tamanho dela ainda não era conhecido
  function ajustarMolduras() {
    app.querySelectorAll('.fr-foto[data-auto="1"]').forEach(fr => {
      const im = fr.previousElementSibling && fr.previousElementSibling.tagName === "IMG" ? fr.previousElementSibling : null;
      if (!im) return;
      const aplicar = () => {
        if (!im.naturalWidth) return;
        const bw = parseFloat(im.style.width.match(/\*([\d.]+)/)[1]), bh = parseFloat(im.style.height.match(/\*([\d.]+)/)[1]);
        const bx = parseFloat(im.style.left.match(/\*(-?[\d.]+)/)[1]), by = parseFloat(im.style.top.match(/\*(-?[\d.]+)/)[1]);
        const k = Math.min(bw / im.naturalWidth, bh / im.naturalHeight), w = im.naturalWidth * k, hh = im.naturalHeight * k;
        const x = bx + (bw - w) / 2, y = by + (bh - hh) / 2;
        fr.style.left = U(x - 5); fr.style.top = U(y - 5); fr.style.width = U(w + 10); fr.style.height = U(hh + 10);
      };
      if (im.complete) aplicar(); else im.addEventListener("load", aplicar, { once: true });
    });
  }
  window.addEventListener("hashchange", desenhar);
  document.addEventListener("keydown", e => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const a = app.querySelector(`[data-nav="${e.key === "ArrowRight" ? "next" : "prev"}"]`);
    if (a) location.hash = a.getAttribute("href");
  });

  /* ---------- aviso ---------- */
  let avisoT;
  function avisar(msg) { const a = document.getElementById("aviso"); a.textContent = msg; a.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => a.hidden = true, 4000); }

  /* ---------- carregar e acompanhar mudanças ---------- */
  let sb = null;

  /* ---------- contador de acessos ----------
     Anota: abriu a vitrine, abriu uma peça, tocou em "Quero esta peça".
     Não conta a dona (aparelho com o painel conectado) e não repete a mesma
     anotação em menos de 30 minutos. O visitante é só um código aleatório do aparelho. */
  function visitante() {
    try {
      let v = localStorage.getItem("lehele-visitante");
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, ""); localStorage.setItem("lehele-visitante", v); }
      return v;
    } catch (e) { return "semlocal" + Math.random().toString(36).slice(2, 12); }
  }
  function ehDaLoja() {
    try {
      const tem = st => Object.keys(st).some(k => /^sb-.+-auth-token$/.test(k));
      return tem(localStorage) || tem(sessionStorage);
    } catch (e) { return false; }
  }
  function registrar(tipo, pecaId, detalhe) {
    if (!sb || ehDaLoja()) return;
    // não repete a mesma anotação (pedido: 1 minuto; o resto: 30 minutos)
    const chave = "lehele-reg-" + tipo + "-" + (pecaId || "") + (tipo === "pedido" ? "-" + JSON.stringify(detalhe || {}) : "");
    const janela = tipo === "pedido" ? 60e3 : 30 * 60e3;
    try { const t = +sessionStorage.getItem(chave) || 0; if (Date.now() - t < janela) return; sessionStorage.setItem(chave, String(Date.now())); } catch (e) { }
    const linha = { tipo, visitante: visitante(), peca_id: pecaId || null };
    const enviar = l => sb.from("acessos").insert(l).then(r => r, () => ({ error: true }));
    try {
      if (!detalhe) { enviar(linha); return; }
      // com detalhe (pedido / origem); se o banco ainda não tiver a coluna, anota sem ele
      enviar(Object.assign({}, linha, { detalhe })).then(r => { if (r && r.error && tipo !== "pedido") enviar(linha); });
    } catch (e) { }
  }
  app.addEventListener("click", e => {
    const a = e.target.closest("[data-zap]"); if (a) registrar("zap", a.getAttribute("data-zap"));
    const b = e.target.closest("button[data-add],button[data-mais],button[data-menos],button[data-tirar],button[data-esvaziar],button[data-zoom],button[data-share],a[data-pedido]");
    if (!b) return;
    const d = b.dataset;
    if (d.zoom) { abrirZoom(d.zoom); return; }
    if (d.share) { compartilhar(d.share); return; }
    if (d.pedido) {
      const l = sacola(), total = l.reduce((s, i) => { const p = ativas().find(x => x.id === i.id); return s + (p && p.valor ? p.valor * i.q : 0); }, 0);
      registrar("pedido", null, { itens: l.reduce((s, i) => s + i.q, 0), total });
      l.forEach(i => registrar("zap", i.id, { origem: "sacola" }));
      return;
    }
    if (d.add) { mudarSacola(d.add, 1); const n = qtdSacola(); avisar(`Adicionada à sacola · ${n} ${n === 1 ? "peça" : "peças"}`); }
    else if (d.mais) mudarSacola(d.mais, 1);
    else if (d.menos) mudarSacola(d.menos, -1);
    else if (d.tirar) mudarSacola(d.tirar, 0, true);
    else if (d.esvaziar) salvarSacola([]);
    desenhar();
  });
  async function carregar() {
    const [r1, r2] = await Promise.all([
      sb.from("pecas").select("*").eq("arquivada", false).order("criado_em", { ascending: true }),
      sb.from("config").select("*").eq("id", 1).maybeSingle()
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    let desejadas = [];
    try { const r3 = await sb.rpc("mais_desejadas", { qtd: 3 }); if (!r3.error && Array.isArray(r3.data)) desejadas = r3.data.map(x => typeof x === "object" && x ? Object.values(x)[0] : x); } catch (e) { }
    return { pecas: (r1.data || []).map(rowToPeca), cfg: rowToConfig(r2.data), desejadas };
  }
  let recT, primeira = true;
  function recarregar() {
    clearTimeout(recT);
    recT = setTimeout(async () => {
      try {
        const antes = new Set(V.pecas.map(p => p.id));
        const d = await carregar();
        const chave = x => JSON.stringify([x.pecas, x.cfg.colecao, x.cfg.whatsapp, x.cfg.instagram, x.cfg.ordemCats, x.cfg.destaques, x.cfg.pixDesconto, x.cfg.parcelasMax, x.cfg.parcelaMin, [...x.desejadas].sort()]);
        const mudou = chave({ ...d, desejadas: new Set(d.desejadas) }) !== chave(V);
        V.pecas = d.pecas; V.cfg = d.cfg; V.desejadas = new Set(d.desejadas);
        if (mudou) {
          const novas = d.pecas.filter(p => !antes.has(p.id)).length;
          desenhar();
          avisar(novas ? `Vitrine atualizada · ${novas} ${novas === 1 ? "peça nova" : "peças novas"}` : "Vitrine atualizada");
        }
      } catch (e) { /* tenta de novo na próxima mudança */ }
    }, 500);
  }

  function erro(msg, retry) {
    app.style.background = C.taupe;
    app.innerHTML = `<div class="msg"><div><img src="assets/emblema.jpg" alt=""><h1>Le Helê</h1><p>${esc(msg)}</p>${retry ? '<button type="button" id="tentar">Tentar de novo</button>' : ""}</div></div>`;
    const b = document.getElementById("tentar"); if (b) b.onclick = () => location.reload();
  }

  async function iniciar() {
    if (!configurado()) { erro("A vitrine está sendo preparada. Volte em instantes.", false); return; }
    // novidades: peças cadastradas depois da última visita desta cliente
    const agora = Date.now();
    try {
      const ult = +localStorage.getItem("lehele-ultima-visita") || 0;
      V.novDesde = ult || agora;
      localStorage.setItem("lehele-ultima-visita", String(agora));
    } catch (e) { V.novDesde = agora; }
    try { await document.fonts.load(`10px "LH Didot"`); } catch (e) { }
    try {
      sb = criarCliente();
      const d = await carregar();
      V.pecas = d.pecas; V.cfg = d.cfg; V.desejadas = new Set(d.desejadas); V.pronto = true;
      registrar("visita");
      desenhar();
    } catch (e) {
      console.error(e);
      erro("Não foi possível abrir a vitrine agora. Verifique a internet e tente de novo.", true);
      return;
    }
    try {
      sb.channel("vitrine-publica")
        .on("postgres_changes", { event: "*", schema: "public", table: "config" }, recarregar)
        .subscribe();
    } catch (e) { }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) recarregar(); });
    setInterval(() => { if (!document.hidden) recarregar(); }, 5 * 60 * 1000);
  }
  window.__vitrine = { recarregar, V };
  iniciar();
})();
