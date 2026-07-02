import { CheckCircle2, XCircle } from "lucide-react";

import type { FormState } from "@/lib/form";

// Banner de feedback de formulário (sucesso/erro) reutilizável.
export function FormFeedback({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const isSuccess = state.status === "success";
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
        isSuccess
          ? "bg-success-dim text-success"
          : "bg-danger-dim text-danger"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0" />
      )}
      {state.message}
    </p>
  );
}
