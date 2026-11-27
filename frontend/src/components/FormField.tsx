import type { ReactNode } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

export function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {hint !== undefined && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}
