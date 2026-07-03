// Interações com a API do GitHub no contexto do PR: comentário "sticky" (um só,
// editado a cada push em vez de empilhar) e rótulo de veredito.

const MARCADOR = '<!-- gemini-reviewer -->';

const LABELS = {
  BLOQUEAR: { nome: '🛑 bloqueado', cor: 'B60205' },
  ATENCAO: { nome: '🟠 atenção', cor: 'D93F0B' },
  OK: { nome: '✅ revisado', cor: '0E8A16' },
};

function headers() {
  return {
    // A API do GitHub exige User-Agent; sem ele retorna 403.
    'User-Agent': 'gemini-code-reviewer',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

function api(metodo, caminho, corpo) {
  return fetch(`https://api.github.com${caminho}`, {
    method: metodo,
    headers: headers(),
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

// Retorna o comentário "sticky" do bot (pelo marcador) ou null.
async function buscarComentarioSticky({ repo, prNumber }) {
  const lista = await api('GET', `/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
  if (!lista.ok) return null;
  const comentarios = await lista.json().catch(() => []);
  return comentarios.find((c) => typeof c.body === 'string' && c.body.includes(MARCADOR)) || null;
}

// Acha o comentário do bot e edita; se não existir, cria.
async function postarOuAtualizarComentario({ repo, prNumber, corpo }) {
  const corpoFinal = `${MARCADOR}\n${corpo}`;

  const existente = await buscarComentarioSticky({ repo, prNumber });
  if (existente) {
    const upd = await api('PATCH', `/repos/${repo}/issues/comments/${existente.id}`, { body: corpoFinal });
    if (!upd.ok) console.error(`Falha ao editar comentário sticky (HTTP ${upd.status}):`, await upd.text().catch(() => ''));
    return;
  }

  const criado = await api('POST', `/repos/${repo}/issues/${prNumber}/comments`, { body: corpoFinal });
  if (!criado.ok) {
    console.error(`Falha ao postar comentário (HTTP ${criado.status}):`, await criado.text().catch(() => ''));
    process.exit(1);
  }
}

async function garantirLabel({ repo, nome, cor }) {
  const res = await api('POST', `/repos/${repo}/labels`, { name: nome, color: cor });
  // 201 = criado; 422 = já existe. Ambos ok.
  if (!res.ok && res.status !== 422) {
    console.error(`Não consegui garantir o label "${nome}" (HTTP ${res.status}).`);
  }
}

// Deixa só o label do veredito atual, removendo os outros dois.
async function aplicarLabelVeredito({ repo, prNumber, veredito }) {
  const alvo = LABELS[veredito];
  if (!alvo) return;

  await garantirLabel({ repo, nome: alvo.nome, cor: alvo.cor });

  for (const v of Object.keys(LABELS)) {
    if (v === veredito) continue;
    // 404 quando o PR não tinha esse label — esperado, ignora.
    await api('DELETE', `/repos/${repo}/issues/${prNumber}/labels/${encodeURIComponent(LABELS[v].nome)}`);
  }

  const res = await api('POST', `/repos/${repo}/issues/${prNumber}/labels`, { labels: [alvo.nome] });
  if (!res.ok) console.error(`Falha ao aplicar label (HTTP ${res.status}):`, await res.text().catch(() => ''));
}

// Mapeia o veredito num evento de review do GitHub e no estado que ele gera.
const REVIEW = {
  BLOQUEAR: { evento: 'REQUEST_CHANGES', estado: 'CHANGES_REQUESTED' },
  ATENCAO: { evento: 'COMMENT', estado: 'COMMENTED' },
  OK: { evento: 'APPROVE', estado: 'APPROVED' },
};

// Submete uma revisão formal (Approve / Request changes / Comment), mas só se o
// estado mudou — evita empilhar reviews a cada push.
async function sincronizarReview({ repo, prNumber, veredito, corpo }) {
  const alvo = REVIEW[veredito];
  if (!alvo) return;

  const lista = await api('GET', `/repos/${repo}/pulls/${prNumber}/reviews?per_page=100`);
  if (lista.ok) {
    const reviews = await lista.json().catch(() => []);
    const meus = reviews.filter((r) => r.user && r.user.login === 'github-actions[bot]');
    const ultimo = meus[meus.length - 1];
    if (ultimo && ultimo.state === alvo.estado) return; // já está no estado desejado
  }

  const res = await api('POST', `/repos/${repo}/pulls/${prNumber}/reviews`, { event: alvo.evento, body: corpo });
  if (!res.ok) console.error(`Falha ao submeter review ${alvo.evento} (HTTP ${res.status}):`, await res.text().catch(() => ''));
}

module.exports = { buscarComentarioSticky, postarOuAtualizarComentario, aplicarLabelVeredito, sincronizarReview, MARCADOR, LABELS };
