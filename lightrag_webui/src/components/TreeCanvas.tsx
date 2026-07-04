import { useRef, useEffect, useState, useCallback } from 'react'
import type { TreeNode, TreeStructure } from '@/api/lightrag'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'

// ── Layout helpers ─────────────────────────────────────────────────────────

interface LayoutNode {
  id: string
  title: string
  nodeId: string
  summary: string
  text: string
  children: LayoutNode[]
  _depth: number
  x: number
  y: number
  w: number
  h: number
}

const NODE_PAD_X = 24
const NODE_PAD_Y = 14
const NODE_MIN_W = 90
const LEVEL_GAP_X = 72
const SIBLING_GAP_Y = 16
const FONT_SIZE = 13
const NODE_RADIUS = 10

// Shared text measurer (created once)
let _measurer: CanvasRenderingContext2D | null = null
function ensureMeasurer(): CanvasRenderingContext2D {
  if (!_measurer) _measurer = document.createElement('canvas').getContext('2d')!
  return _measurer
}

function measureText(text: string, bold = true, size = FONT_SIZE): number {
  const ctx = ensureMeasurer()
  ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`
  return ctx.measureText(text).width
}

function buildLayoutNode(node: TreeNode, depth = 0): LayoutNode {
  const children = node.nodes
    ? node.nodes.map((c) => buildLayoutNode(c, depth + 1))
    : []

  const title = node.title || ''
  const summary = node.summary || node.prefix_summary || ''

  const tw = measureText(title) + NODE_PAD_X * 2
  const sw = summary
    ? measureText(summary.slice(0, 40), false, FONT_SIZE - 2) + NODE_PAD_X * 2
    : 0
  const w = Math.max(tw, sw, NODE_MIN_W)
  const h = FONT_SIZE * 1.4 + NODE_PAD_Y * 2 + (summary ? FONT_SIZE * 1.2 + 4 : 0)

  return {
    id: node.node_id || node.title,
    title,
    nodeId: node.node_id || '',
    summary,
    text: node.text || '',
    children,
    _depth: depth,
    x: 0, y: 0, w, h,
  }
}

function layoutTree(root: LayoutNode, startX = 0, startY = 0) {
  function calcHeight(n: LayoutNode): number {
    if (n.children.length === 0) return n.h
    const childH = n.children.reduce((s, c) => s + calcHeight(c), 0) + (n.children.length - 1) * SIBLING_GAP_Y
    return Math.max(n.h, childH)
  }
  function position(n: LayoutNode, x: number, y: number) {
    n.x = x; n.y = y
    if (n.children.length === 0) return
    const totalChildH = n.children.reduce((s, c) => s + calcHeight(c), 0) + (n.children.length - 1) * SIBLING_GAP_Y
    let childY = y + (n.h - totalChildH) / 2
    for (const child of n.children) {
      const childH = calcHeight(child)
      position(child, x + n.w + LEVEL_GAP_X, childY)
      childY += childH + SIBLING_GAP_Y
    }
  }
  calcHeight(root)
  position(root, startX, startY)
}

// ── Drawing helpers ────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/* Draw shadow rect (fast — no ctx.shadow which uses offscreen buffer) */
function drawShadow(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, alpha: number,
) {
  ctx.save()
  ctx.fillStyle = `rgba(0,0,0,${alpha})`
  ctx.translate(0, 2)
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()
}

/* Smooth bezier edge */
function drawEdge(
  ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string,
) {
  const dx = x2 - x1
  const cp = dx * 0.45
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.bezierCurveTo(x1 + cp, y1, x2 - cp, y2, x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
}

// ── Colors ────────────────────────────────────────────────────────────────

function palette(isDark: boolean, depth: number, isRoot: boolean) {
  if (isRoot) {
    return {
      bg: isDark ? '#064e3b' : '#059669',
      bgTop: isDark ? '#065f46' : '#10b981',
      text: '#ffffff',
      border_inner: isDark ? '#34d399' : '#d1fae5',
      border_outer: 'transparent',
      accent: isDark ? '#34d399' : '#a7f3d0',
    }
  }
  const idx = Math.min(depth - 1, 2)
  const lightBgs = ['#f8fafc', '#f1f5f9', '#ecfdf5']
  const darkBgs = ['#1e293b', '#1e293b', '#0f172a']
  return {
    bg: isDark ? darkBgs[idx] : lightBgs[idx],
    bgTop: '',
    text: isDark ? '#e2e8f0' : '#1e293b',
    border_inner: isDark ? '#475569' : '#94a3b8',
    border_outer: isDark ? '#334155' : '#cbd5e1',
    accent: isDark ? '#059669' : '#059669',
  }
}

// ── Selected node highlight color ──────────────────────────────────────────

function selectedBorderColor(isDark: boolean) {
  return isDark ? '#34d399' : '#059669'
}

// ── Fast draw: single-pass edge + node (with optional shadow skip) ─────────

function drawNode(
  ctx: CanvasRenderingContext2D,
  n: LayoutNode,
  isDark: boolean,
  skipShadow: boolean,
  selectedId: string | null,
) {
  const isRoot = n.nodeId === '0000' || n._depth === 0
  const isSelected = n.id === selectedId
  const p = palette(isDark, n._depth, isRoot)
  const { x, y, w, h } = n
  const r = NODE_RADIUS

  // Shadow (skipped during drag for speed)
  if (!skipShadow) {
    drawShadow(ctx, x, y, w, h, r, isDark ? 0.35 : 0.1)
  }

  // Node fill
  if (isRoot) {
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, p.bgTop)
    grad.addColorStop(1, p.bg)
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = p.bg
  }
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()

  // Left accent bar
  if (!isRoot) {
    ctx.fillStyle = p.accent
    ctx.fillRect(x, y + 5, 4, h - 10)
  }

  // Outer border (thicker, softer)
  if (isSelected) {
    ctx.strokeStyle = selectedBorderColor(isDark)
    ctx.lineWidth = 3
    roundRect(ctx, x, y, w, h, r)
    ctx.stroke()
  } else if (!isRoot) {
    ctx.strokeStyle = p.border_outer
    ctx.lineWidth = 1.5
    roundRect(ctx, x, y, w, h, r)
    ctx.stroke()
  }

  // Inner border (thinner, darker — creates double-border effect)
  if (!isRoot && !isSelected) {
    ctx.strokeStyle = p.border_inner
    ctx.lineWidth = 1
    roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3))
    ctx.stroke()
  }

  // Root node thin inner border
  if (isRoot && !isSelected) {
    ctx.strokeStyle = p.border_inner
    ctx.lineWidth = 1
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2))
    ctx.stroke()
  }

  // Title
  ctx.fillStyle = isSelected ? (isDark ? '#6ee7b7' : '#047857') : p.text
  ctx.font = `bold ${FONT_SIZE}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(n.title, x + NODE_PAD_X, y + NODE_PAD_Y + FONT_SIZE / 2)

  // Summary
  if (n.summary) {
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'
    ctx.font = `${FONT_SIZE - 2}px system-ui, sans-serif`
    ctx.fillText(n.summary.slice(0, 40), x + NODE_PAD_X, y + NODE_PAD_Y + FONT_SIZE * 1.6 + 4)
  }
}

