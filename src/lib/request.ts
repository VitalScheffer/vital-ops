import { headers } from "next/headers";

// Reconstrói um Headers "real" a partir do ReadonlyHeaders do Next, para que o
// helper audit() capture IP (x-forwarded-for) e user-agent corretamente
// (audit() checa `instanceof Headers`). Helper de servidor — não é um endpoint.
export async function requestHeaders(): Promise<Headers> {
  const incoming = await headers();
  const out = new Headers();
  incoming.forEach((value, key) => out.set(key, value));
  return out;
}
