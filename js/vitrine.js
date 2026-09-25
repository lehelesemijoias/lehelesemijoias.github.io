/* =========================================================
   VITRINE LE HELÊ — página das clientes
   Uma página por vez, navegação só pelos botões.
   Lê as peças do Supabase e se atualiza sozinha.
   ========================================================= */
(function () {
  const { esc, brl, catOf, ordenar, whatsLink, rowToPeca, rowToConfig, fotoURL, configurado, criarCliente } = LH;
  const PW = 405, PH = 720;
  const C = { taupe: "#D0BFA8", cream: "#EBDECA", gold: "#C8A96A", deep: "#A9823E", ink: "#4A3A22", soft: "#8A7150", paper: "#F4ECDF", cat: "#6E5122" };
  const app = document.getElementById("app");
  const V = { pecas: [], cfg: {}, novDesde: 0, pronto: false };
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
    return `<div class="${c}" style="${st}">${esc(s)}</div>`;
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
  const link = (x, y, w, h, href, o = {}) => `<a class="hit" style="${box(x, y, w, h)}" href="${esc(href)}"${o.ext ? ' target="_blank" rel="noopener"' : ""}${o.nav ? ` data-nav="${o.nav}"` : ""} aria-label="${esc(o.label || "")}"></a>`;
  const img = (src, x, y, w, h, cls = "im", extra = "") => `<img class="${cls}" src="${esc(src)}" alt="" style="${box(x, y, w, h)};${extra}" loading="eager" decoding="async">`;
  const selo = (x, y) => `<div class="pill t b" style="${box(x, y, 58, 13)};background:${C.deep};color:${C.paper};font-size:${U(6)};letter-spacing:${U(1.6)};--sw:${U(0.25)};z-index:2">NOVIDADE</div>`;

  /* ---------- dados ---------- */
  const ativas = () => ordenar(V.cfg, V.pecas.filter(p => !p.arquivada));
  const ehNova = p => p.criadoEm > V.novDesde;
  const thumbDe = p => { const f = p.fotos[0]; return f ? fotoURL(f.thumb || f.full) : ""; };

  /* ---------- plano do índice (mesmo do PDF) ---------- */
  const M = 31.5, GAP = 14, colW = (PW - 2 * M - GAP) / 2, cardH = colW + 46, ROWGAP = 16, CATH = 30, LIM = PH - 48;
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
      const w = largura(s, 8.5, 2) + 34, x = (PW - w) / 2, yb = PH - 146;
      h += rect(x, yb, w, 26, { fill: C.deep, r: 13 });
      h += estrela(x + 14, yb + 13, 4.5, C.paper);
      h += T(s, x + 24, yb + 16.5, { size: 8.5, color: C.paper, cs: 2, bold: true });
      h += link(x, yb, w, 26, "#novidades-1", { label: "Ver novidades" });
    }
    const bw = 214, bx = (PW - bw) / 2, by = PH - 102;
    h += rect(bx, by, bw, 38, { stroke: C.deep, lw: 0.9, r: 19 });
    h += T("ENTRAR NA VITRINE  ›", PW / 2, by + 23, { size: 10, color: C.ink, cs: 2.6, align: "center", bold: true });
    h += link(bx, by, bw, 38, "#indice-1", { label: "Entrar na vitrine", nav: "next" });
    return { bg: C.taupe, html: h };
  }

  function paginaIndice(m, modo) {
    const todas = ativas();
    const lista = modo === "novidades" ? todas.filter(ehNova) : todas;
    const { pags } = planoIndice(lista);
    m = Math.max(0, Math.min(m, pags.length - 1));
    const base = modo === "novidades" ? "#novidades-" : "#indice-";
    const cfg = V.cfg;
    let h = moldura();
    if (m === 0) {
      h += img("assets/emblema.jpg", PW / 2 - 29, 34, 58, 54, "im");
      h += `<div style="${box(PW / 2 - 33, 28, 66, 66)};border:max(${U(0.5)},.5px) solid ${C.gold};border-radius:50%;pointer-events:none"></div>`;
      h += T(modo === "novidades" ? "Novidades" : "Vitrine", PW / 2, 126, { size: 30, color: C.ink, align: "center" });
      h += T(modo === "novidades" ? "DESDE A SUA ÚLTIMA VISITA" : (cfg.colecao || "Le Helê Semi Joias").toUpperCase(), PW / 2, 143, { size: 7.5, color: C.deep, cs: 3, align: "center" });
      h += divisor(PW / 2, 157, 150);
      h += T("TOQUE EM UMA PEÇA PARA VER OS DETALHES", PW / 2, 172, { size: 5.8, color: C.soft, cs: 2, align: "center" });
    } else {
      h += T(modo === "novidades" ? "NOVIDADES" : "VITRINE", M, 46, { size: 8, color: C.deep, cs: 3.5 });
      h += T("LE HELÊ", PW - M, 46, { size: 8, color: C.deep, cs: 3.5, align: "right" });
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
      if (ehNova(p) && modo !== "novidades") h += selo(it.x + 9, it.y + 9);
      const nl = linhas(p.nome, 11.5, colW - 6, 2);
      nl.forEach((l, i) => { h += `<div class="t" style="left:${U(it.x)};width:${U(colW)};text-align:center;top:${U(it.y + colW + 16 + i * 13 - 0.91 * 11.5)};font-size:${U(11.5)};color:${C.ink}">${esc(l)}</div>`; });
      if (p.codigo) h += `<div class="t" style="left:${U(it.x)};width:${U(colW)};text-align:center;top:${U(it.y + colW + 16 + nl.length * 13 + 1 - 0.91 * 6.5)};font-size:${U(6.5)};color:${C.deep};letter-spacing:${U(1.8)}">${esc(p.codigo.toUpperCase())}</div>`;
      h += link(it.x, it.y, colW, cardH - 4, `#peca-${p.id}`, { label: p.nome });
    }
    const FY = PH - 36, nav = { size: 9, color: C.deep, cs: 2, bold: true };
    const esq = m === 0 ? (modo === "novidades" ? ["‹  CAPA", "#capa"] : ["‹  CAPA", "#capa"]) : ["‹  ANTERIOR", base + m];
    h += T(esq[0], M, FY, { ...nav, href: esq[1], nav: "prev" });
    const temContato = !!(cfg.whatsapp || cfg.instagram);
    let dir = null;
    if (m < pags.length - 1) dir = ["PRÓXIMA  ›", base + (m + 2)];
    else if (modo === "novidades") dir = ["VITRINE COMPLETA  ›", "#indice-1"];
    else if (temContato) dir = ["ATENDIMENTO  ›", "#atendimento"];
    if (dir) h += T(dir[0], PW - M, FY, { ...nav, align: "right", href: dir[1], nav: "next" });
    if (pags.length > 1) h += T(`${m + 1} / ${pags.length}`, PW / 2, FY, { size: 8, color: C.soft, cs: 1.5, align: "center" });
    return { bg: C.cream, html: h };
  }

  function paginaPeca(id) {
    const lista = ativas(), idx = lista.findIndex(p => p.id === id);
    if (idx < 0) return null;
    const p = lista[idx], fotos = p.fotos, cfg = V.cfg;
    const { onde } = planoIndice(lista);
    let h = moldura();
    h += T("‹  ÍNDICE", 30, 44, { size: 11.5, color: C.deep, cs: 2.2, bold: true, href: "#indice-" + (onde.get(p.id) || 1) });
    h += T(`${String(idx + 1).padStart(2, "0")} / ${String(lista.length).padStart(2, "0")}`, PW / 2, 44, { size: 7.5, color: C.soft, cs: 1.5, align: "center" });
    const ant = lista[idx - 1], seg = lista[idx + 1];
    h += T("›", PW - 30, 49, { size: 30, color: seg ? C.deep : C.taupe, align: "right", bold: !!seg });
    h += T("‹", PW - 76, 49, { size: 30, color: ant ? C.deep : C.taupe, align: "right", bold: !!ant });
    if (seg) h += link(PW - 58, 20, 42, 38, `#peca-${seg.id}`, { label: "Próxima peça", nav: "next" });
    if (ant) h += link(PW - 104, 20, 42, 38, `#peca-${ant.id}`, { label: "Peça anterior", nav: "prev" });

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
      h += `<div class="fr-foto" data-auto="${conhecido ? 0 : 1}" style="${box(fx - 5, top - 5, fw + 10, fh + 10)};border:max(${U(0.5)},.5px) solid ${C.gold};pointer-events:none"></div>`;
    } else h += rect(fx, top, fw, fh, { fill: C.taupe });
    if (ehNova(p)) h += selo(fx + 4, top + 4);
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
      h += T("TOQUE NAS MINIATURAS PARA AMPLIAR", PW / 2, yy + 8, { size: 5.5, color: C.soft, cs: 1.6, align: "center" });
      yy += 10;
    }
    let ty = yy + 26;
    if (catOf(p)) { h += T(catOf(p).toUpperCase(), PW / 2, ty, { size: 9.5, color: C.cat, cs: 3, align: "center" }); ty += 26; } else ty += 6;
    nomeLs.forEach((l, i) => { h += T(l, PW / 2, ty + i * 25, { size: 22, color: C.ink, align: "center" }); });
    ty += (nomeLs.length - 1) * 25 + 16;
    if (p.codigo) { h += T("REF. " + p.codigo.toUpperCase(), PW / 2, ty, { size: 7, color: C.soft, cs: 2, align: "center" }); ty += 14; }
    h += divisor(PW / 2, ty, 110); ty += 26;
    h += T(brl(p.valor) || "Sob consulta", PW / 2, ty, { size: p.valor != null ? 21 : 15, color: C.deep, align: "center" });
    ty += 17;
    if (p.banho) {
      const bt = "BANHO · " + p.banho.toUpperCase().replace(/^BANHO\s+/, ""); let bs = 9.5;
      while (bs > 6.5 && largura(bt, bs, 2) > 330) bs -= 0.5;
      h += T(bt, PW / 2, ty + 2, { size: bs, color: C.ink, cs: 2, align: "center" }); ty += 17;
    }
    ty += 12;
    const limite = zap ? PH - 110 : PH - 44;
    const cabem = Math.max(0, Math.floor((limite - ty) / DESC_LH) + 1);
    if (descLs.length) {
      const ls = descLs.length > cabem ? linhas(p.descricao, DESC_S, DESC_W, cabem) : descLs;
      ls.forEach((l, i) => { h += T(l, PW / 2, ty + i * DESC_LH, { size: DESC_S, color: C.ink, align: "center" }); });
    }
    if (zap) {
      const w = 222, hh = 38, x = (PW - w) / 2, yb = PH - 92;
      h += rect(x, yb, w, hh, { fill: C.deep, r: 19 });
      h += T("QUERO ESTA PEÇA", PW / 2, yb + 23, { size: 10, color: C.paper, cs: 2.8, align: "center", bold: true });
      h += link(x, yb, w, hh, zap, { ext: true, label: "Quero esta peça (WhatsApp)" });
      h += T("ATENDIMENTO PELO WHATSAPP", PW / 2, yb + hh + 12, { size: 5.5, color: C.soft, cs: 1.8, align: "center" });
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
    h += T(linhas(p.nome, 17, 320, 1)[0], PW / 2, 80, { size: 17, color: C.ink, align: "center" });
    h += divisor(PW / 2, 94, 90);
    const maxW = PW - 64, maxH = PH - 118 - 92;
    let gw = maxW, gh = maxH, conhecido = false;
    if (f.w && f.h) { const kk = Math.min(maxW / f.w, maxH / f.h); gw = f.w * kk; gh = f.h * kk; conhecido = true; }
    const gx = (PW - gw) / 2, gy = 118 + (maxH - gh) / 2;
    h += img(fotoURL(f.full), gx, gy, gw, gh, "ct");
    h += `<div class="fr-foto" data-auto="${conhecido ? 0 : 1}" style="${box(gx - 5, gy - 5, gw + 10, gh + 10)};border:max(${U(0.6)},.5px) solid ${C.cream};pointer-events:none"></div>`;
    const prev = k === 2 ? `#peca-${p.id}` : `#peca-${p.id}-foto-${k - 1}`;
    h += T("‹  ANTERIOR", 30, PH - 42, { size: 9, color: C.ink, cs: 2, bold: true, href: prev, nav: "prev" });
    if (k < p.fotos.length) h += T("PRÓXIMA  ›", PW - 30, PH - 42, { size: 9, color: C.ink, cs: 2, align: "right", bold: true, href: `#peca-${p.id}-foto-${k + 1}`, nav: "next" });
    else h += T("VOLTAR À PEÇA  ›", PW - 30, PH - 42, { size: 9, color: C.ink, cs: 2, align: "right", bold: true, href: `#peca-${p.id}`, nav: "next" });
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
    h += T("‹  VOLTAR AO ÍNDICE", PW / 2, PH - 60, { size: 9, color: C.ink, cs: 2.2, align: "center", bold: true, href: "#indice-1", nav: "prev" });
    return { bg: C.taupe, html: h };
  }

  /* ---------- rotas ---------- */
  function rota() {
    const hsh = decodeURIComponent(location.hash.replace(/^#/, ""));
    let m;
    if (!hsh || hsh === "capa") return { tipo: "capa" };
    if ((m = hsh.match(/^indice-(\d+)$/))) return { tipo: "indice", n: +m[1] - 1 };
    if ((m = hsh.match(/^novidades-(\d+)$/))) return { tipo: "novidades", n: +m[1] - 1 };
    if ((m = hsh.match(/^peca-(.+)-foto-(\d+)$/))) return { tipo: "foto", id: m[1], k: +m[2] };
    if ((m = hsh.match(/^peca-(.+)$/))) return { tipo: "peca", id: m[1] };
    if (hsh === "atendimento") return { tipo: "atendimento" };
    return { tipo: "capa" };
  }
  function desenhar() {
    if (!V.pronto) return;
    const r = rota();
    let pg = null;
    if (r.tipo === "capa") pg = paginaCapa();
    else if (r.tipo === "indice") pg = paginaIndice(r.n, "indice");
    else if (r.tipo === "novidades") pg = ativas().some(ehNova) ? paginaIndice(r.n, "novidades") : paginaIndice(0, "indice");
    else if (r.tipo === "peca") pg = paginaPeca(r.id);
    else if (r.tipo === "foto") pg = paginaFoto(r.id, r.k);
    else if (r.tipo === "atendimento") pg = (V.cfg.whatsapp || V.cfg.instagram) ? paginaAtendimento() : null;
    if (!pg) { location.replace("#indice-1"); return; }
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
  async function carregar() {
    const [r1, r2] = await Promise.all([
      sb.from("pecas").select("*").eq("arquivada", false).order("criado_em", { ascending: true }),
      sb.from("config").select("*").eq("id", 1).maybeSingle()
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    return { pecas: (r1.data || []).map(rowToPeca), cfg: rowToConfig(r2.data) };
  }
  let recT, primeira = true;
  function recarregar() {
    clearTimeout(recT);
    recT = setTimeout(async () => {
      try {
        const antes = new Set(V.pecas.map(p => p.id));
        const d = await carregar();
        const mudou = JSON.stringify([d.pecas, d.cfg.colecao, d.cfg.whatsapp, d.cfg.instagram, d.cfg.ordemCats]) !== JSON.stringify([V.pecas, V.cfg.colecao, V.cfg.whatsapp, V.cfg.instagram, V.cfg.ordemCats]);
        V.pecas = d.pecas; V.cfg = d.cfg;
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
      V.pecas = d.pecas; V.cfg = d.cfg; V.pronto = true;
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
