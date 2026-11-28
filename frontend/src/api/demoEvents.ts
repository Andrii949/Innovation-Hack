import { api } from "@/api/workspaceClient";

export type DemoAction = "push" | "scan" | "card" | "toast";

export type DemoEvent = {
  id: number;
  action: DemoAction;
  public_id: string | null;
  code: string | null;
  name: string | null;
  title: string;
  message: string;
  source: "nfc" | "qr" | null;
  created_at: string;
};

export function fetchDemoEvents(token: string, after: number): Promise<DemoEvent[]> {
  return api<DemoEvent[]>(`/demo/events?after=${after}`, token);
}
