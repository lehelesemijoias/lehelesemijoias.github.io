/* Painel Le Helê — código do painel (antes ficava dentro do painel.html) */

const $ = s => document.querySelector(s);
const CATS_BASE = ["Anéis","Brincos","Colares","Pulseiras","Tornozeleiras","Conjuntos","Piercings","Braceletes"];
const BANHOS_BASE = ["Ouro 18k","Ouro rosé","Ródio branco","Ródio negro","Prata 925","Banho de ouro 18k com zircônias"];

const S = { pecas: [], config: {}, filtro: "", busca: "", canWrite: false, ready: false, email: "" };
let store = null;

/* ---------- utilidades ---------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "");
const brl = LH.brl;
function parseValor(s) {
  s = String(s || "").replace(/[^\d,.]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Math.round(parseFloat(s) * 100);
  return isFinite(n) ? n : null;
}
const fmtValorInput = c => c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = LH.esc;
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const catOf = LH.catOf, norm = LH.norm;
const rankCat = c => LH.rankCat(S.config, c);
const ordenarCats = cats => LH.ordenarCats(S.config, cats);
const ordenar = pecas => LH.ordenar(S.config, pecas);

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("imagem")); i.src = src; });
}
async function comprimir(file, max = 1600, q = 0.86) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", q));
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- armazenamento: Supabase ---------- */
function SupaStore(sb) {
  const B = sb.storage.from("fotos");
  let onP = () => { }, onC = () => { }, t = null;
  const pub = p => p ? B.getPublicUrl(p).data.publicUrl : "";
  async function carregar() {
    const [r1, r2] = await Promise.all([
      sb.from("pecas").select("*").order("criado_em", { ascending: true }),
      sb.from("config").select("*").eq("id", 1).maybeSingle()
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    onC(LH.rowToConfig(r2.data)); onP((r1.data || []).map(LH.rowToPeca));
  }
  const agendar = () => { clearTimeout(t); t = setTimeout(() => carregar().catch(() => { }), 300); };
  return {
    kind: "supabase",
    async init(p, c) {
      onP = p; onC = c; await carregar();
      try { sb.channel("painel").on("postgres_changes", { event: "*", schema: "public", table: "config" }, agendar).subscribe(); } catch (e) { }
      document.addEventListener("visibilitychange", () => { if (!document.hidden) agendar(); });
    },
    recarregar: carregar,
    async savePeca(id, d) {
      const row = LH.pecaToRow(d);
      if (id) { const { error } = await sb.from("pecas").update(row).eq("id", id); if (error) throw error; }
      else { const { data, error } = await sb.from("pecas").insert(row).select("id").single(); if (error) throw error; id = data.id; }
      agendar(); return id;
    },
    async deletePeca(id) { const { error } = await sb.from("pecas").delete().eq("id", id); if (error) throw error; agendar(); },
    async saveConfig(c) { const { error } = await sb.from("config").update(LH.configToRow(c)).eq("id", 1); if (error) throw error; agendar(); },
    async upload(file) {
      const base = "pecas/" + uid();
      const full = await comprimir(file, 1600, 0.85), thumb = await comprimir(file, 600, 0.8);
      const dim = await medir(full);
      for (const [path, blob] of [[base + "-full.jpg", full], [base + "-thumb.jpg", thumb]]) {
        const { error } = await B.upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (error) throw error;
      }
      return { full: base + "-full.jpg", thumb: base + "-thumb.jpg", w: dim.w, h: dim.h };
    },
    async removeFoto(ref) { try { await B.remove([ref.full, ref.thumb].filter((x, i, a) => x && a.indexOf(x) === i)); } catch (e) { } },
    url: ref => ref ? pub(ref.thumb || ref.full) : "",
    urlFull: ref => ref ? pub(ref.full || ref.thumb) : "",
    async blob(ref) { const r = await fetch(pub(ref.full || ref.thumb)); if (!r.ok) throw new Error("foto indisponível"); return r.blob(); }
  };
}
async function medir(blob) {
  const url = URL.createObjectURL(blob);
  try { const i = await loadImg(url); return { w: i.naturalWidth, h: i.naturalHeight }; } catch (e) { return { w: 0, h: 0 }; } finally { URL.revokeObjectURL(url); }
}

/* ---------- inicialização e login ---------- */
let sb = null;
function mostrarGate(qual) {
  $("#gate").hidden = !qual;
  ["gateCarregando", "gateConfig", "gateLogin", "gateNovaSenha", "gateSemAcesso", "gateErro"].forEach(id => $("#" + id).hidden = id !== qual);
  if (qual === "gateLogin") setTimeout(() => $("#lEmail").focus(), 50);
}
function setStatus() {
  $("#status").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/><path d="M9.5 13.5l2 2 3.5-4"/></svg><b>Vitrine online</b>';
}
const siteURL = () => (LH.CFG.SITE_URL || new URL(".", location.href).href);
function prepararCompartilhar() {
  const url = siteURL();
  $("#shareBox").hidden = false;
  $("#linkVitrine").href = url; $("#linkVitrine").textContent = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  $("#btnCopiar").onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copiado"); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#linkVitrine")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Link selecionado. Copie e cole onde quiser."); }
  };
  $("#btnZap").onclick = () => { window.open("https://wa.me/?text=" + encodeURIComponent(`Conheça a vitrine Le Helê ✨ ${url}`), "_blank", "noopener"); };
}
let iniciado = false;
async function entrarNoPainel(session) {
  S.email = (session && session.user && session.user.email) || "";
  let r = await sb.rpc("is_admin");
  if (r.error) { await sleep(1500); r = await sb.rpc("is_admin"); }
  if (r.error) { console.error(r.error); mostrarGate("gateErro"); return; }
  if (!r.data) { mostrarGate("gateSemAcesso"); return; }
  if (LH.manterConectado() && navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { } }
  mostrarGate(null);
  $("#btnSair").hidden = false; $("#btnAjustes").hidden = false;
  $("#contaEmail").textContent = S.email ? "Conectado como " + S.email : "";
  S.canWrite = true;
  $("#abas").hidden = false;
  setStatus(); prepararCompartilhar();
  if (iniciado) return;
  iniciado = true;
  try {
    try { const pr = await sb.from("pecas").select("valor_antigo").limit(1); LH.colunas.valorAntigo = !pr.error; } catch (e) { LH.colunas.valorAntigo = false; }
    store = SupaStore(sb);
    await store.init(pecas => { S.pecas = pecas; S.ready = true; render(); }, cfg => { S.config = cfg || {}; if (S.ready) render(); });
    if (location.hash === "#acessos") mostrarAba("acessos");   // vindo da Gestão
  } catch (e) {
    console.error(e);
    $("#lista").innerHTML = '<div class="empty"><h3>Não foi possível carregar</h3><p class="hint">Verifique a internet e se o script do Supabase foi executado (guia, passo 2).</p></div>';
  }
}
const faltaLinha = e => /linha/i.test(((e && (e.message || "")) + " " + (e && (e.details || e.hint || "")))) && /column|coluna|schema|find/i.test((e && e.message) || "");

