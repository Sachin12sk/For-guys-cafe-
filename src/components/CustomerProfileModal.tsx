import { useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { CustomerProfile } from '../types';
import {
  isValidCustomerProfileId,
  validateCustomerProfileInput,
  type CustomerProfileInput,
} from '../utils/customerProfile';

const QUICK_WARDS = [
  'Ward 1',
  'Ward 2',
  'Ward 3',
  'Ward 4',
  'Ward 5',
  'Ward 6',
  'Ward 7',
  'Ward 8',
];

const QUICK_AREAS = [
  'Master Market',
  'Kakawan Road',
  'Bilhaur Bazar',
  'Station Road',
  'GT Road',
];

export interface CustomerProfileModalProps {
  isOpen: boolean;
  mode: 'mandatory-first-launch' | 'edit';
  initialProfile: CustomerProfile | null;
  onSaveProfile: (input: CustomerProfileInput) => Promise<{
    ok: boolean;
    error?: string;
    restored?: boolean;
  }>;
  onRestoreFromFirebase: (params: {
    phone?: string;
    customerName?: string;
    ward?: string;
    area?: string;
    profileId?: string;
  }) => Promise<{ ok: boolean; profile?: CustomerProfile; error?: string }>;
  onClose?: () => void;
}

export function CustomerProfileModal({
  isOpen,
  mode,
  initialProfile,
  onSaveProfile,
  onRestoreFromFirebase,
  onClose,
}: CustomerProfileModalProps) {
  const isMandatory = mode === 'mandatory-first-launch';

  const [customerName, setCustomerName] = useState(
    initialProfile?.customerName || ''
  );
  const [phone, setPhone] = useState(initialProfile?.phone || '');
  const [ward, setWard] = useState(initialProfile?.ward || '');
  const [area, setArea] = useState(initialProfile?.area || '');
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialProfile?.deliveryAddress || ''
  );
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Reinstall / Returning Customer Firebase Restore panel
  const [showRestorePanel, setShowRestorePanel] = useState(false);
  const [restoreName, setRestoreName] = useState('');
  const [restorePhone, setRestorePhone] = useState('');
  const [restoreWard, setRestoreWard] = useState('');
  const [restoreArea, setRestoreArea] = useState('');
  const [restoreCode, setRestoreCode] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerName(initialProfile?.customerName || '');
    setPhone(initialProfile?.phone || '');
    setWard(initialProfile?.ward || '');
    setArea(initialProfile?.area || '');
    setDeliveryAddress(initialProfile?.deliveryAddress || '');
    setShowValidation(false);
    setSubmitError('');
    setRestoreWard('');
    setRestoreArea('');
    setRestoreMessage(null);
  }, [isOpen, initialProfile, mode]);

  if (!isOpen) return null;

  const validation = validateCustomerProfileInput({
    customerName,
    phone,
    ward,
    area,
    deliveryAddress,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowValidation(true);
    setSubmitError('');

    if (!validation.valid) {
      setSubmitError(
        validation.summaryError || 'Please complete all required profile fields.'
      );
      return;
    }

    setSaving(true);
    try {
      const result = await onSaveProfile({
        customerName,
        phone,
        ward,
        area,
        deliveryAddress,
      });
      if (!result.ok) {
        setSubmitError(result.error || 'Could not save customer profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreLookup = async () => {
    setRestoreMessage(null);
    const trimmedCode = restoreCode.trim();
    const trimmedPhone = restorePhone.trim();
    const trimmedName = restoreName.trim();
    const trimmedWard = restoreWard.trim();
    const trimmedArea = restoreArea.trim();

    if (trimmedCode) {
      if (!isValidCustomerProfileId(trimmedCode)) {
        setRestoreMessage({
          ok: false,
          text: 'Invalid Profile Sync Code format (expected custprof_...).',
        });
        return;
      }
    } else if (!trimmedPhone || !trimmedName || !trimmedWard || !trimmedArea) {
      setRestoreMessage({
        ok: false,
        text: 'For your privacy, enter all 4 saved details (Name, 10-Digit Mobile, Ward Number, and Area / Mohalla) or your Profile Sync Code.',
      });
      return;
    }

    setRestoring(true);
    try {
      const res = await onRestoreFromFirebase({
        profileId: trimmedCode || undefined,
        phone: trimmedPhone || undefined,
        customerName: trimmedName || undefined,
        ward: trimmedWard || undefined,
        area: trimmedArea || undefined,
      });
      if (res.ok && res.profile) {
        setCustomerName(res.profile.customerName);
        setPhone(res.profile.phone);
        setWard(res.profile.ward);
        setArea(res.profile.area);
        setDeliveryAddress(res.profile.deliveryAddress || '');
        setRestoreMessage({
          ok: true,
          text: `Welcome back, ${res.profile.customerName}! Saved profile restored from Firebase.`,
        });
      } else {
        setRestoreMessage({
          ok: false,
          text:
            res.error ||
            'No matching saved profile found. Please fill the quick form above once.',
        });
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleCopyProfileId = async () => {
    if (!initialProfile?.profileId) return;
    try {
      await navigator.clipboard.writeText(initialProfile.profileId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={
        isMandatory ? 'First-Time Customer Profile Setup' : 'Edit Customer Profile'
      }
      data-mandatory-setup={isMandatory ? 'true' : 'false'}
    >
      {/* Blocking Backdrop: Never closes on click when mandatory first launch */}
      <div
        className="fixed inset-0 bg-stone-950/75 backdrop-blur-md"
        onClick={isMandatory ? undefined : onClose}
      />

      <div className="relative z-10 w-full max-w-lg rounded-3xl bg-[#FAF9F6] border border-stone-200 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C83E2B]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>FOUR GUYS CAFE · Bilhaur</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
              {isMandatory
                ? 'Welcome! Complete Your Quick Profile'
                : 'Your Saved Customer Profile'}
            </h2>
            <p className="text-xs text-stone-600 leading-relaxed">
              {isMandatory
                ? 'Save your Name, Mobile, Ward, and Area once before browsing. These auto-fill every Home & Dine-In order (no OTP required).'
                : 'Updating your profile auto-fills future Home & Dine-In orders without modifying past order history.'}
            </p>
          </div>

          {!isMandatory && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Profile Editor"
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-900 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Edit mode: Show Sync Code for optional manual backup */}
          {!isMandatory && initialProfile?.profileId && (
            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                  <span>Synced Across Web &amp; Android App</span>
                </div>
                <div className="text-[11px] font-mono text-stone-600 truncate mt-0.5">
                  Sync Code: {initialProfile.profileId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyProfileId()}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-stone-700 hover:text-stone-900 text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
              >
                {copiedId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Mandatory / Edit Profile Form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            <div>
              <label
                htmlFor="profile-customer-name"
                className="block text-xs font-semibold text-stone-800 mb-1"
              >
                Customer Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="profile-customer-name"
                  type="text"
                  required
                  maxLength={80}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Aarav Tiwari"
                  className={`w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] ${
                    (showValidation || customerName.length > 0) &&
                    validation.errors.customerName
                      ? 'border-[#C83E2B]'
                      : 'border-stone-200'
                  }`}
                />
              </div>
              {(showValidation || customerName.trim().length > 0) &&
                validation.errors.customerName && (
                  <p className="text-[11px] font-medium text-[#C83E2B] mt-1">
                    {validation.errors.customerName}
                  </p>
                )}
            </div>

            <div>
              <label
                htmlFor="profile-phone"
                className="block text-xs font-semibold text-stone-800 mb-1"
              >
                10-Digit Mobile Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="profile-phone"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={14}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile e.g. 9839112233"
                  className={`w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border bg-white text-sm text-stone-900 placeholder:text-stone-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] ${
                    (showValidation || phone.length > 0) &&
                    validation.errors.phone
                      ? 'border-[#C83E2B]'
                      : 'border-stone-200'
                  }`}
                />
              </div>
              {(showValidation || phone.trim().length > 0) &&
                validation.errors.phone && (
                  <p className="text-[11px] font-medium text-[#C83E2B] mt-1">
                    {validation.errors.phone}
                  </p>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="profile-ward"
                  className="block text-xs font-semibold text-stone-800 mb-1"
                >
                  Ward Number *
                </label>
                <input
                  id="profile-ward"
                  type="text"
                  required
                  maxLength={60}
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  placeholder="e.g. Ward 4"
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl border bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] ${
                    showValidation && validation.errors.ward
                      ? 'border-[#C83E2B]'
                      : 'border-stone-200'
                  }`}
                />
                {showValidation && validation.errors.ward && (
                  <p className="text-[11px] font-medium text-[#C83E2B] mt-1">
                    {validation.errors.ward}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="profile-area"
                  className="block text-xs font-semibold text-stone-800 mb-1"
                >
                  Area / Mohalla *
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="profile-area"
                    type="text"
                    required
                    maxLength={100}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. Main Market, Bilhaur"
                    className={`w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl border bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] ${
                      showValidation && validation.errors.area
                        ? 'border-[#C83E2B]'
                        : 'border-stone-200'
                    }`}
                  />
                </div>
                {showValidation && validation.errors.area && (
                  <p className="text-[11px] font-medium text-[#C83E2B] mt-1">
                    {validation.errors.area}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Ward & Area selectors */}
            <div className="space-y-2 pt-0.5">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_WARDS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWard(w)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      ward.trim().toLowerCase() === w.toLowerCase()
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AREAS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArea(a)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      area.trim().toLowerCase() === a.toLowerCase()
                        ? 'bg-[#C83E2B] text-white border-[#C83E2B]'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-delivery-address"
                className="block text-xs font-semibold text-stone-800 mb-1"
              >
                Default Home Delivery Address (Optional — can change per order)
              </label>
              <input
                id="profile-delivery-address"
                type="text"
                maxLength={250}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House / Shop No., Gali, Near Landmark"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
              />
            </div>

            {submitError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-[#C83E2B]">
                {submitError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {!isMandatory && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-semibold text-sm shadow-sm disabled:opacity-60 transition-colors"
              >
                {saving
                  ? 'Saving Profile...'
                  : isMandatory
                  ? 'Save Profile & Enter Cafe'
                  : 'Update Saved Profile'}
              </button>
            </div>
          </form>

          {/* Reinstall / Returning Customer Firebase Auto-Restore */}
          <div className="pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={() => setShowRestorePanel((prev) => !prev)}
              className="text-xs font-semibold text-[#C83E2B] hover:underline inline-flex items-center gap-1.5 py-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                Reinstalled app or ordered before? Restore Saved Profile from Firebase
              </span>
            </button>

            {showRestorePanel && (
              <div className="mt-2.5 p-3.5 rounded-2xl bg-white border border-stone-200 space-y-2.5 text-xs">
                <p className="text-stone-600 leading-snug">
                  Enter all 4 previously saved details (<span className="font-semibold">Name, 10-Digit Mobile, Ward, and Area</span>) or your <span className="font-semibold">Sync Code</span> to restore your saved profile from Firebase securely — mobile number alone is never enough.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={restoreName}
                    onChange={(e) => setRestoreName(e.target.value)}
                    placeholder="Saved Name"
                    aria-label="Saved Customer Name for restore"
                    className="min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={14}
                    value={restorePhone}
                    onChange={(e) => setRestorePhone(e.target.value)}
                    placeholder="Saved 10-Digit Mobile"
                    aria-label="Saved Mobile Number for restore"
                    className="min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                  />
                  <input
                    type="text"
                    value={restoreWard}
                    onChange={(e) => setRestoreWard(e.target.value)}
                    placeholder="Saved Ward (e.g. Ward 4)"
                    aria-label="Saved Ward Number for restore"
                    className="min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                  />
                  <input
                    type="text"
                    value={restoreArea}
                    onChange={(e) => setRestoreArea(e.target.value)}
                    placeholder="Saved Area / Mohalla"
                    aria-label="Saved Area or Mohalla for restore"
                    className="min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                  />
                </div>
                <input
                  type="text"
                  value={restoreCode}
                  onChange={(e) => setRestoreCode(e.target.value)}
                  placeholder="Or paste Profile Sync Code (custprof_...)"
                  aria-label="Profile Sync Code for restore"
                  className="w-full min-h-[38px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-mono text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
                {restoreMessage && (
                  <div
                    className={`p-2 rounded-lg text-[11px] font-semibold ${
                      restoreMessage.ok
                        ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                        : 'bg-red-50 text-[#C83E2B] border border-red-200'
                    }`}
                  >
                    {restoreMessage.text}
                  </div>
                )}
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => void handleRestoreLookup()}
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {restoring ? 'Searching Firebase...' : 'Find & Restore Saved Profile'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
