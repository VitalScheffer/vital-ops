// Erros tipados do client Omie (portado do nextstep/apps/omie/errors.py).
// O caller decide retry vs. falha a partir de `retryable`; `OmieBlocked`
// significa que nem chegamos a chamar o Omie (breaker soft ou hard aberto).

export class OmieBlocked extends Error {
  readonly retryAfter?: Date;

  constructor(message: string, options: { retryAfter?: Date } = {}) {
    super(message);
    this.name = "OmieBlocked";
    this.retryAfter = options.retryAfter;
  }
}

export interface OmieErrorOptions {
  retryable?: boolean;
  faultcode?: string;
  status?: number;
}

export class OmieError extends Error {
  readonly retryable: boolean;
  readonly faultcode?: string;
  readonly status?: number;

  constructor(message: string, options: OmieErrorOptions = {}) {
    super(message);
    this.name = "OmieError";
    this.retryable = options.retryable ?? false;
    this.faultcode = options.faultcode;
    this.status = options.status;
  }
}

// Escrita rejeitada por já existir (idempotência): o caller deve então consultar
// o registro existente em vez de tratar como falha.
export class OmieDuplicate extends OmieError {
  constructor(message: string, options: { faultcode?: string } = {}) {
    super(message, { retryable: false, faultcode: options.faultcode });
    this.name = "OmieDuplicate";
  }
}

// Descrição do produto já usada por OUTRO cadastro (código diferente do nosso).
// Diferente de OmieDuplicate: aqui NÃO é o nosso próprio registro que já existe
// (não dá pra tratar como sucesso) — é um item que precisa de decisão humana
// (renomear a descrição ou reaproveitar o código já existente no Omie). Comum
// para peças padrão (parafusos, dobradiças) reusadas em várias BOMs.
export class OmieDescriptionConflict extends OmieError {
  constructor(message: string, options: { faultcode?: string } = {}) {
    super(message, { retryable: false, faultcode: options.faultcode });
    this.name = "OmieDescriptionConflict";
  }
}

// Código (SKU) já usado por OUTRO cadastro, sob um ID interno (`codigo_produto`)
// diferente do nosso. Mesma ideia do OmieDescriptionConflict (peça padrão
// reaproveitada entre BOMs), mas aqui o Omie identifica o cadastro existente
// pelo ID interno na mensagem, não pelo `codigo`.
export class OmieCodeConflict extends OmieError {
  constructor(message: string, options: { faultcode?: string } = {}) {
    super(message, { retryable: false, faultcode: options.faultcode });
    this.name = "OmieCodeConflict";
  }
}
