import { z } from "zod";

// Papéis (espelham o enum Role do Prisma).
export const roleSchema = z.enum(["ADMIN", "GESTOR", "FUNCIONARIO"]);
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