/* ---------- abas e acessos ---------- */
const AC = { dias: 7, pedido: 0, verTodas: false };
function mostrarAba(qual) {
  const ac = qual === "acessos";
  $("#abaPecas").hidden = ac; $("#abaAcessos").hidden = !ac;
  $("#tabPecas").setAttribute("aria-selected", String(!ac)); $("#tabAcessos").setAttribute("aria-selected", String(ac));
  $(".dock").hidden = ac;
  document.body.style.paddingBottom = ac ? "24px" : "";
  window.scrollTo(0, 0);
  if (ac) carregarAcessos();
}
$("#tabPecas").onclick = () => mostrarAba("pecas");
$("#tabAcessos").onclick = () => mostrarAba("acessos");
$("#acAtualizar").onclick = () => carregarAcessos();
document.querySelectorAll(".periodo button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".periodo button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  AC.dias = b.dataset.dias ? +b.dataset.dias : null; AC.verTodas = false;
  carregarAcessos();
});
const milhar = n => String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dataBR = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
async function carregarAcessos() {
  const box = $("#acConteudo"), meu = ++AC.pedido;
  if (!box.innerHTML) box.innerHTML = '<div class="loading">CARREGANDO ACESSOS…</div>';
  box.style.opacity = ".55";
  const { data, error } = await sb.rpc("resumo_acessos", { dias: AC.dias });
  if (meu !== AC.pedido) return;
  box.style.opacity = "";
  if (error) {
    console.error(error);
    const falta = /resumo_acessos|PGRST202|42883|does not exist|not find/i.test((error.message || "") + " " + (error.code || ""));
    box.innerHTML = falta
      ? '<div class="empty"><h3>Falta ligar o contador</h3><p class="hint">No Supabase, abra o SQL Editor, cole o conteúdo do arquivo <b>acessos.sql</b> e toque em Run. Depois volte aqui e toque em Atualizar.</p></div>'
      : '<div class="empty"><h3>Não foi possível carregar</h3><p class="hint">Verifique a internet e toque em Atualizar.</p></div>';
    return;
  }
  renderAcessos(data || {});
}
function renderAcessos(d) {
  const periodo = AC.dias ? `nos últimos ${AC.dias} dias` : "desde o início";
  const lista = (d.pecas || []).filter(x => x.aberturas > 0 || x.zap > 0);
  const porId = new Map(S.pecas.map(p => [p.id, p]));
  const max = Math.max(1, ...lista.map(x => x.aberturas));
  const mostrar = AC.verTodas ? lista : lista.slice(0, 10);
  const itens = mostrar.map((x, i) => {
    const p = porId.get(x.peca_id), f = p && p.fotos[0];
    return `<li class="${!p || p.arquivada ? "fora" : ""}">
      <span class="pos">${i + 1}</span>
      ${f ? `<img src="${esc(store.url(f))}" alt="" loading="lazy">` : '<span class="semfoto"></span>'}
      <div><div class="nm">${esc(p ? p.nome : "Peça excluída")}</div>
        <div class="sub">${esc([p && p.codigo, p && catOf(p), p && p.arquivada ? "arquivada" : ""].filter(Boolean).join(" · "))}</div>
        <div class="barra"><i style="width:${Math.round(x.aberturas / max * 100)}%"></i></div></div>
      <div class="num">${milhar(x.aberturas)}<small>${x.aberturas === 1 ? "visualização" : "visualizações"}</small>${x.zap ? `<em>${milhar(x.zap)} no WhatsApp</em>` : ""}</div>
    </li>`;
  }).join("");
  $("#acConteudo").innerHTML = `
    <div class="kpis">
      <div class="kpi"><span class="lbl">Visitas</span><b>${milhar(d.visitas)}</b><small>vezes que a vitrine foi aberta ${periodo}</small></div>
      <div class="kpi"><span class="lbl">Clientes diferentes</span><b>${milhar(d.visitantes)}</b><small>aparelhos diferentes ${periodo}</small></div>
    </div>
    <p class="nota">${d.primeiro ? `Contando desde ${dataBR(d.primeiro)}. ` : ""}Aberturas do mesmo aparelho em menos de 30 minutos contam uma vez. Aparelhos com o painel conectado não entram na conta.</p>
    <div class="sec-t"><h3>Peças mais vistas</h3><span>${lista.length ? `${lista.length} ${lista.length === 1 ? "peça" : "peças"}` : ""}</span></div>
    ${lista.length ? `<ol class="ranking">${itens}</ol>${lista.length > 10 ? `<p style="text-align:center;margin:14px 0 0"><button class="btn sm" type="button" id="acTodas">${AC.verTodas ? "Mostrar só as 10 primeiras" : `Ver todas (${lista.length})`}</button></p>` : ""}`
      : `<div class="empty"><h3>${d.visitas ? "Nenhuma peça aberta" : "Nenhuma visita"} ${periodo}</h3><p class="hint">Assim que as clientes abrirem a vitrine, os números aparecem aqui. Envie o link pelo botão “Enviar no WhatsApp” na aba Peças.</p></div>`}`;
  const t = $("#acTodas"); if (t) t.onclick = () => { AC.verTodas = !AC.verTodas; renderAcessos(d); };
}

