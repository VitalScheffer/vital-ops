// Estado de formulário compartilhado entre server actions e componentes cliente
// (useActionState). Mantido fora de qualquer módulo "use server" porque esses só
// podem exportar funções assíncronas.

export interface FormState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };
