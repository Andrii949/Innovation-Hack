import { useState } from "react";

import ServerSetupPage from "./features/setup/ServerSetupPage";
import { getServerUrl, isNativeApp, needsServerSetup } from "./platform/server";

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
    <main>
      <h1>Intelligent Laboratory</h1>
      <p>Supervision of measuring equipment in the laboratory.</p>
      {isNativeApp() && server !== null && <p>Server: {server}</p>}
    </main>
  );
}
