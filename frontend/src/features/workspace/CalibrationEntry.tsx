import { Camera, Plus, ScanText, Trash2 } from "lucide-react";
import { type FormEvent, type ReactElement, useState } from "react";
import { toast } from "sonner";

import { api, errorMessage, upload } from "@/api/workspaceClient";
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
import { Textarea } from "@/components/ui/textarea";
import { capturePhoto } from "@/platform/camera";

import { Control, FilePicker, Message, selectStyle, today } from "./shared";

type Point = { point: string; error: string; uncertainty: string; unit: string };
type Draft = {
  calibrated_month: string | null;
  vendor: string | null;
  certificate_no: string | null;
  adjustments: string | null;
  points: Partial<Point>[];
  warnings: string[];
};

function blankPoint() {
  return { point: "", error: "", uncertainty: "", unit: "" };
}

export function CalibrationEntry({
  token,
  equipmentId,
  name,
  after,
  children,
}: {
  token: string;
  equipmentId: number;
  name: string;
  after: () => void;
  children?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [points, setPoints] = useState([{ id: 0, value: blankPoint() }]);
  const [file, setFile] = useState<File>();
  const [attachment, setAttachment] = useState<{ id: number; filename: string }>();
  const path = `/equipment/${equipmentId}/calibrations`;

  async function uploadCertificate() {
    if (file === undefined) {
      return undefined;
    }
    if (attachment !== undefined) {
      return attachment.id;
    }
    const saved = await upload(file, token);
    setAttachment(saved);
    return saved.id;
  }

  async function captureCertificate() {
    setBusy(true);
    setError("");
    try {
      const photo = await capturePhoto();
      if (photo === null) {
        return;
      }
      setFile(new File([photo.blob], photo.filename, { type: photo.mimeType }));
      setAttachment(undefined);
      setDraft(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function extract() {
    setBusy(true);
    setError("");
    try {
      const id = await uploadCertificate();
      if (id === undefined) {
        return;
      }
      const next = await api<Draft>(`${path}/extract`, token, "POST", { attachment_id: id });
      setDraft(next);
      if (next.points.length) {
        setPoints(
          next.points.map((point, index) => ({
            id: index,
            value: {
              point: point.point ?? "",
              error: point.error ?? "",
              uncertainty: point.uncertainty ?? "",
              unit: point.unit ?? "",
            },
          })),
        );
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const id = await uploadCertificate();
      const entry = await api<{ next_due_month: string | null }>(path, token, "POST", {
        calibrated_month: fields.get("calibrated_month"),
        vendor: fields.get("vendor"),
        certificate_no: fields.get("certificate_no"),
        adjustments: fields.get("adjustments"),
        result: fields.get("result"),
        note: fields.get("note"),
        attachment_ids: id === undefined ? [] : [id],
        points: points.map(({ value }) => value),
      });
      setOpen(false);
      after();
      toast.success("Zarejestrowano wzorcowanie", {
        description: entry.next_due_month
          ? `Termin z tego wpisu: ${entry.next_due_month}.`
          : undefined,
      });
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
          setDraft(undefined);
          setPoints([{ id: 0, value: blankPoint() }]);
          setFile(undefined);
          setAttachment(undefined);
          setError("");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button">
            <Plus />
            Zarejestruj wzorcowanie
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Zarejestruj wzorcowanie</DialogTitle>
          <DialogDescription>
            {name} · Przepisz dane ze świadectwa wystawionego przez firmę wzorcującą.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="rounded-lg border bg-muted/60 p-3">
            <Control label="Świadectwo wzorcowania (opcjonalnie)" htmlFor="cert-file">
              <div className="flex flex-wrap items-center gap-2">
                <FilePicker
                  id="cert-file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  file={file}
                  onChange={(value) => {
                    setFile(value);
                    setAttachment(undefined);
                    setDraft(undefined);
                  }}
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void captureCertificate()}
                >
                  <Camera />
                  Zrób zdjęcie
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!file || busy}
                  onClick={extract}
                >
                  <ScanText />
                  Odczytaj świadectwo (OCR)
                </Button>
              </div>
            </Control>
          </div>
          {draft && (
            <Message>Sprawdź propozycje OCR ze świadectwem. {draft.warnings.join(" ")}</Message>
          )}
          <div key={draft ? "ocr-draft" : "manual-draft"} className="grid gap-3 sm:grid-cols-2">
            <Control label="Miesiąc wzorcowania" htmlFor="cert-month">
              <Input
                id="cert-month"
                name="calibrated_month"
                type="month"
                required
                defaultValue={draft?.calibrated_month ?? today().slice(0, 7)}
              />
            </Control>
            <Control label="Firma wzorcująca" htmlFor="cert-vendor">
              <Input id="cert-vendor" name="vendor" required defaultValue={draft?.vendor ?? ""} />
            </Control>
            <Control label="Numer świadectwa" htmlFor="cert-number">
              <Input
                id="cert-number"
                name="certificate_no"
                defaultValue={draft?.certificate_no ?? ""}
              />
            </Control>
            <Control label="Decyzja specjalisty" htmlFor="cert-result">
              <select
                id="cert-result"
                name="result"
                className={selectStyle}
                required
                defaultValue=""
              >
                <option value="">Wybierz wynik</option>
                <option value="OK">OK · przyjęte</option>
                <option value="NOK">NOK · nieprzyjęte</option>
              </select>
            </Control>
            <Control label="Regulacje (opcjonalnie)" htmlFor="cert-adjustments">
              <Textarea
                id="cert-adjustments"
                name="adjustments"
                rows={2}
                defaultValue={draft?.adjustments ?? ""}
              />
            </Control>
            <Control label="Uwagi (opcjonalnie)" htmlFor="cert-note">
              <Textarea id="cert-note" name="note" rows={2} />
            </Control>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-2 font-semibold">Punkty ze świadectwa</legend>
            {points.map(({ id, value }, index) => (
              <div
                key={id}
                className="grid grid-cols-2 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto]"
              >
                <p className="col-span-full text-xs font-semibold text-muted-foreground">
                  Punkt {index + 1}
                </p>
                {(
                  [
                    ["point", "Punkt / wartość"],
                    ["error", "Błąd"],
                    ["uncertainty", "Niepewność"],
                    ["unit", "Jednostka"],
                  ] satisfies [keyof Point, string][]
                ).map(([key, label]) => (
                  <Control key={key} label={label} htmlFor={`cert-point-${id}-${key}`}>
                    <Input
                      id={`cert-point-${id}-${key}`}
                      required
                      value={value[key]}
                      inputMode={key === "error" || key === "uncertainty" ? "decimal" : "text"}
                      onChange={(event) => {
                        const input = event.currentTarget.value;
                        setPoints((items) =>
                          items.map((row) =>
                            row.id === id ? { id, value: { ...row.value, [key]: input } } : row,
                          ),
                        );
                      }}
                    />
                  </Control>
                ))}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Usuń punkt ${index + 1}`}
                  disabled={points.length < 2}
                  onClick={() => setPoints((items) => items.filter((row) => row.id !== id))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </fieldset>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              setPoints((items) => [
                ...items,
                { id: Math.max(...items.map(({ id }) => id)) + 1, value: blankPoint() },
              ])
            }
          >
            <Plus />
            Dodaj punkt
          </Button>
          {error && <Message>{error}</Message>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Przetwarzanie…" : "Zapisz wzorcowanie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
