import { FileSpreadsheet, FileText, TrendingUp } from 'lucide-react';
import type {
  CafeSettings,
  HomeOrderRecord,
  TableOrderRecord,
} from '../types';
import {
  computeSalesAnalytics,
  downloadAdminPdfReport,
  downloadHomeOrdersCsv,
  downloadTableOrdersCsv,
} from '../utils/reports';

interface AdminAnalyticsTabProps {
  settings: CafeSettings;
  homeOrders: HomeOrderRecord[];
  tableOrders: TableOrderRecord[];
}

export function AdminAnalyticsTab({
  settings,
  homeOrders,
  tableOrders,
}: AdminAnalyticsTabProps) {
  const analytics = computeSalesAnalytics(homeOrders, tableOrders);
  const maxProductQty =
    analytics.productRankings.length > 0
      ? Math.max(...analytics.productRankings.map((p) => p.quantitySold))
      : 1;
  const maxModeRevenue = Math.max(
    analytics.homeRevenue,
    analytics.tableRevenue,
    1
  );

  const homeSharePct =
    analytics.totalRevenue > 0
      ? Math.round((analytics.homeRevenue / analytics.totalRevenue) * 100)
      : 0;
  const tableSharePct =
    analytics.totalRevenue > 0 ? 100 - homeSharePct : 0;

  return (
    <div className="space-y-5">
      {/* Header & Instant PDF / Excel Exports */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-stone-900">
            Sales Analytics &amp; Reports
          </h3>
          <p className="text-xs text-stone-600 mt-0.5">
            Calculated live from all Home Orders and Table Orders stored in this browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadAdminPdfReport(settings, homeOrders, tableOrders, analytics)
            }
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#C83E2B] hover:bg-[#AE3221] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>Download PDF Report</span>
          </button>

          <button
            type="button"
            onClick={() => downloadHomeOrdersCsv(homeOrders)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#15803D]" />
            <span>Home Excel</span>
          </button>

          <button
            type="button"
            onClick={() => downloadTableOrdersCsv(tableOrders)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-stone-700" />
            <span>Table Excel</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-[11px] font-medium text-stone-500">
            Total Revenue
          </div>
          <div className="font-display text-2xl font-bold text-stone-900 tabular-nums mt-1">
            ₹{analytics.totalRevenue}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-[11px] font-medium text-stone-500">
            Total Orders
          </div>
          <div className="font-display text-2xl font-bold text-stone-900 tabular-nums mt-1">
            {analytics.totalOrders}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-[11px] font-medium text-stone-500">
            Home Orders
          </div>
          <div className="font-display text-2xl font-bold text-[#15803D] tabular-nums mt-1">
            {analytics.homeOrderCount}
          </div>
          <div className="text-[11px] text-stone-500 tabular-nums">
            ₹{analytics.homeRevenue}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <div className="text-[11px] font-medium text-stone-500">
            Table Orders
          </div>
          <div className="font-display text-2xl font-bold text-[#C83E2B] tabular-nums mt-1">
            {analytics.tableOrderCount}
          </div>
          <div className="text-[11px] text-stone-500 tabular-nums">
            ₹{analytics.tableRevenue}
          </div>
        </div>
      </div>

      {/* Home vs Table Revenue Visual Chart (Offline-Safe CSS/SVG Bars) */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-bold text-stone-900">
            Home Order vs. Table Order Revenue Split
          </h4>
          <span className="text-xs text-stone-500 tabular-nums">
            {analytics.totalUnitsSold} total units sold
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-stone-800">
                Table / Dine-In Orders ({analytics.tableOrderCount})
              </span>
              <span className="font-bold text-stone-900 tabular-nums">
                ₹{analytics.tableRevenue} ({tableSharePct}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-[#C83E2B] rounded-full transition-all duration-300"
                style={{
                  width: `${
                    analytics.totalRevenue > 0
                      ? Math.max(4, Math.round((analytics.tableRevenue / maxModeRevenue) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-stone-800">
                Home Delivery Orders ({analytics.homeOrderCount})
              </span>
              <span className="font-bold text-stone-900 tabular-nums">
                ₹{analytics.homeRevenue} ({homeSharePct}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-[#15803D] rounded-full transition-all duration-300"
                style={{
                  width: `${
                    analytics.totalRevenue > 0
                      ? Math.max(4, Math.round((analytics.homeRevenue / maxModeRevenue) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top Selling Products Ranking Graph */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#C83E2B]" />
          <h4 className="font-display text-sm font-bold text-stone-900">
            Top Selling Products Ranking (Quantity &amp; Revenue)
          </h4>
        </div>

        {analytics.productRankings.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">
            No sales recorded yet. Place a Dine-In or Home Order on WhatsApp to see live product rankings and graphs.
          </div>
        ) : (
          <div className="space-y-3.5">
            {analytics.productRankings.map((item, idx) => {
              const barPct = Math.max(
                6,
                Math.round((item.quantitySold / maxProductQty) * 100)
              );
              return (
                <div key={item.productId || item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center tabular-nums shrink-0 ${
                          idx === 0
                            ? 'bg-stone-900 text-white'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-stone-900 truncate">
                        {item.name}
                        {item.isCombo && (
                          <span className="ml-1.5 text-[11px] font-bold text-[#C83E2B]">
                            · Combo
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <span className="font-bold text-stone-900">
                        {item.quantitySold} sold
                      </span>
                      <span className="text-stone-400 mx-1.5">·</span>
                      <span className="font-semibold text-[#15803D]">
                        ₹{item.revenue}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        idx === 0 ? 'bg-[#C83E2B]' : 'bg-stone-700'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-stone-500 tabular-nums">
                    Table: {item.tableQty} · Home: {item.homeQty}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
