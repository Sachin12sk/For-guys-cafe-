import { useState, type FormEvent } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Trash2,
  MapPin,
  Home,
  UtensilsCrossed,
  Flag,
  AlertTriangle,
  Users,
  Info,
  CheckCircle2,
  Plus,
  Minus,
  RotateCcw,
  MessageCircle,
} from 'lucide-react';
import type {
  CafeSettings,
  HomeOrderRecord,
  LoyaltyState,
  OrderMode,
  ReferralRecord,
  TableOrderRecord,
} from '../types';
import {
  computeSalesAnalytics,
  downloadAdminPdfReport,
  downloadHomeOrdersCsv,
  downloadTableOrdersCsv,
  formatOrderTimestamp,
} from '../utils/reports';
import {
  buildHomeReceiptWhatsappUrl,
  buildTableReceiptWhatsappUrl,
} from '../utils/whatsapp';

interface AdminOrdersAndSheetsTabProps {
  settings: CafeSettings;
  homeOrders: HomeOrderRecord[];
  tableOrders: TableOrderRecord[];
  referralRecords: ReferralRecord[];
  loyalty: LoyaltyState;
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
}

export function AdminOrdersAndSheetsTab({
  settings,
  homeOrders,
  tableOrders,
  referralRecords,
  loyalty,
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
}: AdminOrdersAndSheetsTabProps) {
  const [activeSheet, setActiveSheet] = useState<'home' | 'table' | 'referrals'>('home');
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged'>('all');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Manual cross-device WhatsApp referral verification state
  const [manualOrderCode, setManualOrderCode] = useState('');
  const [manualOrderMode, setManualOrderMode] = useState<OrderMode>('home');
  const [manualRefCode, setManualRefCode] = useState('');
  const [manualCustomerLabel, setManualCustomerLabel] = useState('');
  const [manualOrderAmount, setManualOrderAmount] = useState<number>(150);
  const [manualSpins, setManualSpins] = useState<number>(
    Math.max(1, Number(settings.referralSpins ?? 5))
  );
  const [creditBrowser, setCreditBrowser] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const [manualFeedback, setManualFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const analytics = computeSalesAnalytics(homeOrders, tableOrders);

  const flaggedHomeCount = homeOrders.filter((o) => o.isFlagged).length;
  const flaggedTableCount = tableOrders.filter((o) => o.isFlagged).length;
  const totalFlaggedCount = flaggedHomeCount + flaggedTableCount;

  const displayedHomeOrders =
    flagFilter === 'flagged'
      ? homeOrders.filter((o) => o.isFlagged)
      : homeOrders;
  const displayedTableOrders =
    flagFilter === 'flagged'
      ? tableOrders.filter((o) => o.isFlagged)
      : tableOrders;

  const handleManualReferralSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = onConfirmManualReferral({
      orderCode: manualOrderCode,
      orderMode: manualOrderMode,
      referralCode: manualRefCode,
      customerLabel: manualCustomerLabel,
      orderAmount: Number(manualOrderAmount) || 0,
      spinsToAward: Number(manualSpins) || 0,
      creditToThisBrowser: creditBrowser,
      note: manualNote,
    });
    setManualFeedback(res);
    if (res.ok) {
      setManualOrderCode('');
      setManualRefCode('');
      setManualCustomerLabel('');
      setManualNote('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Export Action Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-stone-900">
            Live Order Feeds, Excel Sheets &amp; Order-Verified Referrals
          </h3>
          <p className="text-xs text-stone-600 mt-0.5 tabular-nums">
            {homeOrders.length} Home Orders · {tableOrders.length} Table Orders ·{' '}
            {referralRecords.length} Verified Referrals
            {totalFlaggedCount > 0 && (
              <span className="font-semibold text-[#C83E2B]">
                {' '}
                · {totalFlaggedCount} flagged for review
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadHomeOrdersCsv(homeOrders)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Home Excel (.csv)</span>
          </button>

          <button
            type="button"
            onClick={() => downloadTableOrdersCsv(tableOrders)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Table Excel (.csv)</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadAdminPdfReport(settings, homeOrders, tableOrders, analytics)
            }
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-[#C83E2B]" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Sheet Switcher & Flag Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Order Excel Sheets and Referrals"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-stone-200/70 rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeSheet === 'home'}
              onClick={() => setActiveSheet('home')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeSheet === 'home'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Home className="w-3.5 h-3.5 text-[#15803D]" />
              <span>
                Sheet 1: Home Orders ({homeOrders.length})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSheet === 'table'}
              onClick={() => setActiveSheet('table')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeSheet === 'table'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-[#C83E2B]" />
              <span>
                Sheet 2: Table Orders ({tableOrders.length})
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSheet === 'referrals'}
              onClick={() => setActiveSheet('referrals')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                activeSheet === 'referrals'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-700" />
              <span>
                Sheet 3: Referrals ({referralRecords.length})
              </span>
            </button>
          </div>

          {activeSheet !== 'referrals' && (
            <div className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setFlagFilter('all')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  flagFilter === 'all'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFlagFilter('flagged')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors tabular-nums ${
                  flagFilter === 'flagged'
                    ? 'bg-[#C83E2B] text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                <Flag className="w-3 h-3" />
                <span>
                  Flagged (
                  {activeSheet === 'home' ? flaggedHomeCount : flaggedTableCount})
                </span>
              </button>
            </div>
          )}
        </div>

        {activeSheet !== 'referrals' &&
          (homeOrders.length > 0 || tableOrders.length > 0) && (
            <div>
              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs font-semibold text-stone-500 hover:text-[#C83E2B] py-1"
                >
                  Clear All Order Logs
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-700">Clear all recorded orders?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllOrders();
                      setConfirmClearAll(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#C83E2B] text-white font-semibold"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 text-stone-500 hover:text-stone-800"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
      </div>

      {/* SHEET 1: HOME ORDERS EXCEL SHEET */}
      {activeSheet === 'home' && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {displayedHomeOrders.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="font-display text-base font-bold text-stone-900">
                {flagFilter === 'flagged'
                  ? 'No flagged Home Orders'
                  : 'No Home Orders recorded yet'}
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                {flagFilter === 'flagged'
                  ? 'High-quantity or suspicious Home Orders flagged automatically or manually will appear here.'
                  : 'Whenever a customer places a Home Order on WhatsApp, their Gmail, name, phone, area/GPS, items, and ₹ total appear in this sheet automatically.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                    <th className="py-3 px-3 whitespace-nowrap">Order ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Time</th>
                    <th className="py-3 px-3 whitespace-nowrap">Customer</th>
                    <th className="py-3 px-3 whitespace-nowrap">Mobile</th>
                    <th className="py-3 px-3 whitespace-nowrap">Ward / Location</th>
                    <th className="py-3 px-3 min-w-[200px]">Items Ordered</th>
                    <th className="py-3 px-3 whitespace-nowrap text-right">Total</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {displayedHomeOrders.map((order) => (
                    <tr
                      key={order.id}
                      className={`align-top ${
                        order.isFlagged
                          ? 'bg-amber-50/70 hover:bg-amber-50'
                          : 'hover:bg-stone-50/70'
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                        <div>{order.orderCode}</div>
                        {order.referralCodeUsed && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-sans font-bold">
                            Ref: {order.referralCodeUsed}
                          </div>
                        )}
                        {order.isFlagged && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-sans font-bold text-[#C83E2B]">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>FLAGGED</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap tabular-nums">
                        {formatOrderTimestamp(order.timestamp)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-stone-900 whitespace-nowrap">
                          {order.customerName}
                        </div>
                        {order.gmail && (
                          <div className="text-[11px] text-stone-500">
                            {order.gmail}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-stone-600 whitespace-nowrap tabular-nums">
                        {order.alternatePhone || '—'}
                      </td>
                      <td className="py-3 px-3 text-stone-700">
                        <div>{order.wardArea || 'Via GPS Pin'}</div>
                        {order.geoLocationUrl && (
                          <a
                            href={order.geoLocationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] hover:underline mt-0.5"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Open Map</span>
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-3 text-stone-700">
                        {order.isFlagged && (
                          <div className="mb-1.5 text-[11px] font-semibold text-[#C83E2B]">
                            {order.flagReason || 'Flagged for quantity/manual review'}
                          </div>
                        )}
                        <div className="space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="tabular-nums">
                              <div>
                                {item.quantity}x{' '}
                                {item.isCombo && (
                                  <span className="font-bold text-[#C83E2B] mr-1">
                                    [COMBO]
                                  </span>
                                )}
                                {item.name} (₹{item.subtotal})
                              </div>
                              {item.comboBreakdown && (
                                <div className="text-[11px] text-stone-500 pl-3">
                                  ↳ {item.comboBreakdown}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {order.customerNote && (
                          <div className="text-[11px] text-stone-500 mt-1">
                            Note: {order.customerNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-stone-900 whitespace-nowrap text-right tabular-nums">
                        ₹{order.totalAmount}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={buildHomeReceiptWhatsappUrl(settings, order)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Send digital receipt on WhatsApp for ${order.orderCode}`}
                            aria-label={`Send Bill / Receipt on WhatsApp for ${order.orderCode}`}
                            className="px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <MessageCircle className="w-3 h-3 shrink-0" />
                            <span>Send Bill / Receipt</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => onToggleHomeOrderFlag(order.id)}
                            title={
                              order.isFlagged ? 'Clear flag' : 'Flag order for review'
                            }
                            aria-label={
                              order.isFlagged
                                ? `Unflag ${order.orderCode}`
                                : `Flag ${order.orderCode}`
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              order.isFlagged
                                ? 'bg-[#C83E2B] text-white hover:bg-[#AE3221]'
                                : 'text-stone-400 hover:text-[#C83E2B] hover:bg-red-50'
                            }`}
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteHomeOrder(order.id)}
                            aria-label={`Delete ${order.orderCode}`}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SHEET 2: TABLE ORDERS EXCEL SHEET */}
      {activeSheet === 'table' && (
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {displayedTableOrders.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="font-display text-base font-bold text-stone-900">
                {flagFilter === 'flagged'
                  ? 'No flagged Table Orders'
                  : 'No Table Orders recorded yet'}
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                {flagFilter === 'flagged'
                  ? 'High-quantity or suspicious Table Orders flagged automatically or manually will appear here.'
                  : 'Whenever a dine-in guest sends an order on WhatsApp from their Live Table Bill, each order batch is logged here cleanly.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                    <th className="py-3 px-3 whitespace-nowrap">Order ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">Time</th>
                    <th className="py-3 px-3 whitespace-nowrap">Table / Counter</th>
                    <th className="py-3 px-3 min-w-[220px]">Items Ordered</th>
                    <th className="py-3 px-3 whitespace-nowrap text-right">Order ₹</th>
                    <th className="py-3 px-3 whitespace-nowrap text-right">Session ₹</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {displayedTableOrders.map((order) => (
                    <tr
                      key={order.id}
                      className={`align-top ${
                        order.isFlagged
                          ? 'bg-amber-50/70 hover:bg-amber-50'
                          : 'hover:bg-stone-50/70'
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                        <div>{order.orderCode}</div>
                        {order.referralCodeUsed && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-sans font-bold">
                            Ref: {order.referralCodeUsed}
                          </div>
                        )}
                        {order.isFlagged && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-sans font-bold text-[#C83E2B]">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>FLAGGED</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap tabular-nums">
                        {formatOrderTimestamp(order.timestamp)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-stone-900 whitespace-nowrap">
                        {order.tableNumber || 'Counter / QR'}
                      </td>
                      <td className="py-3 px-3 text-stone-700">
                        {order.isFlagged && (
                          <div className="mb-1.5 text-[11px] font-semibold text-[#C83E2B]">
                            {order.flagReason || 'Flagged for quantity/manual review'}
                          </div>
                        )}
                        <div className="space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="tabular-nums">
                              <div>
                                {item.quantity}x{' '}
                                {item.isCombo && (
                                  <span className="font-bold text-[#C83E2B] mr-1">
                                    [COMBO]
                                  </span>
                                )}
                                {item.name} (₹{item.subtotal})
                              </div>
                              {item.comboBreakdown && (
                                <div className="text-[11px] text-stone-500 pl-3">
                                  ↳ {item.comboBreakdown}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {order.previouslySentCount > 0 && (
                          <div className="text-[11px] text-[#15803D] mt-0.5 tabular-nums">
                            +{order.previouslySentCount} already sent earlier
                          </div>
                        )}
                        {order.customerNote && (
                          <div className="text-[11px] text-stone-500 mt-0.5">
                            Note: {order.customerNote}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-stone-900 whitespace-nowrap text-right tabular-nums">
                        ₹{order.newOrderAmount}
                      </td>
                      <td className="py-3 px-3 text-stone-600 whitespace-nowrap text-right tabular-nums">
                        ₹{order.sessionTotalAmount}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={buildTableReceiptWhatsappUrl(settings, order)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Send digital receipt on WhatsApp for ${order.orderCode}`}
                            aria-label={`Send Bill / Receipt on WhatsApp for ${order.orderCode}`}
                            className="px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <MessageCircle className="w-3 h-3 shrink-0" />
                            <span>Send Bill / Receipt</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => onToggleTableOrderFlag(order.id)}
                            title={
                              order.isFlagged ? 'Clear flag' : 'Flag order for review'
                            }
                            aria-label={
                              order.isFlagged
                                ? `Unflag ${order.orderCode}`
                                : `Flag ${order.orderCode}`
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              order.isFlagged
                                ? 'bg-[#C83E2B] text-white hover:bg-[#AE3221]'
                                : 'text-stone-400 hover:text-[#C83E2B] hover:bg-red-50'
                            }`}
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTableOrder(order.id)}
                            aria-label={`Delete ${order.orderCode}`}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SHEET 3: ORDER-VERIFIED REFERRALS & CROSS-DEVICE ADMIN REVIEW */}
      {activeSheet === 'referrals' && (
        <div className="space-y-4">
          {/* Static Site Disclosure Note */}
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold">
                Static GitHub Pages Cross-Device &amp; Anti-Duplicate Tracking Note
              </p>
              <p className="leading-relaxed text-amber-900">
                Because this site runs 100% statically on GitHub Pages without a shared database server, referral clicks only save{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">pendingRefCode</code>{' '}
                (zero spins awarded on link click alone). Spins verify when an order is placed/completed and attach a{' '}
                <span className="font-semibold">REFERRAL ORDER TAG</span> to the WhatsApp message &amp; order logs. Use the form below to confirm/adjust cross-device WhatsApp referrals—duplicate Order IDs are automatically blocked.
              </p>
            </div>
          </div>

          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-semibold text-stone-500">
                Verified Referred Orders
              </div>
              <div className="font-display text-xl font-bold text-stone-900 mt-1 tabular-nums">
                {loyalty.referralCount}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-semibold text-stone-500">
                Referral Spins Credited
              </div>
              <div className="font-display text-xl font-bold text-[#15803D] mt-1 tabular-nums">
                +{loyalty.referralEarningsSpins} Spins
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200">
              <div className="text-[11px] font-semibold text-stone-500">
                Referred Order Value
              </div>
              <div className="font-display text-xl font-bold text-stone-900 mt-1 tabular-nums">
                ₹{loyalty.referralOrderAmount}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold text-stone-500">
                  Browser Spins Left
                </div>
                <div className="font-display text-xl font-bold text-[#C83E2B] mt-1 tabular-nums">
                  {loyalty.spinsLeft}
                </div>
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAdjustBrowserSpins(-1)}
                  aria-label="Subtract 1 spin from this browser"
                  className="w-8 h-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAdjustBrowserSpins(1)}
                  aria-label="Add 1 spin to this browser"
                  className="w-8 h-8 rounded-lg border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Confirm / Log Cross-Device WhatsApp Referral Form */}
          <form
            onSubmit={handleManualReferralSubmit}
            className="p-4 rounded-2xl bg-white border border-stone-200 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="font-display text-sm font-bold text-stone-900">
                  Confirm / Log Cross-Device WhatsApp Referral
                </h4>
                <p className="text-[11px] text-stone-500">
                  Paste the Order ID &amp; Ref Code from a WhatsApp order notification to verify it once (duplicate Order IDs blocked).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Order Code *
                </label>
                <input
                  type="text"
                  required
                  value={manualOrderCode}
                  onChange={(e) => setManualOrderCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HOM-1005 or TBL-1008"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Referral Code *
                </label>
                <input
                  type="text"
                  required
                  value={manualRefCode}
                  onChange={(e) => setManualRefCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 4GUYS8A2K"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Order Mode
                </label>
                <select
                  value={manualOrderMode}
                  onChange={(e) => setManualOrderMode(e.target.value as OrderMode)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                >
                  <option value="home">Home Order</option>
                  <option value="dine-in">Dine-In / Table Order</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Customer Name / Mobile
                </label>
                <input
                  type="text"
                  value={manualCustomerLabel}
                  onChange={(e) => setManualCustomerLabel(e.target.value)}
                  placeholder="e.g. Aman · 98765xxxxx"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Order Value (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={manualOrderAmount}
                  onChange={(e) => setManualOrderAmount(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Spins Awarded
                </label>
                <input
                  type="number"
                  min={0}
                  value={manualSpins}
                  onChange={(e) => setManualSpins(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-stone-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={creditBrowser}
                    onChange={(e) => setCreditBrowser(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#15803D]"
                  />
                  <span>Also add spins to this browser&apos;s wallet</span>
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Optional admin note (e.g. Verified on WhatsApp)"
                  className="flex-1 min-h-[38px] px-3 rounded-xl border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#C83E2B]"
                />
              </div>

              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Verify &amp; Log Referral</span>
              </button>
            </div>

            {manualFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold ${
                  manualFeedback.ok
                    ? 'bg-emerald-50 text-[#15803D] border border-emerald-200'
                    : 'bg-red-50 text-[#C83E2B] border border-red-200'
                }`}
              >
                {manualFeedback.message}
              </div>
            )}
          </form>

          {/* Referral Records Table */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {referralRecords.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="font-display text-base font-bold text-stone-900">
                  No Verified Referral Orders Yet
                </p>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  When a visitor arrives via <code className="font-mono">?ref=CODE</code> or attaches a friend&apos;s code and completes a WhatsApp order, it is logged here automatically with duplicate-order protection.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                      <th className="py-3 px-3 whitespace-nowrap">Time</th>
                      <th className="py-3 px-3 whitespace-nowrap">Order ID</th>
                      <th className="py-3 px-3 whitespace-nowrap">Ref Code</th>
                      <th className="py-3 px-3 whitespace-nowrap">Customer</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">Order ₹</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">Spins</th>
                      <th className="py-3 px-3 whitespace-nowrap">Status</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {referralRecords.map((rec) => {
                      const isRevoked = rec.status === 'revoked';
                      return (
                        <tr
                          key={rec.id}
                          className={`align-top ${
                            isRevoked ? 'bg-red-50/50 text-stone-500' : 'hover:bg-stone-50/70'
                          }`}
                        >
                          <td className="py-3 px-3 text-stone-500 whitespace-nowrap tabular-nums">
                            {formatOrderTimestamp(rec.timestamp)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono font-semibold text-stone-800">
                              {rec.orderCode}
                            </span>
                            <div className="text-[11px] text-stone-500 capitalize">
                              {rec.orderMode}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-amber-900 whitespace-nowrap">
                            {rec.referralCode}
                          </td>
                          <td className="py-3 px-3 text-stone-700">
                            <div>{rec.customerLabel || 'Guest'}</div>
                            {rec.note && (
                              <div className="text-[11px] text-stone-500">{rec.note}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-semibold text-stone-900 whitespace-nowrap text-right tabular-nums">
                            ₹{rec.orderAmount}
                          </td>
                          <td className="py-3 px-3 font-bold text-[#15803D] whitespace-nowrap text-right tabular-nums">
                            {isRevoked ? '0' : `+${rec.spinsAwarded}`}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold capitalize ${
                                rec.status === 'credited'
                                  ? 'bg-emerald-100 text-[#15803D]'
                                  : rec.status === 'adjusted'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-red-100 text-[#C83E2B]'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onAdjustReferralRecord(rec.id, 5)}
                                title="Add +5 spins"
                                className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-[11px]"
                              >
                                +5
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustReferralRecord(rec.id, -5)}
                                title="Subtract 5 spins"
                                className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-[11px]"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleRevokeReferral(rec.id)}
                                title={isRevoked ? 'Restore referral credit' : 'Revoke referral credit'}
                                className="p-1.5 rounded-lg text-stone-500 hover:text-amber-800 hover:bg-amber-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteReferralRecord(rec.id)}
                                aria-label={`Delete referral ${rec.orderCode}`}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-[#C83E2B] hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
