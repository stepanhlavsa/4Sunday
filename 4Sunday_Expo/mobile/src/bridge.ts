export type Auth = { username: string; password: string };
export type BridgeRequest = {
  action: string;
  auth: Auth;
  params: Record<string, unknown>;
};
type Handler = (message: BridgeRequest) => Promise<any>;
let handler: Handler | null = null;
let reset: (() => void) | null = null;
export function attachBridge(next: Handler, clear: () => void) {
  handler = next;
  reset = clear;
  return () => {
    if (handler === next) {
      handler = null;
      reset = null;
    }
  };
}
export async function bridgeCall(message: BridgeRequest): Promise<any> {
  // Host mounts next to Main; its useEffect is normally ready before the first login.
  if (!handler)
    throw new Error(
      "Mobilní spojení ještě není připraveno. Zkuste přihlášení znovu.",
    );
  return handler(message);
}
export function resetBridge() {
  reset?.();
}
