import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Upload,
  Download,
  Share2,
  Star,
  Check,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type { VibeSnapRecord } from '../types';

interface SnapModalProps {
  isOpen: boolean;
  onClose: () => void;
  cafeName: string;
  onPublishSnap: (snap: VibeSnapRecord) => void;
}

interface PromoOverlayPreset {
  id: string;
  label: string;
  topTag: string;
  bottomBanner: string;
  accentBg: string;
}

const OVERLAY_PRESETS: PromoOverlayPreset[] = [
  {
    id: 'gang',
    label: 'FOUR GUYS Gang 😂🍕',
    topTag: 'FOUR GUYS CAFE · BILHAUR',
    bottomBanner: 'FOUR GUYS Gang 😂🍕',
    accentBg: '#C83E2B',
  },
  {
    id: 'king',
    label: 'Pizza King Vibe 👑🍔',
    topTag: "BILHAUR'S PIZZA KING 👑",
    bottomBanner: 'Pizza King Vibe 👑🍔',
    accentBg: '#1C1917',
  },
  {
    id: 'bite',
    label: "Bilhaur's Best Bite 😎",
    topTag: 'FOUR GUYS · KAKAWAN ROAD',
    bottomBanner: "Bilhaur's Best Bite 😎",
    accentBg: '#15803D',
  },
  {
    id: 'nodiet',
    label: 'No Diet Today 🤤🥤',
    topTag: 'CHEESE & CHILLED VIBES',
    bottomBanner: 'No Diet Today 🤤🥤 @ FOUR GUYS',
    accentBg: '#D97706',
  },
];

