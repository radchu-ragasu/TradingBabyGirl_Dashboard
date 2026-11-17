import React, { useState, useMemo } from 'react';
import { Trade, ReceiptDocument } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  Layers,
  X,
  Eye,
  LayoutGrid,
} from 'lucide-react';

interface TradingPnLCalendarProps {
  trades: Trade[];
  currency: string;
  receipts?: ReceiptDocument[];
  onViewReceipt?: (receipt: ReceiptDocument) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getColomboTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const TradingPnLCalendar: React.FC<TradingPnLCalendarProps> = ({
  trades,
  currency,
  receipts = [],
  onViewReceipt,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedDayTrades, setSelectedDayTrades] = useState<{ date: string; trades: Trade[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayColombo = getColomboTodayStr();

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Extract all available years from trades + current year
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([new Date().getFullYear(), year]);
    trades.forEach((t) => {
      if (t.date && t.date.length >= 4) {
        const y = parseInt(t.date.slice(0, 4), 10);
        if (!isNaN(y)) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [trades, year]);

  const prevPeriod = () => {
    if (viewMode === 'YEARLY') {
      setCurrentDate(new Date(year - 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month - 1, 1));
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'YEARLY') {
      setCurrentDate(new Date(year + 1, month, 1));
    } else {
      setCurrentDate(new Date(year, month + 1, 1));
    }
  };

  // Group trades by date string (YYYY-MM-DD)
  const tradesByDate: Record<string, Trade[]> = {};
  trades.forEach((t) => {
    if (!t.date) return;
    if (!tradesByDate[t.date]) {
      tradesByDate[t.date] = [];
    }
    tradesByDate[t.date].push(t);
  });

  // Scope trades either to selected Month or Full Year based on viewMode
  const periodPrefix =
    viewMode === 'YEARLY'
      ? `${year}-`
      : `${year}-${String(month + 1).padStart(2, '0')}`;

  const scopedTrades = trades.filter((t) => t.date && t.date.startsWith(periodPrefix));

  let periodNetPnL = 0;
  let periodProfitDays = 0;
  let periodLossDays = 0;
  let periodTotalVolume = 0;

  const activeDaysInPeriod = new Set<string>();
  scopedTrades.forEach((t) => {
    activeDaysInPeriod.add(t.date);
    periodNetPnL += t.realizedPnL || 0;
    periodTotalVolume += t.grossConsideration || 0;
  });

  activeDaysInPeriod.forEach((dateStr) => {
    const dayTrades = tradesByDate[dateStr] || [];
    const dayPnL = dayTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    if (dayPnL > 0) periodProfitDays++;
    else if (dayPnL < 0) periodLossDays++;
  });

  const totalActiveDays = periodProfitDays + periodLossDays;
  const winRate = totalActiveDays > 0 ? (periodProfitDays / totalActiveDays) * 100 : 0;

  // Per-month breakdown for Yearly Grid (Jan - Dec)
  const monthlyBreakdown = useMemo(() => {
    return MONTH_NAMES.map((mName, mIdx) => {
      const mPrefix = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
      const mTrades = trades.filter((t) => t.date && t.date.startsWith(mPrefix));
      const mPnL = mTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
      const mVolume = mTrades.reduce((sum, t) => sum + (t.grossConsideration || 0), 0);
      const activeDays = new Set(mTrades.map((t) => t.date)).size;
      return {
        monthIndex: mIdx,
        monthName: mName,
        shortName: SHORT_MONTH_NAMES[mIdx],
        tradeCount: mTrades.length,
        pnl: mPnL,
        volume: mVolume,
        activeDays,
      };
    });
  }, [trades, year]);

  // Calendar matrix generation for Monthly View
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays = [];

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarDays.push({
      dayNumber: daysInPrevMonth - i,
      isCurrentMonth: false,
      dateString: '',
    });
  }

  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays.push({
      dayNumber: d,
      isCurrentMonth: true,
      dateString: dateStr,
    });
  }

  const remainingCells = 42 - calendarDays.length;
  for (let d = 1; d <= (remainingCells >= 7 ? remainingCells - 7 : remainingCells); d++) {
    calendarDays.push({
      dayNumber: d,
      isCurrentMonth: false,
      dateString: '',
    });
  }

  const periodLabel = viewMode === 'YEARLY' ? `${year} Full Year` : MONTH_NAMES[month];

  return (
    <div className="space-y-6">
      {/* Dynamic Period Summary Bar (Monthly or Full Year) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Realized P&L */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {periodLabel} Realized P&L
            </span>
            <div
              className={`p-1.5 rounded-lg border ${
                periodNetPnL > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : periodNetPnL < 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {periodNetPnL >= 0 ? (
                <TrendingUp className="w-4 h-4 text-[#15803D]" />
              ) : (
                <TrendingDown className="w-4 h-4 text-[#B91C1C]" />
              )}
            </div>
          </div>
          <div
            className={`text-2xl font-bold tracking-tight tabular-nums ${
              periodNetPnL > 0
                ? 'text-[#15803D]'
                : periodNetPnL < 0
                ? 'text-[#B91C1C]'
                : 'text-slate-900'
            }`}
          >
            {periodNetPnL >= 0 ? '+' : ''}
            {formatLKR(periodNetPnL)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            From {scopedTrades.length} trade{scopedTrades.length === 1 ? '' : 's'} in {periodLabel}
          </p>
        </div>

        {/* Profit vs Loss Days */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Trading Days</span>
            <div className="p-1.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-200">
              <CalendarIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
            <span className="text-[#15803D]">{periodProfitDays}W</span>
            <span className="text-slate-300 mx-1.5">/</span>
            <span className="text-[#B91C1C]">{periodLossDays}L</span>
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            {totalActiveDays} active trading session{totalActiveDays === 1 ? '' : 's'}
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Win Rate</span>
            <div className="p-1.5 bg-teal-50 text-teal-800 rounded-lg border border-teal-200">
              <TrendingUp className="w-4 h-4 text-teal-700" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
            {winRate.toFixed(1)}%
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Percentage of winning closed days
          </p>
        </div>

        {/* Period Trade Volume */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gross Consideration</span>
            <div className="p-1.5 bg-slate-50 text-slate-700 rounded-lg border border-slate-200">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
            {formatLKR(periodTotalVolume)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Total consideration traded in {periodLabel}
          </p>
        </div>
      </div>

      {/* Calendar / Yearly Overview Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header with Quick Jump Selectors & Monthly/Yearly Toggle */}
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-2.5">
            {viewMode === 'MONTHLY' && (
              <select
                value={month}
                onChange={(e) => setCurrentDate(new Date(year, Number(e.target.value), 1))}
                aria-label="Select Month"
                className="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>
            )}

            <select
              value={year}
              onChange={(e) => setCurrentDate(new Date(Number(e.target.value), month, 1))}
              aria-label="Select Year"
              className="px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer tabular-nums"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {scopedTrades.length} Trade{scopedTrades.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Monthly vs Yearly */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('MONTHLY')}
                className={`inline-flex items-center space-x-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  viewMode === 'MONTHLY'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Monthly</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('YEARLY')}
                className={`inline-flex items-center space-x-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  viewMode === 'YEARLY'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Yearly</span>
              </button>
            </div>

            {/* Prev / Today / Next Navigation */}
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={prevPeriod}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                title={viewMode === 'YEARLY' ? 'Previous Year' : 'Previous Month'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
              >
                Today
              </button>
              <button
                type="button"
                onClick={nextPeriod}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                title={viewMode === 'YEARLY' ? 'Next Year' : 'Next Month'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'YEARLY' ? (
          /* YEARLY VIEW: 12-Month Performance Grid (Jan - Dec) */
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-slate-50/30">
            {monthlyBreakdown.map((mItem) => {
              const hasActivity = mItem.tradeCount > 0;
              const isCurrentCalMonth =
                year === new Date().getFullYear() && mItem.monthIndex === new Date().getMonth();

              return (
                <div
                  key={mItem.monthIndex}
                  onClick={() => {
                    setCurrentDate(new Date(year, mItem.monthIndex, 1));
                    setViewMode('MONTHLY');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between min-h-[124px] hover:ring-2 hover:ring-slate-900 ${
                    hasActivity && mItem.pnl > 0
                      ? 'bg-emerald-50/50 border-emerald-200/90 hover:bg-emerald-50'
                      : hasActivity && mItem.pnl < 0
                      ? 'bg-rose-50/50 border-rose-200/90 hover:bg-rose-50'
                      : 'bg-white border-slate-200/90 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{mItem.monthName}</span>
                      {isCurrentCalMonth && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-white font-semibold">
                          Now
                        </span>
                      )}
                    </span>
                    <span className="text-3xs px-2 py-0.5 rounded-full font-semibold bg-white border border-slate-200 text-slate-600">
                      {mItem.tradeCount} trade{mItem.tradeCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {hasActivity ? (
                    <div className="mt-3">
                      <div
                        className={`text-base font-bold tabular-nums ${
                          mItem.pnl > 0
                            ? 'text-[#15803D]'
                            : mItem.pnl < 0
                            ? 'text-[#B91C1C]'
                            : 'text-slate-800'
                        }`}
                      >
                        {mItem.pnl >= 0 ? '+' : ''}
                        {formatLKR(mItem.pnl)}
                      </div>
                      <div className="flex items-center justify-between text-3xs text-slate-500 mt-1.5 pt-1.5 border-t border-slate-200/60">
                        <span>{mItem.activeDays} active day{mItem.activeDays === 1 ? '' : 's'}</span>
                        <span className="font-semibold text-slate-700">Click to inspect →</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-slate-400">No closed trades</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* MONTHLY VIEW: 7-Column Calendar Matrix */
          <>
            {/* Days of week header */}
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-3xs font-semibold text-slate-400 py-2.5 uppercase tracking-wider">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {calendarDays.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return (
                    <div
                      key={idx}
                      className="min-h-[96px] p-2.5 bg-slate-50/20 text-slate-300 text-xs"
                    >
                      <span className="font-medium">{cell.dayNumber}</span>
                    </div>
                  );
                }

                const dayTrades = tradesByDate[cell.dateString] || [];
                const dayPnL = dayTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
                const hasTrades = dayTrades.length > 0;
                const isToday = cell.dateString === todayColombo;

                return (
                  <div
                    key={idx}
                    onClick={() => hasTrades && setSelectedDayTrades({ date: cell.dateString, trades: dayTrades })}
                    className={`min-h-[96px] p-2.5 transition-colors relative flex flex-col justify-between ${
                      hasTrades ? 'cursor-pointer hover:ring-2 hover:ring-slate-900 z-10' : ''
                    } ${
                      hasTrades && dayPnL > 0
                        ? 'bg-emerald-50/50 hover:bg-emerald-50/80'
                        : hasTrades && dayPnL < 0
                        ? 'bg-rose-50/50 hover:bg-rose-50/80'
                        : 'bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                          isToday
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {hasTrades && (
                        <span className="text-3xs px-1.5 py-0.5 rounded-full font-bold bg-white border border-slate-200 text-slate-600 shadow-2xs">
                          {dayTrades.length} trade{dayTrades.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    {/* Day Trade P&L Display */}
                    {hasTrades ? (
                      <div className="mt-1">
                        <div
                          className={`text-xs font-bold tabular-nums ${
                            dayPnL > 0
                              ? 'text-[#15803D]'
                              : dayPnL < 0
                              ? 'text-[#B91C1C]'
                              : 'text-slate-700'
                          }`}
                        >
                          {dayPnL >= 0 ? '+' : ''}
                          {formatLKR(dayPnL)}
                        </div>
                        {dayPnL > 0 && (
                          <div className="text-3xs text-[#15803D] font-medium tabular-nums">
                            30%: +{formatLKR(dayPnL * 0.3)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-3xs text-slate-200">
                        —
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Selected Day Trade Details Modal */}
      {selectedDayTrades && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
                  <CalendarIcon className="w-4 h-4 text-slate-600" />
                  <span>Trades Executed on {selectedDayTrades.date}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedDayTrades.trades.length} trade{selectedDayTrades.trades.length === 1 ? '' : 's'} closed
                </p>
              </div>
              <button
                onClick={() => setSelectedDayTrades(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              {selectedDayTrades.trades.map((t) => {
                const isProfit = t.realizedPnL > 0;
                const matchedReceipt = t.receiptId
                  ? receipts.find((r) => r.id === t.receiptId)
                  : receipts.find((r) => r.contractNoteNumber === t.contractNoteNumber);

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900 flex items-center space-x-2 text-sm">
                          <span>{t.symbol}</span>
                          <span
                            className={`text-3xs px-2 py-0.5 rounded font-semibold ${
                              t.type === 'SELL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {t.type}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">{t.companyName}</div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-base font-bold tabular-nums ${
                            isProfit
                              ? 'text-[#15803D]'
                              : t.realizedPnL < 0
                              ? 'text-[#B91C1C]'
                              : 'text-slate-800'
                          }`}
                        >
                          {t.realizedPnL >= 0 ? '+' : ''}
                          {formatLKR(t.realizedPnL)}
                        </div>
                        <div className="text-2xs text-slate-400">Realized Profit</div>
                      </div>
                    </div>

                    {/* Trade stats grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-200/70">
                      <div>
                        <span className="text-slate-400 block text-2xs">Quantity:</span>
                        <span className="font-medium text-slate-800 tabular-nums">{t.quantity.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-2xs">Sell Exec Price:</span>
                        <span className="font-medium text-slate-800 tabular-nums">Rs. {t.price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-2xs">Buy Cost Basis:</span>
                        <span className="font-medium text-slate-800 tabular-nums">Rs. {t.costBasisPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-2xs">CSE Fees (1.12%):</span>
                        <span className="font-medium text-slate-800 tabular-nums">Rs. {t.totalExpenses.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* 70/30 Split Breakdown */}
                    {isProfit && (
                      <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-emerald-950 block">
                            70% Re-investment:
                          </span>
                          <span className="text-[#15803D] font-bold tabular-nums">
                            +{formatLKR(t.reinvest70)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-sky-950 block">
                            30% Amma Payout:
                          </span>
                          <span className="text-sky-800 font-bold tabular-nums">
                            +{formatLKR(t.payout30)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* View Receipt Button if receipt exists */}
                    {matchedReceipt && onViewReceipt && (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => {
                            setSelectedDayTrades(null);
                            onViewReceipt(matchedReceipt);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3 py-1 text-2xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 text-teal-700" />
                          <span>View Saved Contract Note PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};