function drawNodeRecursive(
  ctx: CanvasRenderingContext2D,
  n: LayoutNode,
  isDark: boolean,
  edgeColor: string,
  skipShadow: boolean,
  selectedId: string | null,
) {
  // Edges first (behind nodes)
  for (const child of n.children) {
    drawEdge(ctx, n.x + n.w, n.y + n.h / 2, child.x, child.y + child.h / 2, edgeColor)
  }
  for (const child of n.children) {
    drawNodeRecursive(ctx, child, isDark, edgeColor, skipShadow, selectedId)
  }
  drawNode(ctx, n, isDark, skipShadow, selectedId)
}

// ── Pure draw function ─────────────────────────────────────────────────────

const _sizeCache = { w: 0, h: 0 }

function draw(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  layoutRoots: LayoutNode[],
  docName: string | undefined,
  px: number,
  py: number,
  zm: number,
  skipShadow: boolean,
  selectedId: string | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx || layoutRoots.length === 0) return

  const dpr = window.devicePixelRatio || 1
  const cw = container.clientWidth
  const ch = container.clientHeight

  // Only resize canvas when container size actually changes
  if (cw !== _sizeCache.w || ch !== _sizeCache.h) {
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    _sizeCache.w = cw
    _sizeCache.h = ch
  }

  // Quick clear
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)

  ctx.save()
  ctx.translate(px, py)
  ctx.scale(zm, zm)

  const isDark = document.documentElement.classList.contains('dark')
  const edgeColor = isDark ? '#334155' : '#cbd5e1'

  for (const root of layoutRoots) {
    drawNodeRecursive(ctx, root, isDark, edgeColor, skipShadow, selectedId)
  }

  ctx.restore()
}

// ── Node detail panel ──────────────────────────────────────────────────────

