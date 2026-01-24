import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { referralKeys } from "~~/utils/referral";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ReferralCodeResponse {
  code: string | null;
  createdAt?: string;
  created?: boolean;
  error?: string;
}

interface ValidateCodeResponse {
  valid: boolean;
  reason?: string;
  referrerAddress?: string;
  error?: string;
}

interface RegisterReferralResponse {
  registered: boolean;
  reason?: string;
  existingCode?: string;
  referrerAddress?: string;
  createdAt?: string;
  error?: string;
}

interface ReferralInfo {
  refereeAddress: string;
  createdAt: string;
}

interface ReferralStatsResponse {
  code: string | null;
  totalReferrals: number;
  referredBy: string | null;
  recentReferrals: ReferralInfo[];
  error?: string;
}

// -----------------------------------------------------------------------------
// API Functions
// -----------------------------------------------------------------------------

async function fetchReferralCode(wallet: string): Promise<ReferralCodeResponse> {
  const params = new URLSearchParams({ wallet });
  const res = await fetch(`/api/referral/code?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function createReferralCode(wallet: string): Promise<ReferralCodeResponse> {
  const res = await fetch("/api/referral/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function validateReferralCode(code: string): Promise<ValidateCodeResponse> {
  const params = new URLSearchParams({ code });
  const res = await fetch(`/api/referral/validate?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function registerReferral(refereeWallet: string, referralCode: string): Promise<RegisterReferralResponse> {
  const res = await fetch("/api/referral/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refereeWallet, referralCode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchReferralStats(wallet: string): Promise<ReferralStatsResponse> {
  const params = new URLSearchParams({ wallet });
  const res = await fetch(`/api/referral/stats?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Hooks
// -----------------------------------------------------------------------------

/**
 * Hook to fetch the current user's referral code.
 *
 * @param wallet - User's wallet address
 * @param options - Query options
 */
export function useReferralCode(wallet: string | undefined, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && !!wallet;

  const query = useQuery({
    queryKey: referralKeys.code(wallet ?? ""),
    queryFn: () => fetchReferralCode(wallet as string),
    enabled,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });

  return {
    code: query.data?.code ?? null,
    createdAt: query.data?.createdAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook to create a referral code for the current user.
 * Returns a mutation function that can be called to create the code.
 */
export function useCreateReferralCode() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (wallet: string) => createReferralCode(wallet),
    onSuccess: (data, wallet) => {
      // Update the cache with the new code
      queryClient.setQueryData(referralKeys.code(wallet), data);
      // Also invalidate stats since code changed
      queryClient.invalidateQueries({ queryKey: referralKeys.stats(wallet) });
    },
  });

  return {
    createCode: mutation.mutate,
    createCodeAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error?.message ?? null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Hook to validate a referral code.
 *
 * @param code - Referral code to validate
 * @param options - Query options
 */
export function useValidateReferralCode(code: string | undefined, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && !!code && code.length > 0;

  const query = useQuery({
    queryKey: referralKeys.validate(code ?? ""),
    queryFn: () => validateReferralCode(code as string),
    enabled,
    staleTime: 30_000, // 30 seconds
    gcTime: 60_000, // 1 minute
  });

  return {
    isValid: query.data?.valid ?? false,
    referrerAddress: query.data?.referrerAddress ?? null,
    reason: query.data?.reason ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook to register with a referral code.
 * Returns a mutation function that can be called to register.
 */
export function useRegisterReferral() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ refereeWallet, referralCode }: { refereeWallet: string; referralCode: string }) =>
      registerReferral(refereeWallet, referralCode),
    onSuccess: (_, { refereeWallet }) => {
      // Invalidate stats to reflect the new referral
      queryClient.invalidateQueries({ queryKey: referralKeys.stats(refereeWallet) });
    },
  });

  return {
    register: mutation.mutate,
    registerAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error?.message ?? null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Hook to fetch referral statistics for a wallet.
 *
 * @param wallet - User's wallet address
 * @param options - Query options
 */
export function useReferralStats(wallet: string | undefined, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && !!wallet;

  const query = useQuery({
    queryKey: referralKeys.stats(wallet ?? ""),
    queryFn: () => fetchReferralStats(wallet as string),
    enabled,
    staleTime: 30_000, // 30 seconds
    gcTime: 2 * 60_000, // 2 minutes
  });

  return {
    code: query.data?.code ?? null,
    totalReferrals: query.data?.totalReferrals ?? 0,
    referredBy: query.data?.referredBy ?? null,
    recentReferrals: query.data?.recentReferrals ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
