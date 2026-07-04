import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  MapPinIcon, RouteIcon, Loader2Icon, RefreshCwIcon,
  DollarSignIcon, ArrowLeftRightIcon, TrendingUpIcon,
  FootprintsIcon, BusIcon, TrainIcon, CarIcon, BikeIcon,
  StarIcon, HistoryIcon, SearchIcon, XIcon, ClockIcon,
  ArrowRightIcon,
} from 'lucide-react'
import {
  planTrip, getTravelHistory, clearTravelCache,
  type TravelPlanResponse, type TravelMode, type SegmentDetail,
} from '@/api/lightrag'

const MODE_META: Record<string, { icon: React.ReactNode; border: string; bg: string }> = {
  步行: { icon: <FootprintsIcon className="size-4" />, border: 'border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/15' },
  公交: { icon: <BusIcon className="size-4" />, border: 'border-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/15' },
  地铁: { icon: <TrainIcon className="size-4" />, border: 'border-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/15' },
  出租车: { icon: <CarIcon className="size-4" />, border: 'border-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/15' },
  网约车: { icon: <CarIcon className="size-4" />, border: 'border-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/15' },
  自驾: { icon: <CarIcon className="size-4" />, border: 'border-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/15' },
  骑行: { icon: <BikeIcon className="size-4" />, border: 'border-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/15' },
}
const FM = { icon: <RouteIcon className="size-4" />, border: 'border-gray-300', bg: 'bg-gray-50 dark:bg-gray-900' }
function mm(k: string) { for (const [a, b] of Object.entries(MODE_META)) if (k.startsWith(a)) return b; return FM }

