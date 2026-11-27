import type { DueItem } from "@/api/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDue } from "@/lib/format";
import { dueKindLabel } from "@/lib/status";

export function ScheduleTable({
  items,
  onSelectEquipment,
}: {
  items: DueItem[];
  onSelectEquipment: (equipmentId: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Termin</TableHead>
          <TableHead>Pozycja</TableHead>
          <TableHead>Pracownia</TableHead>
          <TableHead>Rodzaj</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              Brak pozycji dla wybranych filtrów.
            </TableCell>
          </TableRow>
        )}
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap tabular-nums">{formatDue(item)}</TableCell>
            <TableCell className="max-w-[24rem] text-wrap">
              {item.equipmentId !== null ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start p-0 text-left whitespace-normal"
                  onClick={() => onSelectEquipment(item.equipmentId ?? "")}
                >
                  {item.label}
                </Button>
              ) : (
                item.label
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">{item.labName}</TableCell>
            <TableCell className="whitespace-nowrap">{dueKindLabel(item.kind)}</TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
