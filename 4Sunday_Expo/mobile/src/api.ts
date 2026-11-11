import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { bridgeCall, resetBridge } from "./bridge";
export type MenuItem = {
  label: string;
  url: string | null;
  children: MenuItem[];
};
export type Song = {
  sid: number;
  name: string;
  key: string;
  pdf?: string | null;
  xml?: string | null;
  actions?: Record<string, string>;
  attachments?: boolean;
  editable?: boolean;
  drawer?: boolean;
  schedule?: boolean;
  last_planned?: string;
};
export type EventItem = {
  eid: number;
  title: string;
  songs: Song[];
  links: { plan: string | null; pdf: string | null; xml: string | null };
};
export type TeamEvent = {
  eid: number;
  title: string;
  date: string;
  scheduler: string;
  plan: string | null;
  toggle: boolean;
  cancel: boolean;
};
export type ExportFile = {
  base64: string;
  filename: string;
  mime: string;
  text: string;
};
export type Session = { username: string; password: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  session: Session,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (Platform.OS === "web")
    throw new Error(
      "Přímé připojení k WTTS je v této verzi dostupné na Androidu a iOS. Na webu použijte ukázkový režim.",
    );
  const result = await bridgeCall({ action, auth: session, params });
  if (!result.ok)
    throw new ApiError(
      result.error || "Požadavek WTTS selhal.",
      result.status || 500,
    );
  return result as T;
}
export function clearConnection() {
  resetBridge();
}
const key = "4sunday.direct.credentials.v1";
export async function loadSession(): Promise<Session | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return typeof s.username === "string" &&
      typeof s.password === "string" &&
      s.username &&
      s.password
      ? s
      : null;
  } catch {
    return null;
  }
}
export async function saveSession(session: Session | null) {
  if (Platform.OS === "web") return;
  if (session)
    await SecureStore.setItemAsync(key, JSON.stringify(session), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(key);
}
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs")
    .trim();
