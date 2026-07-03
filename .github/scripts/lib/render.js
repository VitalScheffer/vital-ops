// Decide o veredito a partir dos achados e monta o comentário markdown do PR.

const SELO = {
  PERIGO: '🛑 PERIGO',
  MODERADO: '🟠 MODERADO',
  BAIXO: '🔵 BAIXO',
};

const PESO = { PERIGO: 0, MODERADO: 1, BAIXO: 2 };

const VEREDITO = {
  BLOQUEAR: { titulo: '🛑 BLOQUEAR', exit: 1 },
  ATENCAO: { titulo: '🟠 ATENÇÃO', exit: 0 },
  OK: { titulo: '✅ OK', exit: 0 },
};

function calcularVeredito({ achados, conflito, iaIndisponivel }) {
  if (achados.some((a) => a.severidade === 'PERIGO')) return 'BLOQUEAR';
  if (achados.some((a) => a.severidade === 'MODERADO') || conflito || iaIndisponivel) return 'ATENCAO';
  return 'OK';
}

function umaLinha(texto) {
  return String(texto || '').replace(/\s*\n+\s*/g, ' ').trim();
}

// Um bloco por achado: aponta arquivo:linha, o quê, por quê e como corrigir.
function blocoAchado(a) {
  const local = a.arquivo ? `\`${a.arquivo}${a.linha ? `:${a.linha}` : ''}\`` : '';
  const cabecalho = `${SELO[a.severidade] || a.severidade} · **${a.categoria || 'Geral'}**${local ? ` — ${local}` : ''}`;
  const linhas = [cabecalho];
  if (a.problema) linhas.push(`- **O quê:** ${umaLinha(a.problema)}`);
  if (a.porque) linhas.push(`- **Por quê:** ${umaLinha(a.porque)}`);
  if (a.recomendacao) linhas.push(`- **Como corrigir:** ${umaLinha(a.recomendacao)}`);
  return linhas.join('\n');
}

function listaAchados(achados) {
  if (achados.length === 0) return '_Nenhum achado._';
  return [...achados]
    .sort((a, b) => PESO[a.severidade] - PESO[b.severidade])
    .map(blocoAchado)
    .join('\n\n');
}

function montarComentario({ veredito, achados, escopoDeclarado, areasAlteradas, conflito, modeloUsado, iaIndisponivel }) {
  const v = VEREDITO[veredito];
  const contagem = {
    PERIGO: achados.filter((a) => a.severidade === 'PERIGO').length,
    MODERADO: achados.filter((a) => a.severidade === 'MODERADO').length,
    BAIXO: achados.filter((a) => a.severidade === 'BAIXO').length,
  };

  const escopoTxt = escopoDeclarado.areas.length
    ? `${escopoDeclarado.areas.join(', ')}${escopoDeclarado.explicito ? '' : ' (inferido)'}`
    : 'não declarado';
  const mergeTxt = conflito ? '❌ conflitos com a base' : '✅ limpo';
  const iaNota = iaIndisponivel
    ? '\n> ⚠️ Revisão de IA indisponível (Gemini fora do ar) — vale **apenas o pré-scan determinístico** abaixo.\n'
    : '';

  return [
    `### 🤖 Revisão Automática — ${v.titulo}`,
    iaNota,
    `**Escopo declarado:** ${escopoTxt}`,
    `**Áreas alteradas:** ${areasAlteradas.length ? areasAlteradas.join(', ') : '-'}`,
    `**Merge na main:** ${mergeTxt}`,
    `**Achados:** 🛑 ${contagem.PERIGO} · 🟠 ${contagem.MODERADO} · 🔵 ${contagem.BAIXO}`,
    '',
    listaAchados(achados),
    veredito === 'BLOQUEAR' ? '\n**Este PR está bloqueado** até resolver os itens 🛑 PERIGO acima.' : '',
    modeloUsado
      ? `\n<sub>Revisado por \`${modeloUsado}\` + pré-scan de segurança.</sub>`
      : '\n<sub>Apenas pré-scan de segurança (sem IA).</sub>',
  ]
    .filter((parte) => parte !== '')
    .join('\n');
}

// Resumo curto (1 bloco) pro corpo do PR Review e pra descrição do card no Trello.
function resumoCurto({ veredito, achados }) {
  const v = VEREDITO[veredito];
  const c = {
    PERIGO: achados.filter((a) => a.severidade === 'PERIGO').length,
    MODERADO: achados.filter((a) => a.severidade === 'MODERADO').length,
    BAIXO: achados.filter((a) => a.severidade === 'BAIXO').length,
  };
  const topo = achados
    .filter((a) => a.severidade === 'PERIGO')
    .slice(0, 3)
    .map((a) => `- ${a.categoria}${a.linha ? ` (${a.arquivo}:${a.linha})` : ''}: ${umaLinha(a.problema)}`);

  const linhas = [`Revisão automática: ${v.titulo}`, `Achados: 🛑 ${c.PERIGO} · 🟠 ${c.MODERADO} · 🔵 ${c.BAIXO}`];
  if (topo.length) linhas.push('Principais bloqueios:', ...topo);
  return linhas.join('\n');
}

// Bloco que vai na descrição do card do Trello, abaixo da descrição da tarefa:
// o veredito + o porquê (resumo da IA) + os achados (motivos do bloqueio/atenção).
function blocoCard({ veredito, resumoIA, achados }) {
  const v = VEREDITO[veredito];
  const partes = [`**Revisão automática — ${v.titulo}**`];
  if (resumoIA) partes.push(umaLinha(resumoIA));

  const relevantes = [...achados]
    .filter((a) => a.severidade !== 'BAIXO')
    .sort((a, b) => PESO[a.severidade] - PESO[b.severidade]);

  if (relevantes.length) {
    partes.push('', 'Achados:');
    for (const a of relevantes) {
      partes.push(`- ${SELO[a.severidade]} \`${a.arquivo}${a.linha ? `:${a.linha}` : ''}\` — ${umaLinha(a.problema)}`);
    }
  } else {
    partes.push('', 'Sem achados bloqueantes.');
  }
  return partes.join('\n');
}

module.exports = { calcularVeredito, montarComentario, resumoCurto, blocoCard, VEREDITO };
