# FinanceVier Backend Bruno Collection

Open this folder as a Bruno collection:

`bruno/financevier-backend`

## Variables

- `baseUrl`: backend URL, default `http://localhost:3000`.
- `token`: runtime token set by `Login` or `Google Login` when the response has `{ "token": "..." }`.
- `ownerContextId`: planned active owner context for delegation checkpoints.
- `walletId`, `destinationWalletId`, `categoryId`, `transactionId`, `delegationId`, `attachmentId`: fill after creating or seeding data.

## Current Status

- Checkpoints 1-3: `Health`, `Login`, `Google Login`, and `Logout` are the relevant requests.
- Checkpoint 4 onward: delegation, owner context, wallets, transactions, and attachments will start becoming executable.
- Future endpoints are mapped now and may return 404 until implemented.
