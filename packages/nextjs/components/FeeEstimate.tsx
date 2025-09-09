type Props = {
  loading: boolean;
  error: string | null;
  feeNative: number | null;
  label?: string;
  unit?: "ETH" | "STRK";
};

export function FeeEstimate({
  loading,
  error,
  feeNative,
  label = "Estimated Network Fee",
  unit = "ETH",
}: Props) {
  return (
    <div className="mt-3 text-sm text-gray-500">
      {loading ? (
        <span>Estimating fee…</span>
      ) : error ? (
        <span className="text-amber-600">{label}: unavailable</span>
      ) : feeNative != null ? (
        <span>
          {label}: {feeNative.toFixed(4)} {unit}
        </span>
      ) : null}
    </div>
  );
}
