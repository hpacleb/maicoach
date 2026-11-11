import { useEffect, useRef, useState } from "react";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import type { ProviderConfig } from "../shared/types";
import { providerSchema } from "../shared/validation";
import "./provider.css";

const PREFS_KEY = "maicoach.provider-preferences.v1";
const defaultPrefs = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  outputMode: "chat" as const,
};
export function readProviderPreferences(): Omit<ProviderConfig, "apiKey"> {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    const parsed = providerSchema.safeParse({
      ...stored,
      apiKey: "preferences-validation",
    });
    if (parsed.success)
      return {
        baseUrl: parsed.data.baseUrl,
        model: parsed.data.model,
        outputMode: parsed.data.outputMode,
      };
  } catch {
    /* Preferences are optional; keys are never read from storage. */
  }
  return defaultPrefs;
}
export default function ProviderSettings({
  provider,
  onApply,
  onClose,
}: {
  provider: ProviderConfig | null;
  onApply: (provider: ProviderConfig | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ProviderConfig>(
    () => provider ?? { ...readProviderPreferences(), apiKey: "" },
  );
  const [error, setError] = useState("");
  const secure = window.isSecureContext;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const parsed = providerSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        "Enter a key, model name, and public HTTPS API base URL. Put credentials only in the API key field.",
      );
      return;
    }
    if (!secure) {
      setError("Open MaiCoach over HTTPS before adding a provider key.");
      return;
    }
    // Persist only these explicit non-secret fields. Never spread the complete provider config here.
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          baseUrl: parsed.data.baseUrl,
          model: parsed.data.model,
          outputMode: parsed.data.outputMode,
        }),
      );
    } catch {
      /* In-memory configuration still works if storage is disabled. */
    }
    onApply(parsed.data);
  }
  return (
    <dialog
      ref={dialog}
      className="score-modal provider-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <form onSubmit={apply} autoComplete="off">
        <button
          type="button"
          className="modal-close icon-button"
          aria-label="Close AI settings"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="eyebrow muted">
          <KeyRound size={13} />
          YOUR KEY. YOUR PROVIDER.
        </div>
        <h2>Bring your own AI.</h2>
        <p className="provider-intro">
          Connect OpenAI or another provider that supports Chat Completions. The
          planner stays free to use without a key.
        </p>
        <label className="field-label" htmlFor="provider-preset">
          Provider
        </label>
        <select
          id="provider-preset"
          value={draft.baseUrl === defaultPrefs.baseUrl ? "openai" : "custom"}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              baseUrl: e.target.value === "openai" ? defaultPrefs.baseUrl : "",
              model: e.target.value === "openai" ? defaultPrefs.model : "",
              apiKey: "",
              outputMode: "chat",
            }))
          }
        >
          <option value="openai">OpenAI</option>
          <option value="custom">Custom OpenAI-compatible endpoint</option>
        </select>
        <label className="field-label" htmlFor="provider-url">
          API base URL
        </label>
        <input
          id="provider-url"
          type="url"
          placeholder="https://your-provider.com/v1"
          value={draft.baseUrl}
          onChange={(e) =>
            setDraft((d) => ({ ...d, baseUrl: e.target.value, apiKey: "" }))
          }
          required
          maxLength={500}
          spellCheck={false}
        />
        <p className="provider-field-help">
          Use a public HTTPS endpoint, usually ending in /v1. Local and private
          network endpoints are unavailable.
        </p>
        <label className="field-label" htmlFor="provider-model">
          Model name
        </label>
        <input
          id="provider-model"
          value={draft.model}
          onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
          placeholder="Your provider’s model ID"
          required
          maxLength={150}
          spellCheck={false}
        />
        <label className="field-label" htmlFor="provider-key">
          API key <span>THIS TAB ONLY</span>
        </label>
        <input
          id="provider-key"
          name="maicoach-provider-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft.apiKey}
          onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
          placeholder="Paste your provider API key"
          required
          maxLength={4096}
        />
        <label className="field-label" htmlFor="provider-mode">
          Output mode
        </label>
        <select
          id="provider-mode"
          value={draft.outputMode}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              outputMode: e.target.value as ProviderConfig["outputMode"],
            }))
          }
        >
          <option value="chat">Standard chat · widest compatibility</option>
          <option value="jsonSchema">
            Strict JSON schema · supported models only
          </option>
        </select>
        <p className="provider-field-help">
          Standard mode asks for JSON and validates the answer. Try it if your
          provider does not support strict structured output.
        </p>
        <div className="provider-privacy">
          <ShieldCheck size={17} />
          <p>
            Your key is held in memory until you reload, close this tab, or
            forget it. On each coaching request, MaiCoach relays it securely to
            the endpoint you choose. Keys and coaching requests aren’t saved or
            logged by the app. Your provider’s usage charges apply.
          </p>
        </div>
        {!secure && (
          <p role="alert" className="inline-warning">
            Open this page over HTTPS to use a provider key.
          </p>
        )}
        {error && (
          <p role="alert" className="inline-warning">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={!secure}>
          <KeyRound size={16} />
          Use for this tab
        </button>
        {provider && (
          <button
            type="button"
            className="button subtle full forget-key"
            onClick={() => {
              setDraft((d) => ({ ...d, apiKey: "" }));
              onApply(null);
            }}
          >
            Forget key
          </button>
        )}
      </form>
    </dialog>
  );
}
