// Regras de Prisma. Portadas da versão que o vital-ops já mantinha à mão, para a
// consolidação não regredir aquele repositório.

const REGRAS_LINHA = [
  {
    id: 'prisma-sql-cru-inseguro',
    severidade: 'PERIGO',
    categoria: 'Segurança',
    // As variantes `Unsafe` recebem string montada, sem parametrização. As sem
    // sufixo (`$queryRaw`) usam template tag e são seguras: não entram aqui.
    regex: /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/,
    soArquivo: /\.[jt]sx?$/,
    problema: 'SQL cru sem parametrização ($queryRawUnsafe/$executeRawUnsafe).',
    recomendacao: 'Use $queryRaw com template tag, que parametriza, ou o próprio client tipado.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'prisma-migration',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => /prisma\/migrations\//.test(p.replace(/\\/g, '/')),
    problema: 'Nova migration do Prisma. O build de produção roda migrate deploy sozinho.',
    recomendacao: 'Confirme reversibilidade e impacto em dado existente antes de mergear.',
  },
  {
    id: 'prisma-schema-tocado',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => /(^|\/)prisma\/schema\.prisma$/.test(p.replace(/\\/g, '/')),
    problema: 'Schema do Prisma alterado.',
    recomendacao: 'Toda mudança aqui vira migration aplicada no deploy; confira o diff da migration gerada.',
  },
];

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO };
