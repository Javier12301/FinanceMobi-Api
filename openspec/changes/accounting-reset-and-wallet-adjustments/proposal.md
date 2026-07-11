## Why

Users need to restart their financial tracking without deleting their account or activity streak, and they need to reconcile a wallet with its real balance without inventing missing income or expenses.

## What Changes

- Add an owner-only, online accounting reset that clears operational accounting data while preserving account configuration and streaks.
- Allow the reset to retain zeroed wallets or remove all wallets, then guide the user through a fresh balance setup.
- Add an auditable wallet balance adjustment record that changes the wallet balance without affecting income, expense, budget, or insight totals.
- Clear owner-scoped offline pending work and cached financial data after a successful reset so deleted data cannot reappear locally.

## Capabilities

### New Capabilities
- `accounting-reset`: Owner-controlled deletion of operational accounting data with wallet retention choices.
- `wallet-balance-adjustments`: Auditable reconciliation of a wallet to a real target balance.

### Modified Capabilities
- `wallets-categories`: Wallet APIs gain the balance-adjustment action.
- `transactions-ledger`: The ledger represents adjustment records separately from income, expense, and transfers.

## Impact

Backend wallet, transaction, debt, recurring, budget, attachment, and Drive cleanup flows; Prisma schema and migration; frontend Settings, wallet menus, onboarding, React Query persistence, and native SQLite outbox behavior.
