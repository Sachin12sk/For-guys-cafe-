# Security Summary

## Audit Overview
- **Scope**: Complete security, privacy isolation, and functionality audit of the FOUR GUYS CAFE Customer Profile System, Zero-OTP Checkout, Firebase Firestore Security Rules, and Capacitor Android integration (`com.fourguyscafe.app`).
- **Reviewed Surfaces**: Customer profile storage and lookup (`src/utils/customerProfile.ts`, `src/services/cloudSync.ts`, `src/components/CustomerProfileModal.tsx`, `src/App.tsx`), order drawers (`src/components/HomeOrderDrawer.tsx`, `src/components/BasketDrawer.tsx`), Firebase authentication and database config (`src/firebase.ts`, `src/services/customerAuth.ts`, `src/components/AdminModal.tsx`), security rules and schema (`firestore.rules`, `firebase-blueprint.json`, `firestore.rules.test.ts`), and Android native bridge (`android/app/src/main/java/com/fourguyscafe/app/MainActivity.java`, `android/app/src/main/AndroidManifest.xml`).

## Issues Found & Resolved
| Issue | Severity | Fix Applied |
| :--- | :--- | :--- |
| Zero-OTP Firebase profile lookup previously hashed only 2 fields (Mobile + Name), which could allow someone who knows a customer's public name and phone number to look up their saved profile. | High | Upgraded `computeProfileLookupId` to domain-separated SHA-256 v2 hashing across **all 4 saved factors** (10-digit Mobile + Name + Ward + Area/Mohalla). Updated `lookupCloudCustomerProfileByIdentity`, `CustomerProfileModal.tsx`, and `App.tsx` to strictly reject mobile-only or partial restore attempts unless the user provides a valid `custprof_...` Sync Code or all 4 matching fields. |
| Android `NativePrefsBridge.setProfileId` stored raw strings from WebView into `SharedPreferences` without format or length validation. | Medium | Added strict pattern (`^custprof_[a-zA-Z0-9_-]{16,64}$`) and max-length (`<= 80`) validation on both `setProfileId` and `getProfileId` in `MainActivity.java`. |

## Safeguards Verified
| Area | Safeguard Confirmed |
| :--- | :--- |
| **Customer Profile Data Isolation** | `/customerProfiles` and `/customerProfileLookup` block blanket collection listing (`allow list: if isAdmin()`), expose zero raw PII inside `/customerProfileLookup`, freeze `profileId` on lookup updates, and require unguessable random capability IDs (`custprof_...` with 24 random characters). |
| **Order Isolation & Immutability** | `/orders/{orderId}` strictly restricts reads (`get` and `list`) to verified Admin or matching signed-in owner UID, forbids customer payment self-verification (`paymentStatus` cannot be created as `'paid'`), and forbids all non-admin updates/deletes so historical customer snapshots remain immutable even after profile updates. |
| **Zero-OTP Compliance** | Zero occurrences of `RecaptchaVerifier`, `signInWithPhoneNumber`, `sendRealSmsOtp`, `confirmSmsOtp`, `PhoneAuthModal.tsx`, or OTP UI prompts remain in web or Android source. |
| **Admin Google Login Safety** | Admin panel access remains protected by verified Google Sign-In (`ashuofficial2093@gmail.com` / Firebase Custom Claims / `/admins/{uid}` check) with zero `VITE_ADMIN_*` credentials in frontend bundles. |
| **Dependency Audit** | `npm audit --omit=dev` flagged only `@grpc/grpc-js` (a Node-only transitive dependency of `@firebase/firestore`, unused in browser/WebView runtime). Package versions were left unchanged because the suggested upgrade (`firebase@9.14.0`) would break the Firebase v12 client SDK. |

---

## PoC Verification

### 1. Mobile-Only & Partial-Identity Profile Restore Blocked
- **Previous Behavior**: `computeProfileLookupId(phone, customerName)` allowed resolving `/customerProfileLookup/cpl_<hash>` using only a 10-digit phone number and customer name.
- **Verification Test (`tests/app.verification.test.ts` — `Security PoC: Rejects Mobile-only / Name+Mobile-only Zero-OTP Restore`)**:
  - Calling `lookupCloudCustomerProfileByIdentity('9651008080', '', '', '')` returns `null`.
  - Calling `lookupCloudCustomerProfileByIdentity('9651008080', 'Rohan Verma', '', '')` returns `null`.
  - Calling `lookupCloudCustomerProfileByIdentity('9651008080', 'Rohan Verma', 'Ward 4', '')` returns `null`.
  - `computeProfileLookupId` produces distinct hashes whenever Ward (`Ward 4` vs `Ward 5`) or Area (`Master Market` vs `Station Road`) differs, while accepting only all 4 matching normalized factors (`fgc-profile-lookup-v2:${digits}:${normName}:${normWard}:${normArea}`) or a valid `custprof_...` capability Sync Code in `CustomerProfileModal.tsx`.

### 2. Android SharedPreferences Capability Bridge Hardened
- **Verification**: Static and automated verification against `android/app/src/main/java/com/fourguyscafe/app/MainActivity.java` confirms both `setProfileId` and `getProfileId` enforce length `<= 80` and `^custprof_[a-zA-Z0-9_-]{16,64}$`, ignoring malformed strings while allowing valid profile recovery via `android:allowBackup="true"`.

### 3. Pending Live-Environment Checks
- Physical Android APK reinstall backup/restore behavior (`FourGuysNativePrefs` via Android Auto Backup), live Firestore Emulator execution of all 26 `firestore.rules.test.ts` cases against the cloud database engine, and interactive Admin Google OAuth popup verification require a live Android device / emulator / Firebase project session and remain marked **Pending**.