async function boot() {
  if (!LH.configurado()) { mostrarGate("gateConfig"); return; }
  sb = LH.criarCliente();
  let recuperando = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") { recuperando = true; mostrarGate("gateNovaSenha"); return; }
    if (ev === "SIGNED_IN" && session && !recuperando) entrarNoPainel(session);
    if (ev === "SIGNED_OUT") location.reload();
  });
  const { data } = await sb.auth.getSession();
  if (recuperando) { mostrarGate("gateNovaSenha"); return; }
  if (data && data.session) entrarNoPainel(data.session); else mostrarGate("gateLogin");
}
$("#fLogin").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#lEmail").value.trim(), senha = $("#lSenha").value;
  $("#lErro").textContent = "";
  if (!email || !senha) { $("#lErro").textContent = "Preencha e-mail e senha."; return; }
  const b = $("#lEntrar"); b.disabled = true; b.textContent = "Entrando…";
  try { localStorage.setItem("lehele-manter", $("#lManter").checked ? "1" : "0"); } catch (err) { }
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  b.disabled = false; b.textContent = "Entrar";
  if (!error && window.PasswordCredential && navigator.credentials) {
    // oferece salvar a senha no gerenciador do navegador (Chrome/Android)
    try { navigator.credentials.store(new PasswordCredential({ id: email, password: senha, name: email })).catch(() => { }); } catch (err) { }
  }
  if (error) $("#lErro").textContent = /invalid/i.test(error.message || "") ? "E-mail ou senha incorretos." : "Não foi possível entrar. Verifique a internet.";
});
$("#lEsqueci").onclick = async () => {
  const email = $("#lEmail").value.trim();
  if (!email) { $("#lErro").textContent = "Digite seu e-mail acima e toque de novo em “Esqueci minha senha”."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("painel.html", siteURL()).href });
  $("#lErro").textContent = error ? "Não foi possível enviar agora. Tente de novo em alguns minutos." : "Enviamos um link para " + email + ". Abra o e-mail para criar a nova senha.";
};
$("#fNovaSenha").addEventListener("submit", async e => {
  e.preventDefault();
  const senha = $("#nSenha").value;
  if (senha.length < 6) { $("#nErro").textContent = "Use pelo menos 6 caracteres."; return; }
  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) { $("#nErro").textContent = "Não foi possível salvar. Peça um novo link."; return; }
  history.replaceState(null, "", location.pathname);
  const { data } = await sb.auth.getSession();
  toast("Senha alterada"); entrarNoPainel(data.session);
});
$("#btnSair").onclick = () => sb.auth.signOut();
$("#gTentar").onclick = () => location.reload();
try { $("#lManter").checked = localStorage.getItem("lehele-manter") !== "0"; } catch (e) { }
$("#gSair").onclick = () => sb.auth.signOut();

/* ---------- lista ---------- */
function render() {
  const todas = ordenar(S.pecas);
  const pecas = [...todas.filter(p => !p.arquivada), ...todas.filter(p => p.arquivada)];
  const nArq = pecas.filter(p => p.arquivada).length;
  const cats = [...new Set(pecas.map(catOf).filter(Boolean))];
  if (S.filtro && !["__sem", "__arq", "__l:semijoias", "__l:ouro"].includes(S.filtro) && !cats.includes(S.filtro)) S.filtro = "";
  if (S.filtro === "__arq" && !nArq) S.filtro = "";
  $("#resumo").textContent = pecas.length ? `${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}${cats.length ? " · " + cats.length + (cats.length === 1 ? " categoria" : " categorias") : ""}${nArq ? " · " + nArq + (nArq === 1 ? " arquivada" : " arquivadas") : ""}` : "";
  $("#tools").hidden = !pecas.length;
  $("#atalhoOrdem").hidden = !S.canWrite || cats.length < 2;
  $("#filtroCat").innerHTML = `<option value="">Todas as categorias</option>` + cats.map(c => `<option value="${esc(c)}" ${c === S.filtro ? "selected" : ""}>${esc(c)}</option>`).join("") + (pecas.some(p => !catOf(p)) ? `<option value="__sem" ${S.filtro === "__sem" ? "selected" : ""}>Sem categoria</option>` : "") + (nArq ? `<option value="__arq" ${S.filtro === "__arq" ? "selected" : ""}>Arquivadas</option>` : "") + `<optgroup label="Linha">${LH.LINHAS.map(l => `<option value="__l:${l.id}" ${S.filtro === "__l:" + l.id ? "selected" : ""}>Só ${l.nome}</option>`).join("")}</optgroup>`;
  if (S.filtro === "__sem" && !pecas.some(p => !catOf(p))) S.filtro = "";
  $("#filtroCat").value = S.filtro;
  $("#filtroBox").classList.toggle("on", !!S.filtro);
  $("#buscaLimpar").hidden = !S.busca;
  $("#btnAdd").disabled = !S.ready;
  $("#dlCategorias").innerHTML = [...new Set([...cats, ...CATS_BASE])].map(c => `<option value="${esc(c)}">`).join("");
  $("#dlBanhos").innerHTML = [...new Set([...pecas.map(p => (p.banho || "").trim()).filter(Boolean), ...BANHOS_BASE])].map(c => `<option value="${esc(c)}">`).join("");

  if (!pecas.length) {
    $("#mostrando").hidden = true;
    $("#lista").innerHTML = `<div class="empty"><img src="assets/emblema.jpg" alt="">
      <h3>Sua vitrine começa aqui</h3>
      <ol><li>Toque em Adicionar e escolha as fotos da peça.</li><li>Preencha nome, valor e descrição. Tudo fica salvo automaticamente.</li><li>Pronto: a peça aparece na hora na vitrine online das suas clientes.</li></ol>
      ${S.canWrite ? '<button class="btn primary" id="btnAddVazio">Adicionar primeira peça</button>' : ""}</div>`;
    const b = $("#btnAddVazio"); if (b) b.onclick = () => abrirEditor(null);
    return;
  }
  const q = norm(S.busca), qc = q.replace(/[^a-z0-9]/g, "");
  const vis = pecas.filter(p => {
    if (S.filtro === "__arq") { if (!p.arquivada) return false; }
    else if (S.filtro.startsWith("__l:")) { if (p.linha !== S.filtro.slice(4)) return false; }
    else if (S.filtro === "__sem" ? catOf(p) : (S.filtro && catOf(p) !== S.filtro)) return false;
    if (!q) return true;
    const cod = norm(p.codigo);
    return norm(p.nome).includes(q) || cod.includes(q) || (qc && cod.replace(/[^a-z0-9]/g, "").includes(qc));
  });
  const filtrando = !!(q || S.filtro);
  const nomeCat = S.filtro === "__sem" ? "Sem categoria" : S.filtro === "__arq" ? "Arquivadas" : S.filtro.startsWith("__l:") ? LH.nomeLinha(S.filtro.slice(4)) : S.filtro;
  $("#mostrando").hidden = !filtrando;
  $("#mostrando").innerHTML = filtrando ? `<span>Mostrando ${vis.length} de ${pecas.length} ${pecas.length === 1 ? "peça" : "peças"}${nomeCat ? " em " + esc(nomeCat) : ""}</span><button class="linkbtn" type="button" data-limpar>Limpar filtros</button>` : "";
  if (!vis.length) {
    $("#lista").innerHTML = `<div class="empty"><h3>Nenhuma peça encontrada</h3><p class="hint">${q ? `Nada com “${esc(S.busca.trim())}” no nome ou no código` : "Nenhuma peça nesta categoria"}${nomeCat && q ? " em " + esc(nomeCat) : ""}.</p><p style="margin:16px 0 0"><button class="btn" type="button" data-limpar>Limpar filtros</button></p></div>`;
    return;
  }
  $("#lista").innerHTML = `<div class="grid">${vis.map(p => {
    const f = (p.fotos || [])[0];
    const arq = !!p.arquivada;
    return `<div class="card${arq ? " arq" : ""}" data-id="${esc(p.id)}">
      <button class="open" type="button" ${S.canWrite ? "" : "tabindex='-1'"} aria-label="${S.canWrite ? "Editar " : ""}${esc(p.nome)}${arq ? " (arquivada)" : ""}">
      <div class="ph">${f ? `<img loading="lazy" alt="" src="${esc(store.url(f))}">` : ""}${p.linha === "ouro" ? `<span class="ouro">Ouro</span>` : ""}${arq ? `<span class="flag">Arquivada</span>` : ""}${(p.fotos || []).length > 1 ? `<span class="count">${p.fotos.length} fotos</span>` : ""}</div>
      <div class="meta">${catOf(p) ? `<span class="cat">${esc(catOf(p))}</span>` : ""}<span class="nm">${esc(p.nome)}</span>
      <div class="row"><span class="ref">${esc(p.codigo || "")}</span><span class="pr">${p.valorAntigo > p.valor ? `<s>${esc(brl(p.valorAntigo))}</s> ` : ""}${esc(brl(p.valor) || "Sob consulta")}</span></div></div></button>
      ${S.canWrite ? `<button class="arch" type="button" data-arq="${esc(p.id)}" aria-label="${arq ? "Reativar" : "Arquivar"} ${esc(p.nome)}">${arq
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>Reativar'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"/></svg>Arquivar'}</button>` : ""}
      </div>`;
  }).join("")}</div>`;
}

