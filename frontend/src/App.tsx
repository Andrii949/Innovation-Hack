import { useState } from "react";

import ServerSetupPage from "@/features/setup/ServerSetupPage";
import { getServerUrl, isNativeApp, needsServerSetup } from "@/platform/server";

export default function App() {
  const [ready, setReady] = useState(() => !needsServerSetup());

  if (!ready) {
    return (
      <ServerSetupPage
        onDone={() => {
          setReady(true);
        }}
      />
    );
  }

  const server = getServerUrl();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Intelligent Laboratory</h1>
      <p className="text-muted-foreground">Supervision of measuring equipment in the laboratory.</p>
      {isNativeApp() && server !== null && (
        <p className="text-sm text-muted-foreground">Server: {server}</p>
      )}
    </main>
  );
}
