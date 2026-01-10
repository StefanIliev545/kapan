# Modal Styling Guide

Reference component: `TokenActionModal.tsx` (Deposit/Withdraw/Borrow/Repay modals)

## Target Layout Structure

```
+------------------+---------------------------+
|     BEFORE       |        ACTION FORM        |
|                  |                           |
| Health Factor    |  [Icon] Action TokenName  |
| [====----] 1.90  |              PROTOCOL     |
|                  |                           |
| Loan To Value    |  APY Label X.XX%  Balance |
| [====----] 75%   |                           |
|                  |  [       Input       ]    |
| Total supplied   |  [25%] [50%] [100%]       |
| [icon] 5,000     |                           |
|                  |        ~ $0.00            |
|                  |                           |
|                  |  HF    |  LTV   | Balance |
|                  | 1.90   | 75.00% |  5,000  |
|                  |                           |
|                  | [x] Batch Transactions    |
|                  |                           |
|                  |      [ Action Button ]    |
+------------------+---------------------------+
```

## Components to Use

### Base Container
- `BaseModal` with dark theme
- Two-column layout for complex modals (BEFORE | FORM)
- Single column for simple modals

### BEFORE Panel (Left Side)
Component: `BeforePanel` in `TokenActionModal.tsx`

- **Health Factor**: Progress bar + value (green/yellow/red based on value)
- **Loan To Value**: Progress bar + percentage
- **Metric**: Icon + formatted value (Total supplied/Total debt)

### Action Form (Right Side)

#### Header
```tsx
<div className="flex items-center gap-3">
  <Image src={token.icon} width={40} height={40} />
  <h3 className="text-lg font-semibold">{action} {token.name}</h3>
</div>
<div className="text-base-content/40 text-xs uppercase">{protocolName}</div>
```

#### APY & Balance Row
```tsx
<div className="text-base-content/70 flex items-center justify-between text-xs">
  <span>{apyLabel} {formatPercentage(apy)}%</span>
  <span>Balance: {formattedBalance}</span>
</div>
```

#### Input Component
Use `PercentInput` component with:
- Percentage buttons: 25%, 50%, 100%
- USD value display below: `~ $X.XX`
- MAX button for full balance

#### After Metrics Grid
Use `AfterMetricsGrid` - shows projected values after action:
- Health Factor (color coded)
- Loan To Value
- Balance/Debt

#### Extra Content Area
- Batch transactions checkbox
- Any protocol-specific options

#### Action Button
- Full width, centered
- Disabled state when invalid
- Loading state during transaction

## Spacing & Colors

### Gaps
- Section gap: `gap-6`
- Element gap: `gap-3`
- Tight gap: `gap-2`

### Text Colors
- Primary: `text-base-content`
- Secondary: `text-base-content/70`
- Muted: `text-base-content/40`
- Labels: `text-base-content/50`

### Health Factor Colors
- Safe (>2): `text-success` (green)
- Warning (1.5-2): `text-warning` (yellow)
- Danger (<1.5): `text-error` (red)

## What Needs Fixing

### Swap Modals (CollateralSwapModal, DebtSwapEvmModal)
Current issues:
1. Missing BEFORE panel - add health factor/LTV preview
2. Different input styling - use PercentInput pattern
3. Missing after-metrics grid
4. Different button styling

### Refinance Modal
Current issues:
1. Missing BEFORE panel with current position stats
2. Collateral grid could use consistent item styling

## Implementation Priority

1. Add BEFORE panel to swap modals
2. Add AfterMetricsGrid showing position impact
3. Unify input component styling
4. Consistent button styling
