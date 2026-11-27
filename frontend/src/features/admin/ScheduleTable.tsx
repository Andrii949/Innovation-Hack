import type { CheckPlan, DueItem, Lab } from "@/api/types";
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
import { dueEquipmentId, dueKey, dueLabName } from "@/lib/due";
import { formatDue } from "@/lib/format";
import { dueKindLabel } from "@/lib/status";

export function ScheduleTable({
  items,
  plans,
  labs,
  onSelectEquipment,
}: {
  items: DueItem[];
  plans: CheckPlan[];
  labs: Lab[];
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
        {items.map((item) => {
          const equipmentId = dueEquipmentId(item, plans);
          return (
            <TableRow key={dueKey(item)}>
              <TableCell className="whitespace-nowrap tabular-nums">{formatDue(item)}</TableCell>
              <TableCell className="max-w-[24rem] text-wrap">
                {equipmentId !== null ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto justify-start p-0 text-left whitespace-normal"
                    onClick={() => {
                      onSelectEquipment(equipmentId);
                    }}
                  >
                    {item.label}
                  </Button>
                ) : (
                  item.label
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">{dueLabName(item, labs)}</TableCell>
              <TableCell className="whitespace-nowrap">{dueKindLabel(item.kind)}</TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
