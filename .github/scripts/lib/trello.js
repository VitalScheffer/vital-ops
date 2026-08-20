// Integração com o Trello: move o card vinculado ao PR conforme o veredito e
// escreve no card o porquê (aprovado/reprovado). Tudo best-effort — se faltar
// credencial ou o PR não tiver card vinculado, não faz nada e não quebra a revisão.

const MARCADOR_DESC = '<!-- revisao-gemini -->';

// Acha o shortlink do card numa URL tipo https://trello.com/c/AbCdEf12/...
function acharShortlink(texto) {
  const m = (texto || '').match(/trello\.com\/c\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function urlCard(shortlink, sufixo, key, token) {
  return `https://api.trello.com/1/cards/${shortlink}${sufixo}?key=${key}&token=${token}`;
}

async function criarCard({ key, token, idList, nome, desc }) {
  const params = new URLSearchParams({ idList, name: nome || 'PR', desc: desc || '', key, token });
  const res = await fetch(`https://api.trello.com/1/cards?${params.toString()}`, { method: 'POST' });
  if (!res.ok) {
    console.error(`Trello: falha ao criar card (HTTP ${res.status}):`, await res.text().catch(() => ''));
    return null;
  }
  return res.json().catch(() => null);
}

// Compara nome de pessoa ignorando caixa, acento e espaço sobrando.
function normalizarNome(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Último recurso: procura a pessoa entre os membros do board pelo nome completo
// (é o que aparece no Trello) ou pelo username. Serve pra quem foi cadastrado
// como "Hiro Terato" em vez do username, que ninguém decora.
async function acharMembroNoBoard({ key, token, shortlink, alvo }) {
  if (!shortlink) return null;
  const board = await fetch(`https://api.trello.com/1/cards/${shortlink}/board?fields=id&key=${key}&token=${token}`);
  if (!board.ok) return null;
  const { id } = await board.json().catch(() => ({}));
  if (!id) return null;

  const res = await fetch(`https://api.trello.com/1/boards/${id}/members?fields=id,username,fullName&key=${key}&token=${token}`);
  if (!res.ok) return null;
  const membros = await res.json().catch(() => []);

  const procurado = normalizarNome(alvo);
  const achado = membros.find(
    (m) => normalizarNome(m.fullName) === procurado || normalizarNome(m.username) === procurado
  );
  if (achado) return achado.id;

  console.error(
    `Trello: "${alvo}" não bate com ninguém do board. Membros: ` +
      membros.map((m) => `${m.fullName} (@${m.username})`).join(', ')
  );
  return null;
}

// Aceita id (24 hex), username do Trello ou o nome completo como aparece no board.
async function resolverIdMembro({ key, token, alvo, shortlink }) {
  if (/^[0-9a-f]{24}$/i.test(alvo)) return alvo;

  // username não pode ter espaço: nome completo vai direto pro board
  if (!/\s/.test(alvo)) {
    const res = await fetch(`https://api.trello.com/1/members/${encodeURIComponent(alvo)}?fields=id&key=${key}&token=${token}`);
    if (res.ok) {
      const m = await res.json().catch(() => ({}));
      if (m.id) return m.id;
    }
  }

  return acharMembroNoBoard({ key, token, shortlink, alvo });
}

async function adicionarMembro({ key, token, shortlink, membro }) {
  const idMembro = await resolverIdMembro({ key, token, alvo: membro, shortlink });
  if (!idMembro) return false;
  const res = await fetch(`https://api.trello.com/1/cards/${shortlink}/idMembers?value=${idMembro}&key=${key}&token=${token}`, { method: 'POST' });
  if (res.ok) return true;
  const corpo = await res.text().catch(() => '');
  if (res.status === 400 && /already on the card/i.test(corpo)) return true; // já estava atribuído
  console.error(`Trello: falha ao atribuir membro (HTTP ${res.status}):`, corpo);
  return false;
}

// Anexa o link do PR no card (vira botão clicável; qualquer um abre), sem duplicar.
async function anexarPR({ key, token, shortlink, prUrl }) {
  const r = await fetch(`https://api.trello.com/1/cards/${shortlink}/attachments?fields=url&key=${key}&token=${token}`);
  if (r.ok) {
    const anexos = await r.json().catch(() => []);
    if (anexos.some((a) => a.url === prUrl)) return;
  }
  const params = new URLSearchParams({ url: prUrl, name: 'Pull Request', key, token });
  const res = await fetch(`https://api.trello.com/1/cards/${shortlink}/attachments?${params.toString()}`, { method: 'POST' });
  if (!res.ok) console.error(`Trello: falha ao anexar o PR (HTTP ${res.status}).`);
}

async function moverCard({ key, token, shortlink, idList }) {
  const res = await fetch(`${urlCard(shortlink, '/idList', key, token)}&value=${idList}`, { method: 'PUT' });
  if (!res.ok) console.error(`Trello: falha ao mover card ${shortlink} (HTTP ${res.status}):`, await res.text().catch(() => ''));
  return res.ok;
}

// Reescreve só o bloco marcado da descrição (não cresce a cada revisão). Se o card
// ainda não tem descrição, usa a descrição da tarefa (corpo do PR) como base.
async function atualizarDescricao({ key, token, shortlink, bloco, descricaoTarefa }) {
  const get = await fetch(urlCard(shortlink, '', key, token) + '&fields=desc');
  if (!get.ok) {
    console.error(`Trello: não consegui ler o card ${shortlink} (HTTP ${get.status}).`);
    return;
  }
  const card = await get.json().catch(() => ({}));
  const antes = (card.desc || '').split(MARCADOR_DESC)[0].trim();
  const base = antes || (descricaoTarefa || '').trim();
  const desc = `${base}\n\n${MARCADOR_DESC}\n${bloco}`.trim();

  const put = await fetch(urlCard(shortlink, '', key, token), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desc }),
  });
  if (!put.ok) console.error(`Trello: falha ao atualizar descrição (HTTP ${put.status}).`);
}

