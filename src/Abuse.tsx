import { useState, useEffect, useRef, type FormEvent } from "react";
import { X } from "lucide-react";
import Turnstile from "./Turnstile";
import { submit } from "./api";
export default function Abuse({
  id,
  onClose,
  loggedIn,
}: {
  id: string;
  onClose: () => void;
  loggedIn: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, a[href], iframe, input:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ) || [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || sent || !token) return;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await submit(
        "abuse",
        { contribution_id: id, reason: String(f.get("reason")) },
        token,
      );
      setSent(true);
      setMessage("Segnalazione ricevuta dai moderatori.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      setToken("");
      setReset((r) => r + 1);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="abuse-title"
        className="modal"
      >
        <button
          autoFocus
          className="icon-button modal-close"
          aria-label="Chiudi"
          onClick={onClose}
        >
          <X />
        </button>
        <h2 id="abuse-title">Segnala un abuso</h2>
        {!loggedIn ? (
          <p>Accedi con Google prima di inviare una segnalazione di abuso.</p>
        ) : sent ? (
          <p>
            Il motivo è stato trasmesso alla moderazione. Puoi chiudere questa
            finestra.
          </p>
        ) : (
          <form onSubmit={send}>
            <label>
              Motivo
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                placeholder="Descrivi il problema senza inserire dati personali"
              />
            </label>
            <Turnstile onToken={setToken} resetKey={reset} />
            <button className="primary" disabled={!token || busy}>
              Invia ai moderatori
            </button>
          </form>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </div>
  );
}
