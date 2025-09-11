export const formatPercentage = (
  value: number,
  fractionDigits = 2,
  dropLeadingZero = true,
): string => {
  const formatted = value.toFixed(fractionDigits);
  return dropLeadingZero && Math.abs(value) < 1 && value !== 0
    ? formatted.replace(/^(-?)0/, "$1")
    : formatted;
};

export default formatPercentage;