export function SnapModal({
  isOpen,
  onClose,
  cafeName,
  onPublishSnap,
}: SnapModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [composedDataUrl, setComposedDataUrl] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>(
    OVERLAY_PRESETS[0].id
  );
  const [caption, setCaption] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [stars, setStars] = useState(5);
  const [publishedBanner, setPublishedBanner] = useState(false);
  const [snapchatHint, setSnapchatHint] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(
    async (mode: 'user' | 'environment') => {
      stopCamera();
      setCameraError('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Live camera is not available in this browser — use "Upload / Take Photo" below.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch {
        setCameraError(
          'Camera permission blocked or unavailable — tap "Upload / Take Photo" below instead!'
        );
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    if (!rawImageSrc) {
      void startCamera(facingMode);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, rawImageSrc, startCamera, stopCamera]);

  // Compose raw photo onto HTML5 Canvas with FOUR GUYS funny promotional overlays
  useEffect(() => {
    if (!rawImageSrc || !canvasRef.current) {
      setComposedDataUrl(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = 640;
      const height = 760;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Cover-crop photo into canvas
      const imgAspect = img.width / img.height;
      const targetAspect = width / height;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (imgAspect > targetAspect) {
        sw = img.height * targetAspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / targetAspect;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

      // Subtle bottom gradient vignette for contrast
      const grad = ctx.createLinearGradient(0, height - 220, 0, height);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, height - 220, width, 220);

      const preset =
        OVERLAY_PRESETS.find((p) => p.id === selectedOverlayId) ||
        OVERLAY_PRESETS[0];

      // Top corner FOUR GUYS watermark pill on canvas
      ctx.fillStyle = 'rgba(28, 25, 23, 0.85)';
      ctx.beginPath();
      ctx.roundRect(24, 24, 290, 44, 12);
      ctx.fill();

      ctx.fillStyle = '#FCD34D';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(preset.topTag, 40, 52);

      // Bottom funny promotional banner
      ctx.fillStyle = preset.accentBg;
      ctx.beginPath();
      ctx.roundRect(24, height - 118, width - 48, 60, 16);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(preset.bottomBanner, 44, height - 79);

      // Custom caption & star line if entered
      const starString = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 18px sans-serif';
      const footerLine = caption.trim()
        ? `${starString}  "${caption.trim().slice(0, 42)}"`
        : `${starString}  Spotted at ${cafeName}`;
      ctx.fillText(footerLine, 28, height - 28);

      setComposedDataUrl(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.src = rawImageSrc;
  }, [rawImageSrc, selectedOverlayId, caption, stars, cafeName]);

  if (!isOpen) return null;

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const temp = document.createElement('canvas');
    temp.width = video.videoWidth || 640;
    temp.height = video.videoHeight || 480;
    const ctx = temp.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(temp.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, temp.width, temp.height);
    setRawImageSrc(temp.toDataURL('image/jpeg', 0.9));
    stopCamera();
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawImageSrc(reader.result);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRetake = () => {
    setRawImageSrc(null);
    setComposedDataUrl(null);
    setPublishedBanner(false);
    setSnapchatHint(false);
  };

  const handleDownloadSnap = () => {
    if (!composedDataUrl) return;
    const a = document.createElement('a');
    a.href = composedDataUrl;
    a.download = `four-guys-cafe-snap-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePostToVibeWall = () => {
    if (!composedDataUrl) return;
    const preset =
      OVERLAY_PRESETS.find((p) => p.id === selectedOverlayId) ||
      OVERLAY_PRESETS[0];

    onPublishSnap({
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageDataUrl: composedDataUrl,
      overlayLabel: preset.bottomBanner,
      stars,
      caption: caption.trim() || preset.bottomBanner,
      authorName: authorName.trim() || 'Cafe Guest',
      createdAt: new Date().toISOString(),
    });
    setPublishedBanner(true);
    setTimeout(() => {
      setPublishedBanner(false);
    }, 3500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="FOUR GUYS Snap Camera Studio"
    >
      <div
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md bg-[#FAF9F6] h-full flex flex-col shadow-2xl border-l border-stone-200">
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">
                FOUR GUYS Snap Studio
              </h2>
              <p className="text-xs text-stone-500">
                Take a funny selfie/food snap · Post to Vibe Wall or Snapchat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Snap Studio"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {publishedBanner && (
            <div className="p-3 rounded-2xl bg-[#15803D] text-white text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                Snap posted to the Cafe Vibe Wall below!
              </span>
            </div>
          )}

          {/* Live Camera or Composed Preview */}
          <div className="rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 relative aspect-[640/760] flex items-center justify-center">
            {!rawImageSrc ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  }`}
                />
                {cameraError && (
                  <div className="absolute inset-0 bg-stone-950/90 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-amber-400" />
                    <p className="text-xs text-stone-200 leading-relaxed max-w-xs">
                      {cameraError}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <canvas
                ref={canvasRef}
                className="w-full h-full object-cover block"
              />
            )}
          </div>

          {/* Camera Controls or Editing Controls */}
          {!rawImageSrc ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!cameraReady}
                  onClick={handleCaptureFrame}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Snap</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((prev) =>
                      prev === 'user' ? 'environment' : 'user'
                    )
                  }
                  className="min-h-[48px] px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Flip</span>
                </button>
              </div>

              <label className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-[#C83E2B]" />
                <span>Upload / Take Photo via Device</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Promo Overlay Picker */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#C83E2B]" />
                  <span>Pick Funny FOUR GUYS Overlay</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {OVERLAY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedOverlayId(preset.id)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold text-left transition-colors ${
                        selectedOverlayId === preset.id
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Star Rating + Caption + Name */}
              <div className="p-4 rounded-2xl bg-white border border-stone-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-700">
                    Your Rating
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setStars(v)}
                        aria-label={`Rate ${v} stars`}
                        className="p-1"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            v <= stars
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-stone-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your Name (e.g. Aryan)"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                />

                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Funny caption (e.g. Pizza party with the gang!)"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={!composedDataUrl}
                  onClick={handlePostToVibeWall}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Post to Cafe Vibe Wall</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!composedDataUrl}
                    onClick={handleDownloadSnap}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Save Snap</span>
                  </button>

                  <a
                    href="https://www.snapchat.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      handleDownloadSnap();
                      setSnapchatHint(true);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Send to Snapchat</span>
                  </a>
                </div>

                {snapchatHint && (
                  <p className="text-[11px] text-stone-600 bg-amber-50 border border-amber-200 rounded-xl p-2.5 leading-snug">
                    Your branded <span className="font-semibold">FOUR GUYS</span> snap was saved! Attach the downloaded photo right inside Snapchat.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleRetake}
                  className="w-full min-h-[40px] text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  Retake / Choose Another Photo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
