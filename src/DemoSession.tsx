import { useEffect, useState, type ReactNode } from "react";

// Hold ownership before mounting the app: loading, saving and WebMCP execution
// must never run concurrently against a different tab's in-memory snapshot.
export function DemoSession({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ready" | "busy" | "unsupported">("checking");
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    if (!navigator.locks) {
      setStatus("unsupported");
      return;
    }
    void navigator.locks.request("teachback-demo-editor", { ifAvailable: true }, async (lock) => {
      if (cancelled) return;
      if (!lock) {
        setStatus("busy");
        return;
      }
      await new Promise<void>((resolve) => {
        release = resolve;
        setStatus("ready");
      });
    }).catch(() => { if (!cancelled) setStatus("unsupported"); });
    return () => { cancelled = true; release?.(); };
  }, []);

  if (status === "ready") return children;
  if (status === "checking") return null;
  let ja = navigator.language.toLowerCase().startsWith("ja");
  try {
    const locale = localStorage.getItem("teachback-ui-locale-v1");
    if (locale === "ja" || locale === "en") ja = locale === "ja";
  } catch { /* Language preference is optional. */ }
  return (
    <main className="session-notice" lang={ja ? "ja" : "en"}>
      <h1>{status === "busy"
        ? ja ? "別のタブでTeachbackを開いています" : "Teachback is open in another tab"
        : ja ? "このブラウザーでは操作を開始できません" : "This browser cannot start an editing session"}</h1>
      <p>{status === "busy"
        ? ja ? "保存内容を守るため、同時に操作できるのは1つのタブです。他のタブを閉じてから再読み込みしてください。" : "Only one tab can edit at a time to protect saved work. Close the other tab, then reload."
        : ja ? "タブ間の同時操作を防ぐ機能が必要です。対応するブラウザーで開き直してください。" : "A browser supporting Web Locks is required to protect saved work across tabs."}</p>
      <button onClick={() => window.location.reload()}>{ja ? "再読み込み" : "Reload"}</button>
    </main>
  );
}
