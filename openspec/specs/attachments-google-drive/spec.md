# attachments-google-drive Specification

## Purpose

Attach receipts to transactions using each user's own Google Drive storage while preserving privacy and traceability.

## Requirements

### Requirement: Bring-your-own Google Drive storage

The backend SHALL store transaction receipt files in the owner's linked Google Drive account.

#### Scenario: User uploads receipt

- GIVEN the owner has linked Google Drive
- WHEN an authorized user uploads a receipt for a transaction
- THEN the backend SHALL upload the file to the owner's Drive folder
- AND it SHALL store the returned Google file ID in the database.

### Requirement: Least-privileged Drive scope

The Google Drive integration SHALL request `drive.file` or an equivalently constrained scope.

#### Scenario: Drive authorization starts

- WHEN the user connects Google Drive
- THEN the requested scope SHALL avoid broad full-drive access unless explicitly approved later.

### Requirement: Root folder persistence

On first Drive linkage, the backend SHALL create or identify an application root folder and persist its `folderId`.

#### Scenario: User renames folder in Drive

- GIVEN the backend stored the Drive root `folderId`
- WHEN the user renames the folder in Google Drive
- THEN future uploads SHALL continue using the stored folder ID.

### Requirement: Encrypted refresh token storage

Google refresh tokens SHALL be encrypted with AES-256-GCM before being persisted.

#### Scenario: Token is stored

- WHEN the backend receives a Google refresh token
- THEN it SHALL encrypt the token before saving it to MySQL
- AND the plaintext token SHALL NOT be logged or persisted.

### Requirement: Drive file metadata

Uploaded Drive files SHALL include app properties containing traceability metadata such as transaction ID and category when the Google Drive API supports the operation for the uploaded file.

#### Scenario: Receipt uploaded

- WHEN the backend uploads a receipt
- THEN the created Drive file SHOULD contain app-level metadata that helps correlate it to the transaction.

### Requirement: Attachment listing

The backend SHALL list attachments for an authorized transaction.

#### Scenario: Advisor views attachments

- GIVEN an `ASESOR` has read access to an owner context
- WHEN the advisor lists transaction attachments
- THEN the backend SHALL return only attachments for transactions in that authorized context.

### Requirement: Approved receipt upload limits

The backend SHALL enforce approved upload limits for transaction receipt attachments.

#### Scenario: Valid upload request

- GIVEN an authorized owner or supervisor uploads up to 3 files for a transaction they can mutate
- AND each file is at most 5 MB
- AND each file MIME type is `image/jpeg`, `image/png`, `image/webp`, or `application/pdf`
- WHEN the client calls `POST /api/transactions/:transactionId/attachments` with multipart field `file`
- THEN the backend SHALL upload each file to the owner's Google Drive folder
- AND create one `TransactionAttachment` row per uploaded file
- AND return the created attachment records.

#### Scenario: Unsupported MIME type

- GIVEN a file has a MIME type outside the approved allowlist
- WHEN the client uploads it
- THEN the backend SHALL reject the request with HTTP 400.

#### Scenario: Too many files

- GIVEN the client uploads more than 3 files for one transaction
- WHEN the upload middleware processes the request
- THEN the backend SHALL reject the request.

#### Scenario: Oversized file

- GIVEN any uploaded file exceeds 5 MB
- WHEN the upload middleware processes the request
- THEN the backend SHALL reject the request.

### Requirement: Attachment Drive deletion

The backend SHALL delete the Google Drive file and database row when an authorized user deletes an attachment.

#### Scenario: Attachment delete succeeds

- GIVEN an attachment belongs to a transaction in the active owner context
- WHEN an authorized owner or supervisor calls `DELETE /api/transactions/:transactionId/attachments/:attachmentId`
- THEN the backend SHALL delete the file from Google Drive first
- AND delete the `TransactionAttachment` database row
- AND return HTTP 204.

#### Scenario: Drive delete fails

- GIVEN Google Drive deletion fails for the attachment file
- WHEN the delete endpoint is called
- THEN the backend SHALL leave the database row unchanged
- AND return an error.
