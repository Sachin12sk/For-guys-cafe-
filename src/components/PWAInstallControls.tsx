import { useState } from 'react';
import { Download, Smartphone, WifiOff, X, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { isCapacitorNative } from '../utils/nativeAndroid';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled || isCapacitorNative()) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center gap-1.5 font-semibold transition-colors whitespace-nowrap shrink-0 ${
          compact
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs'
            : 'min-h-[40px] px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs shadow-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  // Provide Add to Home Screen helper button for iOS Safari & browsers without active prompt yet
  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuideModal(true)}
        className={`inline-flex items-center gap-1.5 font-semibold transition-colors whitespace-nowrap shrink-0 ${
          compact
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs'
            : 'min-h-[40px] px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs'
        }`}
      >
        <Smartphone className="w-3.5 h-3.5 text-[#C83E2B] shrink-0" />
        <span>Add to Home Screen</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add FOUR GUYS CAFE to Home Screen"
        >
          <div
            className="fixed inset-0 bg-stone-950/55 backdrop-blur-sm"
            onClick={() => setShowGuideModal(false)}
          />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-3xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="./pwa-192x192.png"
                  alt="FOUR GUYS CAFE App Icon"
                  className="w-10 h-10 rounded-xl border border-stone-200 shrink-0"
                />
                <div>
                  <h3 className="font-display text-base font-bold text-stone-900">
                    Install FOUR GUYS CAFE App
                  </h3>
                  <p className="text-xs text-stone-500">
                    Quick QR menu access from your home screen
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 text-xs text-stone-700 leading-relaxed">
                <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-[#C83E2B]" />
                  <span>On iPhone / iPad (Safari):</span>
                </p>
                <p>
                  1. Tap the <span className="font-semibold text-stone-900">Share</span> button in Safari&apos;s toolbar.
                </p>
                <p>
                  2. Scroll down and tap{' '}
                  <span className="font-semibold text-stone-900">
                    Add to Home Screen
                  </span>
                  .
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 text-xs text-stone-700 leading-relaxed">
                <p className="font-semibold text-stone-900">
                  On Android Chrome / Desktop Browser:
                </p>
                <p>
                  1. Open your browser menu (⋮ or address bar install icon).
                </p>
                <p>
                  2. Tap{' '}
                  <span className="font-semibold text-stone-900">
                    Install app
                  </span>{' '}
                  or{' '}
                  <span className="font-semibold text-stone-900">
                    Add to Home screen
                  </span>
                  .
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[42px] rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineStatusBanner({
  pendingSyncCount = 0,
}: {
  pendingSyncCount?: number;
}) {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingSyncCount <= 0) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-lg ${
        !isOnline ? 'bg-amber-600' : 'bg-[#15803D]'
      }`}
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {!isOnline
          ? pendingSyncCount > 0
            ? `इंटरनेट बंद है (Offline) — ${pendingSyncCount} अपडेट कतार में हैं (नेट आते ही Sync होंगे)`
            : 'इंटरनेट बंद है (No Internet) — Cached मेन्यू उपलब्ध है। OTP और लाइव ऑर्डर के लिए इंटरनेट चालू करें।'
          : `Syncing ${pendingSyncCount} pending update${
              pendingSyncCount === 1 ? '' : 's'
            }...`}
      </span>
    </div>
  );
}
