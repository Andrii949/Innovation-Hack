import { QrCode } from "lucide-react";
import type { SyntheticEvent } from "react";
import { useState } from "react";

import { CorporateBrand } from "@/components/BrandMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canScanQr, scanRawQrCode } from "@/platform/scan";
import {
  checkServer,
  normalizeServerUrl,
  parseServerConfigQr,
  setServerUrl,
} from "@/platform/server";

import "@/layout/app-shell.css";
import "@/layout/workspace-pages.css";

type Props = {
  onDone: () => void;
};

export default function ServerSetupPage({ onDone }: Props) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verifyAndSave = async (url: string): Promise<void> => {
    setBusy(true);
    const reachable = await checkServer(url);
    setBusy(false);

    if (!reachable) {
      setError(`Brak odpowiedzi z ${url}/api/health. Sprawdź adres i sieć.`);
      return;
    }

    setServerUrl(url);
    onDone();
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    const url = normalizeServerUrl(address);
    if (url === null) {
      setError("Podaj adres serwera, np. https://lab.example.com.");
      return;
    }

    await verifyAndSave(url);
  };

  const handleScanConfigQr = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    const raw = await scanRawQrCode();
    if (raw === null) {
      setBusy(false);
      return;
    }

    const parsed = parseServerConfigQr(raw);
    if (parsed === null) {
      setBusy(false);
      setError("To nie jest kod konfiguracyjny serwera.");
      return;
    }

    setAddress(parsed);
    await verifyAndSave(parsed);
  };

  return (
    <main className="workspace workspace-setup">
      <header className="workspace-setup-header">
        <div className="workspace-container workspace-brand-container">
          <div className="workspace-brand">
            <CorporateBrand />
          </div>
        </div>
      </header>
      <div className="workspace-container workspace-content mx-auto max-w-md">
        <Card className="workspace-login-card">
          <CardHeader>
            <CardTitle className="text-xl">Adres serwera</CardTitle>
            <CardDescription>
              Adres serwera laboratoryjnego. Zapisujemy go tylko na tym urządzeniu.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void handleSubmit(event)}>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="server-address">Adres serwera</Label>
                <Input
                  id="server-address"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://lab.example.com"
                  className="h-11"
                  value={address}
                  aria-invalid={error !== null}
                  aria-describedby={error === null ? undefined : "server-address-error"}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                  required
                />
              </div>
              {error !== null && (
                <Alert variant="destructive" id="server-address-error">
                  <AlertDescription className="break-all">{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="grid gap-2">
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? "Sprawdzanie…" : "Sprawdź i zapisz"}
              </Button>
              {canScanQr() && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={busy}
                  onClick={() => void handleScanConfigQr()}
                >
                  <QrCode className="mr-2 size-4" />
                  Skanuj QR konfiguracyjny
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
