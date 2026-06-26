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

### Requirement: Attachment deletion policy

Attachment deletion SHALL remove or invalidate both database state and Drive file state according to the approved policy.

#### Scenario: Attachment delete requested before policy resolution

- GIVEN Drive deletion behavior is not approved
- WHEN implementation reaches attachment deletion
- THEN implementation SHALL stop and ask for clarification.

### Requirement: Upload limits require a defined policy

The backend SHALL enforce allowed MIME types and file size limits once the product limits are approved.

#### Scenario: Limits unresolved

- GIVEN upload limits are not approved
- WHEN implementation reaches upload validation
- THEN implementation SHALL stop and ask for clarification rather than accepting arbitrary files.
