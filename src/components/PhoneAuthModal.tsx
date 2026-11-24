import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import {
  X,
  Phone,
  ShieldCheck,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Loader2,
  RotateCcw,
  UserCheck,
  ShoppingBag,
  Save,
  MapPin,
  Navigation,
} from 'lucide-react';
import type {
  CustomerCloudOrder,
  CustomerCloudProfile,
  HomeOrderDetails,
} from '../types';
import {
  confirmSmsOtp,
  ensureOrSaveCustomerProfile,
  formatPhoneDisplay,
  logoutCustomer,
  mapPhoneAuthError,
  normalizeCustomerPhone,
  sendRealSmsOtp,
} from '../services/customerAuth';
import { ORDER_STATUS_META } from '../services/cloudSync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  composeWardAreaLabel,
  requestConsentedGpsLocation,
  sanitizeGpsLocationUrl,
  splitLegacyWardArea,
} from '../utils/location';

interface PhoneAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: User | null;
  profile: CustomerCloudProfile | null;
  orders: CustomerCloudOrder[];
  currentHomeDetails: HomeOrderDetails;
  onProfileSaved: (saved: {
    customerName: string;
    gmail: string;
    ward: string;
    area: string;
    wardArea: string;
    deliveryAddress: string;
    geoLocationUrl: string;
    customerNote: string;
  }) => void;
  onClearGpsPin?: () => void;
}

