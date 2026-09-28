// SPDX-License-Identifier: GPL-2.0-or-later
// Port of Morpho TickLib, copyright (c) 2026 Morpho Association.
// https://github.com/morpho-org/midnight/blob/fade1a4c3fedfcc44cd61f663b45018405561b4c/src/libraries/TickLib.sol
const WAD = 10n ** 18n;
function wExp(x: bigint): bigint {
  if (x < 0n) return (WAD * WAD) / wExp(-x);
  const q = (x + 322611214989459870n) / 693147180559945309n;
  const r = x - q * 693147180559945309n;
  const second = (r * r) / (2n * WAD),
    third = (second * r) / (3n * WAD);
  return (WAD + r + second + third) << q;
}
const halfDown = (x: bigint, d: bigint) => (x + (d - 1n) / 2n) / d;
export function tickToPrice(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < 0 || tick > 6744) throw new Error("Invalid Midnight price tick");
  return halfDown(halfDown(WAD * WAD, WAD + wExp(4987541511039073n * (3372n - BigInt(tick)))), 10n ** 11n) * 10n ** 11n;
}
