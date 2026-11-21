import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Plus,
  Minus,
  Pencil,
  Trash2,
  Upload,
  Search,
  Layers,
  X,
} from 'lucide-react';
import type {
  ComboItemEntry,
  ComboSet,
  HighlightBadge,
  Product,
} from '../types';
import { compressImageFileToDataUrl } from '../utils/imageUpload';
import { ResilientImage } from './ResilientImage';

interface AdminComboManagerTabProps {
  combos: ComboSet[];
  products: Product[];
  onUpdateCombos: (nextCombos: ComboSet[]) => void;
  onFlashStatus: (msg: string) => void;
}

export function AdminComboManagerTab({
  combos,
  products,
  onUpdateCombos,
  onFlashStatus,
}: AdminComboManagerTabProps) {
  const [search, setSearch] = useState('');
  const [editingCombo, setEditingCombo] = useState<ComboSet | null>(null);
  const [isNewCombo, setIsNewCombo] = useState(false);
  const [deleteComboId, setDeleteComboId] = useState<string | null>(null);
  const [selectedAddProductId, setSelectedAddProductId] = useState<string>(
    products[0]?.id || ''
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const openCreateCombo = () => {
    const firstProd = products[0];
    const secondProd = products.find((p) => p.id === 'prod-coke-40') || products[1];
    const initialItems: ComboItemEntry[] = [];
    if (firstProd) {
      initialItems.push({
        productId: firstProd.id,
        name: firstProd.name,
        quantity: 1,
        unitPrice: firstProd.price,
      });
    }
    if (secondProd && secondProd.id !== firstProd?.id) {
      initialItems.push({
        productId: secondProd.id,
        name: secondProd.name,
        quantity: 1,
        unitPrice: secondProd.price,
      });
    }
    const sumVal = initialItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    setIsNewCombo(true);
    setUploadError('');
    setSelectedAddProductId(products[0]?.id || '');
    setEditingCombo({
      id: `combo-${Date.now()}`,
      name: '',
      description: '',
      price: Math.max(50, sumVal - 10),
      originalPrice: sumVal || undefined,
      image: firstProd?.image || '',
      items: initialItems,
      available: true,
      dineInEnabled: true,
      homeOrderEnabled: true,
    });
  };

  const openEditCombo = (combo: ComboSet) => {
    setIsNewCombo(false);
    setUploadError('');
    setSelectedAddProductId(products[0]?.id || '');
    setEditingCombo({
      ...combo,
      available: combo.available !== false,
      dineInEnabled: combo.dineInEnabled !== false,
      homeOrderEnabled: combo.homeOrderEnabled !== false,
      items: combo.items.map((i) => ({ ...i })),
    });
  };

  const handleComboFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCombo) return;
    setUploadingImage(true);
    setUploadError('');
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      setEditingCombo({ ...editingCombo, image: dataUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleAddItemToEditingCombo = () => {
    if (!editingCombo) return;
    const prod =
      products.find((p) => p.id === selectedAddProductId) || products[0];
    if (!prod) return;

    const existing = editingCombo.items.find((i) => i.productId === prod.id);
    if (existing) {
      setEditingCombo({
        ...editingCombo,
        items: editingCombo.items.map((i) =>
          i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      setEditingCombo({
        ...editingCombo,
        items: [
          ...editingCombo.items,
          {
            productId: prod.id,
            name: prod.name,
            quantity: 1,
            unitPrice: prod.price,
          },
        ],
      });
    }
  };

  const handleChangeComboItemQty = (index: number, nextQty: number) => {
    if (!editingCombo) return;
    if (nextQty <= 0) {
      setEditingCombo({
        ...editingCombo,
        items: editingCombo.items.filter((_, idx) => idx !== index),
      });
      return;
    }
    setEditingCombo({
      ...editingCombo,
      items: editingCombo.items.map((item, idx) =>
        idx === index ? { ...item, quantity: nextQty } : item
      ),
    });
  };

  const handleSwapComboItem = (index: number, newProductId: string) => {
    if (!editingCombo) return;
    const newProd = products.find((p) => p.id === newProductId);
    if (!newProd) return;

    setEditingCombo({
      ...editingCombo,
      items: editingCombo.items.map((item, idx) =>
        idx === index
          ? {
              productId: newProd.id,
              name: newProd.name,
              quantity: item.quantity,
              unitPrice: newProd.price,
            }
          : item
      ),
    });
  };

  const handleRemoveComboItem = (index: number) => {
    if (!editingCombo) return;
    setEditingCombo({
      ...editingCombo,
      items: editingCombo.items.filter((_, idx) => idx !== index),
    });
  };

  const handleSaveCombo = (e: FormEvent) => {
    e.preventDefault();
    if (!editingCombo) return;
    const cleanName = editingCombo.name.trim();
    if (!cleanName) return;

    const itemsTotal = editingCombo.items.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0
    );
    const cleanedPrice = Math.max(0, Number(editingCombo.price) || 0);
    const cleanedOriginal =
      editingCombo.originalPrice && editingCombo.originalPrice > cleanedPrice
        ? Number(editingCombo.originalPrice)
        : itemsTotal > cleanedPrice
        ? itemsTotal
        : undefined;

    const normalized: ComboSet = {
      ...editingCombo,
      name: cleanName,
      description: editingCombo.description.trim(),
      price: cleanedPrice,
      originalPrice: cleanedOriginal,
      image:
        editingCombo.image.trim() ||
        products.find((p) => p.id === editingCombo.items[0]?.productId)?.image ||
        '',
      available: editingCombo.available !== false,
      dineInEnabled: editingCombo.dineInEnabled !== false,
      homeOrderEnabled: Boolean(editingCombo.homeOrderEnabled),
    };

    const nextCombos = isNewCombo
      ? [normalized, ...combos]
      : combos.map((c) => (c.id === normalized.id ? normalized : c));

    onUpdateCombos(nextCombos);
    setEditingCombo(null);
    onFlashStatus(isNewCombo ? 'Combo Set created' : 'Combo Set updated');
  };

  const handleQuickComboPriceDelta = (comboId: string, delta: number) => {
    const nextCombos = combos.map((c) =>
      c.id === comboId ? { ...c, price: Math.max(1, c.price + delta) } : c
    );
    onUpdateCombos(nextCombos);
    onFlashStatus('Combo price updated');
  };

  const handleExactComboPrice = (comboId: string, rawVal: string) => {
    const numeric = Math.max(0, Math.round(Number(rawVal) || 0));
    const nextCombos = combos.map((c) =>
      c.id === comboId ? { ...c, price: numeric } : c
    );
    onUpdateCombos(nextCombos);
  };

  const handleToggleComboStock = (comboId: string) => {
    const nextCombos = combos.map((c) =>
      c.id === comboId ? { ...c, available: !(c.available !== false) } : c
    );
    onUpdateCombos(nextCombos);
    onFlashStatus('Combo stock status updated');
  };

  const handleCycleComboBadge = (comboId: string) => {
    const nextCombos = combos.map((c) => {
      if (c.id !== comboId) return c;
      const nextBadge: HighlightBadge | undefined =
        !c.highlightBadge
          ? 'bestseller'
          : c.highlightBadge === 'bestseller'
          ? 'special'
          : undefined;
      return { ...c, highlightBadge: nextBadge };
    });
    onUpdateCombos(nextCombos);
    onFlashStatus('Combo highlight badge updated');
  };

  const handleDeleteCombo = (comboId: string) => {
    onUpdateCombos(combos.filter((c) => c.id !== comboId));
    setDeleteComboId(null);
    onFlashStatus('Combo Set deleted');
  };

  const filteredCombos = combos.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.items.some((i) => i.name.toLowerCase().includes(q))
    );
  });

  if (editingCombo) {
    const individualTotal = editingCombo.items.reduce(
      (s, i) => s + i.unitPrice * i.quantity,
      0
    );

    return (
      <form
        onSubmit={handleSaveCombo}
        className="bg-white rounded-2xl border border-stone-200 p-5 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#C83E2B]" />
            <h3 className="font-display text-lg font-bold text-stone-900">
              {isNewCombo ? 'Create New Combo Set' : 'Edit Combo Set'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setEditingCombo(null)}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            Cancel
          </button>
        </div>

        {/* Name, Combo Price & Original Value */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Combo Name *
            </label>
            <input
              type="text"
              required
              value={editingCombo.name}
              onChange={(e) =>
                setEditingCombo({ ...editingCombo, name: e.target.value })
              }
              placeholder="e.g. Pizza + Cold Drink Combo"
              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Combo Price (₹) *
            </label>
            <input
              type="number"
              min={0}
              required
              value={editingCombo.price}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  price: Number(e.target.value),
                })
              }
              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Original Value (₹)
            </label>
            <input
              type="number"
              min={0}
              value={editingCombo.originalPrice ?? ''}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  originalPrice: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder={String(individualTotal || '')}
              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
            />
          </div>
        </div>

        {/* Description & Highlight Badge */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Short Description
            </label>
            <textarea
              rows={2}
              value={editingCombo.description}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  description: e.target.value,
                })
              }
              placeholder="Brief description of what's inside this combo deal"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Menu Highlight Badge
            </label>
            <select
              value={editingCombo.highlightBadge || ''}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  highlightBadge: (e.target.value || undefined) as
                    | HighlightBadge
                    | undefined,
                })
              }
              className="w-full min-h-[44px] px-3 rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B] focus:bg-white"
            >
              <option value="">Standard (No Badge)</option>
              <option value="bestseller">🔥 Bestseller</option>
              <option value="special">⭐ Today&apos;s Special</option>
            </select>
            <p className="text-[11px] text-stone-500 mt-1">
              Featured combos automatically rise to the top.
            </p>
          </div>
        </div>

        {/* Availability Toggles */}
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={editingCombo.available !== false}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
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
              checked={editingCombo.dineInEnabled !== false}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  dineInEnabled: e.target.checked,
                })
              }
              className="w-4 h-4 rounded accent-stone-900"
            />
            <span>Show in Dine-In Menu</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={editingCombo.homeOrderEnabled !== false}
              onChange={(e) =>
                setEditingCombo({
                  ...editingCombo,
                  homeOrderEnabled: e.target.checked,
                })
              }
              className="w-4 h-4 rounded accent-[#C83E2B]"
            />
            <span>Available in Home Order mode</span>
          </label>
        </div>

        {/* Included Items Builder (Add / Remove / Swap / Qty) */}
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-display text-sm font-bold text-stone-900">
                Included Items in This Combo ({editingCombo.items.length})
              </h4>
              <p className="text-xs text-stone-600 tabular-nums">
                Individual items value: <span className="font-semibold text-stone-900">₹{individualTotal}</span> · Combo Price:{' '}
                <span className="font-semibold text-[#C83E2B]">₹{editingCombo.price || 0}</span>
              </p>
            </div>
            {individualTotal > 0 && (
              <button
                type="button"
                onClick={() =>
                  setEditingCombo({
                    ...editingCombo,
                    originalPrice: individualTotal,
                  })
                }
                className="text-xs font-semibold text-[#C83E2B] hover:underline self-start sm:self-auto"
              >
                Set Original Value to ₹{individualTotal}
              </button>
            )}
          </div>

          {/* Current Items List */}
          {editingCombo.items.length === 0 ? (
            <div className="p-4 rounded-xl bg-white border border-dashed border-stone-300 text-center text-xs text-stone-500">
              No items inside this combo yet. Pick a menu item below to add it.
            </div>
          ) : (
            <div className="space-y-2">
              {editingCombo.items.map((item, idx) => (
                <div
                  key={`${item.productId}-${idx}`}
                  className="p-3 rounded-xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-stone-900 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-stone-500 tabular-nums">
                      ₹{item.unitPrice} each · Subtotal ₹{item.unitPrice * item.quantity}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Swap Item Select */}
                    <select
                      aria-label={`Swap ${item.name}`}
                      value={item.productId}
                      onChange={(e) => handleSwapComboItem(idx, e.target.value)}
                      className="min-h-[36px] max-w-[180px] px-2.5 rounded-lg border border-stone-200 bg-stone-50 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                    >
                      {!products.some((p) => p.id === item.productId) && (
                        <option value={item.productId}>{item.name}</option>
                      )}
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          Swap: {p.name} (₹{p.price})
                        </option>
                      ))}
                    </select>

                    {/* Quantity Stepper */}
                    <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50">
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeComboItemQty(idx, item.quantity - 1)
                        }
                        aria-label={`Decrease ${item.name}`}
                        className="w-8 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-200/60 rounded-l-lg"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleChangeComboItemQty(idx, item.quantity + 1)
                        }
                        aria-label={`Increase ${item.name}`}
                        className="w-8 h-9 flex items-center justify-center text-stone-700 hover:bg-stone-200/60 rounded-r-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Remove Specific Item (e.g. remove Coke/Cold Drink) */}
                    <button
                      type="button"
                      onClick={() => handleRemoveComboItem(idx)}
                      aria-label={`Remove ${item.name} from combo`}
                      title="Remove item from combo"
                      className="min-w-[36px] min-h-[36px] px-2.5 rounded-lg border border-red-200 bg-red-50/70 text-[#C83E2B] hover:bg-red-100 inline-flex items-center gap-1 text-xs font-semibold"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Item to Combo Bar */}
          <div className="pt-1 flex flex-col sm:flex-row gap-2">
            <select
              value={selectedAddProductId}
              onChange={(e) => setSelectedAddProductId(e.target.value)}
              aria-label="Choose menu item to add to combo"
              className="flex-1 min-h-[42px] px-3 rounded-xl border border-stone-300 bg-white text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{p.price}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddItemToEditingCombo}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item to Combo</span>
            </button>
          </div>
        </div>

        {/* Combo Photo Upload / URL */}
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-28 aspect-[4/3] rounded-xl overflow-hidden bg-stone-200 shrink-0">
              <ResilientImage
                src={editingCombo.image}
                alt={editingCombo.name || 'Combo Preview'}
                fallbackLabel="Combo"
              />
            </div>

            <div className="flex-1 space-y-2">
              <label className="inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold items-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>
                  {uploadingImage
                    ? 'Compressing photo...'
                    : 'Upload Combo Photo from Device'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleComboFileUpload}
                  className="sr-only"
                />
              </label>

              <input
                type="text"
                value={editingCombo.image}
                onChange={(e) =>
                  setEditingCombo({ ...editingCombo, image: e.target.value })
                }
                placeholder="Or paste combo image URL / Data URL"
                className="w-full min-h-[40px] px-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
              />
              {uploadError && (
                <p className="text-xs text-[#C83E2B]">{uploadError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setEditingCombo(null)}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold"
          >
            {isNewCombo ? 'Create Combo Set' : 'Save Combo Changes'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search combos or included items (e.g. Pizza, Coke, Shake)..."
            className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
          />
        </div>

        <button
          type="button"
          onClick={openCreateCombo}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Combo Set</span>
        </button>
      </div>

      {filteredCombos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center space-y-2">
          <p className="font-display text-base font-bold text-stone-900">
            No Combo Sets found
          </p>
          <p className="text-xs text-stone-500">
            Click &ldquo;Create Combo Set&rdquo; to bundle pizzas, burgers, shakes, or cold drinks into special combo deals.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCombos.map((combo) => {
            const inStock = combo.available !== false;
            const dineInOk = combo.dineInEnabled !== false;
            const homeOk = combo.homeOrderEnabled !== false;
            return (
              <div
                key={combo.id}
                className="p-4 rounded-2xl bg-white border border-stone-200/80 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-20 h-16 rounded-xl overflow-hidden bg-stone-100 shrink-0">
                    <ResilientImage src={combo.image} alt={combo.name} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-[11px] font-medium text-stone-500">
                      {dineInOk ? 'Dine-In' : 'Dine-In Off'} ·{' '}
                      {homeOk ? 'Home Order OK' : 'No Home Order'}
                    </div>
                    <h4 className="font-display font-bold text-sm text-stone-900 truncate">
                      {combo.name}
                    </h4>
                    <div className="text-xs text-stone-600 line-clamp-2">
                      {combo.items.length > 0
                        ? combo.items
                            .map((i) => `${i.quantity}x ${i.name}`)
                            .join(' + ')
                        : 'No items attached'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                  <button
                    type="button"
                    onClick={() => handleCycleComboBadge(combo.id)}
                    title="Click to cycle: Standard → 🔥 Bestseller → ⭐ Today's Special"
                    className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      combo.highlightBadge === 'bestseller'
                        ? 'bg-amber-100 border-amber-300 text-amber-950'
                        : combo.highlightBadge === 'special'
                        ? 'bg-[#C83E2B]/10 border-[#C83E2B]/30 text-[#C83E2B]'
                        : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {combo.highlightBadge === 'bestseller'
                      ? '🔥 Bestseller'
                      : combo.highlightBadge === 'special'
                      ? "⭐ Today's Special"
                      : '☆ Mark Badge'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleComboStock(combo.id)}
                    className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      inStock
                        ? 'bg-[#15803D]/10 border-[#15803D]/30 text-[#15803D]'
                        : 'bg-red-50 border-red-200 text-[#C83E2B]'
                    }`}
                  >
                    {inStock ? 'In Stock' : 'Out of Stock'}
                  </button>

                  <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-50">
                    <button
                      type="button"
                      onClick={() => handleQuickComboPriceDelta(combo.id, -5)}
                      aria-label={`Decrease price of ${combo.name} by ₹5`}
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
                        aria-label={`Price for ${combo.name}`}
                        value={combo.price}
                        onChange={(e) =>
                          handleExactComboPrice(combo.id, e.target.value)
                        }
                        className="w-12 text-center text-xs font-bold text-stone-900 tabular-nums focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickComboPriceDelta(combo.id, 5)}
                      aria-label={`Increase price of ${combo.name} by ₹5`}
                      className="px-2.5 h-9 flex items-center justify-center gap-0.5 text-xs font-semibold text-stone-700 hover:bg-stone-200/70 rounded-r-xl"
                    >
                      <Plus className="w-3 h-3" />
                      <span>5</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditCombo(combo)}
                    className="min-h-[40px] px-3 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-100 inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Items</span>
                  </button>

                  {deleteComboId === combo.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteCombo(combo.id)}
                        className="min-h-[40px] px-2.5 rounded-xl bg-[#C83E2B] text-white text-xs font-semibold"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteComboId(null)}
                        className="min-h-[40px] px-2 rounded-xl text-xs text-stone-500 hover:bg-stone-100"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteComboId(combo.id)}
                      aria-label={`Delete ${combo.name}`}
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
      )}
    </div>
  );
}
