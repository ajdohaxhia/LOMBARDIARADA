import { useEffect, useRef } from "react";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
export default function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (s: string) => void;
  resetKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    let disposed = false;
    const render = () => {
      if (!disposed && window.turnstile && ref.current)
        widget = window.turnstile.render(ref.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
          action: "submit",
        });
    };
    if (window.turnstile) render();
    else {
      let script = document.getElementById(
        "turnstile-script",
      ) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "turnstile-script";
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.append(script);
      }
      script.addEventListener("load", render);
      return () => {
        disposed = true;
        script.removeEventListener("load", render);
        if (widget) window.turnstile?.remove(widget);
      };
    }
    return () => {
      disposed = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [onToken, resetKey]);
  return import.meta.env.VITE_TURNSTILE_SITE_KEY ? (
    <div ref={ref} />
  ) : (
    <p className="notice">
      Protezione anti-abuso da configurare. Invio disabilitato.
    </p>
  );
}
