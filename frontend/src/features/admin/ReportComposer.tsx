import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";

import { generateReport } from "@/api/demoClient";
import type { Report, Snapshot } from "@/api/types";
import { FormField } from "@/components/FormField";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";

export function ReportComposer({ snapshot }: { snapshot: Snapshot }) {
  const allowed = can(snapshot.session, "report:write");
  const [from, setFrom] = useState(`${snapshot.today.slice(0, 7)}-01`);
  const [to, setTo] = useState(snapshot.today);
  const [labId, setLabId] = useState("ALL");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const labOptions = useMemo<SelectOption[]>(
    () => [
      { value: "ALL", label: "Wszystkie pracownie" },
      ...snapshot.labs.map((lab) => ({ value: lab.id, label: `${lab.code} — ${lab.name}` })),
    ],
    [snapshot.labs],
  );

  if (!allowed) {
    return null;
  }

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const labIds = labId === "ALL" ? snapshot.labs.map((lab) => lab.id) : [labId];
    const response = generateReport({ periodFrom: from, periodTo: to, labIds });
    if (!response.ok) {
      setMessage({ tone: "error", text: response.error.message });
      return;
    }
    const report: Report = response.data;
    setMessage({
      tone: "ok",
      text: `${report.title} — wysłany do kierownika (${formatDate(report.periodFrom)}–${formatDate(report.periodTo)}).`,
    });
  };

  return (
    <Card
      size="sm"
      className="gap-0 overflow-hidden rounded-2xl border bg-card py-0 shadow-sm ring-0"
    >
      <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="size-1.5 shrink-0 bg-chart-2" aria-hidden />
          <CardTitle>Raport nadzoru</CardTitle>
        </div>
        <CardDescription>
          Zestaw terminów, spisów i wyników z okresu. Raport trafia do kierownika; PDF (Typst)
          powstanie po stronie backendu.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-5">
        <form onSubmit={submit}>
          <FieldGroup className="gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
              <FormField id="report-from" label="Od">
                <Input
                  id="report-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                  required
                />
              </FormField>
              <FormField id="report-to" label="Do">
                <Input
                  id="report-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                  required
                />
              </FormField>
              <FormField id="report-lab" label="Zakres pracowni">
                <SelectField
                  id="report-lab"
                  value={labId}
                  options={labOptions}
                  onValueChange={setLabId}
                  ariaLabel="Zakres pracowni"
                />
              </FormField>
              <Button type="submit" className="mb-5 sm:mb-0">
                Wygeneruj i wyślij
              </Button>
            </div>
            {message !== null && (
              <Alert variant={message.tone === "error" ? "destructive" : "default"}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
