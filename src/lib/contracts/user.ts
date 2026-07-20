import { z } from "zod";

// Papéis FIXOS (em código, com poderes especiais). FABRICA = chão de fábrica: vê
// SÓ Requisições e só SOLICITA. FABRICA_GESTOR = quem aprova (ex.: Daniel): vê SÓ
// Requisições por padrão, mas com a fila de decisão e o relatório PDF.
export const PAPEIS_FIXOS = ["ADMIN", "GESTOR", "FUNCIONARIO", "FABRICA", "FABRICA_GESTOR"] as const;
export type PapelFixo = (typeof PAPEIS_FIXOS)[number];

export const ROTULO_PAPEL_FIXO: Record<PapelFixo, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FUNCIONARIO: "Funcionário",
  FABRICA: "Fábrica",
  FABRICA_GESTOR: "Gestor da Fábrica",
};

export function isPapelFixo(codigo: string): codigo is PapelFixo {
  return (PAPEIS_FIXOS as readonly string[]).includes(codigo);
}

// `User.role` = o `codigo` do papel fixo OU de um perfil customizado (cuid). Por
// isso é string livre; a Server Action valida que o código existe (fixo ou perfil
// no banco) antes de gravar.
export const roleSchema = z.string().min(1);
export type Role = z.infer<typeof roleSchema>; // = string

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