// ── 分段详情渲染 ──────────────────────────────────────────────────
function SegmentRow({ seg, index, isLast }: { seg: SegmentDetail; index: number; isLast: boolean }) {
  const { t } = useTranslation()
  if (seg.type === 'walk') {
    const d = seg.distance_m ?? 0
    const dur = seg.duration_min ?? (seg.duration_s ? Math.round(seg.duration_s / 60) : null)
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-sm shadow-sm dark:bg-emerald-900/50">🚶</span>
          {!isLast && <div className="mt-1 h-full w-0.5 rounded-full bg-gradient-to-b from-emerald-200 to-gray-100 dark:from-emerald-800 dark:to-gray-800" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-foreground/80">{t('travel.walk', '步行')}</span>
            {seg.not_recommended && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">{t('travel.notRecommended', '不推荐')}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {d > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-foreground/70 dark:bg-gray-900/50"><span className="text-emerald-500">↗</span> {d}{t('travel.meters', '米')}</span>}
            {dur != null && <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-foreground/70 dark:bg-gray-900/50"><ClockIcon className="size-3 text-blue-400" /> {dur}{t('travel.minutes', '分钟')}</span>}
          </div>
        </div>
      </div>
    )
  }
  if (seg.type === 'bus') {
    const name = seg.bus_name || ''
    const isMetro = name.includes('地铁') || name.includes('轨道交通')
    const line = isMetro
      ? name.split('(')[0].replace('(轨道交通)', '').replace('(地铁)', '').replace('(轻轨)', '').replace('轨道交通', '').replace('地铁', '').trim()
      : name
    const direction = name.includes('内环') ? '(内环)' : name.includes('外环') ? '(外环)' : ''
    const dur = seg.duration_min ?? (seg.duration_s ? Math.round(seg.duration_s / 60) : null)
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className={`flex size-8 items-center justify-center rounded-full text-sm shadow-sm ${isMetro ? 'bg-orange-100 dark:bg-orange-900/50' : 'bg-sky-100 dark:bg-sky-900/50'}`}>{isMetro ? '🚇' : '🚌'}</span>
          {!isLast && <div className="mt-1 h-full w-0.5 rounded-full bg-gradient-to-b from-gray-200 to-gray-100 dark:from-gray-700 dark:to-gray-800" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="text-[12px] font-semibold text-foreground/80">{isMetro ? `${t('travel.metro', '地铁/轻轨')} ${direction}` : t('travel.bus', '公交')}</div>
          {/* 线路名 + 站数 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${isMetro ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>{line}</span>
            {seg.via_num != null && seg.via_num > 0 && (
              <span className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-gray-900/50">{t('travel.stops', '途经')} {seg.via_num}{t('travel.stopsUnit', '站')}</span>
            )}
            {dur != null && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ClockIcon className="size-3" />{dur}{t('travel.minutes', '分钟')}</span>}
          </div>
          {/* 上车站/下车站 */}
          {(seg.departure || seg.arrival) && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border-2 border-gray-100 bg-white/60 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex flex-1 flex-col items-center">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{t('travel.board', '上车')}</span>
                <span className="mt-0.5 text-[13px] font-semibold text-foreground">{seg.departure || '—'}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <ArrowRightIcon className="size-3 text-muted-foreground/30" />
                <div className="h-4 w-0.5 rounded bg-gray-200 dark:bg-gray-600" />
                <ArrowRightIcon className="size-3 text-muted-foreground/30" />
              </div>
              <div className="flex flex-1 flex-col items-center">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">{t('travel.alight', '下车')}</span>
                <span className="mt-0.5 text-[13px] font-semibold text-foreground">{seg.arrival || '—'}</span>
              </div>
            </div>
          )}
          {/* 运营时间 */}
          {(seg.start_time || seg.end_time) && (
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <span>🕐 {seg.start_time || '—'} → {seg.end_time || '—'}</span>
            </div>
          )}
        </div>
      </div>
    )
  }
  if (seg.type === 'railway') {
    const trip = seg.trip || ''
    const trainType = trip.startsWith('G') ? ('高铁' as const) : trip.startsWith('D') ? ('动车' as const) : trip.startsWith('C') ? ('城际' as const) : ('火车' as const)
    const typeColor = trainType === '高铁' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
      : trainType === '动车' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    const dur = seg.duration_min ?? (seg.duration_s ? Math.round(seg.duration_s / 60) : null)
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-rose-100 text-sm shadow-sm dark:bg-rose-900/50">🚄</span>
          {!isLast && <div className="mt-1 h-full w-0.5 rounded-full bg-gradient-to-b from-rose-200 to-gray-100 dark:from-rose-800 dark:to-gray-800" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="text-[12px] font-semibold text-foreground/80">{t('travel.railway', '铁路')}</div>
          {/* 车次 + 类型 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ${typeColor}`}>{trainType}</span>
            <span className="rounded-md border-2 border-gray-200 bg-white/70 px-2 py-0.5 text-[13px] font-bold text-foreground dark:border-gray-600 dark:bg-gray-900/50">{trip || seg.train_name || ''}</span>
            {dur != null && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ClockIcon className="size-3" />{dur}{t('travel.minutes', '分钟')}</span>}
          </div>
          {/* 发站/到站 */}
          {(seg.departure || seg.arrival) && (
            <div className="mt-2 rounded-lg border-2 border-gray-100 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col items-center">
                  {seg.start_time && <span className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400">{seg.start_time}</span>}
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{t('travel.departStation', '出发站')}</span>
                  <span className="mt-0.5 text-[13px] font-semibold text-foreground">{seg.departure || '—'}</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <ArrowRightIcon className="size-3 text-muted-foreground/30" />
                  <div className="h-5 w-0.5 rounded bg-gray-200 dark:bg-gray-600" />
                  <span className="text-[9px] text-muted-foreground/50">{dur || ''}{t('travel.minutes', '分')}</span>
                  <div className="h-5 w-0.5 rounded bg-gray-200 dark:bg-gray-600" />
                  <ArrowRightIcon className="size-3 text-muted-foreground/30" />
                </div>
                <div className="flex flex-1 flex-col items-center">
                  {seg.end_time && <span className="text-[15px] font-bold text-blue-600 dark:text-blue-400">{seg.end_time}</span>}
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">{t('travel.arriveStation', '到达站')}</span>
                  <span className="mt-0.5 text-[13px] font-semibold text-foreground">{seg.arrival || '—'}</span>
                </div>
              </div>
            </div>
          )}
          {/* 票价 */}
          {seg.prices && seg.prices.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {seg.prices.map(([code, cost], pi) => (
                <span key={pi} className="rounded-md border-2 border-rose-100 bg-rose-50/60 px-2 py-0.5 text-[11px] dark:border-rose-900/40 dark:bg-rose-950/20">
                  <span className="text-muted-foreground">{code}</span>{' '}
                  <span className="font-semibold text-rose-500">{cost.toFixed(0)}</span>
                  <span className="text-[9px] text-muted-foreground">{t('travel.yuan', '元')}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (seg.type === 'driving') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-sm shadow-sm dark:bg-violet-900/50">🚗</span>
          {!isLast && <div className="mt-1 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="text-[12px] font-semibold text-foreground/80">{t('travel.drivingDetail', '驾车路线')}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border-2 border-gray-100 bg-white/60 p-2.5 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="text-[9px] text-muted-foreground/60">{t('travel.distance', '距离')}</div>
              <div className="text-[15px] font-bold text-foreground">{seg.distance_km}<span className="text-[11px] font-normal text-muted-foreground">{t('travel.km', '公里')}</span></div>
            </div>
            <div className="rounded-lg border-2 border-gray-100 bg-white/60 p-2.5 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="text-[9px] text-muted-foreground/60">{t('travel.duration', '耗时')}</div>
              <div className="text-[15px] font-bold text-foreground">{seg.duration_min}<span className="text-[11px] font-normal text-muted-foreground">{t('travel.minutes', '分钟')}</span></div>
            </div>
          </div>
          {/* 费用明细 */}
          <div className="mt-2 rounded-lg border-2 border-gray-100 bg-white/60 p-2.5 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="text-[9px] text-muted-foreground/60 mb-1.5">{t('travel.costBreakdown', '费用明细')}</div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><DollarSignIcon className="size-3 text-amber-500" />{t('travel.tolls', '高速费')}: <span className="font-semibold text-foreground">{seg.tolls_yuan?.toFixed(1) || 0}{t('travel.yuan', '元')}</span></span>
              <span className="flex items-center gap-1"><DollarSignIcon className="size-3 text-green-500" />{t('travel.gas', '油费')}: <span className="font-semibold text-foreground">{seg.gas_yuan?.toFixed(1) || 0}{t('travel.yuan', '元')}</span></span>
            </div>
            {seg.paths_count != null && seg.paths_count > 1 && (
              <div className="mt-1 text-[10px] text-muted-foreground/50">{t('travel.alternativePaths', '可选路线')}: {seg.paths_count}{t('travel.paths', '条')}</div>
            )}
          </div>
        </div>
      </div>
    )
  }
  if (seg.type === 'taxi') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-sm shadow-sm dark:bg-amber-900/50">🚕</span>
          {!isLast && <div className="mt-1 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="text-[12px] font-semibold text-foreground/80">{t('travel.taxiDetail', '出租车')}</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-lg border-2 border-gray-100 bg-white/60 p-2.5 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <div className="text-[9px] text-muted-foreground/60">{t('travel.distance', '距离')}</div>
              <div className="text-sm font-bold text-foreground">{seg.distance_km}<span className="text-[10px] font-normal text-muted-foreground">{t('travel.km', '公里')}</span></div>
            </div>
            <div className="rounded-lg border-2 border-gray-100 bg-white/60 p-2.5 text-center dark:border-gray-700 dark:bg-gray-900/40">
              <div className="text-[9px] text-muted-foreground/60">{t('travel.duration', '耗时')}</div>
              <div className="text-sm font-bold text-foreground">{seg.duration_min}<span className="text-[10px] font-normal text-muted-foreground">{t('travel.minutes', '分钟')}</span></div>
            </div>
            <div className="rounded-lg border-2 border-amber-100 bg-amber-50/60 p-2.5 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="text-[9px] text-amber-500/60">{t('travel.cost', '费用')}</div>
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400">{seg.cost_yuan}<span className="text-[10px] font-normal">{t('travel.yuan', '元')}</span></div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (seg.type === 'cycling') {
    const dur = seg.duration_min ?? null
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className="flex size-8 items-center justify-center rounded-full bg-cyan-100 text-sm shadow-sm dark:bg-cyan-900/50">🚲</span>
          {!isLast && <div className="mt-1 h-full w-0.5 bg-gray-200 dark:bg-gray-700" />}
        </div>
        <div className="min-w-0 flex-1 pb-5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-foreground/80">{t('travel.cycling', '骑行')}</span>
            {seg.not_recommended && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">{t('travel.notRecommended', '不推荐')}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-foreground/70 dark:bg-gray-900/50"><span className="text-cyan-500">↗</span> {seg.distance_km}{t('travel.km', '公里')}</span>
            {dur != null && <span className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-foreground/70 dark:bg-gray-900/50"><ClockIcon className="size-3 text-blue-400" /> {dur}{t('travel.minutes', '分钟')}</span>}
          </div>
        </div>
      </div>
    )
  }
  // fallback for unknown types
  return null
}

// ── 展开的详情卡片 ──────────────────────────────────────────────────
function ExpandedModeCard({ m, onClose }: { m: TravelMode; onClose: () => void }) {
  const { t } = useTranslation()
  const na = m.time_minutes === null && m.cost_yuan === null
  const meta = mm(m.mode)
  const segs = m._segments || []

  const segTimeline = m.notes?.split(' → ').filter(Boolean) ?? []
  const hasStructuredSegs = segs.length > 0 && segs.some(s => s.type !== 'walk' || s.distance_m !== undefined)

  // 汇总统计
  const totalWalk = segs.filter(s => s.type === 'walk').reduce((sum, s) => sum + (s.distance_m || 0), 0)
  const totalStops = segs.filter(s => s.type === 'bus').reduce((sum, s) => sum + (s.via_num || 0), 0)
  const priceByClass = segs.filter(s => s.type === 'railway').flatMap(s => s.prices || [])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white/95 shadow-lg backdrop-blur-sm transition-all duration-300 dark:bg-gray-900/95" style={{ borderColor: meta.border.replace('border-', '') }}>
      {/* 头部 */}
      <div className="flex items-center justify-between border-b-2 border-gray-100 px-5 py-3 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <span className={`flex size-10 items-center justify-center rounded-xl border-2 bg-white/80 dark:bg-gray-900/60 ${meta.border}`}>{meta.icon}</span>
          <div>
            <h2 className="text-base font-bold text-foreground">{m.mode}</h2>
            {!na && (
              <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><ClockIcon className="size-3.5" />{m.time_minutes}{t('travel.minutes', '分钟')}</span>
                <span className="inline-flex items-center gap-1"><DollarSignIcon className="size-3.5" />{m.cost_yuan}{t('travel.yuan', '元')}</span>
                {m.transfers != null && m.transfers > 0 && (
                  <span className="inline-flex items-center gap-1"><TrendingUpIcon className="size-3.5" />{t('travel.transfers', '换乘')}{m.transfers}{t('travel.times', '次')}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <button onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg border-2 border-gray-200 text-muted-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-gray-600 dark:hover:bg-red-950/20">
          <XIcon className="size-4" />
        </button>
      </div>

      {/* 详细内容 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        {hasStructuredSegs ? (
          <>
            {/* 行程摘要 */}
            {(totalWalk > 0 || totalStops > 0 || priceByClass.length > 0) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {totalWalk > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                    🚶 {t('travel.totalWalk', '总步行')} {totalWalk}{t('travel.meters', '米')}
                  </span>
                )}
                {totalStops > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] text-sky-600 dark:bg-sky-950/30 dark:text-sky-400">
                    🚏 {t('travel.totalStops', '途经')} {totalStops}{t('travel.stopsUnit', '站')}
                  </span>
                )}
              </div>
            )}

            {/* 分段时间轴 */}
            <div className="space-y-1">
              {segs.map((seg, i) => (
                <SegmentRow key={i} seg={seg} index={i} isLast={i === segs.length - 1} />
              ))}
            </div>

            {/* 全票价表 */}
            {priceByClass.length > 0 && (
              <div className="mt-3 rounded-xl border-2 border-rose-100 bg-rose-50/40 p-3 dark:border-rose-900/30 dark:bg-rose-950/10">
                <div className="mb-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">{t('travel.allPrices', '全部票价')}</div>
                <div className="flex flex-wrap gap-2">
                  {priceByClass.map(([code, cost], pi) => (
                    <span key={pi} className="rounded-lg bg-white/80 px-3 py-1.5 text-[12px] shadow-sm dark:bg-gray-900/60">
                      <span className="text-muted-foreground">{code}</span>{' '}
                      <span className="font-bold text-rose-500">{cost.toFixed(0)}</span>
                      <span className="text-[9px] text-muted-foreground">{t('travel.yuan', '元')}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* 降级：从 notes 文本解析 */
          <div className="space-y-1">
            {segTimeline.map((s, i) => {
              const last = i === segTimeline.length - 1
              const em = s.match(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\u2600-\u26FF]|[\u{1F000}-\u{1FFFF}]|[\u2300-\u23FF])/u)?.[0] || '•'
              const txt = s.replace(/^.\s*/, '').trim()
              return (
                <div key={i} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span className="flex size-7 items-center justify-center rounded-full bg-white/80 text-xs shadow-sm dark:bg-gray-900/60">{em}</span>
                    {!last && <div className="mt-0.5 h-full w-0.5 rounded-full bg-gradient-to-b from-gray-200 to-gray-100 dark:from-gray-700 dark:to-gray-800" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-4 pt-1">
                    <p className="text-[12px] leading-relaxed text-foreground/80">{txt}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 紧凑模式卡片 ──────────────────────────────────────────────────
function ModeCard({ m, best, onClick, isExpanded }: { m: TravelMode; best: boolean; onClick: () => void; isExpanded: boolean }) {
  const { t } = useTranslation()
  const na = m.time_minutes === null && m.cost_yuan === null
  const meta = mm(m.mode)
  const segs = (m.notes || '').split(' → ').filter(Boolean)
  const tl = segs.length > 1 && !na
  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded-xl border-2 transition-all duration-200 hover:shadow-md active:scale-[0.98] ${na ? 'border-gray-200 bg-gray-50/40 opacity-55 dark:border-gray-700 dark:bg-gray-900/20' : meta.bg + ' ' + meta.border} ${isExpanded ? 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-gray-900' : ''}`}
    >
      {best && !na && <div className="absolute -right-1 -top-2.5 flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm"><StarIcon className="size-2.5 fill-white" />{t('travel.recommendation', '推荐')}</div>}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`flex size-7 items-center justify-center rounded-lg border-2 bg-white/70 dark:bg-gray-900/60 ${meta.border}`}>{meta.icon}</span>
        <span className="text-sm font-semibold text-foreground">{m.mode}</span>
        {!na && <span className="ml-auto flex items-baseline gap-0.5 tabular-nums"><span className="text-lg font-bold text-foreground">{m.time_minutes}</span><span className="text-[10px] text-muted-foreground">{t('travel.minutes', '分钟')}</span></span>}
      </div>
      <div className="space-y-2 px-3 pb-3">
        {!na && <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 rounded-md bg-white/60 px-1.5 py-0.5 dark:bg-gray-900/40"><DollarSignIcon className="size-3" />{m.cost_yuan}<span className="text-[9px] opacity-60">{t('travel.yuan', '元')}</span></span>
          {m.transfers !== null && m.transfers > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-white/60 px-1.5 py-0.5 dark:bg-gray-900/40"><TrendingUpIcon className="size-3" />{t('travel.transfers', '换乘')} {m.transfers}{t('travel.times', '次')}</span>}
        </div>}
        {tl ? <div>{segs.map((s, i) => {
          const last = i === segs.length - 1
          const em = s.match(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\u2600-\u26FF]|[\u{1F000}-\u{1FFFF}]|[\u2300-\u23FF])/u)?.[0] || ''
          const txt = s.replace(/^.\s*/, '').trim()
          return <div key={i} className="flex items-start gap-2"><div className="flex flex-col items-center"><span className="flex size-5 items-center justify-center rounded-full bg-white/70 text-[10px] dark:bg-gray-900/50">{em || '•'}</span>{!last && <div className="h-3 w-0.5 bg-gray-200 dark:bg-gray-700" />}</div><span className="pt-0.5 text-[11px] leading-relaxed text-foreground/80">{txt}</span></div>
        })}</div> : <p className={`text-[11px] leading-relaxed ${na ? 'text-muted-foreground/60' : 'text-foreground/70'}`}>{m.notes}</p>}
      </div>
    </div>
  )
}

export default function TravelPlannerView() {
  const { t } = useTranslation()
  const [o, setO] = useState('')
  const [d, setD] = useState('')
  const [c, setC] = useState('重庆')
  const [res, setRes] = useState<TravelPlanResponse | null>(null)
  const [ld, setLd] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const plan = async (force = false) => {
    if (!o.trim() || !d.trim()) { toast.error(t('travel.inputRequired', '请输入起点和目的地')); return }
    setLd(true); setRes(null); setExpandedIdx(null)
    try { setRes(await planTrip({ origin: o.trim(), destination: d.trim(), city: c.trim() || undefined, force_refresh: force })) }
    catch { toast.error(t('travel.planError', '规划失败')) }
    finally { setLd(false) }
  }

  const bt = res?.modes?.find(m => m.time_minutes !== null)?.time_minutes ?? Infinity

  return (
    <div className="flex h-full gap-0 p-0">
      {/* ── 左侧控制台 ── */}
      <div className="flex w-80 shrink-0 flex-col border-r-2 border-gray-200 bg-white/60 p-4 dark:border-gray-700 dark:bg-gray-900/40">
        <div className="mb-4">
          <h1 className="text-base font-semibold text-foreground">{t('travel.title', '出行规划')}</h1>
          <p className="text-[11px] text-muted-foreground">{t('travel.description', '比较不同交通方式的时间和费用')}</p>
        </div>

        {/* 表单 */}
        <div className="flex flex-col gap-2.5">
          {/* 起点 */}
          <div className="relative">
            <MapPinIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-emerald-500" />
            <input value={o} onChange={e => setO(e.target.value)} placeholder={t('travel.originPlaceholder', '起点')}
              className="w-full rounded-lg border-2 border-gray-200 bg-white py-2 pl-7 pr-2.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900" />
          </div>
          {/* 交换按钮 */}
          <div className="flex justify-center">
            <button onClick={() => { setO(d); setD(o) }}
              className="flex size-7 items-center justify-center rounded-full border-2 border-gray-200 text-muted-foreground transition-colors hover:border-emerald-300 hover:text-emerald-600 dark:border-gray-600">
              <ArrowLeftRightIcon className="size-3" />
            </button>
          </div>
          {/* 目的地 */}
          <div className="relative">
            <MapPinIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-blue-500" />
            <input value={d} onChange={e => setD(e.target.value)} placeholder={t('travel.destPlaceholder', '目的地')}
              className="w-full rounded-lg border-2 border-gray-200 bg-white py-2 pl-7 pr-2.5 text-xs outline-none transition-colors focus:border-blue-400 dark:border-gray-600 dark:bg-gray-900" />
          </div>
          {/* 城市 */}
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">{t('travel.city', '城市')}</span>
            <input value={c} onChange={e => setC(e.target.value)}
              className="w-full rounded-lg border-2 border-gray-200 bg-white py-2 pl-10 pr-2.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900" />
          </div>
          {/* 规划按钮 */}
          <button onClick={() => plan(false)} disabled={ld}
            className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">
            {ld ? <Loader2Icon className="size-3.5 animate-spin" /> : <SearchIcon className="size-3.5" />}
            {t('travel.plan', '规划')}
          </button>
        </div>

        {/* 历史记录 */}
        <div className="mt-auto pt-4">
          <div className="border-t-2 border-gray-100 pt-4 dark:border-gray-800">
            <HistoryDrop onPick={(a, b, c2) => { setO(a); setD(b); setC(c2) }} />
          </div>
        </div>
      </div>

      {/* ── 右侧结果区 ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 加载中 */}
        {ld && (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-3 size-10 rounded-full border-[3px] border-emerald-200 border-t-emerald-500 animate-spin" />
              <p className="text-xs text-muted-foreground">{t('travel.planning', '正在规划路线...')}</p>
            </div>
          </div>
        )}

        {/* 结果 */}
        {res && !ld && (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 scrollbar-thin">
            {res.error && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-red-400">{t('travel.error', '错误')}</span>
                {res.error}
              </div>
            )}
            {!res.error && (
              <>
                <RouteInfo o={res.origin || ''} d={res.destination || ''} c={res.city} onRef={() => plan(true)} />
                {expandedIdx !== null ? (
                  /* ── 展开详情视图 ── */
                  <div className="flex flex-1 flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <button
                      onClick={() => setExpandedIdx(null)}
                      className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      ← {t('travel.backToList', '返回列表')}
                    </button>
                    {res.modes && res.modes[expandedIdx] && (
                      <ExpandedModeCard
                        m={res.modes[expandedIdx]}
                        onClose={() => setExpandedIdx(null)}
                      />
                    )}
                    {(!res.modes || !res.modes[expandedIdx]) && (
                      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                        {t('travel.noModes', '暂无可用方案')}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── 列表视图 ── */
                  <>
                    {res.modes && res.modes.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {res.modes.map((m, i) => (
                          <ModeCard
                            key={i}
                            m={m}
                            best={m.time_minutes !== null && m.time_minutes === bt}
                            onClick={() => setExpandedIdx(i)}
                            isExpanded={false}
                          />
                        ))}
                      </div>
                    )}
                    {res.recommendation && <Reco text={res.recommendation} />}
                    {(!res.modes || res.modes.length === 0) && (
                      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                        {t('travel.noModes', '暂无可用方案')}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* 空状态 */}
        {!res && !ld && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-blue-100 dark:from-emerald-950/30 dark:to-blue-950/30">
              <RouteIcon className="size-8 text-emerald-500/60" />
            </div>
            <p className="text-xs text-muted-foreground">{t('travel.empty', '输入起点和目的地，开始规划')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RouteInfo({ o, d, c, onRef }: { o: string; d: string; c?: string; onRef: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-gray-200 bg-white/70 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900/50">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">{t('travel.originMarker', '起')}</span>
        <span className="truncate font-medium text-foreground">{o}</span>
        <span className="shrink-0 text-muted-foreground/40">→</span>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-600 dark:bg-blue-900 dark:text-blue-300">{t('travel.destMarker', '终')}</span>
        <span className="truncate font-medium text-foreground">{d}</span>
        {c && <span className="hidden shrink-0 text-muted-foreground sm:inline">· {c}</span>}
      </div>
      <button onClick={onRef} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent dark:border-gray-600"><RefreshCwIcon className="size-3" />{t('travel.refresh', '刷新')}</button>
    </div>
  )
}

function Reco({ text }: { text: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 dark:border-emerald-800 dark:from-emerald-950/20 dark:to-emerald-950/10">
      <div className="mb-1 flex items-center gap-1.5"><StarIcon className="size-4 fill-emerald-500 text-emerald-500" /><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{t('travel.recommendation', '推荐')}</span></div>
      <p className="text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-300">{text}</p>
    </div>
  )
}

function HistoryDrop({ onPick }: { onPick: (o: string, d: string, c: string) => void }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const load = useCallback(async () => { try { const r = await getTravelHistory(); setEntries(r.entries) } catch { } }, [])
  return (
    <div>
      <button onClick={() => { setOpen(!open); if (!open) load() }}
        className="flex w-full items-center gap-2 rounded-lg border-2 border-gray-200 px-3 py-2 text-xs text-foreground/70 transition-colors hover:bg-accent dark:border-gray-600">
        <HistoryIcon className="size-3.5" />
        <span className="flex-1 text-left">{t('travel.history', '历史记录')}</span>
        <span className={`text-muted-foreground/40 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b-2 border-gray-100 px-3 py-1.5 dark:border-gray-800">
            <span className="text-[10px] font-medium text-muted-foreground/60">{t('travel.recordCount', { count: entries.length })}</span>
            <button onClick={async () => { await clearTravelCache(); setEntries([]); toast.success(t('travel.cleared', '已清除')) }}
              className="text-[10px] text-red-400 hover:text-red-500">{t('travel.clear', '清除')}</button>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted-foreground">{t('travel.noHistory', '暂无记录')}</p>
            ) : (
              <div className="divide-y-2 divide-gray-100 dark:divide-gray-800">
                {entries.map((e: any, i: number) => (
                  <button key={i} onClick={() => { onPick(e.origin, e.destination, e.city || '重庆'); setOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-foreground/70 transition-colors hover:bg-accent">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <HistoryIcon className="size-2.5" />
                    </span>
                    <span className="truncate">{e.origin} <span className="text-muted-foreground/30">→</span> {e.destination}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