let buscaT;
$("#busca").addEventListener("input", e => { S.busca = e.target.value; clearTimeout(buscaT); buscaT = setTimeout(render, 120); });
$("#buscaLimpar").onclick = () => { S.busca = ""; $("#busca").value = ""; render(); $("#busca").focus(); };
$("#filtroCat").addEventListener("change", e => { S.filtro = e.target.value; try { localStorage.setItem("lehele-filtro", S.filtro); } catch (err) { } render(); });
const limparFiltros = () => { S.busca = ""; S.filtro = ""; $("#busca").value = ""; try { localStorage.removeItem("lehele-filtro"); } catch (err) { } render(); };
document.addEventListener("click", e => { if (e.target.closest("[data-limpar]")) limparFiltros(); });
try { S.filtro = localStorage.getItem("lehele-filtro") || ""; } catch (err) { }
$("#lista").addEventListener("click", e => {
  if (!S.canWrite) return;
  const a = e.target.closest("[data-arq]"); if (a) return alternarArquivo(a.dataset.arq, a);
  const c = e.target.closest(".open"); if (!c) return;
  abrirEditor(S.pecas.find(p => p.id === c.closest(".card").dataset.id));
});
async function alternarArquivo(id, btn) {
  const p = S.pecas.find(x => x.id === id); if (!p) return;
  const { id: _id, ...data } = p;
  const arquivar = !p.arquivada;
  btn.disabled = true;
  try {
    await store.savePeca(id, { ...data, arquivada: arquivar, atualizadoEm: Date.now() });
    toast(arquivar ? "Peça arquivada. Ela saiu da vitrine." : "Peça reativada. Ela voltou para a vitrine.");
  } catch (e) { btn.disabled = false; toast(faltaLinha(e) ? "Falta rodar o arquivo linha.sql no Supabase (SQL Editor)." : "Não foi possível arquivar. Verifique a conexão e tente de novo."); }
}
$("#btnAdd").onclick = () => abrirEditor(null);

/* ---------- editor ---------- */
let D = null; // rascunho
function abrirEditor(p) {
  D = { id: p ? p.id : null, original: p ? [...(p.fotos || [])] : [], fotos: p ? [...(p.fotos || [])] : [], novas: [], enviando: 0, criadoEm: p ? p.criadoEm : null, arquivada: !!(p && p.arquivada), confirmando: false };
  $("#edTitulo").textContent = p ? "Editar peça" : "Nova peça";
  $("#fNome").value = p?.nome || ""; $("#fCodigo").value = p?.codigo || ""; $("#fValor").value = fmtValorInput(p?.valor ?? null);
  $("#fCategoria").value = p?.categoria || ""; $("#fBanho").value = p?.banho || ""; $("#fDescricao").value = p?.descricao || "";
  $("#fAntigo").value = fmtValorInput(p?.valorAntigo ?? null);
  $("#fAntigo").disabled = !LH.colunas.valorAntigo;
  $("#antigoHint").textContent = LH.colunas.valorAntigo ? "Preencha com um valor maior que o atual: na vitrine aparece “de R$ antigo por R$ atual” e o selo OFERTA." : "Para usar, rode o arquivo vitrine2.sql no Supabase (SQL Editor).";
  let linhaIni = p ? p.linha : "semijoias";
  if (!p) { try { linhaIni = localStorage.getItem("lehele-ultima-linha") || "semijoias"; } catch (e) { } }
  document.querySelectorAll('input[name="fLinha"]').forEach(r => r.checked = r.value === linhaIni);
  $("#edExcluir").hidden = !p;
  resetRodape();
  renderFotos();
  $("#editor").hidden = false;
  document.body.style.overflow = "hidden";
  $("#edForm").scrollTop = 0;
  if (!p) $("#edArquivo").click();
}
function resetRodape() {
  D && (D.confirmando = false);
  $("#edRodape").innerHTML = `<button class="btn danger" id="edExcluir" type="button" ${D && D.id ? "" : "hidden"}>Excluir</button><button class="btn primary" id="edSalvar" type="button">Salvar peça</button>`;
  $("#edExcluir").onclick = pedirExclusao; $("#edSalvar").onclick = salvarPeca;
}
async function fecharEditor(descartar = true) {
  if (descartar && D) for (const id of D.novas) store.removeFoto(id);
  D = null; $("#editor").hidden = true; document.body.style.overflow = "";
}
$("#edFechar").onclick = () => fecharEditor(true);

