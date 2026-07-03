// Chamada à API do Gemini com cadeia de fallback de modelos. Em erro transitório
// (404/429/5xx) cai pro próximo; em 400/401/403 aborta (problema de chave/requisição
// não melhora trocando de modelo).

const STATUS_QUE_ABORTA = new Set([400, 401, 403]);

async function chamarGemini({ apiKey, modelos, contents, generationConfig }) {
  for (const modelo of modelos) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig }),
      });
    } catch (err) {
      console.error(`Falha de rede ao chamar ${modelo}; tentando o próximo:`, err.message);
      continue;
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (texto) return { modelo, texto };
      console.error(`Resposta sem texto do modelo ${modelo}; tentando o próximo:`, JSON.stringify(data));
      continue;
    }

    console.error(`Erro da API do Gemini (HTTP ${response.status}, modelo ${modelo}):`, JSON.stringify(data));
    if (STATUS_QUE_ABORTA.has(response.status)) break;
    console.log(`Modelo ${modelo} indisponível (HTTP ${response.status}); tentando o próximo do fallback.`);
  }

  return { modelo: null, texto: null };
}

module.exports = { chamarGemini };
