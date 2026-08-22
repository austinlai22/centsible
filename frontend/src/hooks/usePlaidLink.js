import { useState, useRef, useCallback, useEffect } from "react";
import { plaidApi } from "../api.js";

const PLAID_SDK_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

/**
 * Loads the Plaid Link SDK on demand and opens the Link flow.
 *
 * The SDK (~250KB) is injected only when the user actually clicks "Link a
 * bank account", so it never costs anything on first paint for the majority
 * of sessions that never link an account.
 */
export function usePlaidLink(onSuccess) {
  const [ready,   setReady]   = useState(false);
  const [linking, setLinking] = useState(false);
  const [error,   setError]   = useState("");
  const handlerRef = useRef(null);

  // Plaid's handler holds an iframe; leaving it attached after the component
  // unmounts leaks a DOM node and an event listener per open/close cycle.
  useEffect(() => () => {
    try { handlerRef.current?.destroy?.(); } catch { /* already gone */ }
  }, []);

  const open = useCallback(async () => {
    if (linking) return;
    setLinking(true);
    setError("");
    try {
      const { link_token } = await plaidApi.createLinkToken();

      if (!window.Plaid) {
        await new Promise((resolve, reject) => {
          const script   = document.createElement("script");
          script.src     = PLAID_SDK_SRC;
          script.onload  = resolve;
          script.onerror = () => reject(new Error("Failed to load Plaid SDK"));
          document.head.appendChild(script);
        });
      }

      handlerRef.current = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            await plaidApi.exchangeToken(
              public_token,
              metadata.institution?.institution_id,
              metadata.institution?.name
            );
            setLinking(false);
            onSuccess(metadata.institution?.name);
          } catch (e) {
            // Surfaced rather than console-logged: otherwise the Plaid modal
            // just closes and the user assumes the bank linked successfully.
            setLinking(false);
            setError(e.message || "Couldn't finish linking your account. Please try again.");
          }
        },
        onExit: (err) => {
          setLinking(false);
          // err is null on a normal user-initiated close.
          if (err) setError(err.error_message || "Bank connection was cancelled or failed.");
        },
      });
      handlerRef.current.open();
      setReady(true);
    } catch (e) {
      setLinking(false);
      setError(e.message || "Couldn't start the bank connection flow. Please try again.");
    }
  }, [linking, onSuccess]);

  return { open, ready, linking, error };
}