function renderFotos() {
  const tiles = D.fotos.map((id, i) => `<div class="ptile"><img alt="Foto ${i + 1}" src="${esc(store.url(id))}">
    ${i === 0 ? '<span class="tag">Capa</span>' : ""}
    <div class="act">${i > 0 ? `<button type="button" data-capa="${i}" aria-label="Usar como capa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></button>` : ""}
    <button type="button" data-rm="${i}" aria-label="Remover foto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>`);
  for (let i = 0; i < D.enviando; i++) tiles.push('<div class="ptile busy">Enviando…</div>');
  tiles.push(`<button type="button" class="addph" id="edAddFoto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>${D.fotos.length ? "Mais fotos" : "Escolher fotos"}</button>`);
  $("#edFotos").innerHTML = tiles.join("");
  $("#edAddFoto").onclick = () => $("#edArquivo").click();
}
$("#edFotos").addEventListener("click", e => {
  const c = e.target.closest("[data-capa]"), r = e.target.closest("[data-rm]");
  if (c) { const i = +c.dataset.capa; const [f] = D.fotos.splice(i, 1); D.fotos.unshift(f); renderFotos(); }
  if (r) { D.fotos.splice(+r.dataset.rm, 1); renderFotos(); }
});
$("#edArquivo").addEventListener("change", async e => {
  const files = [...e.target.files].filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
  e.target.value = "";
  if (!files.length || !D) return;
  const alvo = D;
  alvo.enviando += files.length; renderFotos();
  for (const f of files) {
    try {
      const id = await store.upload(f);
      if (D !== alvo) { store.removeFoto(id); continue; }
      alvo.fotos.push(id); alvo.novas.push(id);
    } catch (err) {
      console.error(err); toast(/quota|exceed|size/i.test((err && (err.message || err.error)) || "") ? "O espaço de fotos está cheio. Exclua peças antigas para liberar." : "Não foi possível enviar uma das fotos. Tente novamente.");
    } finally { alvo.enviando--; if (D === alvo) renderFotos(); }
  }
});
$("#fValor").addEventListener("blur", e => { const v = parseValor(e.target.value); e.target.value = v == null ? "" : fmtValorInput(v); });
$("#fAntigo").addEventListener("blur", e => { const v = parseValor(e.target.value); e.target.value = v == null ? "" : fmtValorInput(v); });

async function salvarPeca() {
  if (!D) return;
  const nome = $("#fNome").value.trim();
  if (D.enviando) return toast("Aguarde as fotos terminarem de enviar.");
  if (!D.fotos.length) return toast("Adicione pelo menos uma foto da peça.");
  if (!nome) { $("#fNome").focus(); return toast("Dê um nome à peça."); }
  const valor = parseValor($("#fValor").value), antigo = parseValor($("#fAntigo").value);
  if (antigo != null && (valor == null || antigo <= valor)) { $("#fAntigo").focus(); return toast("O preço antigo precisa ser maior que o valor atual."); }
  const data = {
    nome, codigo: $("#fCodigo").value.trim(), valor, valorAntigo: antigo,
    categoria: $("#fCategoria").value.trim(), banho: $("#fBanho").value.trim(), descricao: $("#fDescricao").value.trim(),
    linha: (document.querySelector('input[name="fLinha"]:checked') || {}).value || "semijoias",
    fotos: D.fotos, criadoEm: D.criadoEm || Date.now(), atualizadoEm: Date.now(), arquivada: !!D.arquivada
  };
  try { localStorage.setItem("lehele-ultima-linha", data.linha); } catch (e) { }
  const btn = $("#edSalvar"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    await store.savePeca(D.id, data);
    const removidas = D.original.filter(id => !D.fotos.includes(id));
    for (const id of removidas) store.removeFoto(id);
    const novo = !D.id;
    await fecharEditor(false);
    toast(novo ? "Peça publicada na vitrine" : "Alterações publicadas na vitrine");
  } catch (e) {
    btn.disabled = false; btn.textContent = "Salvar peça";
    console.error(e); toast(faltaLinha(e) ? "Falta rodar o arquivo linha.sql no Supabase (SQL Editor). Depois tente salvar de novo." : "Não foi possível salvar. Verifique a conexão e tente de novo.");
  }
}
function pedirExclusao() {
  D.confirmando = true;
  $("#edRodape").innerHTML = `<div class="confirm" style="flex:1">Excluir esta peça e suas fotos?</div><button class="btn ghost" id="edNao" type="button">Manter</button><button class="btn primary" id="edSim" type="button" style="flex:none;background:var(--danger);border-color:var(--danger);color:#fff">Excluir</button>`;
  $("#edNao").onclick = resetRodape;
  $("#edSim").onclick = async () => {
    try {
      await store.deletePeca(D.id);
      for (const id of new Set([...D.original, ...D.fotos])) store.removeFoto(id);
      await fecharEditor(true);
      toast("Peça excluída");
    } catch (e) { toast("Não foi possível excluir. Tente de novo."); resetRodape(); }
  };
}

/* ---------- ajustes ---------- */
let ORDEM = [];
function renderOrdem() {
  const n = ORDEM.length, cont = c => S.pecas.filter(p => catOf(p) === c).length;
  $("#ordemBox").hidden = n < 2;
  $("#ordemLista").innerHTML = ORDEM.map((c, i) => `<li>
    <select data-pos="${i}" aria-label="Posição de ${esc(c)}">${ORDEM.map((_, k) => `<option value="${k}" ${k === i ? "selected" : ""}>${k + 1}</option>`).join("")}</select>
    <span class="nm">${esc(c)}</span><span class="qt">${cont(c)} ${cont(c) === 1 ? "peça" : "peças"}</span>
    <button type="button" data-mv="${i}" data-d="-1" aria-label="Subir ${esc(c)}" ${i === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 15l6-6 6 6"/></svg></button>
    <button type="button" data-mv="${i}" data-d="1" aria-label="Descer ${esc(c)}" ${i === n - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9l6 6 6-6"/></svg></button></li>`).join("");
}
const mover = (de, para) => { if (para < 0 || para >= ORDEM.length || de === para) return; const [c] = ORDEM.splice(de, 1); ORDEM.splice(para, 0, c); renderOrdem(); };
$("#ordemLista").addEventListener("click", e => { const b = e.target.closest("[data-mv]"); if (b) mover(+b.dataset.mv, +b.dataset.mv + +b.dataset.d); });
$("#ordemLista").addEventListener("change", e => { const sl = e.target.closest("select[data-pos]"); if (sl) mover(+sl.dataset.pos, +sl.value); });
let DEST = {};
function renderDestaques() {
  const tem = !!S.config.temDestaques;
  $("#destLista").innerHTML = LH.LINHAS.map(l => {
    const itens = ordenar(S.pecas.filter(p => !p.arquivada && p.linha === l.id));
    const auto = itens.slice().sort((a, b) => b.criadoEm - a.criadoEm)[0];
    const esc1 = itens.find(p => p.id === DEST[l.id]);
    const mostra = esc1 || auto, f = mostra && mostra.fotos[0];
    return `<div class="dest-item">
      ${f ? `<img src="${esc(store.url(f))}" alt="">` : '<span class="vazio"></span>'}
      <div><b>${esc(l.nome)}</b>
        <select data-linha="${l.id}" aria-label="Foto de destaque de ${esc(l.nome)}" ${tem && itens.length ? "" : "disabled"}>
          <option value="">${itens.length ? "Automático (mais recente)" : "Nenhuma peça nesta linha"}</option>
          ${itens.map(p => `<option value="${esc(p.id)}" ${p.id === DEST[l.id] ? "selected" : ""}>${esc(p.nome)}${p.codigo ? " · " + esc(p.codigo) : ""}</option>`).join("")}
        </select></div></div>`;
  }).join("");
  $("#destHint").innerHTML = tem ? "É a foto grande que a cliente vê em Semijoias e em Ouro depois de tocar em “Entrar na vitrine”. Em “Automático” aparece a peça cadastrada mais recente."
    : "Para escolher a foto, rode antes o arquivo <b>destaques.sql</b> no Supabase (SQL Editor). Enquanto isso, aparece a peça cadastrada mais recente.";
}
$("#destLista").addEventListener("change", e => { const sl = e.target.closest("select[data-linha]"); if (!sl) return; DEST[sl.dataset.linha] = sl.value || null; renderDestaques(); });
const pctIn = x => x ? String(+(x * 100).toFixed(2)).replace(".", ",") : "0";
function lerPagamento() {
  const pix = parseFloat(String($("#aPix").value).replace(",", ".").replace(/[^\d.]/g, "")) || 0;
  const parc = parseInt(String($("#aParc").value).replace(/\D/g, ""), 10) || 0;
  return { pixDesconto: Math.min(90, Math.max(0, pix)) / 100, parcelasMax: Math.min(24, parc), parcelaMin: parseValor($("#aParcMin").value) || 0 };
}
const pagamentoDe = c => ({ pixDesconto: c.pixDesconto || 0, parcelasMax: c.parcelasMax || 0, parcelaMin: c.parcelaMin || 0, temPagamento: !!c.temPagamento });
function abrirAjustes(focoOrdem) {
  const tp = !!S.config.temPagamento;
  $("#aPix").value = pctIn(S.config.pixDesconto); $("#aParc").value = S.config.parcelasMax || 0; $("#aParcMin").value = fmtValorInput(S.config.parcelaMin || 0);
  ["aPix", "aParc", "aParcMin"].forEach(i => $("#" + i).disabled = !tp);
  $("#pagHint").textContent = tp ? "Aparece embaixo do preço de cada peça e na sacolinha. Ex.: 5% e 3x com mínimo de R$ 30 → “R$ 93,10 no Pix · ou 3x de R$ 32,67 sem juros”. Use 0 para não mostrar." : "Para usar, rode o arquivo vitrine2.sql no Supabase (SQL Editor).";
  $("#aColecao").value = S.config.colecao || ""; $("#aWhats").value = S.config.whatsapp || ""; $("#aInsta").value = S.config.instagram || "";
  ORDEM = ordenarCats([...new Set(S.pecas.map(catOf).filter(Boolean))]);
  renderOrdem();
  DEST = Object.assign({}, S.config.destaques || {});
  renderDestaques();
  $("#ajustes").hidden = false; document.body.style.overflow = "hidden";
  $("#ajForm").scrollTop = 0;
  carregarNotif();
}

/* ---------- notificações no celular ---------- */
const NT = { cfg: null, insc: null, pronto: false };
const temPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ehIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function b64uParaBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
function nomeAparelho() { const u = navigator.userAgent; return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Navegador"; }
// mensagem de erro que a função "notificar" devolveu (para mostrar o motivo real)
async function motivoFuncao(error) {
  try { const r = error && error.context; if (r && typeof r.json === "function") { const j = await r.clone().json(); if (j && (j.erro || j.message)) return j.erro || j.message; } } catch (e) { }
  return error && error.message ? error.message : "";
}
// diagnóstico da função (só para administradora logada); vazio se estiver tudo certo
async function diagnosticoFuncao() {
  try {
    const { data } = await sb.functions.invoke("notificar", { body: { acao: "diagnostico" } });
    if (data && data.detalhe && data.detalhe !== "tudo certo") return " · Diagnóstico: " + data.detalhe;
  } catch (e) { }
  return "";
}
function statusNotif(txt, cls = "") { const el = $("#nStatus"); el.textContent = txt; el.className = "notif-st " + cls; }
async function carregarNotif() {
  if (!$("#nHora").options.length) $("#nHora").innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("");
  const r = await sb.from("notificacoes_config").select("*").eq("id", 1).maybeSingle();
  if (r.error || !r.data) {
    NT.pronto = false; statusNotif("Ainda não instaladas.", "alerta");
    $("#nHint").textContent = "Para usar, publique a função “notificar” e rode o arquivo notificacoes.sql no Supabase (veja o passo a passo).";
    $("#nAtivar").disabled = true; $("#nTeste").disabled = true; $("#nTogs").classList.add("off"); return;
  }
  NT.pronto = true; NT.cfg = r.data; $("#nTogs").classList.remove("off");
  document.querySelectorAll("[data-n]").forEach(i => i.checked = !!NT.cfg[i.dataset.n]);
  $("#nHora").value = String(NT.cfg.resumo_hora ?? 18); $("#nHora").disabled = !NT.cfg.resumo;
  $("#nHint").textContent = "Os avisos ligados aqui valem para todos os aparelhos com notificações ativas. Visitas feitas de um aparelho com o painel aberto não contam.";
  await atualizarAparelho();
}
async function atualizarAparelho() {
  const bA = $("#nAtivar"), bT = $("#nTeste");
  NT.insc = null;
  if (!temPush()) {
    bA.disabled = true; bT.disabled = true;
    statusNotif(ehIOS() && !instalado() ? "Abra o painel pelo ícone “Painel Le Helê” na tela de início do iPhone para ativar." : "Este navegador não recebe notificações.", "alerta");
    return;
  }
  try { const reg = await navigator.serviceWorker.getRegistration(); NT.insc = reg ? await reg.pushManager.getSubscription() : null; } catch (e) { }
  bA.disabled = false;
  if (Notification.permission === "denied") { statusNotif("Bloqueadas neste aparelho. Libere em Ajustes do iPhone › Notificações › Painel Le Helê.", "alerta"); bA.textContent = "Ativar neste aparelho"; bT.disabled = true; return; }
  if (NT.insc) { statusNotif("✓ Ligadas neste aparelho", "ok"); bA.textContent = "Desligar neste aparelho"; bA.classList.remove("primary"); bT.disabled = false; }
  else { statusNotif("Desligadas neste aparelho."); bA.textContent = "Ativar neste aparelho"; bA.classList.add("primary"); bT.disabled = true; }
}
$("#nAtivar").onclick = async () => {
  if (!NT.pronto || !temPush()) return;
  const b = $("#nAtivar"); b.disabled = true;
  try {
    if (NT.insc) {   // desligar
      const ep = NT.insc.endpoint;
      try { await NT.insc.unsubscribe(); } catch (e) { }
      await sb.from("push_inscricoes").delete().eq("endpoint", ep);
      toast("Notificações desligadas neste aparelho");
    } else {
      const perm = await Notification.requestPermission();   // precisa ser logo no toque (iPhone)
      if (perm !== "granted") { toast("Permissão não concedida."); return; }
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const { data, error } = await sb.functions.invoke("notificar", { body: { acao: "chave" } });
      if (error || !data || !data.chave) {
        const m = await motivoFuncao(error); console.error(error, m);
        toast(/not found|404/i.test(m) ? "Falta publicar a função “notificar” no Supabase." : "Não deu para ativar: " + (m || "erro desconhecido") + (await diagnosticoFuncao()));
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(data.chave) });
      const j = sub.toJSON();
      const { error: e2 } = await sb.from("push_inscricoes").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email: S.email, aparelho: nomeAparelho() }, { onConflict: "endpoint" });
      if (e2) throw e2;
      toast("Notificações ligadas neste aparelho");
    }
  } catch (e) { console.error(e); toast("Não foi possível mudar as notificações. Tente de novo."); }
  finally { b.disabled = false; await atualizarAparelho(); }
};
$("#nTeste").onclick = async () => {
  const b = $("#nTeste"); b.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("notificar", { body: { acao: "teste", endpoint: NT.insc && NT.insc.endpoint } });
    if (error) { toast("Não foi possível enviar o teste: " + ((await motivoFuncao(error)) || "erro desconhecido") + (await diagnosticoFuncao())); return; }
    toast(data && data.enviados ? "Teste enviado. Deve chegar em instantes." : "Não chegou ao aparelho" + (data && data.falhas && data.falhas.length ? " (código " + data.falhas.join(", ") + ")" : "") + ". Desligue e ative de novo.");
  } catch (e) { console.error(e); toast("Não foi possível enviar o teste."); }
  finally { b.disabled = false; }
};
async function salvarNotif(campos) {
  const { error } = await sb.from("notificacoes_config").update(Object.assign({ atualizado_em: new Date().toISOString() }, campos)).eq("id", 1);
  if (error) { toast("Não foi possível salvar."); return false; }
  Object.assign(NT.cfg, campos); return true;
}
document.querySelectorAll("[data-n]").forEach(i => i.onchange = async () => {
  const ok = await salvarNotif({ [i.dataset.n]: i.checked });
  if (!ok) { i.checked = !i.checked; return; }
  if (i.dataset.n === "resumo") $("#nHora").disabled = !i.checked;
  toast(i.checked ? "Aviso ligado" : "Aviso desligado");
});
$("#nHora").onchange = async e => { if (await salvarNotif({ resumo_hora: +e.target.value })) toast(`Resumo às ${String(e.target.value).padStart(2, "0")}:00`); };
// mantém o receptor de notificações atualizado
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => { });
$("#btnAjustes").onclick = () => abrirAjustes();
$("#btnOrdem").onclick = () => abrirAjustes(true);
const fecharAjustes = () => { $("#ajustes").hidden = true; document.body.style.overflow = ""; };
$("#ajFechar").onclick = fecharAjustes;
$("#ajSalvar").onclick = async () => {
  const ig = $("#aInsta").value.trim().replace(/^@+/, "");
  const antigas = (S.config.ordemCats || []).filter(x => !ORDEM.some(c => norm(c) === norm(x)));
  const c = { colecao: $("#aColecao").value.trim(), whatsapp: $("#aWhats").value.trim(), instagram: ig ? "@" + ig : "", ordemCats: [...ORDEM, ...antigas], destaques: DEST, temDestaques: !!S.config.temDestaques, ...pagamentoDe(S.config), ...(S.config.temPagamento ? lerPagamento() : {}) };
  try { await store.saveConfig(c); S.config = c; fecharAjustes(); render(); toast("Ajustes salvos"); } catch (e) { toast("Não foi possível salvar os ajustes."); }
};
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#editor").hidden) fecharEditor(true); if (!$("#ajustes").hidden) fecharAjustes(); } });