export function PhoneAuthModal({
  isOpen,
  onClose,
  authUser,
  profile,
  orders,
  currentHomeDetails,
  onProfileSaved,
  onClearGpsPin,
}: PhoneAuthModalProps) {
  const isOnline = useOnlineStatus();

  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [sentToE164, setSentToE164] = useState('');
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Logged-in profile form state
  const [nameInput, setNameInput] = useState('');
  const [gmailInput, setGmailInput] = useState('');
  const [wardNumberInput, setWardNumberInput] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [deliveryAddressInput, setDeliveryAddressInput] = useState('');
  const [geoUrlInput, setGeoUrlInput] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsFeedback, setGpsFeedback] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Cleanup reCAPTCHA verifier when modal closes or user logs in
  const clearRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // Ignore cleanup failure
      }
      recaptchaVerifierRef.current = null;
    }
    if (recaptchaContainerRef.current) {
      recaptchaContainerRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    if (!isOpen || authUser) {
      clearRecaptcha();
    }
  }, [isOpen, authUser]);

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  // Sync profile inputs when Firestore profile loads or modal opens
  useEffect(() => {
    if (!isOpen || !authUser) return;
    setNameInput(profile?.customerName || currentHomeDetails.customerName || '');
    setGmailInput(profile?.gmail || currentHomeDetails.gmail || '');
    const split = splitLegacyWardArea(
      profile?.wardArea || currentHomeDetails.wardArea || '',
      profile?.ward || currentHomeDetails.ward,
      profile?.area || currentHomeDetails.area
    );
    setWardNumberInput(split.ward);
    setAreaInput(split.area);
    setDeliveryAddressInput(
      profile?.deliveryAddress || currentHomeDetails.deliveryAddress || ''
    );
    setGeoUrlInput(
      sanitizeGpsLocationUrl(
        profile?.geoLocationUrl || currentHomeDetails.geoLocationUrl || ''
      )
    );
    setGpsFeedback('');
    setNoteInput(profile?.customerNote || currentHomeDetails.customerNote || '');
    setProfileFeedback(null);
  }, [isOpen, authUser, profile]);

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  if (!isOpen) return null;

  const handleSendOtp = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!isOnline) {
      setAuthError(
        'इंटरनेट कनेक्शन बंद है। वास्तविक SMS OTP प्राप्त करने के लिए कृपया ऑनलाइन आएं।'
      );
      return;
    }

    const normalized = normalizeCustomerPhone(phoneInput);
    if (!normalized.valid) {
      setAuthError(normalized.error || 'सही मोबाइल नंबर दर्ज करें।');
      return;
    }

    const container = recaptchaContainerRef.current;
    if (!container) {
      setAuthError('सुरक्षा सत्यापन लोड नहीं हो सका। कृपया मोडल दोबारा खोलें।');
      return;
    }

    setIsSendingOtp(true);
    try {
      const { confirmationResult: result, verifier } = await sendRealSmsOtp(
        normalized.e164,
        container,
        recaptchaVerifierRef.current
      );
      recaptchaVerifierRef.current = verifier;
      setConfirmationResult(result);
      setSentToE164(normalized.e164);
      setStep('otp');
      setOtpInput('');
      setResendSeconds(60);
      setAuthSuccess(
        `${formatPhoneDisplay(normalized.e164)} पर वास्तविक SMS OTP भेज दिया गया है।`
      );
    } catch (err) {
      recaptchaVerifierRef.current = null;
      setAuthError(mapPhoneAuthError(err));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!isOnline) {
      setAuthError(
        'इंटरनेट कनेक्शन उपलब्ध नहीं है। OTP सत्यापित करने के लिए नेटवर्क जांचें।'
      );
      return;
    }

    if (!confirmationResult) {
      setAuthError('OTP सत्र समाप्त हो गया है। कृपया दोबारा OTP मंगाएं।');
      setStep('phone');
      return;
    }

    const cleanedOtp = otpInput.replace(/\D/g, '');
    if (cleanedOtp.length !== 6) {
      setAuthError('कृपया SMS में आया पूरा 6-अंकीय OTP दर्ज करें।');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const user = await confirmSmsOtp(confirmationResult, cleanedOtp);
      // Create/preserve customer record in Firestore immediately after SMS verification
      try {
        await ensureOrSaveCustomerProfile(
          user,
          {
            customerName: currentHomeDetails.customerName,
            gmail: currentHomeDetails.gmail,
            ward: currentHomeDetails.ward,
            area: currentHomeDetails.area,
            wardArea: currentHomeDetails.wardArea,
            deliveryAddress: currentHomeDetails.deliveryAddress,
            geoLocationUrl: sanitizeGpsLocationUrl(
              currentHomeDetails.geoLocationUrl
            ),
            customerNote: currentHomeDetails.customerNote,
          },
          false
        );
      } catch (profileErr) {
        console.warn('Initial customer profile sync notice:', profileErr);
      }
      clearRecaptcha();
      setConfirmationResult(null);
      setOtpInput('');
      setStep('phone');
      setAuthSuccess('मोबाइल नंबर सफलतापूर्वक सत्यापित हो गया!');
    } catch (err) {
      setAuthError(mapPhoneAuthError(err));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleChangePhone = () => {
    clearRecaptcha();
    setConfirmationResult(null);
    setOtpInput('');
    setAuthError('');
    setAuthSuccess('');
    setStep('phone');
  };

  const handleRequestProfileGps = async () => {
    setGpsFeedback('');
    setGpsLoading(true);
    const res = await requestConsentedGpsLocation({ userInitiated: true });
    setGpsLoading(false);
    if (res.granted && res.geoLocationUrl) {
      setGeoUrlInput(res.geoLocationUrl);
      setGpsFeedback(res.message);
      return;
    }
    setGpsFeedback(res.message);
    if (res.status === 'denied') {
      setGeoUrlInput('');
      onClearGpsPin?.();
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setProfileFeedback(null);

    if (!isOnline) {
      setProfileFeedback({
        ok: false,
        message: 'नेटवर्क उपलब्ध नहीं है। प्रोफ़ाइल सेव करने के लिए ऑनलाइन आएं।',
      });
      return;
    }

    const cleanWard = wardNumberInput.trim().slice(0, 60);
    const cleanArea = areaInput.trim().slice(0, 100);
    const nextDetails = {
      customerName: nameInput.trim().slice(0, 80),
      gmail: gmailInput.trim().toLowerCase().slice(0, 120),
      ward: cleanWard,
      area: cleanArea,
      wardArea: composeWardAreaLabel({ ward: cleanWard, area: cleanArea }),
      deliveryAddress: deliveryAddressInput.trim().slice(0, 250),
      geoLocationUrl: sanitizeGpsLocationUrl(geoUrlInput),
      customerNote: noteInput.trim().slice(0, 300),
    };

    setIsSavingProfile(true);
    try {
      await ensureOrSaveCustomerProfile(authUser, nextDetails, true);
      onProfileSaved(nextDetails);
      setProfileFeedback({
        ok: true,
        message: 'आपकी जानकारी और Delivery Address सुरक्षित सेव हो गए हैं!',
      });
    } catch (err) {
      setProfileFeedback({
        ok: false,
        message: mapPhoneAuthError(err),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    setAuthError('');
    setIsLoggingOut(true);
    try {
      await logoutCustomer();
      setStep('phone');
      setOtpInput('');
      setPhoneInput('');
      setConfirmationResult(null);
      setAuthSuccess('');
    } catch (err) {
      setAuthError(mapPhoneAuthError(err));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customer Mobile OTP Login"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div className="relative z-10 w-full max-w-md h-full sm:h-auto sm:max-h-[90vh] bg-[#FAF9F6] sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl text-white flex items-center justify-center ${
                authUser ? 'bg-[#15803D]' : 'bg-[#C83E2B]'
              }`}
            >
              {authUser ? (
                <UserCheck className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">
                {authUser ? 'Verified Customer Account' : 'Mobile OTP Login'}
              </h2>
              <p className="text-xs text-stone-500">
                {authUser
                  ? 'Firebase SMS Verified · Secure Profile'
                  : 'Real SMS OTP verification via Firebase'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close OTP Login"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!isOnline && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-medium flex items-start gap-2">
              <WifiOff className="w-4 h-4 text-[#C83E2B] shrink-0 mt-0.5" />
              <span>
                आप ऑफ़लाइन हैं। SMS OTP भेजने या सुरक्षित प्रोफ़ाइल अपडेट करने के लिए इंटरनेट कनेक्शन चालू करें।
              </span>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#C83E2B] font-medium flex items-start gap-2 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="p-3 rounded-xl bg-[#15803D]/10 border border-[#15803D]/30 text-xs text-[#15803D] font-semibold flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authSuccess}</span>
            </div>
          )}

          {!authUser ? (
            <div className="space-y-4">
              {step === 'phone' ? (
                <form
                  onSubmit={handleSendOtp}
                  className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-xs"
                >
                  <div>
                    <h3 className="font-display text-base font-bold text-stone-900">
                      अपने मोबाइल नंबर से लॉगिन करें
                    </h3>
                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                      अपना मोबाइल नंबर दर्ज करें। आपके फोन पर वास्तविक SMS द्वारा 6-अंकीय OTP भेजा जाएगा।
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="otp-phone-input"
                      className="block text-xs font-semibold text-stone-700 mb-1.5"
                    >
                      Mobile Number (मोबाइल नंबर) *
                    </label>
                    <div className="flex items-stretch gap-2">
                      <span className="min-h-[46px] px-3 rounded-xl border border-stone-200 bg-stone-100 text-sm font-bold text-stone-700 flex items-center justify-center shrink-0">
                        +91
                      </span>
                      <input
                        id="otp-phone-input"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="10-digit mobile (e.g. 9876543210)"
                        className="flex-1 min-h-[46px] px-3.5 py-2 rounded-xl border border-stone-300 bg-stone-50 text-sm font-semibold text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1.5">
                      दूसरे देश का नंबर हो तो देश कोड के साथ लिखें (जैसे +1...)
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingOtp || !isOnline}
                    className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] disabled:bg-stone-300 disabled:text-stone-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    {isSendingOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Real SMS OTP...</span>
                      </>
                    ) : (
                      <>
                        <Phone className="w-4 h-4" />
                        <span>Send OTP on SMS</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={handleVerifyOtp}
                  className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-bold text-stone-900">
                        6-अंकीय OTP दर्ज करें
                      </h3>
                      <p className="text-xs text-stone-600 mt-1 tabular-nums">
                        SMS भेजा गया नंबर:{' '}
                        <span className="font-bold text-stone-900">
                          {formatPhoneDisplay(sentToE164)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangePhone}
                      className="text-xs font-semibold text-[#C83E2B] hover:underline whitespace-nowrap shrink-0"
                    >
                      Change Number
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="otp-code-input"
                      className="block text-xs font-semibold text-stone-700 mb-1.5"
                    >
                      6-Digit SMS OTP *
                    </label>
                    <input
                      id="otp-code-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={otpInput}
                      onChange={(e) =>
                        setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="• • • • • •"
                      className="w-full min-h-[50px] px-4 py-2 rounded-xl border border-stone-300 bg-stone-50 text-center text-xl font-extrabold tracking-[0.45em] text-stone-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#15803D] focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp || otpInput.length !== 6 || !isOnline}
                    className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:bg-stone-300 disabled:text-stone-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying OTP...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>Verify OTP &amp; Login</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-stone-500">OTP नहीं मिला?</span>
                    {resendSeconds > 0 ? (
                      <span className="font-semibold text-stone-500 tabular-nums">
                        Resend OTP in {resendSeconds}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSendingOtp || !isOnline}
                        onClick={() => void handleSendOtp()}
                        className="font-semibold text-[#C83E2B] hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Resend OTP</span>
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* Stable invisible reCAPTCHA mount point */}
              <div
                ref={recaptchaContainerRef}
                id="four-guys-recaptcha-container"
                className="flex justify-center"
              />

              <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 flex items-start gap-2.5 text-[11px] text-stone-600 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-stone-900">100% Real SMS Security:</strong>{' '}
                  Firebase Phone Authentication के माध्यम से लॉगिन करने पर आपका नाम, पता और ऑर्डर विवरण केवल आपके सत्यापित खाते में सुरक्षित रहते हैं।
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verified Account Banner */}
              <div className="p-4 rounded-2xl bg-white border border-[#15803D]/30 flex items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#15803D] uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SMS Verified Account</span>
                  </div>
                  <div className="font-display text-lg font-extrabold text-stone-900 tabular-nums mt-0.5 truncate">
                    {formatPhoneDisplay(authUser.phoneNumber)}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    लॉगिन सक्रिय है — चेकआउट में नंबर और पता अपने-आप भर जाएगा।
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-[#C83E2B] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-60"
                >
                  {isLoggingOut ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>Logout</span>
                </button>
              </div>

              {/* Secure Saved Delivery Profile Form */}
              <form
                onSubmit={handleSaveProfile}
                className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-stone-900">
                    Saved Delivery Details (सुरक्षित प्रोफ़ाइल)
                  </h3>
                  <span className="text-[11px] font-semibold text-[#15803D]">
                    Private · Encrypted
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="profile-name"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    आपका नाम (Full Name)
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    maxLength={80}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Rahul Verma"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-gmail"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Gmail ID (Optional)
                  </label>
                  <input
                    id="profile-gmail"
                    type="email"
                    maxLength={120}
                    value={gmailInput}
                    onChange={(e) => setGmailInput(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="profile-ward"
                      className="block text-xs font-semibold text-stone-700 mb-1"
                    >
                      Ward (वार्ड)
                    </label>
                    <input
                      id="profile-ward"
                      type="text"
                      maxLength={60}
                      value={wardNumberInput}
                      onChange={(e) => setWardNumberInput(e.target.value)}
                      placeholder="e.g. Ward 7"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile-area"
                      className="block text-xs font-semibold text-stone-700 mb-1"
                    >
                      Area / Mohalla (क्षेत्र)
                    </label>
                    <input
                      id="profile-area"
                      type="text"
                      maxLength={100}
                      value={areaInput}
                      onChange={(e) => setAreaInput(e.target.value)}
                      placeholder="e.g. Master Market, Kakawan Road"
                      className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="profile-delivery-address"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Full Delivery Address (पूरा पता)
                  </label>
                  <textarea
                    id="profile-delivery-address"
                    rows={2}
                    maxLength={250}
                    value={deliveryAddressInput}
                    onChange={(e) => setDeliveryAddressInput(e.target.value)}
                    placeholder="House / Shop No., Street / Gali, Near Landmark, Bilhaur"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRequestProfileGps()}
                      disabled={gpsLoading}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Navigation className="w-3.5 h-3.5 text-[#C83E2B]" />
                      <span>
                        {gpsLoading
                          ? 'Requesting GPS...'
                          : 'Use Current GPS Location'}
                      </span>
                    </button>

                    {geoUrlInput && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                        <MapPin className="w-3.5 h-3.5" />
                        <a
                          href={geoUrlInput}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          GPS Pinned
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setGeoUrlInput('');
                            onClearGpsPin?.();
                            setGpsFeedback('GPS लोकेशन पिन हटा दिया गया है।');
                          }}
                          className="text-stone-400 hover:text-stone-700 ml-1"
                          aria-label="Clear saved GPS pin"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {gpsFeedback && (
                    <p className="text-[11px] text-stone-600 leading-snug">
                      {gpsFeedback}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="profile-note"
                    className="block text-xs font-semibold text-stone-700 mb-1"
                  >
                    Default Order Note (Optional)
                  </label>
                  <input
                    id="profile-note"
                    type="text"
                    maxLength={300}
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="e.g. Extra oregano, call at gate"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                  />
                </div>

                {profileFeedback && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-semibold ${
                      profileFeedback.ok
                        ? 'bg-[#15803D]/10 text-[#15803D]'
                        : 'bg-red-50 text-[#C83E2B]'
                    }`}
                  >
                    {profileFeedback.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSavingProfile || !isOnline}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving to Secure Cloud...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Details Securely</span>
                    </>
                  )}
                </button>
              </form>

              {/* Verified Account Order History */}
              <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                    <ShoppingBag className="w-3.5 h-3.5 text-[#C83E2B]" />
                    <span>Your Synced Orders ({orders.length})</span>
                  </div>
                  <span className="text-[11px] text-stone-500">
                    Private History
                  </span>
                </div>

                {orders.length === 0 ? (
                  <p className="text-xs text-stone-500 py-1">
                    लॉगिन के बाद किए गए आपके Dine-In या Home ऑर्डर यहाँ सुरक्षित रूप से सेव होंगे।
                  </p>
                ) : (
                  <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto">
                    {orders.map((ord) => {
                      const statusMeta =
                        ORDER_STATUS_META[ord.orderStatus || 'pending'];
                      return (
                        <div key={ord.id} className="py-2 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2 font-bold text-stone-900 tabular-nums">
                            <span className="truncate">
                              {ord.orderCode} ·{' '}
                              <span className="font-semibold text-stone-600">
                                {ord.orderMode === 'home' ? 'Home' : 'Dine-In'}
                                {ord.sourcePlatform === 'android' ? ' · App' : ''}
                              </span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.hiLabel}
                              </span>
                              <span className="text-[#15803D]">
                                ₹{ord.totalAmount}
                              </span>
                            </div>
                          </div>
                          <div className="text-[11px] text-stone-600 line-clamp-2">
                            {ord.itemsSummary}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
