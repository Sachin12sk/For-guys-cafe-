# FOUR GUYS CAFE — Firestore Security Specification

## 1. Data Invariants
1. **Identity & Ownership**: A document at `/customers/{userId}` can ONLY be read, created, updated, or deleted by the authenticated user whose `request.auth.uid == userId` (or a verified admin).
2. **SMS Phone Integrity**: A customer profile's `phoneNumber` MUST strictly equal `request.auth.token.phone_number` (the SMS-verified E.164 phone number from Firebase Phone Authentication). Users cannot claim or spoof another customer's mobile number.
3. **Immutable Audit Fields**: `uid`, `phoneNumber`, and `createdAt` cannot be altered after creation. `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. **Master Gate for Subcollections & Cloud Orders**: Both `/customers/{userId}/orders/{orderId}` and `/orders/{orderId}` MUST verify parent `/customers/{uid}` exists (`exists(...)`) and has matching `uid == request.auth.uid`. Customers cannot tamper with past order totals (`allow update` denied to customers; `/orders/{orderId}` allows only verified admins to toggle `isFlagged`/`flagReason`).
5. **PII & Order Isolation**: No unauthenticated or cross-user reads or list queries are ever allowed on `/customers`, `/customers/{userId}/orders`, or `/orders`. Verified Cafe Admin reads `/orders` using a dedicated admin Firebase Auth session (`adminAuth`), completely separate from customer Phone OTP sessions (`auth`).
6. **Admin Isolation**: `/admins/{adminId}` is strictly read-only (`allow write: if false`) from client SDKs so no user can self-assign admin privileges.
7. **Location Consent & Address Validation**: `ward`, `area`, `wardArea`, and `deliveryAddress` are bounded string fields; `geoLocationUrl` accepts ONLY empty string `''` (no GPS shared) or an explicit `https://maps.google.com/?q=lat,lng` link captured strictly after explicit user click/consent.
8. **Live Catalog Admin-Only Write & Credential Exclusion**: `/store/catalog` is publicly readable for live menu/prices/cafe open-closed status across Website & Android App, writable ONLY by verified Admin (`isAdmin()`), and explicitly rejects `adminId`, `adminMobile`, or `adminPin`.
9. **Live Order Status, Payment Verification & Idempotent Deduplication**: Customers may only read their own `/orders/{orderId}` for live status updates and cannot modify `orderStatus` or self-mark `paymentStatus: 'paid'`; ONLY verified Admin may transition `orderStatus` (`pending | confirmed | preparing | ready | delivered | completed | cancelled`) and `paymentStatus` (`unpaid | pending_verification | paid`) with `statusUpdatedAt == request.time` / `paymentVerifiedAt == request.time`. Deterministic document IDs block duplicate retries.
10. **Reviews, Vibe Snaps & Referral Isolation**: Public reviews (`/reviews`) and Vibe Wall snaps (`/vibeSnaps`) require authenticated creation, strict schema/image-URL bounds, are immutable (`allow update: if false`), and can only be deleted by Admin. Referral entries (`/referrals`) are strictly private to the owning customer or Admin.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Customer Read**: Anonymous/unauthenticated `get /customers/uid_123`.
2. **Cross-User PII Snooping**: Authenticated user `uid_attacker` calling `get /customers/uid_victim` or `get /orders/ORD-VICTIM`.
3. **Blanket Customer/Order List Scraping**: Authenticated user `uid_attacker` calling `list /customers` or `list /orders` without matching `uid == request.auth.uid`.
4. **Phone Spoofing on Create**: Authenticated user `uid_1` (`phone_number: +919999999991`) attempting `create /customers/uid_1` or `create /orders/ORD-1` with another phone number.
5. **UID Spoofing on Create**: Authenticated user `uid_1` attempting `create /customers/uid_1` or `create /orders/ORD-1` with `uid`/`customerUid: "uid_victim"`.
6. **Shadow / Ghost Field Injection**: Authenticated user `uid_1` sending `{ ..., isAdmin: true, verified: true }` in `create` or `update /customers/uid_1` or `/orders/ORD-1`.
7. **Timestamp Forgery**: Authenticated user `uid_1` sending a backdated `createdAt` or `updatedAt` instead of `request.time`.
8. **Immutable Field Tampering**: Authenticated user `uid_1` attempting `update /customers/uid_1` to change `phoneNumber`, `uid`, or `createdAt`.
9. **Resource Exhaustion / Size Poisoning**: Authenticated user `uid_1` sending a 5KB string in `customerName` or `itemsSummary`, or a 1KB junk document ID.
10. **Orphaned / Negative Order Creation**: Authenticated user `uid_1` attempting `create /orders/ORD-1` before `/customers/uid_1` exists, or with `totalAmount: -500`.
11. **Order Tampering**: Authenticated user `uid_1` attempting `update /customers/uid_1/orders/ord_1` or `update /orders/ORD-1` to alter `totalAmount`, `itemsSummary`, or `orderStatus`.
12. **Privilege Escalation**: Authenticated user `uid_attacker` attempting `create /admins/uid_attacker` or using an unverified email token claiming admin email.