/* =========================================================
   Utilidades de imagem
   ========================================================= */
const C = { cat: "#6E5122", cream: "#EBDECA", taupe: "#D0BFA8", gold: "#C8A96A", deep: "#A9823E", ink: "#4A3A22", soft: "#8A7150", paper: "#F4ECDF" };
const PW = 405, PH = 720;

async function bitmapDe(blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
function recorte(img, modo, max, q = 0.84) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement("canvas"), g = c.getContext("2d");
  if (modo === "quadrado") {
    const s = Math.min(w, h), o = Math.min(max, s);
    c.width = c.height = o;
    g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, o, o);
  } else {
    const k = Math.min(1, max / Math.max(w, h));
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    g.drawImage(img, 0, 0, c.width, c.height);
  }
  return { data: c.toDataURL("image/jpeg", q), w: c.width, h: c.height };
}
function whatsLink(num, msg) {
  let d = String(num || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(msg)}`;
}

function mostrarBotoes(lista) {
  const b = $("#gBtns"); b.innerHTML = ""; b.hidden = false;
  lista.forEach(([t, fn, prim]) => { const x = document.createElement("button"); x.className = "btn" + (prim ? " primary" : ""); x.textContent = t; x.onclick = fn; b.appendChild(x); });
}
function baixar(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function compartilharOuBaixar(blob, nome, tipo) {
  const f = new File([blob], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nome }); return "compartilhado"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelado"; }
  }
  baixar(blob, nome); return "baixado";
}
/* ---------- cópia de segurança ---------- */
const blobParaDataURL = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
async function dataURLParaBlob(d) { return (await fetch(d)).blob(); }
function progresso(titulo, texto, pct) {
  $("#gerando").hidden = false; $("#gBtns").hidden = true;
  $("#gTitulo").textContent = titulo; $("#gTexto").textContent = texto; $("#gBarra").style.width = Math.round(pct * 100) + "%";
}
$("#btnBackup").onclick = async () => {
  fecharAjustes();
  try {
    const pecas = ordenar(S.pecas), total = pecas.reduce((n, p) => n + p.fotos.length, 0) || 1; let k = 0;
    const out = { formato: "lehele-backup", versao: 1, geradoEm: new Date().toISOString(), config: { colecao: S.config.colecao, whatsapp: S.config.whatsapp, instagram: S.config.instagram, ordemCats: S.config.ordemCats }, pecas: [] };
    for (const p of pecas) {
      const fotos = [];
      for (const f of p.fotos) { progresso("Preparando a cópia", `${p.nome} · foto ${fotos.length + 1}`, k++ / total); try { fotos.push(await blobParaDataURL(await store.blob(f))); } catch (e) { } }
      out.pecas.push({ nome: p.nome, codigo: p.codigo, categoria: p.categoria, banho: p.banho, valor: p.valor, valorAntigo: p.valorAntigo ?? null, descricao: p.descricao, arquivada: p.arquivada, linha: p.linha, criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm, fotos });
    }
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const nome = `lehele-backup-${new Date().toISOString().slice(0, 10)}.json`;
    progresso("Cópia pronta", `${pecas.length} peças · ${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB. Guarde este arquivo em lugar seguro.`, 1);
    mostrarBotoes([["Salvar cópia", () => compartilharOuBaixar(blob, nome, "application/json"), true], ["Fechar", () => $("#gerando").hidden = true, false]]);
  } catch (e) { console.error(e); progresso("Não deu certo", "A cópia não pôde ser criada. Tente de novo.", 0); mostrarBotoes([["Fechar", () => $("#gerando").hidden = true, false]]); }
};
$("#btnImportar").onclick = () => $("#arqImport").click();
$("#arqImport").addEventListener("change", async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  fecharAjustes();
  let dados;
  try { dados = JSON.parse(await file.text()); if (dados.formato !== "lehele-backup" || !Array.isArray(dados.pecas)) throw new Error("formato"); }
  catch (err) { toast("Este arquivo não é uma cópia da vitrine Le Helê."); return; }
  const chave = p => LH.norm(p.nome) + "|" + LH.norm(p.codigo);
  const existentes = new Set(S.pecas.map(chave));
  const novas = dados.pecas.filter(p => p && p.nome && !existentes.has(chave(p)));
  const total = novas.reduce((n, p) => n + (p.fotos || []).length, 0) || 1; let k = 0, ok = 0, falhas = 0;
  try {
    for (const p of novas) {
      const refs = [];
      for (const d of (p.fotos || [])) {
        progresso("Importando peças", `${p.nome} · foto ${refs.length + 1}`, k++ / total);
        try { refs.push(await store.upload(await dataURLParaBlob(d))); } catch (err) { falhas++; }
      }
      if (!refs.length) { falhas++; continue; }
      await store.savePeca(null, { nome: p.nome, codigo: p.codigo || "", categoria: p.categoria || "", banho: p.banho || "", valor: p.valor ?? null, valorAntigo: p.valorAntigo ?? null, descricao: p.descricao || "", arquivada: !!p.arquivada, linha: p.linha === "ouro" ? "ouro" : "semijoias", criadoEm: p.criadoEm || Date.now(), fotos: refs });
      ok++;
    }
    const c = dados.config || {};
    const atual = S.config;
    const mesclado = { ...pagamentoDe(atual), destaques: atual.destaques || {}, temDestaques: !!atual.temDestaques, colecao: atual.colecao || c.colecao || "", whatsapp: atual.whatsapp || c.whatsapp || "", instagram: atual.instagram || c.instagram || "", ordemCats: (atual.ordemCats && atual.ordemCats.length) ? atual.ordemCats : (c.ordemCats || []) };
    await store.saveConfig(mesclado); S.config = mesclado;
    await store.recarregar();
    const pulei = dados.pecas.length - novas.length;
    progresso("Importação concluída", `${ok} ${ok === 1 ? "peça importada" : "peças importadas"}${pulei ? `, ${pulei} já existiam` : ""}${falhas ? `, ${falhas} com problema` : ""}.`, 1);
  } catch (err) {
    console.error(err);
    progresso("Importação interrompida", `${ok} peças importadas antes do problema. Rode de novo: as que já entraram serão puladas.`, k / total);
  }
  mostrarBotoes([["Fechar", () => $("#gerando").hidden = true, true]]);
});


boot();
