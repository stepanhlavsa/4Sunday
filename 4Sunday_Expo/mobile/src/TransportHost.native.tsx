import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { attachBridge, BridgeRequest } from "./bridge";
import { BRIDGE_HTML } from "./workerSource";

type Pending = {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  parts: string[];
  total: number;
  size: number;
};
export default function TransportHost() {
  const web = useRef<WebView<{}>>(null);
  const ready = useRef(false);
  const waiters = useRef<
    Array<{ resolve: () => void; reject: (e: Error) => void }>
  >([]);
  const pending = useRef(new Map<string, Pending>());
  const serial = useRef(0);
  const [generation, setGeneration] = useState(0);
  function rejectAll(message: string) {
    ready.current = false;
    const error = new Error(message);
    waiters.current.splice(0).forEach((w) => w.reject(error));
    pending.current.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(error);
    });
    pending.current.clear();
  }
  useEffect(
    () =>
      attachBridge(
        async (request: BridgeRequest) => {
          if (!ready.current)
            await new Promise<void>((resolve, reject) => {
              const waiter = {
                resolve: () => {
                  clearTimeout(timer);
                  resolve();
                },
                reject: (e: Error) => {
                  clearTimeout(timer);
                  reject(e);
                },
              };
              const timer = setTimeout(() => {
                waiters.current = waiters.current.filter((w) => w !== waiter);
                reject(
                  new Error(
                    "WebView se nepodařilo spustit. Zavřete a znovu otevřete aplikaci.",
                  ),
                );
              }, 20000);
              waiters.current.push(waiter);
            });
          return new Promise((resolve, reject) => {
            const id = String(++serial.current);
            const timer = setTimeout(() => {
              pending.current.delete(id);
              reject(
                new Error(
                  "Vypršel čas požadavku. U zápisu nejprve obnovte seznam a ověřte stav na WTTS.",
                ),
              );
              rejectAll("Spojení se obnovuje.");
              setGeneration((n) => n + 1);
            }, 240000);
            pending.current.set(id, {
              resolve,
              reject,
              timer,
              parts: [],
              total: 0,
              size: 0,
            });
            const json = JSON.stringify({ ...request, id })
              .replace(/\u2028/g, "\\u2028")
              .replace(/\u2029/g, "\\u2029");
            web.current?.injectJavaScript(
              `window.__fourSundayRun(${json});true;`,
            );
          });
        },
        () => {
          rejectAll("Relace byla ukončena.");
          setGeneration((n) => n + 1);
        },
      ),
    [],
  );
  useEffect(() => () => rejectAll("Aplikace ukončila spojení."), []);
  function onMessage(event: WebViewMessageEvent) {
    let message: any;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === "ready") {
      ready.current = true;
      waiters.current.splice(0).forEach((w) => w.resolve());
      return;
    }
    if (message.type !== "part" || typeof message.id !== "string") return;
    const p = pending.current.get(message.id);
    if (!p) return;
    if (
      !Number.isInteger(message.total) ||
      message.total < 1 ||
      message.total > 700 ||
      !Number.isInteger(message.index) ||
      message.index < 0 ||
      message.index >= message.total ||
      typeof message.text !== "string" ||
      message.text.length > 60000
    )
      return;
    if (
      (p.total && p.total !== message.total) ||
      p.parts[message.index] !== undefined
    )
      return;
    p.total = message.total;
    p.size += message.text.length;
    p.parts[message.index] = message.text;
    if (p.size > 32 * 1024 * 1024) {
      clearTimeout(p.timer);
      pending.current.delete(message.id);
      p.reject(new Error("Odpověď je příliš velká."));
      return;
    }
    if (p.parts.filter((x) => typeof x === "string").length === p.total) {
      clearTimeout(p.timer);
      pending.current.delete(message.id);
      try {
        p.resolve(JSON.parse(p.parts.join("")));
      } catch {
        p.reject(new Error("Poškozená odpověď z mobilního spojení."));
      }
    }
  }
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        opacity: 0,
        overflow: "hidden",
      }}
    >
      <WebView<{}>
        key={generation}
        ref={web}
        source={{ html: BRIDGE_HTML, baseUrl: "https://www.wtts.org/" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        incognito
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        mixedContentMode="never"
        allowFileAccess={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onShouldStartLoadWithRequest={(request) =>
          request.url === "about:blank" ||
          request.url === "https://www.wtts.org/"
        }
        onMessage={onMessage}
        onError={() => rejectAll("WebView selhalo. Restartujte aplikaci.")}
        onContentProcessDidTerminate={() => {
          rejectAll("Spojení bylo přerušeno systémem. Zkuste požadavek znovu.");
          setGeneration((n) => n + 1);
        }}
        onRenderProcessGone={() => {
          rejectAll("Spojení bylo přerušeno systémem. Zkuste požadavek znovu.");
          setGeneration((n) => n + 1);
        }}
      />
    </View>
  );
}
