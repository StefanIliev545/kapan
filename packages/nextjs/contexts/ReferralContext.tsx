"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount as useWagmiAccount } from "wagmi";
import { useReferralCode, useReferralStats, useRegisterReferral, useCreateReferralCode } from "~~/hooks/useReferral";
import { isValidReferralCode, formatReferralCode, normalizeAddress } from "~~/utils/referral";

const REFERRAL_CODE_STORAGE_KEY = "kapan_referral_code";

interface ReferralContextValue {
  /** The current user's referral code (if they have one) */
  myReferralCode: string | null;
  /** Whether the user's referral code is loading */
  isLoadingMyCode: boolean;
  /** The full referral link to share */
  referralLink: string | null;
  /** Total number of users this wallet has referred */
  totalReferrals: number;
  /** Address of who referred this user (if any) */
  referredBy: string | null;
  /** The pending referral code from URL/localStorage (before registration) */
  pendingReferralCode: string | null;
  /** Whether a referral registration is in progress */
  isRegistering: boolean;
  /** Generate a referral code for the current user */
  generateMyCode: () => void;
  /** Whether code generation is in progress */
  isGeneratingCode: boolean;
  /** Clear the pending referral code */
  clearPendingCode: () => void;
}

const ReferralContext = createContext<ReferralContextValue | null>(null);

export function ReferralProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const { address: evmAddress, isConnected: isEvmConnected } = useWagmiAccount();

  // Use EVM address for now (can extend to support Starknet later)
  const walletAddress = evmAddress;
  const isConnected = isEvmConnected;

  // State for pending referral code (from URL or localStorage)
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(null);
  const [hasAttemptedRegistration, setHasAttemptedRegistration] = useState(false);

  // Hooks for referral data
  const { code: myReferralCode, isLoading: isLoadingMyCode, refetch: refetchCode } = useReferralCode(walletAddress);
  const { totalReferrals, referredBy, refetch: refetchStats } = useReferralStats(walletAddress);
  const { register, isLoading: isRegistering } = useRegisterReferral();
  const { createCode, isLoading: isGeneratingCode } = useCreateReferralCode();

  // Read referral code from URL on mount
  useEffect(() => {
    const refParam = searchParams?.get("ref");
    if (refParam && isValidReferralCode(refParam)) {
      const formattedCode = formatReferralCode(refParam);
      setPendingReferralCode(formattedCode);
      // Store in localStorage for persistence
      try {
        localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, formattedCode);
      } catch {
        // localStorage might not be available
      }
    }
  }, [searchParams]);

  // Load pending code from localStorage on mount (if not already set from URL)
  useEffect(() => {
    if (!pendingReferralCode) {
      try {
        const storedCode = localStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
        if (storedCode && isValidReferralCode(storedCode)) {
          setPendingReferralCode(formatReferralCode(storedCode));
        }
      } catch {
        // localStorage might not be available
      }
    }
  }, [pendingReferralCode]);

  // Auto-register when wallet connects (if we have a pending code and not already referred)
  useEffect(() => {
    if (
      isConnected &&
      walletAddress &&
      pendingReferralCode &&
      !referredBy &&
      !isRegistering &&
      !hasAttemptedRegistration
    ) {
      // Don't try to register with own code
      const normalizedWallet = normalizeAddress(walletAddress);

      setHasAttemptedRegistration(true);

      register(
        { refereeWallet: normalizedWallet, referralCode: pendingReferralCode },
        {
          onSuccess: (result) => {
            if (result.registered) {
              // Clear the pending code from localStorage
              try {
                localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
              } catch {
                // ignore
              }
              setPendingReferralCode(null);
              // Refresh stats to show the new referrer
              refetchStats();
            } else if (result.reason?.includes("Already registered")) {
              // Already has a referrer, clear pending code
              try {
                localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
              } catch {
                // ignore
              }
              setPendingReferralCode(null);
            }
          },
          onError: () => {
            // Registration failed, but don't clear - might want to retry
          },
        }
      );
    }
  }, [
    isConnected,
    walletAddress,
    pendingReferralCode,
    referredBy,
    isRegistering,
    hasAttemptedRegistration,
    register,
    refetchStats,
  ]);

  // Reset registration attempt flag when wallet changes
  useEffect(() => {
    setHasAttemptedRegistration(false);
  }, [walletAddress]);

  // Generate referral link
  const referralLink = useMemo(() => {
    if (!myReferralCode) return null;
    if (typeof window === "undefined") return null;
    const baseUrl = window.location.origin;
    return `${baseUrl}?ref=${myReferralCode}`;
  }, [myReferralCode]);

  // Generate my code
  const generateMyCode = useCallback(() => {
    if (!walletAddress || isGeneratingCode) return;
    createCode(walletAddress, {
      onSuccess: () => {
        refetchCode();
        refetchStats();
      },
    });
  }, [walletAddress, isGeneratingCode, createCode, refetchCode, refetchStats]);

  // Clear pending code
  const clearPendingCode = useCallback(() => {
    setPendingReferralCode(null);
    try {
      localStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ReferralContextValue>(
    () => ({
      myReferralCode,
      isLoadingMyCode,
      referralLink,
      totalReferrals,
      referredBy,
      pendingReferralCode,
      isRegistering,
      generateMyCode,
      isGeneratingCode,
      clearPendingCode,
    }),
    [
      myReferralCode,
      isLoadingMyCode,
      referralLink,
      totalReferrals,
      referredBy,
      pendingReferralCode,
      isRegistering,
      generateMyCode,
      isGeneratingCode,
      clearPendingCode,
    ]
  );

  return <ReferralContext.Provider value={value}>{children}</ReferralContext.Provider>;
}

export function useReferral(): ReferralContextValue {
  const context = useContext(ReferralContext);
  if (!context) {
    throw new Error("useReferral must be used within a ReferralProvider");
  }
  return context;
}
