import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  X,
  Lock,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  Copy,
  Check,
  RotateCcw,
  Minus,
  LogOut,
  Search,
  AlertCircle,
  Home,
  ShieldAlert,
  Clock,
  ArrowUp,
  ArrowDown,
  Gift,
  Link2,
  Store,
} from 'lucide-react';
import type {
  CafeRatingRecord,
  CafeSettings,
  CafeStoreData,
  Category,
  ComboSet,
  HighlightBadge,
  HomeOrderRecord,
  LoyaltyState,
  OrderMode,
  Product,
  ReferralRecord,
  SocialLinkItem,
  TableOrderRecord,
  VibeSnapRecord,
} from '../types';
import { compressImageFileToDataUrl } from '../utils/imageUpload';
import { sanitizeWhatsappNumber } from '../utils/whatsapp';
import {
  formatCooldownTime,
  getAdminLockState,
  MAX_FAILED_ADMIN_ATTEMPTS,
  recordFailedAdminAttempt,
  resetAdminLockState,
  type AdminLockState,
} from '../utils/security';
import { ResilientImage } from './ResilientImage';
import { AdminOrdersAndSheetsTab } from './AdminOrdersAndSheetsTab';
import { AdminAnalyticsTab } from './AdminAnalyticsTab';
import { AdminComboManagerTab } from './AdminComboManagerTab';
import { AdminCommunityModerationTab } from './AdminCommunityModerationTab';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CafeStoreData;
  homeOrders: HomeOrderRecord[];
  tableOrders: TableOrderRecord[];
  referralRecords: ReferralRecord[];
  loyalty: LoyaltyState;
  ratings: CafeRatingRecord[];
  vibeSnaps: VibeSnapRecord[];
  onUpdateData: (nextData: CafeStoreData) => void;
  onResetDefaults: () => void;
  onToggleHomeOrderFlag: (id: string) => void;
  onToggleTableOrderFlag: (id: string) => void;
  onDeleteHomeOrder: (id: string) => void;
  onDeleteTableOrder: (id: string) => void;
  onClearAllOrders: () => void;
  onConfirmManualReferral: (payload: {
    orderCode: string;
    orderMode: OrderMode;
    referralCode: string;
    customerLabel: string;
    orderAmount: number;
    spinsToAward: number;
    creditToThisBrowser: boolean;
    note: string;
  }) => { ok: boolean; message: string };
  onAdjustReferralRecord: (id: string, deltaSpins: number) => void;
  onToggleRevokeReferral: (id: string) => void;
  onDeleteReferralRecord: (id: string) => void;
  onAdjustBrowserSpins: (deltaSpins: number) => void;
  onDeleteRating: (id: string) => void;
  onRestoreStarterRatings: () => void;
  onDeleteSnap: (id: string) => void;
  onClearAllSnaps: () => void;
}

type AdminTab =
  | 'orders'
  | 'analytics'
  | 'combos'
  | 'products'
  | 'home-order'
  | 'categories'
  | 'community'
  | 'settings'
  | 'json';

