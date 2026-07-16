import { z } from "zod";

// Papéis (espelham os valores aceitos em User.role no Prisma).
// FABRICA = chão de fábrica: vê SÓ Requisições e apenas SOLICITA.
// FABRICA_GESTOR = quem aprova os pedidos da fábrica (ex.: Daniel): também vê
// SÓ Requisições por padrão, mas com a fila de decisão e o relatório PDF
// (decisões de 16/07/2026).
export const roleSchema = z.enum(["ADMIN", "GESTOR", "FUNCIONARIO", "FABRICA", "FABRICA_GESTOR"]);
export type Role = z.infer<typeof roleSchema>;

export const setorSchema = z.object({
  id: z.string(),
  nome: z.string(),
});
export type Setor = z.infer<typeof setorSchema>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  active: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

// Resposta de GET /api/auth/me — usuário logado + papel + setores.
export const meResponseSchema = userSchema.extend({
  setores: z.array(setorSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// Payload de criação de usuário (Admin/Gestor). Papel default FUNCIONARIO.
// O admin define a senha inicial (o hash é feito no server action).
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
  role: roleSchema.default("FUNCIONARIO"),
  setorIds: z.array(z.string()).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// Payload de edição de usuário (Admin/Gestor). E-mail não muda (é a identidade).
// A senha é OPCIONAL: em branco mantém a atual; se informada, vira hash no server.
export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: roleSchema,
  active: z.boolean(),
  setorIds: z.array(z.string()).default([]),
  password: z.string().min(6).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
