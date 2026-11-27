import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { AuditLog } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

const ACTION_LABELS: Record<AuditLog["action"], string> = {
  create: "utworzenie",
  update: "zmiana",
  delete: "usunięcie",
  reject: "odrzucenie",
  login: "logowanie",
};

const ENTITY_LABELS: Record<string, string> = {
  equipment: "urządzenie",
  calibration: "wzorcowanie",
  check_record: "sprawdzenie",
  stock_count: "spis stanu",
  test_result: "wynik",
  report: "raport",
  setting: "ustawienie",
};

function ChangeDetails({ after }: { after: string | null }) {
  if (after === null) {
    return null;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="group/details -ml-1.5 gap-1">
          Szczegóły
          <ChevronDown
            className="size-3 transition-transform group-data-open/details:rotate-180"
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] break-all whitespace-pre-wrap text-muted-foreground">
          {after}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function changeLabel(entry: AuditLog): string {
  const entity = ENTITY_LABELS[entry.entity] ?? entry.entity;
  return `${ACTION_LABELS[entry.action]} · ${entity}`;
}

export function AuditList({ audit, limit = 6 }: { audit: AuditLog[]; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? audit : audit.slice(0, limit);

  return (
    <div className="grid gap-2">
      <div className="sm:hidden">
        <DataList>
          {visible.map((entry) => (
            <DataListItem key={entry.id}>
              <p className="text-sm font-medium">{changeLabel(entry)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(entry.at)} · {entry.userName}
              </p>
              {entry.reason !== null && (
                <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
              )}
              <ChangeDetails after={entry.after} />
            </DataListItem>
          ))}
        </DataList>
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kiedy</TableHead>
              <TableHead>Kto</TableHead>
              <TableHead>Zmiana</TableHead>
              <TableHead>Po</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((entry) => (
              <TableRow key={entry.id} className="align-top">
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateTime(entry.at)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{entry.userName}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {changeLabel(entry)}
                  {entry.reason !== null && (
                    <span className="block text-xs text-muted-foreground">{entry.reason}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[28rem]">
                  <ChangeDetails after={entry.after} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {audit.length > limit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded
            ? `Zwiń do ${limit} wpisów`
            : `Pokaż wszystkie wpisy (${audit.length - limit} więcej)`}
        </Button>
      )}
    </div>
  );
}