export function AdminModal({
  isOpen,
  onClose,
  data,
  homeOrders,
  tableOrders,
  referralRecords,
  loyalty,
  ratings,
  vibeSnaps,
  onUpdateData,
  onResetDefaults,
  onToggleHomeOrderFlag,
  onToggleTableOrderFlag,
  onDeleteHomeOrder,
  onDeleteTableOrder,
  onClearAllOrders,
  onConfirmManualReferral,
  onAdjustReferralRecord,
  onToggleRevokeReferral,
  onDeleteReferralRecord,
  onAdjustBrowserSpins,
  onDeleteRating,
  onRestoreStarterRatings,
  onDeleteSnap,
  onClearAllSnaps,
}: AdminModalProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminIdInput, setAdminIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [lockState, setLockState] = useState<AdminLockState>(() =>
    getAdminLockState()
  );
  const [lockNowMs, setLockNowMs] = useState(() => Date.now());

  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Products state
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Home Order Manager state
  const [homeSearch, setHomeSearch] = useState('');
  const [homeMinInput, setHomeMinInput] = useState<number>(
    data.settings.homeMinOrder ?? 150
  );
  const [homeDeliveryFeeInput, setHomeDeliveryFeeInput] = useState<number>(
    data.settings.homeDeliveryFee ?? 0
  );
  const [homeWaInput, setHomeWaInput] = useState<string>(
    data.settings.homeWhatsappNumber || ''
  );
  const [homeNoteInput, setHomeNoteInput] = useState<string>(
    data.settings.homeDeliveryNote || ''
  );

  // Categories state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<CafeSettings>(data.settings);
  const [confirmReset, setConfirmReset] = useState(false);

  // JSON Import / Export state
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const lockRemainingSeconds =
    lockState.lockedUntilMs && lockState.lockedUntilMs > lockNowMs
      ? Math.ceil((lockState.lockedUntilMs - lockNowMs) / 1000)
      : 0;
  const isLoginLocked = lockRemainingSeconds > 0;

  useEffect(() => {
    setSettingsForm(data.settings);
  }, [data.settings]);

  useEffect(() => {
    if (!isOpen) return;
    const now = Date.now();
    setLockNowMs(now);
    setLockState(getAdminLockState(now));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || lockRemainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLockNowMs(now);
      const fresh = getAdminLockState(now);
      setLockState(fresh);
      if (!fresh.lockedUntilMs) {
        setAuthError('');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, lockRemainingSeconds]);

  if (!isOpen) return null;

  const flashStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const currentLock = getAdminLockState(now);
    setLockState(currentLock);
    setLockNowMs(now);

    if (currentLock.lockedUntilMs && currentLock.lockedUntilMs > now) {
      const secs = Math.ceil((currentLock.lockedUntilMs - now) / 1000);
      setAuthError(
        `Too many failed login attempts. Try again in ${formatCooldownTime(secs)}.`
      );
      return;
    }

    const enteredId = adminIdInput.trim();
    const enteredPass = passwordInput.trim();
    const expectedId = (data.settings.adminId || '@pizza').trim();
    const expectedMobile = (data.settings.adminMobile || '9651008080').replace(
      /\D/g,
      ''
    );
    const enteredDigits = enteredId.replace(/\D/g, '');
    const normalizedEnteredMobile =
      enteredDigits.length === 12 && enteredDigits.startsWith('91')
        ? enteredDigits.slice(2)
        : enteredDigits;
    const normalizedExpectedMobile =
      expectedMobile.length === 12 && expectedMobile.startsWith('91')
        ? expectedMobile.slice(2)
        : expectedMobile;

    const expectedPass = (data.settings.adminPin || 'Pizza@115115').trim();

    const idMatches = enteredId.toLowerCase() === expectedId.toLowerCase();
    const mobileMatches =
      normalizedExpectedMobile.length > 0 &&
      normalizedEnteredMobile === normalizedExpectedMobile;

    if ((idMatches || mobileMatches) && enteredPass === expectedPass) {
      resetAdminLockState();
      setLockState({ failedAttempts: 0, lockedUntilMs: null });
      setIsAuthenticated(true);
      setAuthError('');
      setAdminIdInput('');
      setPasswordInput('');
      setSettingsForm(data.settings);
      setHomeMinInput(data.settings.homeMinOrder ?? 150);
      setHomeDeliveryFeeInput(data.settings.homeDeliveryFee ?? 0);
      setHomeWaInput(data.settings.homeWhatsappNumber || '');
      setHomeNoteInput(data.settings.homeDeliveryNote || '');
    } else {
      const nextLock = recordFailedAdminAttempt(now);
      setLockState(nextLock);
      setLockNowMs(now);
      if (nextLock.lockedUntilMs && nextLock.lockedUntilMs > now) {
        setAuthError(
          `5 failed attempts reached. Admin login temporarily locked for ${formatCooldownTime(
            Math.ceil((nextLock.lockedUntilMs - now) / 1000)
          )}.`
        );
      } else {
        const left = Math.max(
          1,
          MAX_FAILED_ADMIN_ATTEMPTS - nextLock.failedAttempts
        );
        setAuthError(
          `Invalid Admin ID or Password. ${left} ${
            left === 1 ? 'attempt' : 'attempts'
          } remaining before temporary lockout.`
        );
      }
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminIdInput('');
    setPasswordInput('');
    setAuthError('');
  };

  // Product Handlers
  const openCreateProduct = () => {
    setIsNewProduct(true);
    setUploadError('');
    const defaultCat =
      productCategoryFilter !== 'all'
        ? productCategoryFilter
        : data.categories[0]?.id || 'cat-cold-drinks';
    const catImg = data.categories.find((c) => c.id === defaultCat)?.image || '';
    setEditingProduct({
      id: `prod-${Date.now()}`,
      name: '',
      categoryId: defaultCat,
      price: 50,
      description: '',
      image: catImg,
      available: true,
      homeOrderEnabled: true,
    });
  };

  const openEditProduct = (product: Product) => {
    setIsNewProduct(false);
    setUploadError('');
    setEditingProduct({
      ...product,
      available: product.available !== false,
      homeOrderEnabled: product.homeOrderEnabled !== false,
    });
  };

  const handleSaveProduct = (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const cleanName = editingProduct.name.trim();
    if (!cleanName) return;

    const normalized: Product = {
      ...editingProduct,
      name: cleanName,
      price: Math.max(0, Number(editingProduct.price) || 0),
      description: editingProduct.description.trim(),
      image: editingProduct.image.trim(),
      available: editingProduct.available !== false,
      homeOrderEnabled: Boolean(editingProduct.homeOrderEnabled),
    };

    const nextProducts = isNewProduct
      ? [normalized, ...data.products]
      : data.products.map((p) => (p.id === normalized.id ? normalized : p));

    onUpdateData({ ...data, products: nextProducts });
    setEditingProduct(null);
    flashStatus(isNewProduct ? 'Product added to menu' : 'Product updated');
  };

  const handleQuickPriceDelta = (productId: string, delta: number) => {
    const nextProducts = data.products.map((p) =>
      p.id === productId ? { ...p, price: Math.max(1, p.price + delta) } : p
    );
    onUpdateData({ ...data, products: nextProducts });
    flashStatus('Price updated & saved');
  };

  const handleExactPriceChange = (productId: string, rawVal: string) => {
    const numeric = Math.max(0, Math.round(Number(rawVal) || 0));
    const nextProducts = data.products.map((p) =>
      p.id === productId ? { ...p, price: numeric } : p
    );
    onUpdateData({ ...data, products: nextProducts });
  };

  const handleToggleStock = (productId: string) => {
    const nextProducts = data.products.map((p) =>
      p.id === productId ? { ...p, available: !(p.available !== false) } : p
    );
    onUpdateData({ ...data, products: nextProducts });
    flashStatus('Stock status updated');
  };

  const handleCycleProductBadge = (productId: string) => {
    const nextProducts = data.products.map((p) => {
      if (p.id !== productId) return p;
      const nextBadge: HighlightBadge | undefined =
        !p.highlightBadge
          ? 'bestseller'
          : p.highlightBadge === 'bestseller'
          ? 'special'
          : undefined;
      return { ...p, highlightBadge: nextBadge };
    });
    onUpdateData({ ...data, products: nextProducts });
    flashStatus('Product highlight badge updated');
  };

  const handleToggleCafeOpen = () => {
    const currentlyOpen = data.settings.isCafeOpen !== false;
    const nextOpen = !currentlyOpen;
    const nextSettings: CafeSettings = {
      ...data.settings,
      isCafeOpen: nextOpen,
    };
    setSettingsForm(nextSettings);
    onUpdateData({ ...data, settings: nextSettings });
    flashStatus(
      nextOpen
        ? 'Cafe is now OPEN — accepting live orders'
        : 'Cafe marked CLOSED — storefront banner active & new orders paused'
    );
  };

  const handleDeleteProduct = (productId: string) => {
    const nextProducts = data.products.filter((p) => p.id !== productId);
    onUpdateData({ ...data, products: nextProducts });
    setDeleteProductId(null);
    flashStatus('Product deleted');
  };

  const handleProductFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    setUploadingImage(true);
    setUploadError('');
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setEditingProduct({ ...editingProduct, image: dataUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Home Order Manager Handlers
  const handleSaveHomeOrderSettings = (e: FormEvent) => {
    e.preventDefault();
    const cleanedMin = Math.max(0, Math.round(Number(homeMinInput) || 0));
    const cleanedFee = Math.max(
      0,
      Math.round(Number(homeDeliveryFeeInput) || 0)
    );
    const cleanedWa = homeWaInput.trim()
      ? sanitizeWhatsappNumber(homeWaInput)
      : '';

    const nextSettings: CafeSettings = {
      ...data.settings,
      homeMinOrder: cleanedMin,
      homeDeliveryFee: cleanedFee,
      homeWhatsappNumber: cleanedWa,
      homeDeliveryNote: homeNoteInput.trim(),
    };
    setSettingsForm(nextSettings);
    setHomeMinInput(cleanedMin);
    setHomeDeliveryFeeInput(cleanedFee);
    setHomeWaInput(cleanedWa);
    onUpdateData({ ...data, settings: nextSettings });
    flashStatus('Home Order settings saved');
  };

  const handleToggleHomeOrderItem = (productId: string) => {
    const nextProducts = data.products.map((p) =>
      p.id === productId
        ? { ...p, homeOrderEnabled: !(p.homeOrderEnabled !== false) }
        : p
    );
    onUpdateData({ ...data, products: nextProducts });
  };

  const handleToggleHomeOrderCombo = (comboId: string) => {
    const nextCombos = (data.combos || []).map((c) =>
      c.id === comboId
        ? { ...c, homeOrderEnabled: !(c.homeOrderEnabled !== false) }
        : c
    );
    onUpdateData({ ...data, combos: nextCombos });
  };

  const handleEnableAllHomeOrder = (enabled: boolean) => {
    const nextProducts = data.products.map((p) => ({
      ...p,
      homeOrderEnabled: enabled,
    }));
    onUpdateData({ ...data, products: nextProducts });
    flashStatus(
      enabled
        ? 'All items enabled for Home Order'
        : 'All items disabled for Home Order'
    );
  };

  // Category Handlers
  const openCreateCategory = () => {
    setIsNewCategory(true);
    setUploadError('');
    setEditingCategory({
      id: `cat-${Date.now()}`,
      name: '',
      subtitle: '',
      image: '',
    });
  };

  const openEditCategory = (cat: Category) => {
    setIsNewCategory(false);
    setUploadError('');
    setEditingCategory({ ...cat });
  };

  const handleSaveCategory = (e: FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const cleanName = editingCategory.name.trim();
    if (!cleanName) return;

    const normalized: Category = {
      ...editingCategory,
      name: cleanName,
      subtitle: editingCategory.subtitle.trim() || `${cleanName} specials`,
      image: editingCategory.image.trim(),
    };

    const nextCategories = isNewCategory
      ? [...data.categories, normalized]
      : data.categories.map((c) => (c.id === normalized.id ? normalized : c));

    onUpdateData({ ...data, categories: nextCategories });
    setEditingCategory(null);
    flashStatus(isNewCategory ? 'Category created' : 'Category updated');
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (data.categories.length <= 1) {
      flashStatus('At least one category is required');
      setDeleteCategoryId(null);
      return;
    }
    const remainingCategories = data.categories.filter((c) => c.id !== categoryId);
    const fallbackId = remainingCategories[0].id;
    const nextProducts = data.products.map((p) =>
      p.categoryId === categoryId ? { ...p, categoryId: fallbackId } : p
    );
    onUpdateData({
      ...data,
      categories: remainingCategories,
      products: nextProducts,
    });
    setDeleteCategoryId(null);
    flashStatus('Category removed; items reassigned');
  };

  const handleCategoryFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCategory) return;
    setUploadingImage(true);
    setUploadError('');
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setEditingCategory({ ...editingCategory, image: dataUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Settings Handlers
  const handleSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    const cleanedLinks: SocialLinkItem[] = (settingsForm.socialLinks || [])
      .map((s) => ({
        ...s,
        platform: s.platform.trim() || 'Link',
        label: s.label.trim() || s.platform.trim() || 'Visit',
        url: s.url.trim(),
      }))
      .filter((s) => s.label || s.url);

    const fb = cleanedLinks.find((s) =>
      s.platform.toLowerCase().includes('facebook')
    );
    const ig = cleanedLinks.find((s) =>
      s.platform.toLowerCase().includes('instagram')
    );

    const cleaned: CafeSettings = {
      ...settingsForm,
      cafeName: settingsForm.cafeName.trim() || 'FOUR GUYS CAFE',
      whatsappNumber: sanitizeWhatsappNumber(settingsForm.whatsappNumber),
      homeWhatsappNumber: settingsForm.homeWhatsappNumber?.trim()
        ? sanitizeWhatsappNumber(settingsForm.homeWhatsappNumber)
        : '',
      homeMinOrder: Math.max(0, Number(settingsForm.homeMinOrder) || 150),
      homeDeliveryFee: Math.max(
        0,
        Math.round(Number(settingsForm.homeDeliveryFee ?? 0))
      ),
      facebook: fb?.label || settingsForm.facebook,
      instagram: ig?.label || settingsForm.instagram,
      socialLinks: cleanedLinks,
      isCafeOpen: settingsForm.isCafeOpen !== false,
      closedNotice: settingsForm.closedNotice?.trim() || '',
      adminId: settingsForm.adminId.trim() || '@pizza',
      adminMobile: (settingsForm.adminMobile || '9651008080').replace(
        /\D/g,
        ''
      ),
      adminPin: settingsForm.adminPin.trim() || 'Pizza@115115',
      orderCooldownSeconds: Math.max(
        0,
        Math.round(Number(settingsForm.orderCooldownSeconds ?? 120))
      ),
      highQuantityThreshold: Math.max(
        1,
        Math.round(Number(settingsForm.highQuantityThreshold ?? 10))
      ),
      loyaltyEnabled: settingsForm.loyaltyEnabled !== false,
      pointsPer100Rupees: Math.max(
        1,
        Math.round(Number(settingsForm.pointsPer100Rupees ?? 10))
      ),
      rewardThresholdPoints: Math.max(
        10,
        Math.round(Number(settingsForm.rewardThresholdPoints ?? 100))
      ),
      rewardLabel:
        settingsForm.rewardLabel?.trim() || 'Free Cold Drink or ₹30 Off',
      firstVisitSpins: Math.max(
        0,
        Math.round(Number(settingsForm.firstVisitSpins ?? 1))
      ),
      firstOrderSpins: Math.max(
        0,
        Math.round(Number(settingsForm.firstOrderSpins ?? 2))
      ),
      repeatOrderSpins: Math.max(
        0,
        Math.round(Number(settingsForm.repeatOrderSpins ?? 1))
      ),
      referralSpins: Math.max(
        0,
        Math.round(Number(settingsForm.referralSpins ?? 5))
      ),
      midTierUnlockSpend: Math.max(
        0,
        Math.round(Number(settingsForm.midTierUnlockSpend ?? 500))
      ),
      highTierUnlockSpend: Math.max(
        100,
        Math.round(Number(settingsForm.highTierUnlockSpend ?? 1000))
      ),
    };
    setSettingsForm(cleaned);
    setHomeMinInput(cleaned.homeMinOrder);
    setHomeDeliveryFeeInput(cleaned.homeDeliveryFee ?? 0);
    setHomeWaInput(cleaned.homeWhatsappNumber);
    onUpdateData({ ...data, settings: cleaned });
    flashStatus('Cafe, WhatsApp, Social & Security settings saved');
  };

  const handleAddSocialLink = () => {
    const nextLinks: SocialLinkItem[] = [
      ...(settingsForm.socialLinks || []),
      {
        id: `soc-${Date.now()}`,
        platform: 'YouTube',
        label: '@fourguyscafe',
        url: 'https://www.youtube.com',
      },
    ];
    setSettingsForm({ ...settingsForm, socialLinks: nextLinks });
  };

  const handleUpdateSocialLink = (
    id: string,
    patch: Partial<SocialLinkItem>
  ) => {
    const nextLinks = (settingsForm.socialLinks || []).map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    setSettingsForm({ ...settingsForm, socialLinks: nextLinks });
  };

  const handleMoveSocialLink = (idx: number, dir: -1 | 1) => {
    const list = [...(settingsForm.socialLinks || [])];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    setSettingsForm({ ...settingsForm, socialLinks: list });
  };

  const handleRemoveSocialLink = (id: string) => {
    const nextLinks = (settingsForm.socialLinks || []).filter(
      (item) => item.id !== id
    );
    setSettingsForm({ ...settingsForm, socialLinks: nextLinks });
  };

  // JSON Export / Import Handlers
  const formattedExportJson = JSON.stringify(data, null, 2);

  const handleDownloadJson = () => {
    const blob = new Blob([formattedExportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'four-guys-cafe-menu.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashStatus('Downloaded menu JSON');
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(formattedExportJson);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
      flashStatus('Copied JSON to clipboard');
    } catch {
      flashStatus('Copy failed — use Download JSON instead');
    }
  };

  const applyJsonString = (raw: string) => {
    setJsonError('');
    try {
      const parsed = JSON.parse(raw) as Partial<CafeStoreData>;
      if (
        !parsed ||
        !parsed.settings ||
        !Array.isArray(parsed.categories) ||
        !Array.isArray(parsed.products)
      ) {
        setJsonError(
          'Invalid format: JSON must contain settings, categories array, and products array.'
        );
        return;
      }
      const nextSettings = { ...data.settings, ...parsed.settings };
      const nextCombos: ComboSet[] = Array.isArray(parsed.combos)
        ? parsed.combos
        : data.combos;
      onUpdateData({
        settings: nextSettings,
        categories: parsed.categories,
        products: parsed.products,
        combos: nextCombos,
      });
      setSettingsForm(nextSettings);
      setHomeMinInput(nextSettings.homeMinOrder ?? 150);
      setHomeWaInput(nextSettings.homeWhatsappNumber || '');
      setHomeNoteInput(nextSettings.homeDeliveryNote || '');
      setJsonInput('');
      flashStatus('Menu JSON imported and applied');
    } catch {
      setJsonError('Could not parse JSON. Check for syntax errors.');
    }
  };

  const handleJsonFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        applyJsonString(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredAdminProducts = data.products.filter((p) => {
    if (productCategoryFilter !== 'all' && p.categoryId !== productCategoryFilter) {
      return false;
    }
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    const catName =
      data.categories.find((c) => c.id === p.categoryId)?.name.toLowerCase() || '';
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      catName.includes(q)
    );
  });

  const filteredHomeOrderProducts = data.products.filter((p) => {
    const q = homeSearch.trim().toLowerCase();
    if (!q) return true;
    const catName =
      data.categories.find((c) => c.id === p.categoryId)?.name.toLowerCase() || '';
    return p.name.toLowerCase().includes(q) || catName.includes(q);
  });

  const homeEnabledCount = data.products.filter(
    (p) => p.homeOrderEnabled !== false
  ).length;
  const totalOrdersCount = homeOrders.length + tableOrders.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Admin Panel"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-5xl h-full sm:h-auto sm:max-h-[92vh] bg-[#FAF9F6] sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-stone-900">
                Cafe Admin &amp; Analytics
              </h2>
              <p className="text-xs text-stone-500">
                Synced live with storefront &amp; browser storage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100 inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Lock</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Panel"
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Toast Bar */}
        {statusMessage && (
          <div className="px-5 py-2.5 bg-[#15803D] text-white text-xs font-semibold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Auth Gate or Dashboard */}
        {!isAuthenticated ? (
          <div className="p-6 sm:p-10 flex items-center justify-center flex-1 overflow-y-auto">
            <form
              onSubmit={handleLogin}
              className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-6 space-y-4 shadow-sm"
            >
              <div>
                <h3 className="font-display text-xl font-bold text-stone-900">
                  Admin Login
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Sign in with your Admin ID and Password to view live order feeds, Excel sheets, sales charts, PDF reports, and edit menu prices.
                </p>
              </div>

              {isLoginLocked && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#C83E2B] font-semibold flex items-center gap-2 tabular-nums">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    Login locked after failed attempts — retry in{' '}
                    {formatCooldownTime(lockRemainingSeconds)}
                  </span>
                </div>
              )}

              <div>
                <label
                  htmlFor="admin-id-input"
                  className="block text-xs font-semibold text-stone-700 mb-1.5"
                >
                  Admin ID or Mobile Number
                </label>
                <input
                  id="admin-id-input"
                  type="text"
                  autoFocus
                  required
                  disabled={isLoginLocked}
                  autoComplete="username"
                  value={adminIdInput}
                  onChange={(e) => setAdminIdInput(e.target.value)}
                  placeholder="Enter Admin ID (@pizza) or Mobile (9651008080)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 bg-stone-50 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password-input"
                  className="block text-xs font-semibold text-stone-700 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  required
                  disabled={isLoginLocked}
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter Admin Password"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 bg-stone-50 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white disabled:opacity-50"
                />
              </div>

              {authError && !isLoginLocked && (
                <p className="text-xs font-medium text-[#C83E2B] flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isLoginLocked}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-600 text-white text-sm font-semibold transition-colors tabular-nums"
              >
                {isLoginLocked
                  ? `Locked (${formatCooldownTime(lockRemainingSeconds)})`
                  : 'Sign In to Admin Panel'}
              </button>

              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 leading-relaxed">
                <div>
                  Sign in with your <span className="font-semibold text-stone-900">Admin ID</span> or{' '}
                  <span className="font-semibold text-stone-900">Mobile Number</span> and Password.
                </div>
                <div className="mt-0.5 text-stone-500">
                  Update credentials anytime inside &ldquo;Cafe &amp; WhatsApp&rdquo;.
                </div>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Quick Master Cafe Open / Closed Status Strip */}
            <div
              className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                data.settings.isCafeOpen !== false
                  ? 'bg-[#15803D]/10 border-[#15803D]/20'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <Store
                  className={`w-4 h-4 shrink-0 ${
                    data.settings.isCafeOpen !== false
                      ? 'text-[#15803D]'
                      : 'text-[#C83E2B]'
                  }`}
                />
                <span className="font-bold text-stone-900">
                  Cafe Status:{' '}
                  <span
                    className={
                      data.settings.isCafeOpen !== false
                        ? 'text-[#15803D]'
                        : 'text-[#C83E2B]'
                    }
                  >
                    {data.settings.isCafeOpen !== false
                      ? 'OPEN (Accepting Orders)'
                      : 'CLOSED (Orders Paused)'}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleToggleCafeOpen}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold text-white transition-colors ${
                  data.settings.isCafeOpen !== false
                    ? 'bg-[#C83E2B] hover:bg-[#AE3221]'
                    : 'bg-[#15803D] hover:bg-[#166534]'
                }`}
              >
                {data.settings.isCafeOpen !== false
                  ? 'Mark Cafe Closed'
                  : 'Reopen Cafe Now'}
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="px-5 pt-3 bg-white border-b border-stone-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
              {(
                [
                  ['orders', `Orders & Excel (${totalOrdersCount})`],
                  ['analytics', 'Analytics & PDF'],
                  ['combos', `Combo Manager (${data.combos.length})`],
                  ['products', `Menu & Prices (${data.products.length})`],
                  ['home-order', `Home Order Manager (${homeEnabledCount})`],
                  ['categories', `Categories (${data.categories.length})`],
                  ['community', `Reviews & Snaps (${ratings.length + vibeSnaps.length})`],
                  ['settings', 'Cafe & WhatsApp'],
                  ['json', 'Export / Import JSON'],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => {
                    setActiveTab(tabKey);
                    setEditingProduct(null);
                    setEditingCategory(null);
                  }}
                  className={`min-h-[42px] px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    activeTab === tabKey
                      ? 'border-[#C83E2B] text-[#C83E2B]'
                      : 'border-transparent text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* TAB 1: ORDERS & EXCEL SHEETS */}
              {activeTab === 'orders' && (
                <AdminOrdersAndSheetsTab
                  settings={data.settings}
                  homeOrders={homeOrders}
                  tableOrders={tableOrders}
                  referralRecords={referralRecords}
                  loyalty={loyalty}
                  onToggleHomeOrderFlag={(id) => {
                    onToggleHomeOrderFlag(id);
                    flashStatus('Updated Home Order flag status');
                  }}
                  onToggleTableOrderFlag={(id) => {
                    onToggleTableOrderFlag(id);
                    flashStatus('Updated Table Order flag status');
                  }}
                  onDeleteHomeOrder={(id) => {
                    onDeleteHomeOrder(id);
                    flashStatus('Home order log deleted');
                  }}
                  onDeleteTableOrder={(id) => {
                    onDeleteTableOrder(id);
                    flashStatus('Table order log deleted');
                  }}
                  onClearAllOrders={() => {
                    onClearAllOrders();
                    flashStatus('All order logs cleared');
                  }}
                  onConfirmManualReferral={(payload) => {
                    const res = onConfirmManualReferral(payload);
                    if (res.ok) {
                      flashStatus(res.message);
                    }
                    return res;
                  }}
                  onAdjustReferralRecord={(id, delta) => {
                    onAdjustReferralRecord(id, delta);
                    flashStatus(
                      `Adjusted referral spins (${delta > 0 ? `+${delta}` : delta})`
                    );
                  }}
                  onToggleRevokeReferral={(id) => {
                    onToggleRevokeReferral(id);
                    flashStatus('Updated referral status');
                  }}
                  onDeleteReferralRecord={(id) => {
                    onDeleteReferralRecord(id);
                    flashStatus('Referral record removed');
                  }}
                  onAdjustBrowserSpins={(delta) => {
                    onAdjustBrowserSpins(delta);
                    flashStatus(
                      `Updated browser spins (${delta > 0 ? `+${delta}` : delta})`
                    );
                  }}
                />
              )}

              {/* TAB 2: ANALYTICS & PDF */}
              {activeTab === 'analytics' && (
                <AdminAnalyticsTab
                  settings={data.settings}
                  homeOrders={homeOrders}
                  tableOrders={tableOrders}
                />
              )}

              {/* TAB 3: COMBO MANAGER */}
              {activeTab === 'combos' && (
                <AdminComboManagerTab
                  combos={data.combos}
                  products={data.products}
                  onUpdateCombos={(nextCombos) =>
                    onUpdateData({ ...data, combos: nextCombos })
                  }
                  onFlashStatus={flashStatus}
                />
              )}

              {/* TAB 4: PRODUCTS */}
              {activeTab === 'products' && (
                <>
                  {editingProduct ? (
                    <form
                      onSubmit={handleSaveProduct}
                      className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-bold text-stone-900">
                          {isNewProduct ? 'Add New Product / Variant' : 'Edit Product'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setEditingProduct(null)}
                          className="text-xs font-semibold text-stone-600 hover:text-stone-900"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Product / Variant Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={editingProduct.name}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                name: e.target.value,
                              })
                            }
                            placeholder="e.g. Pepsi - Can or Classic Margherita Pizza"
                            className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Category *
                            </label>
                            <select
                              value={editingProduct.categoryId}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  categoryId: e.target.value,
                                })
                              }
                              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                            >
                              {data.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-stone-700 mb-1">
                              Price (₹) *
                            </label>
                            <input
                              type="number"
                              min={0}
                              required
                              value={editingProduct.price}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  price: Number(e.target.value),
                                })
                              }
                              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Short Description
                        </label>
                        <textarea
                          rows={2}
                          value={editingProduct.description}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              description: e.target.value,
                            })
                          }
                          placeholder="Brief appetizing description for guests"
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex flex-wrap gap-5">
                          <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editingProduct.available !== false}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  available: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded accent-[#15803D]"
                            />
                            <span>In Stock (Available to Order)</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editingProduct.homeOrderEnabled !== false}
                              onChange={(e) =>
                                setEditingProduct({
                                  ...editingProduct,
                                  homeOrderEnabled: e.target.checked,
                                })
                              }
                              className="w-4 h-4 rounded accent-[#C83E2B]"
                            />
                            <span>Available in Home Order mode</span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Menu Highlight Badge
                          </label>
                          <select
                            value={editingProduct.highlightBadge || ''}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                highlightBadge: (e.target.value || undefined) as
                                  | HighlightBadge
                                  | undefined,
                              })
                            }
                            className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                          >
                            <option value="">Standard (No Badge)</option>
                            <option value="bestseller">🔥 Bestseller</option>
                            <option value="special">⭐ Today&apos;s Special</option>
                          </select>
                        </div>
                      </div>

                      {/* Image Upload + URL */}
                      <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="w-28 aspect-[4/3] rounded-xl overflow-hidden bg-stone-200 shrink-0">
                            <ResilientImage
                              src={editingProduct.image}
                              alt={editingProduct.name || 'Preview'}
                              fallbackLabel="Preview"
                            />
                          </div>

                          <div className="flex-1 space-y-2">
                            <label className="inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold items-center gap-2 cursor-pointer transition-colors">
                              <Upload className="w-4 h-4" />
                              <span>
                                {uploadingImage
                                  ? 'Compressing photo...'
                                  : 'Upload Photo from Device'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleProductFileUpload}
                                className="sr-only"
                              />
                            </label>

                            <div>
                              <input
                                type="text"
                                value={editingProduct.image}
                                onChange={(e) =>
                                  setEditingProduct({
                                    ...editingProduct,
                                    image: e.target.value,
                                  })
                                }
                                placeholder="Or paste image URL / Data URL"
                                className="w-full min-h-[40px] px-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                              />
                            </div>
                            {uploadError && (
                              <p className="text-xs text-[#C83E2B]">{uploadError}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(null)}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold"
                        >
                          {isNewProduct ? 'Add Product' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-1 gap-2">
                          <div className="relative flex-1">
                            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              placeholder="Search Pepsi, Red Bull, Pizza..."
                              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                            />
                          </div>

                          <select
                            value={productCategoryFilter}
                            onChange={(e) => setProductCategoryFilter(e.target.value)}
                            aria-label="Filter admin products by category"
                            className="min-h-[44px] px-3 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                          >
                            <option value="all">All Categories</option>
                            {data.categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={openCreateProduct}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Product / Variant</span>
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {filteredAdminProducts.map((product) => {
                          const catName =
                            data.categories.find((c) => c.id === product.categoryId)
                              ?.name || 'Uncategorized';
                          const inStock = product.available !== false;
                          return (
                            <div
                              key={product.id}
                              className="p-3 rounded-2xl bg-white border border-stone-200/80 flex flex-col sm:flex-row sm:items-center gap-3"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-16 h-12 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                                  <ResilientImage
                                    src={product.image}
                                    alt={product.name}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium text-stone-500">
                                    {catName}
                                    {product.homeOrderEnabled !== false && ' · Home Order'}
                                  </div>
                                  <h4 className="font-semibold text-sm text-stone-900 truncate">
                                    {product.name}
                                  </h4>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                                {/* Highlight Badge Toggle (None -> 🔥 Bestseller -> ⭐ Today's Special) */}
                                <button
                                  type="button"
                                  onClick={() => handleCycleProductBadge(product.id)}
                                  title="Click to cycle: Standard → 🔥 Bestseller → ⭐ Today's Special"
                                  className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                                    product.highlightBadge === 'bestseller'
                                      ? 'bg-amber-100 border-amber-300 text-amber-950'
                                      : product.highlightBadge === 'special'
                                      ? 'bg-[#C83E2B]/10 border-[#C83E2B]/30 text-[#C83E2B]'
                                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                                  }`}
                                >
                                  {product.highlightBadge === 'bestseller'
                                    ? '🔥 Bestseller'
                                    : product.highlightBadge === 'special'
                                    ? "⭐ Today's Special"
                                    : '☆ Mark Badge'}
                                </button>

                                {/* In Stock / Out of Stock Toggle */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleStock(product.id)}
                                  className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                                    inStock
                                      ? 'bg-[#15803D]/10 border-[#15803D]/30 text-[#15803D]'
                                      : 'bg-red-50 border-red-200 text-[#C83E2B]'
                                  }`}
                                >
                                  {inStock ? 'In Stock' : 'Out of Stock'}
                                </button>

                                {/* Quick Price Stepper (-5 / input / +5) */}
                                <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-50">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickPriceDelta(product.id, -5)
                                    }
                                    aria-label={`Decrease price of ${product.name} by ₹5`}
                                    className="px-2.5 h-9 flex items-center justify-center gap-0.5 text-xs font-semibold text-stone-700 hover:bg-stone-200/70 rounded-l-xl"
                                  >
                                    <Minus className="w-3 h-3" />
                                    <span>5</span>
                                  </button>
                                  <div className="flex items-center px-1.5 border-x border-stone-200 bg-white h-9">
                                    <span className="text-xs font-semibold text-stone-500 mr-0.5">
                                      ₹
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      aria-label={`Price for ${product.name}`}
                                      value={product.price}
                                      onChange={(e) =>
                                        handleExactPriceChange(
                                          product.id,
                                          e.target.value
                                        )
                                      }
                                      className="w-12 text-center text-xs font-bold text-stone-900 tabular-nums focus:outline-none"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuickPriceDelta(product.id, 5)
                                    }
                                    aria-label={`Increase price of ${product.name} by ₹5`}
                                    className="px-2.5 h-9 flex items-center justify-center gap-0.5 text-xs font-semibold text-stone-700 hover:bg-stone-200/70 rounded-r-xl"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>5</span>
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => openEditProduct(product)}
                                  aria-label={`Edit ${product.name}`}
                                  className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-100 inline-flex items-center gap-1 text-xs font-semibold"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>

                                {deleteProductId === product.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteProduct(product.id)
                                      }
                                      className="min-h-[40px] px-2.5 rounded-xl bg-[#C83E2B] text-white text-xs font-semibold"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteProductId(null)}
                                      className="min-h-[40px] px-2 rounded-xl text-xs text-stone-500 hover:bg-stone-100"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteProductId(product.id)}
                                    aria-label={`Delete ${product.name}`}
                                    className="min-w-[40px] min-h-[40px] rounded-xl text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* TAB 4: DEDICATED HOME ORDER MANAGER */}
              {activeTab === 'home-order' && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleSaveHomeOrderSettings}
                    className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-[#C83E2B]" />
                      <h3 className="font-display text-base font-bold text-stone-900">
                        Home Order Rules, Prep Note &amp; WhatsApp Routing
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label
                          htmlFor="home-min-order-input"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Minimum Home Order (₹) *
                        </label>
                        <input
                          id="home-min-order-input"
                          type="number"
                          min={0}
                          required
                          value={homeMinInput}
                          onChange={(e) => setHomeMinInput(Number(e.target.value))}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          Default is ₹150.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="home-delivery-fee-input"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Home Delivery Fee (₹)
                        </label>
                        <input
                          id="home-delivery-fee-input"
                          type="number"
                          min={0}
                          value={homeDeliveryFeeInput}
                          onChange={(e) =>
                            setHomeDeliveryFeeInput(
                              Math.max(0, Math.round(Number(e.target.value) || 0))
                            )
                          }
                          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          ₹0 = Free delivery.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="home-wa-input"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Dedicated WhatsApp (Optional)
                        </label>
                        <input
                          id="home-wa-input"
                          type="text"
                          value={homeWaInput}
                          onChange={(e) => setHomeWaInput(e.target.value)}
                          placeholder={`Main (${data.settings.whatsappNumber})`}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 bg-stone-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#15803D] focus:bg-white"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          Active:{' '}
                          <span className="font-mono text-stone-700">
                            {homeWaInput.trim()
                              ? sanitizeWhatsappNumber(homeWaInput)
                              : sanitizeWhatsappNumber(data.settings.whatsappNumber)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="home-prep-note-input"
                        className="block text-xs font-semibold text-stone-700 mb-1"
                      >
                        Prep / Delivery Note (shown in Home Order mode)
                      </label>
                      <input
                        id="home-prep-note-input"
                        type="text"
                        value={homeNoteInput}
                        onChange={(e) => setHomeNoteInput(e.target.value)}
                        placeholder="e.g. Freshly prepared (20–30 mins). No Return Policy applies."
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-xs sm:text-sm font-semibold"
                      >
                        Save Home Order Settings
                      </button>
                    </div>
                  </form>

                  {/* Product Home-Order Availability Toggles */}
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-base font-bold text-stone-900">
                          Available Products in Home Order ({homeEnabledCount}/{data.products.length})
                        </h3>
                        <p className="text-xs text-stone-600 mt-0.5">
                          Toggle which menu items appear when customers select Home Order.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEnableAllHomeOrder(true)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-800"
                        >
                          Enable All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEnableAllHomeOrder(false)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-600"
                        >
                          Disable All
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={homeSearch}
                        onChange={(e) => setHomeSearch(e.target.value)}
                        placeholder="Filter items to toggle for Home Order..."
                        className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div className="divide-y divide-stone-100 border border-stone-200/80 rounded-xl overflow-hidden">
                      {filteredHomeOrderProducts.map((product) => {
                        const enabled = product.homeOrderEnabled !== false;
                        const catName =
                          data.categories.find((c) => c.id === product.categoryId)
                            ?.name || '';
                        return (
                          <label
                            key={product.id}
                            className="flex items-center justify-between gap-3 p-3 bg-white hover:bg-stone-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-9 rounded-lg overflow-hidden bg-stone-100 shrink-0">
                                <ResilientImage
                                  src={product.image}
                                  alt={product.name}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-stone-900 truncate">
                                  {product.name}
                                </div>
                                <div className="text-xs text-stone-500 tabular-nums">
                                  {catName} · ₹{product.price}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span
                                className={`text-xs font-semibold ${
                                  enabled ? 'text-[#15803D]' : 'text-stone-400'
                                }`}
                              >
                                {enabled ? 'Visible' : 'Hidden'}
                              </span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => handleToggleHomeOrderItem(product.id)}
                                className="w-5 h-5 rounded accent-[#15803D] cursor-pointer"
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Combo Home-Order Availability Toggles */}
                  {(data.combos || []).length > 0 && (
                    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
                      <div>
                        <h3 className="font-display text-base font-bold text-stone-900">
                          Available Combo Sets in Home Order (
                          {
                            (data.combos || []).filter(
                              (c) => c.homeOrderEnabled !== false
                            ).length
                          }
                          /{(data.combos || []).length})
                        </h3>
                        <p className="text-xs text-stone-600 mt-0.5">
                          Toggle which Combo Sets appear when customers select Home Order.
                        </p>
                      </div>

                      <div className="divide-y divide-stone-100 border border-stone-200/80 rounded-xl overflow-hidden">
                        {(data.combos || []).map((combo) => {
                          const enabled = combo.homeOrderEnabled !== false;
                          return (
                            <label
                              key={combo.id}
                              className="flex items-center justify-between gap-3 p-3 bg-white hover:bg-stone-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-12 h-9 rounded-lg overflow-hidden bg-stone-100 shrink-0">
                                  <ResilientImage
                                    src={combo.image}
                                    alt={combo.name}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-stone-900 truncate">
                                    {combo.name}
                                  </div>
                                  <div className="text-xs text-stone-500 tabular-nums truncate">
                                    Combo · ₹{combo.price} ·{' '}
                                    {combo.items
                                      .map((i) => `${i.quantity}x ${i.name}`)
                                      .join(', ')}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span
                                  className={`text-xs font-semibold ${
                                    enabled ? 'text-[#15803D]' : 'text-stone-400'
                                  }`}
                                >
                                  {enabled ? 'Visible' : 'Hidden'}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() =>
                                    handleToggleHomeOrderCombo(combo.id)
                                  }
                                  className="w-5 h-5 rounded accent-[#15803D] cursor-pointer"
                                />
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: CATEGORIES */}
              {activeTab === 'categories' && (
                <>
                  {editingCategory ? (
                    <form
                      onSubmit={handleSaveCategory}
                      className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-lg font-bold text-stone-900">
                          {isNewCategory ? 'Add Category' : 'Edit Category'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setEditingCategory(null)}
                          className="text-xs font-semibold text-stone-600 hover:text-stone-900"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Category Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={editingCategory.name}
                            onChange={(e) =>
                              setEditingCategory({
                                ...editingCategory,
                                name: e.target.value,
                              })
                            }
                            placeholder="e.g. Momos & Rolls"
                            className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Subtitle
                          </label>
                          <input
                            type="text"
                            value={editingCategory.subtitle}
                            onChange={(e) =>
                              setEditingCategory({
                                ...editingCategory,
                                subtitle: e.target.value,
                              })
                            }
                            placeholder="e.g. Steamed & crispy cafe specials"
                            className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="w-28 aspect-[4/3] rounded-xl overflow-hidden bg-stone-200 shrink-0">
                            <ResilientImage
                              src={editingCategory.image}
                              alt={editingCategory.name || 'Category Preview'}
                              fallbackLabel="Preview"
                            />
                          </div>

                          <div className="flex-1 space-y-2">
                            <label className="inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold items-center gap-2 cursor-pointer">
                              <Upload className="w-4 h-4" />
                              <span>
                                {uploadingImage
                                  ? 'Compressing photo...'
                                  : 'Upload Category Image'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleCategoryFileUpload}
                                className="sr-only"
                              />
                            </label>

                            <input
                              type="text"
                              value={editingCategory.image}
                              onChange={(e) =>
                                setEditingCategory({
                                  ...editingCategory,
                                  image: e.target.value,
                                })
                              }
                              placeholder="Or paste image URL / Data URL"
                              className="w-full min-h-[40px] px-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCategory(null)}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold"
                        >
                          {isNewCategory ? 'Create Category' : 'Save Category'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-stone-600">
                          Categories appear as layered stack cards at the top of your menu.
                        </p>
                        <button
                          type="button"
                          onClick={openCreateCategory}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Category</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {data.categories.map((cat) => {
                          const count = data.products.filter(
                            (p) => p.categoryId === cat.id
                          ).length;
                          return (
                            <div
                              key={cat.id}
                              className="p-3 rounded-2xl bg-white border border-stone-200/80 flex items-center gap-3"
                            >
                              <div className="w-16 h-12 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                                <ResilientImage src={cat.image} alt={cat.name} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm text-stone-900 truncate">
                                  {cat.name}
                                </h4>
                                <p className="text-xs text-stone-500 tabular-nums">
                                  {count} {count === 1 ? 'item' : 'items'}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditCategory(cat)}
                                  aria-label={`Edit ${cat.name}`}
                                  className="min-w-[40px] min-h-[40px] rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-100 flex items-center justify-center"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {deleteCategoryId === cat.id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCategory(cat.id)}
                                    className="min-h-[40px] px-2.5 rounded-xl bg-[#C83E2B] text-white text-xs font-semibold"
                                  >
                                    Confirm
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteCategoryId(cat.id)}
                                    aria-label={`Delete ${cat.name}`}
                                    className="min-w-[40px] min-h-[40px] rounded-xl text-stone-400 hover:text-[#C83E2B] hover:bg-red-50 flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* TAB: REVIEWS & VIBE SNAPS MODERATION */}
              {activeTab === 'community' && (
                <AdminCommunityModerationTab
                  ratings={ratings}
                  vibeSnaps={vibeSnaps}
                  onDeleteRating={(id) => {
                    onDeleteRating(id);
                    flashStatus('Review deleted');
                  }}
                  onRestoreStarterRatings={() => {
                    onRestoreStarterRatings();
                    flashStatus('Starter sample reviews restored');
                  }}
                  onDeleteSnap={(id) => {
                    onDeleteSnap(id);
                    flashStatus('Vibe Wall snap deleted');
                  }}
                  onClearAllSnaps={() => {
                    onClearAllSnaps();
                    flashStatus('All Vibe Wall snaps cleared');
                  }}
                />
              )}

              {/* TAB 6: CAFE & WHATSAPP SETTINGS */}
              {activeTab === 'settings' && (
                <form
                  onSubmit={handleSaveSettings}
                  className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Main WhatsApp Order Number (with country code) *
                      </label>
                      <input
                        type="text"
                        required
                        value={settingsForm.whatsappNumber}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            whatsappNumber: e.target.value,
                          })
                        }
                        placeholder="919651008080"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#15803D] focus:bg-white"
                      />
                      <p className="text-[11px] text-stone-500 mt-1">
                        Orders redirect to{' '}
                        <span className="font-mono text-stone-700">
                          wa.me/{sanitizeWhatsappNumber(settingsForm.whatsappNumber)}
                        </span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Admin Login ID *
                      </label>
                      <input
                        type="text"
                        required
                        value={settingsForm.adminId}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            adminId: e.target.value,
                          })
                        }
                        placeholder="@pizza"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Admin Login Mobile Number
                      </label>
                      <input
                        type="tel"
                        value={settingsForm.adminMobile || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            adminMobile: e.target.value,
                          })
                        }
                        placeholder="9651008080"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Admin Password *
                      </label>
                      <input
                        type="text"
                        required
                        value={settingsForm.adminPin}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            adminPin: e.target.value,
                          })
                        }
                        placeholder="Admin password"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Cafe Name
                      </label>
                      <input
                        type="text"
                        required
                        value={settingsForm.cafeName}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            cafeName: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Tagline
                      </label>
                      <input
                        type="text"
                        value={settingsForm.tagline}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            tagline: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Opening Hours
                      </label>
                      <input
                        type="text"
                        value={settingsForm.timings}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            timings: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Contact Email
                      </label>
                      <input
                        type="email"
                        value={settingsForm.email}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            email: e.target.value,
                          })
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Cafe Address
                    </label>
                    <input
                      type="text"
                      value={settingsForm.location}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          location: e.target.value,
                        })
                      }
                      className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                    />
                  </div>

                  {/* Cafe Open / Closed Master Switch */}
                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-[#C83E2B]" />
                          <span>Cafe Open / Closed Status</span>
                        </div>
                        <p className="text-[11px] text-stone-600 mt-0.5">
                          When closed, the storefront displays a &ldquo;Cafe Currently Closed&rdquo; banner and disables WhatsApp order submission.
                        </p>
                      </div>

                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          checked={settingsForm.isCafeOpen !== false}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              isCafeOpen: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded accent-[#15803D]"
                        />
                        <span
                          className={
                            settingsForm.isCafeOpen !== false
                              ? 'text-[#15803D]'
                              : 'text-[#C83E2B]'
                          }
                        >
                          {settingsForm.isCafeOpen !== false
                            ? 'Cafe is OPEN'
                            : 'Cafe is CLOSED'}
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-stone-700 mb-1">
                        Custom Closed Message (shown when Closed)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.closedNotice || ''}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            closedNotice: e.target.value,
                          })
                        }
                        placeholder="e.g. Closed for today — opens tomorrow at 11:00 AM!"
                        className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                      />
                    </div>
                  </div>

                  {/* Anti-Spam & Order Security Settings */}
                  <div className="pt-3 border-t border-stone-100 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 uppercase tracking-wider">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#C83E2B]" />
                      <span>Anti-Fake Order &amp; Security Controls</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Home Order Cooldown Timer (seconds)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={900}
                          value={settingsForm.orderCooldownSeconds ?? 120}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              orderCooldownSeconds: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          Applies to Home Orders only (Dine-In Table Orders send anytime without waiting). Set 0 to disable.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          High-Quantity Flag Threshold (units)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={settingsForm.highQuantityThreshold ?? 10}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              highQuantityThreshold: Math.max(
                                1,
                                Math.round(Number(e.target.value) || 10)
                              ),
                            })
                          }
                          className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                        <p className="text-[11px] text-stone-500 mt-1">
                          Orders with &gt;this quantity of any item are flagged for manual review.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cafe Points & Loyalty Settings */}
                  <div className="pt-3 border-t border-stone-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 uppercase tracking-wider">
                        <Gift className="w-3.5 h-3.5 text-[#C83E2B]" />
                        <span>Cafe Points &amp; Loyalty Tier</span>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settingsForm.loyaltyEnabled !== false}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              loyaltyEnabled: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded accent-[#15803D]"
                        />
                        <span>Enabled</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Points per ₹100
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={settingsForm.pointsPer100Rupees ?? 10}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              pointsPer100Rupees: Math.max(
                                1,
                                Math.round(Number(e.target.value) || 10)
                              ),
                            })
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Reward Threshold (pts)
                        </label>
                        <input
                          type="number"
                          min={10}
                          value={settingsForm.rewardThresholdPoints ?? 100}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              rewardThresholdPoints: Math.max(
                                10,
                                Math.round(Number(e.target.value) || 100)
                              ),
                            })
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Reward Offer Label
                        </label>
                        <input
                          type="text"
                          value={
                            settingsForm.rewardLabel ||
                            'Free Cold Drink or ₹30 Off'
                          }
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              rewardLabel: e.target.value,
                            })
                          }
                          className="w-full min-h-[42px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          1st Visit Spins
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={settingsForm.firstVisitSpins ?? 1}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              firstVisitSpins: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          1st Order Spins
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={settingsForm.firstOrderSpins ?? 2}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              firstOrderSpins: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Next Order Spins
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={settingsForm.repeatOrderSpins ?? 1}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              repeatOrderSpins: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          Refer Spin Bonus
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={25}
                          value={settingsForm.referralSpins ?? 5}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              referralSpins: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          25/35-Pt Unlock Spend (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={settingsForm.midTierUnlockSpend ?? 500}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              midTierUnlockSpend: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">
                          100-Pt Unlock Spend (₹)
                        </label>
                        <input
                          type="number"
                          min={100}
                          step={100}
                          value={settingsForm.highTierUnlockSpend ?? 1000}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              highTierUnlockSpend: Math.max(
                                100,
                                Math.round(Number(e.target.value) || 1000)
                              ),
                            })
                          }
                          className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Social / Platform Links Manager */}
                  <div className="pt-3 border-t border-stone-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 uppercase tracking-wider">
                        <Link2 className="w-3.5 h-3.5 text-[#C83E2B]" />
                        <span>Social &amp; Platform Links</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSocialLink}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Link</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {(settingsForm.socialLinks || []).map((link, idx) => (
                        <div
                          key={link.id}
                          className="p-3 rounded-xl border border-stone-200 bg-stone-50/70 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                        >
                          <input
                            type="text"
                            value={link.platform}
                            onChange={(e) =>
                              handleUpdateSocialLink(link.id, {
                                platform: e.target.value,
                              })
                            }
                            placeholder="Platform (e.g. YouTube)"
                            className="sm:col-span-3 min-h-[38px] px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={link.label}
                            onChange={(e) =>
                              handleUpdateSocialLink(link.id, {
                                label: e.target.value,
                              })
                            }
                            placeholder="Display Handle / Label"
                            className="sm:col-span-3 min-h-[38px] px-2.5 rounded-lg border border-stone-200 bg-white text-xs"
                          />
                          <input
                            type="url"
                            value={link.url}
                            onChange={(e) =>
                              handleUpdateSocialLink(link.id, {
                                url: e.target.value,
                              })
                            }
                            placeholder="https://..."
                            className="sm:col-span-4 min-h-[38px] px-2.5 rounded-lg border border-stone-200 bg-white text-xs"
                          />
                          <div className="sm:col-span-2 flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveSocialLink(idx, -1)}
                              aria-label="Move link up"
                              className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={
                                idx === (settingsForm.socialLinks || []).length - 1
                              }
                              onClick={() => handleMoveSocialLink(idx, 1)}
                              aria-label="Move link down"
                              className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-200 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSocialLink(link.id)}
                              aria-label={`Remove ${link.platform}`}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {!confirmReset ? (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(true)}
                        className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-[#C83E2B] hover:bg-red-50 inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Menu to Defaults</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-stone-700 font-medium">
                          Restore original Bilhaur menu?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onResetDefaults();
                            setConfirmReset(false);
                            flashStatus('Restored default menu');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#C83E2B] text-white font-semibold"
                        >
                          Yes, Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReset(false)}
                          className="px-2 py-1.5 text-stone-500 hover:text-stone-800"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold"
                    >
                      Save Settings
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 7: EXPORT / IMPORT JSON */}
              {activeTab === 'json' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
                    <h3 className="font-display text-base font-bold text-stone-900">
                      Backup &amp; GitHub Pages Sync
                    </h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Changes made here are saved immediately in this browser. To make your updated menu, prices, Home Order toggles, and WhatsApp number live for every visitor on GitHub Pages, export this JSON and update <span className="font-mono text-stone-800">src/data/defaultMenu.ts</span> in your repository, or import a saved JSON backup anytime.
                    </p>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download JSON Backup</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyJson}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs font-semibold inline-flex items-center gap-2"
                      >
                        {copiedJson ? (
                          <>
                            <Check className="w-4 h-4 text-[#15803D]" />
                            <span>Copied JSON</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy JSON</span>
                          </>
                        )}
                      </button>

                      <label className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span>Import .json File</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={handleJsonFileUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
                    <h3 className="font-display text-base font-bold text-stone-900">
                      Paste Menu JSON to Import
                    </h3>
                    <textarea
                      rows={6}
                      value={jsonInput}
                      onChange={(e) => setJsonInput(e.target.value)}
                      placeholder="Paste exported FOUR GUYS CAFE JSON here..."
                      className="w-full p-3 rounded-xl border border-stone-200 bg-stone-50 font-mono text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
                    />
                    {jsonError && (
                      <p className="text-xs font-medium text-[#C83E2B]">
                        {jsonError}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!jsonInput.trim()}
                        onClick={() => applyJsonString(jsonInput)}
                        className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C83E2B] disabled:opacity-40 hover:bg-[#AE3221] text-white text-xs font-semibold"
                      >
                        Apply Imported JSON
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
