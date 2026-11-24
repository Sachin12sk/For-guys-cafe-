import type { HomeOrderRecord, OrderStatus, TableOrderRecord } from '../types';

export type OrderDateFilter = 'today' | 'week' | 'all';
export type OrderStatusFilter = 'all' | 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export function matchesOrderDateFilter(
  timestampIso: string,
  filter: OrderDateFilter,
  nowMs = Date.now()
): boolean {
  if (filter === 'all') return true;
  const parsed = Date.parse(timestampIso);
  if (!Number.isFinite(parsed)) return false;

  const nowDate = new Date(nowMs);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    0,
    0,
    0,
    0
  ).getTime();

  if (filter === 'today') {
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    return parsed >= startOfToday && parsed < endOfToday;
  }

  // 'week': rolling 7 local calendar days (today + prior 6 days)
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
  return parsed >= startOfWeek && parsed < endOfToday;
}

export function normalizeOrderStatusForFilter(status?: OrderStatus): OrderStatus {
  return status || 'pending';
}

export function filterOrdersByCriteria<
  T extends HomeOrderRecord | TableOrderRecord,
>(
  orders: T[],
  criteria: {
    searchQuery?: string;
    dateFilter?: OrderDateFilter;
    statusFilter?: OrderStatusFilter;
    flagFilter?: 'all' | 'flagged';
    nowMs?: number;
  }
): T[] {
  const q = (criteria.searchQuery || '').trim().toLowerCase();
  const dateFilter = criteria.dateFilter || 'all';
  const statusFilter = criteria.statusFilter || 'all';
  const flagFilter = criteria.flagFilter || 'all';
  const nowMs = criteria.nowMs ?? Date.now();

  return orders.filter((order) => {
    if (flagFilter === 'flagged' && !order.isFlagged) {
      return false;
    }

    const effectiveStatus = normalizeOrderStatusForFilter(order.orderStatus);
    if (statusFilter !== 'all' && effectiveStatus !== statusFilter) {
      return false;
    }

    if (!matchesOrderDateFilter(order.timestamp, dateFilter, nowMs)) {
      return false;
    }

    if (!q) return true;

    const itemNames = (order.items || []).map((i) => i.name.toLowerCase()).join(' ');
    const isHome = 'customerName' in order;
    const haystack = isHome
      ? [
          order.orderCode,
          order.customerName,
          order.alternatePhone,
          order.gmail || '',
          order.ward || '',
          order.area || '',
          order.wardArea || '',
          order.deliveryAddress || '',
          order.upiRefNote || '',
          itemNames,
        ]
          .join(' ')
          .toLowerCase()
      : [
          order.orderCode,
          order.tableNumber || '',
          order.customerPhone || '',
          order.customerNote || '',
          order.upiRefNote || '',
          itemNames,
        ]
          .join(' ')
          .toLowerCase();

    return haystack.includes(q);
  });
}
