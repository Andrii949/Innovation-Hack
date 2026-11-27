import type { SyntheticEvent } from "react";
import { useState } from "react";

import { checkServer, normalizeServerUrl, setServerUrl } from "../../platform/server";

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
    <main>
      <h1>Server address</h1>
      <p>Enter the address of your laboratory server. It is saved on this device only.</p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="server-address">Server address</label>
        <input
          id="server-address"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://lab.example.com"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
          }}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Check and save"}
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
