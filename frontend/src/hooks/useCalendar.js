import { useApi } from "./useApi.js";
import { termsApi, disbursementsApi } from "../api.js";

/**
 * The student's own academic calendar and expected aid payments.
 *
 * Both drive the runway, which is the number this app exists to produce, so
 * both fail SOFT: an empty list means "fall back to the built-in calendar" or
 * "no upcoming payment known", never a broken screen.
 */
export function useTerms(enabled = true) {
  const { data, loading, error, reload } = useApi(
    async () => (await termsApi.list()).terms || [],
    [], [], enabled
  );
  return { terms: data, loading, error, reload };
}

export function useDisbursements(enabled = true) {
  const { data, loading, error, reload } = useApi(
    async () => (await disbursementsApi.list()).disbursements || [],
    [], [], enabled
  );
  return { disbursements: data, loading, error, reload };
}
