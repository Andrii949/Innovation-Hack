import { useEffect, useState, useSyncExternalStore } from "react";

import {
  getSnapshot,
  markAllNotificationsRead,
  resetDemo,
  subscribe,
  switchRole,
} from "@/api/demoClient";
import type { Snapshot } from "@/api/types";
import { AdminPage } from "@/features/admin/AdminPage";
import { ManagerPage } from "@/features/manager/ManagerPage";
import { viewForSession } from "@/features/roleView";
import ServerSetupPage from "@/features/setup/ServerSetupPage";
import { WorkerPage } from "@/features/worker/WorkerPage";
import { AppShell } from "@/layout/AppShell";
import { roleCodeFromHash, roleHash } from "@/lib/demoRoleRoute";
import { getServerUrl, isNativeApp, needsServerSetup } from "@/platform/server";

function View({ snapshot }: { snapshot: Snapshot }) {
  switch (viewForSession(snapshot.session)) {
    case "manager":
      return <ManagerPage snapshot={snapshot} />;
    case "office":
      return <AdminPage snapshot={snapshot} />;
    case "lab":
      return <WorkerPage snapshot={snapshot} />;
  }
}

function changeRole(roleCode: string): void {
  if (!switchRole(roleCode)) {
    return;
  }
  const nextHash = roleHash(roleCode);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

export default function App() {
  const [ready, setReady] = useState(() => !needsServerSetup());
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    const currentRole = snapshot.session.role.code;
    const applyHash = (): void => {
      const roleCode = roleCodeFromHash(window.location.hash);
      if (roleCode !== null && roleCode !== currentRole) {
        switchRole(roleCode);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [snapshot.session.role.code]);

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
    <AppShell
      snapshot={snapshot}
      onRoleChange={changeRole}
      onReset={resetDemo}
      onMarkNotificationsRead={() => {
        markAllNotificationsRead();
      }}
    >
      {isNativeApp() && server !== null && (
        <p className="mb-4 text-xs text-muted-foreground">Serwer: {server}</p>
      )}
      <View snapshot={snapshot} />
    </AppShell>
  );
}
