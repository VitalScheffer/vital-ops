# Multiplicador de BOMs — Design

## Objetivo

Disponibilizar a tela autenticada `/multiplicador` no Vital Ops para aplicar um fator a vários BOMs de uma vez, multiplicando somente as colunas de quantidade e/ou peso escolhidas pela pessoa, sem enviar arquivos ao servidor.

## Escopo aprovado

- Aceitar vários arquivos `.pdf`, `.xls`, `.xlsx` e `.csv` em uma operação.
- Cada arquivo possui fator positivo próprio e duas opções independentes: `Multiplicar quantidades` e `Multiplicar pesos`.
- XLS/XLSX/CSV voltam no mesmo tipo de arquivo. As células que não são das colunas identificadas não são modificadas.
- PDF digital com tabela de BOM volta visualmente idêntico, com a página original preservada e somente os valores identificados nas colunas QTD e/ou PESO cobertos e redesenhados na mesma posição.
- Gerar também um único PDF com todos os PDFs resultantes, na ordem da lista, para impressão em lote.
- Todo processamento acontece no navegador. Não há armazenamento, registro em banco ou envio do documento ao servidor.

## Delimitações e falhas seguras

- Um PDF sem texto vetorial selecionável ou sem uma tabela com cabeçalho reconhecível não é alterado. A tela explica que uma foto/scan precisa ser convertida em PDF digital ou enviada como planilha, evitando substituir número da coluna errada.
- Se uma das colunas marcadas não existir no arquivo, o item falha de forma explícita e não gera saída parcial.
- Peso total não é confundido com peso/massa unitária: a identificação segue o cabeçalho `PESO` ou `MASSA`, ignorando coluna que contenha `TOTAL`.
- O resultado da planilha preserva valores, fórmulas, abas e formatação que o SheetJS suporta; arquivos `.xls` que o navegador regrave recebem o mesmo formato quando suportado pelo SheetJS.

## Arquitetura

Uma biblioteca client-only `src/lib/multiplicador/` concentra o trabalho puro e testável. Ela identifica os cabeçalhos e células numéricas das planilhas, formata números no padrão do texto original e, no PDF, reaproveita a extração posicional de `src/lib/bom/bomPdf.ts` para localizar QTD/PESO. O `pdf-lib` copia a página original e desenha um retângulo de fundo e o novo valor apenas no retângulo do texto encontrado.

`MultiplicadorClient` administra a lista e os downloads. A página de rota mantém autenticação e reutiliza a permissão já existente de Pranchas, pois ambos são utilitários de documentos técnicos executados localmente. A navegação ganha o item `Multiplicador` com ícone próprio e sem novo contrato para NextStep.

## Fluxo de uso

1. A pessoa arrasta ou seleciona vários arquivos.
2. Para cada linha, informa o fator e marca QTD, PESO ou ambos.
3. Clica em `Multiplicar arquivos`; cada item exibe sucesso ou uma causa acionável de falha.
4. Baixa os arquivos individuais no formato de origem ou usa `Baixar PDF para impressão` quando há PDFs processados.

## Testes

- Testes unitários da detecção de cabeçalho e multiplicação: valor numérico, texto brasileiro, QTD isolada, PESO isolado e falha de coluna ausente.
- Teste de PDF criado em memória: garante que as páginas originais continuam presentes e que a saída possui o mesmo número de páginas.
- Testes de navegação/permissão para o novo item e a rota protegida.
- `vitest`, `eslint`, TypeScript sem emissão e build do Next antes da conclusão.
