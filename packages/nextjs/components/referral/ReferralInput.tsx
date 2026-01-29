"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { useValidateReferralCode, useRegisterReferral } from "~~/hooks/useReferral";
import { isValidReferralCode, formatReferralCode } from "~~/utils/referral";
import { LoadingSpinner } from "~~/components/common/Loading";

interface ReferralInputProps {
  walletAddress: string;
  onSuccess?: () => void;
  className?: string;
}

export function ReferralInput({ walletAddress, onSuccess, className }: ReferralInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedCode, setDebouncedCode] = useState("");

  // Debounce the input for validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue && isValidReferralCode(inputValue)) {
        setDebouncedCode(formatReferralCode(inputValue));
      } else {
        setDebouncedCode("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const {
    isValid,
    reason,
    isLoading: isValidating,
  } = useValidateReferralCode(debouncedCode, { enabled: !!debouncedCode });

  const {
    register,
    isLoading: isRegistering,
    error: registerError,
    data: registerResult,
  } = useRegisterReferral();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || !debouncedCode) return;

    register(
      { refereeWallet: walletAddress, referralCode: debouncedCode },
      {
        onSuccess: (result) => {
          if (result.registered) {
            onSuccess?.();
          }
        },
      }
    );
  };

  const formatInputValue = (value: string) => {
    // Remove any non-alphanumeric characters except hyphens
    let cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");

    // Auto-format as KAP-XXXX-XXXX
    if (cleaned.startsWith("KAP")) {
      const parts = cleaned.split("-");
      if (parts.length === 1 && cleaned.length > 3) {
        // Add first hyphen after KAP
        cleaned = "KAP-" + cleaned.slice(3);
      }
      if (parts.length === 2 && parts[1].length > 4) {
        // Add second hyphen after first segment
        cleaned = parts[0] + "-" + parts[1].slice(0, 4) + "-" + parts[1].slice(4);
      }
    }

    // Limit to max length
    return cleaned.slice(0, 14);
  };

  const showValidation = inputValue.length > 0 && debouncedCode;
  const showInvalidFormat = inputValue.length > 3 && !isValidReferralCode(inputValue);

  if (registerResult?.registered) {
    return (
      <div className={clsx("alert alert-success", className)}>
        <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Successfully registered with referral code!</span>
      </div>
    );
  }

  if (registerResult && !registerResult.registered) {
    return (
      <div className={clsx("alert alert-warning", className)}>
        <svg xmlns="http://www.w3.org/2000/svg" className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>{registerResult.reason || "Could not register referral"}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={clsx("flex flex-col gap-3", className)}>
      <div className="form-control">
        <label className="label">
          <span className="label-text">Enter a referral code</span>
        </label>
        <input
          type="text"
          placeholder="KAP-XXXX-XXXX"
          className={clsx(
            "input input-bordered w-full font-mono tracking-wider",
            showValidation && isValid && "input-success",
            showValidation && !isValid && !isValidating && "input-error",
            showInvalidFormat && "input-warning"
          )}
          value={inputValue}
          onChange={(e) => setInputValue(formatInputValue(e.target.value))}
          disabled={isRegistering}
        />
        <label className="label">
          {isValidating && (
            <span className="label-text-alt flex items-center gap-1">
              <LoadingSpinner size="xs" />
              Validating...
            </span>
          )}
          {showValidation && !isValidating && isValid && (
            <span className="label-text-alt text-success">Valid code</span>
          )}
          {showValidation && !isValidating && !isValid && (
            <span className="label-text-alt text-error">{reason || "Invalid code"}</span>
          )}
          {showInvalidFormat && !showValidation && (
            <span className="label-text-alt text-warning">Format: KAP-XXXX-XXXX</span>
          )}
        </label>
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!isValid || isRegistering || isValidating}
      >
        {isRegistering ? (
          <>
            <LoadingSpinner size="sm" />
            Registering...
          </>
        ) : (
          "Submit Referral Code"
        )}
      </button>

      {registerError && (
        <p className="text-error text-sm">{registerError}</p>
      )}
    </form>
  );
}