// OK -> lista "aprovado"; BLOQUEAR -> lista "bloqueado"; ATENÇÃO -> não move (só desc).
function listaDestino(veredito, cfg) {
  if (veredito === 'OK') return cfg.listaAprovado;
  if (veredito === 'BLOQUEAR') return cfg.listaBloqueado;
  return null;
}

// Resolve o card do PR nesta ordem: link no texto do PR > link guardado de uma
// revisão anterior (prevShortlink) > cria um novo na lista "PR Aberto". Depois
// move conforme o veredito e grava o motivo na descrição.
async function atualizarCardDoPR({ texto, prevShortlink, veredito, bloco, dadosCard, membroTrello, cfg }) {
  if (!cfg.key || !cfg.token) return { feito: false, motivo: 'sem credenciais Trello' };

  let shortlink = acharShortlink(texto) || prevShortlink || null;
  let url = shortlink ? `https://trello.com/c/${shortlink}` : null;
  let criado = false;
  let membro = null;

  if (!shortlink) {
    if (!cfg.listaPRAberto) return { feito: false, motivo: 'sem card e sem lista para criar' };
    const novo = await criarCard({
      key: cfg.key,
      token: cfg.token,
      idList: cfg.listaPRAberto,
      nome: dadosCard?.nome,
      desc: dadosCard?.descricaoTarefa,
    });
    if (!novo) return { feito: false, motivo: 'falha ao criar card' };
    shortlink = novo.shortLink;
    url = novo.shortUrl || `https://trello.com/c/${shortlink}`;
    criado = true;
  }

  const base = { key: cfg.key, token: cfg.token, shortlink };

  // Link do PR como anexo clicável (qualquer um abre), sem duplicar.
  if (dadosCard?.prUrl) await anexarPR({ ...base, prUrl: dadosCard.prUrl });

  // Atribui o autor do PR (idempotente): vale pro card novo E pro card já existente
  // que ainda não tinha responsável.
  if (membroTrello) {
    const ok = await adicionarMembro({ ...base, membro: membroTrello });
    if (ok) membro = membroTrello;
  }

  const idList = listaDestino(veredito, cfg);
  let movido = false;
  if (idList) movido = await moverCard({ ...base, idList });
  await atualizarDescricao({ ...base, bloco, descricaoTarefa: dadosCard?.descricaoTarefa });

  return { feito: true, shortlink, url, movido, criado, membro };
}

module.exports = { acharShortlink, atualizarCardDoPR, normalizarNome };
