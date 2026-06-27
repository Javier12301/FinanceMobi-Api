# attachments-google-drive Specification

## ADDED Requirements

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
