import type { SyntheticEvent } from "react";
import { useState } from "react";

import { BrandMark, PlantSkyline } from "@/components/BrandMark";
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
import { checkServer, normalizeServerUrl, setServerUrl } from "@/platform/server";

type Props = {
  onDone: () => void;
};

export default function ServerSetupPage({ onDone }: Props) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);

    const url = normalizeServerUrl(address);
    if (url === null) {
      setError("Podaj adres serwera, np. https://lab.example.com.");
      return;
    }

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

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-primary px-4 py-10 text-primary-foreground">
      <PlantSkyline className="pointer-events-none absolute -right-8 bottom-0 h-44 w-[40rem] text-primary-foreground/10" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="font-mono text-[9px] tracking-[0.24em] text-chart-2 uppercase">
              Cementownia Warta S.A.
            </p>
            <p className="text-lg font-semibold tracking-tight">Laboratorium zakładowe</p>
            <p className="font-mono text-[10px] tracking-[0.14em] text-white/55 uppercase">
              PN-EN ISO/IEC 17025
            </p>
          </div>
        </div>
        <Card className="bg-card text-card-foreground shadow-2xl">
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
            <CardFooter>
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? "Sprawdzanie…" : "Sprawdź i zapisz"}
              </Button>
            </CardFooter>
          </form>
        </Card>
        <p className="mt-4 text-center font-mono text-[9px] tracking-[0.16em] text-white/50 uppercase">
          Połączenie z serwerem zakładowym
        </p>
      </div>
    </main>
  );
}