function NodeDetail({
  node,
  onClose,
}: {
  node: LayoutNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="absolute right-2 top-2 bottom-2 z-20 w-80 overflow-hidden rounded-lg border border-border/40 bg-card/95 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <h3 className="truncate text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {node.title}
        </h3>
        <button
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(100% - 40px)' }}>
        {node.text ? (
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80">
            {node.text}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            {node.summary || t('treeViewer.noContent', 'No content available')}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Canvas MindMap Component ───────────────────────────────────────────────

export default function TreeCanvas({
  tree,
  docName,
}: {
  tree: TreeStructure
  docName?: string
}) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null)
  const [renderTick, setRenderTick] = useState(0)
  const draggingRef = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const panRef = useRef({ x: 40, y: 20 })
  const zoomRef = useRef(1)
  const rafRef = useRef<number>(0)
  const layoutRef = useRef<LayoutNode[]>([])

  // Pre-compute layout tree once (not every frame)
  useEffect(() => {
    const nodes = tree.structure || []
    const result = nodes.map((n) => buildLayoutNode(n, 0))
    let startY = 0
    for (const root of result) {
      layoutTree(root, 0, startY)
      startY += root.h + 40
    }
    layoutRef.current = result
    setSelectedNode(null) // clear selection on tree change
  }, [tree])

  // Draw using current ref values (no layout recomputation)
  const drawNow = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const skipShadow = draggingRef.current
    draw(
      canvas, container, layoutRef.current, docName,
      panRef.current.x, panRef.current.y, zoomRef.current,
      skipShadow, selectedNode?.id ?? null,
    )
  }, [docName, selectedNode, renderTick])

  useEffect(() => { drawNow() }, [drawNow])

  // Compute bounding box of all layout nodes
  function computeTreeBounds(nodes: LayoutNode[]): {
    minX: number; minY: number; maxX: number; maxY: number
  } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    function walk(list: LayoutNode[]) {
      for (const n of list) {
        if (n.x < minX) minX = n.x
        if (n.y < minY) minY = n.y
        if (n.x + n.w > maxX) maxX = n.x + n.w
        if (n.y + n.h > maxY) maxY = n.y + n.h
        walk(n.children)
      }
    }
    walk(nodes)
    return { minX, minY, maxX, maxY }
  }

  // Auto-center tree via requestAnimationFrame (ensures layout is settled)
  useEffect(() => {
    zoomRef.current = 1
    setZoom(1)
    requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) {
        panRef.current = { x: 40, y: 20 }
        setRenderTick((t) => t + 1)
        return
      }
      const bounds = computeTreeBounds(layoutRef.current)
      if (bounds.minX === Infinity) {
        panRef.current = { x: 40, y: 20 }
        setRenderTick((t) => t + 1)
        return
      }
      const treeW = bounds.maxX - bounds.minX
      const treeH = bounds.maxY - bounds.minY
      const cw = container.clientWidth
      const ch = container.clientHeight
      const pad = 40
      const px = (cw - treeW) / 2 - bounds.minX
      const py = (ch - treeH) / 2 - bounds.minY
      panRef.current = { x: Math.max(pad, px), y: Math.max(pad, py) }
      setRenderTick((t) => t + 1)
    })
  }, [tree])

  // ── Mouse / wheel handlers ───────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoomRef.current = Math.max(0.2, Math.min(3, zoomRef.current * delta))
    setZoom(zoomRef.current)
    drawNow()
  }, [drawNow])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { x: panRef.current.x, y: panRef.current.y }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    panRef.current = {
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    }
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        drawNow()
      })
    }
  }, [drawNow])

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    drawNow()
  }, [drawNow])

  // Click: select node to show content (no collapse/expand)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

    function findNode(nodes: LayoutNode[]): LayoutNode | null {
      for (const n of nodes) {
        if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) return n
        if (n.children.length > 0) {
          const found = findNode(n.children)
          if (found) return found
        }
      }
      return null
    }
    const clicked = findNode(layoutRef.current)
    if (clicked) {
      setSelectedNode((prev) => (prev?.id === clicked.id ? null : clicked))
    } else {
      setSelectedNode(null)
    }
  }, [])

  // Cursor polling (avoids React state during drag)
  const [cursor, setCursor] = useState('grab')
  useEffect(() => {
    const id = setInterval(() => {
      setCursor(draggingRef.current ? 'grabbing' : 'grab')
    }, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden rounded-lg border border-border/30 bg-card/30"
      style={{ cursor }}
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        className="h-full w-full"
      />

      {/* Node detail panel */}
      {selectedNode && (
        <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-border/30 bg-card/80 p-1 shadow-sm backdrop-blur-sm">
        <button
          onClick={() => { zoomRef.current = Math.max(0.2, zoom * 0.8); setZoom(zoomRef.current); drawNow() }}
          className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
        >−</button>
        <span className="min-w-[40px] text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => { zoomRef.current = Math.min(3, zoom * 1.25); setZoom(zoomRef.current); drawNow() }}
          className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
        >+</button>
        <button
          onClick={() => {
            zoomRef.current = 1
            setZoom(1)
            const container = containerRef.current
            if (container) {
              const bounds = computeTreeBounds(layoutRef.current)
              if (bounds.minX !== Infinity) {
                const treeW = bounds.maxX - bounds.minX
                const treeH = bounds.maxY - bounds.minY
                const pad = 40
                panRef.current = {
                  x: Math.max(pad, (container.clientWidth - treeW) / 2 - bounds.minX),
                  y: Math.max(pad, (container.clientHeight - treeH) / 2 - bounds.minY),
                }
              }
            }
            drawNow()
          }}
          className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
        >⟲</button>
      </div>
      {/* Hint */}
      <div className="absolute bottom-3 left-3 rounded-md bg-card/60 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
        {t('treeViewer.clickToSelect', 'Click node to view content')} · {t('treeViewer.scrollToZoom')} · {t('treeViewer.dragToPan')}
      </div>
    </div>
  )
}
