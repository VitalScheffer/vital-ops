import { z } from "zod";

// Envelope de erro padrão das rotas de API.
export const apiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// Resultado tipado de uma chamada de API no frontend.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
