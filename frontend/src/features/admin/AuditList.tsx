import type { AuditLog } from "@/api/types";
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

export function AuditList({ audit, limit = 6 }: { audit: AuditLog[]; limit?: number }) {
  return (
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
        {audit.slice(0, limit).map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap tabular-nums">
              {formatDateTime(entry.at)}
            </TableCell>
            <TableCell className="whitespace-nowrap">{entry.userName}</TableCell>
            <TableCell className="whitespace-nowrap">
              {ACTION_LABELS[entry.action]} · {ENTITY_LABELS[entry.entity] ?? entry.entity}
              {entry.reason !== null && (
                <span className="block text-xs text-muted-foreground">{entry.reason}</span>
              )}
            </TableCell>
            <TableCell className="max-w-[28rem] font-mono text-[11px] break-all text-muted-foreground">
              {entry.after ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
