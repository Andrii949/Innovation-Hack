import { cn } from "cn";
import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { api, type ApiRecord, errorMessage, textValue } from "@/api/workspaceClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type WorkspaceProps = { token: string; permissions: string[] };
export type Option = { value: string; label: string };
export type Field = {
  key: string;
  label: string;
  type?:
    "number" | "date" | "month" | "password" | "boolean" | "options" | "many" | "note" | "json";
  required?: boolean;
  options?: Option[];
  numeric?: boolean;
  clear?: boolean;
  hint?: string;
};

export const selectStyle =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-brand-navy focus-visible:ring-3 focus-visible:ring-brand-navy/15 sm:h-9";

export function options(rows: ApiRecord[], label = "name"): Option[] {
  return rows.map((row) => ({ value: textValue(row.id), label: textValue(row[label]) }));
}

export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type ApiState<T> = { data?: T; error?: string };

export function useApi<T>(
  path: string | null,
  token: string,
  revision = 0,
): ApiState<T> | undefined {
  const [state, setState] = useState<
    ApiState<T> & { path: string; revision: number; token: string }
  >();
  useEffect(() => {
    let active = true;
    async function load(url: string) {
      try {
        const data = await api<T>(url, token);
        if (active) {
          setState({ path: url, data, revision, token });
        }
      } catch (error) {
        if (active) {
          setState({ path: url, error: errorMessage(error), revision, token });
        }
      }
    }
    if (path !== null) {
      void load(path);
    }
    return () => {
      active = false;
    };
  }, [path, token, revision]);
  return state?.path === path && state.revision === revision && state.token === token
    ? state
    : undefined;
}

export function Message({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function Loading({ state }: { state?: { error?: string } }) {
  if (state?.error) {
    return <Message>{state.error}</Message>;
  }
  return <output className="block py-4 text-sm text-muted-foreground">Wczytywanie…</output>;
}

export function Control({
  label,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <small className="text-muted-foreground">{hint}</small>}
    </div>
  );
}

function FieldInput({ field, value }: { field: Field; value: unknown }) {
  const id = useId();
  const { key, label, type, required, hint } = field;
  const initial = textValue(value, "");
  const [selection, setSelection] = useState(initial);
  if (type === "many") {
    const selected = Array.isArray(value) ? value.map((item: unknown) => textValue(item, "")) : [];
    return (
      <fieldset className="grid gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        {(field.options ?? []).map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              name={key}
              type="checkbox"
              value={option.value}
              defaultChecked={selected.includes(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <Control label={label} htmlFor={id} hint={hint}>
      {type === "boolean" ? (
        <select
          id={id}
          name={key}
          defaultValue={
            value === undefined ? "" : textValue(value, value === true ? "true" : "false")
          }
          className={selectStyle}
          required={required}
        >
          <option value="">Wybierz</option>
          <option value="true">Tak</option>
          <option value="false">Nie</option>
        </select>
      ) : type === "options" ? (
        <select
          id={id}
          name={key}
          value={selection}
          onChange={(event) => setSelection(event.currentTarget.value)}
          className={selectStyle}
          required={required}
        >
          <option value="">Wybierz</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === "note" || type === "json" ? (
        <Textarea
          id={id}
          name={key}
          defaultValue={type === "json" ? JSON.stringify(value, null, 2) : initial}
          required={required}
          rows={type === "json" ? 6 : 2}
        />
      ) : (
        <Input
          id={id}
          name={key}
          type={type ?? "text"}
          defaultValue={initial}
          required={required}
        />
      )}
    </Control>
  );
}

function formPayload(form: HTMLFormElement, fields: Field[]): ApiRecord {
  const values = new FormData(form);
  const result: ApiRecord = {};
  for (const field of fields) {
    if (field.type === "many") {
      result[field.key] = values
        .getAll(field.key)
        .map((value) => (field.numeric ? Number(value) : textValue(value, "")));
      continue;
    }
    const entered = textValue(values.get(field.key), "");
    const raw = field.type === "password" ? entered : entered.trim();
    if (raw === "") {
      if (field.clear) {
        result[field.key] = null;
      }
      continue;
    }
    if (field.type === "json") {
      try {
        result[field.key] = JSON.parse(raw);
      } catch {
        throw new Error(`Nieprawidłowy format JSON w polu „${field.label}”.`);
      }
    } else if (field.type === "boolean") {
      result[field.key] = raw === "true";
    } else if (field.type === "number" || field.numeric) {
      result[field.key] = Number(raw);
    } else {
      result[field.key] = raw;
    }
  }
  return result;
}

const emptyRecord: ApiRecord = {};
const emptyFields: Field[] = [];

export function Action({
  label,
  description = "Uzupełnij dane i zapisz zmiany.",
  fields = emptyFields,
  initial = emptyRecord,
  save,
  after,
  primary = false,
  defaultOpen = false,
  submitLabel = "Zapisz",
}: {
  label: string;
  description?: string;
  fields?: Field[];
  initial?: ApiRecord;
  save: (data: ApiRecord) => Promise<unknown>;
  after: () => void;
  primary?: boolean;
  defaultOpen?: boolean;
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save(formPayload(event.currentTarget, fields));
      setOpen(false);
      after();
      toast.success("Zapisano");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) {
          return;
        }
        if (next) {
          setError("");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={primary ? "default" : "outline"} size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {fields.map((field) => (
            <FieldInput key={field.key} field={field} value={initial[field.key]} />
          ))}
          {error && <Message>{error}</Message>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Zapisywanie…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type Columns = [string, string, ((value: unknown) => ReactNode)?][];

export function Rows({
  rows,
  columns,
  renderAction,
}: {
  rows: ApiRecord[];
  columns: Columns;
  renderAction?: (row: ApiRecord) => ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Brak pozycji.
      </p>
    );
  }
  return (
    <Table className="max-sm:block">
      <TableHeader className="max-sm:hidden">
        <TableRow>
          {columns.map(([key, title]) => (
            <TableHead key={key}>{title}</TableHead>
          ))}
          {renderAction && <TableHead>Akcje</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody className="max-sm:grid max-sm:gap-2">
        {rows.map((row, index) => (
          <TableRow key={textValue(row.id ?? row.key, String(index))} className={recordRow}>
            {columns.map(([key, title, display], column) => (
              <TableCell
                key={key}
                data-label={title}
                className={cn(
                  "max-w-[35rem] whitespace-normal",
                  recordField,
                  column === 0 && "font-medium text-brand-navy-ink",
                  column === 0 && recordTitle,
                )}
              >
                {display ? display(row[key]) : textValue(row[key])}
              </TableCell>
            ))}
            {renderAction && (
              <TableCell className="max-sm:mt-1.5 max-sm:p-0">
                <div className="flex flex-wrap gap-1.5">{renderAction(row)}</div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Below the sm breakpoint every row becomes a record card: the first column is its title, the
// others are "label: value" lines taken from data-label, so no column is cut off on a phone.
const recordRow =
  "max-sm:grid max-sm:gap-1 max-sm:rounded-md max-sm:border-0 max-sm:bg-card max-sm:p-3 max-sm:ring-1 max-sm:ring-border max-sm:ring-inset max-sm:even:bg-card";
const recordField =
  "max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:p-0 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-xs max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]";
const recordTitle =
  "max-sm:mb-1 max-sm:justify-start max-sm:text-left max-sm:text-[15px] max-sm:font-semibold max-sm:text-brand-navy-ink max-sm:before:hidden";

export function choice(...choices: [string, string][]): Option[] {
  return choices.map(([value, label]) => ({ value, label }));
}
