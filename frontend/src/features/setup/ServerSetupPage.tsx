import type { SyntheticEvent } from "react";
import { useState } from "react";

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
      setError("Enter the server address, e.g. https://lab.example.com.");
      return;
    }

    setBusy(true);
    const reachable = await checkServer(url);
    setBusy(false);

    if (!reachable) {
      setError(`No answer from ${url}/api/health. Check the address and the network.`);
      return;
    }

    setServerUrl(url);
    onDone();
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Server address</CardTitle>
          <CardDescription>
            Enter the address of your laboratory server. It is saved on this device only.
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="server-address">Server address</Label>
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
              {busy ? "Checking…" : "Check and save"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
