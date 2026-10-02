import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { SendIcon, LightbulbIcon, Loader2Icon, ZoomInIcon, ZoomOutIcon, DatabaseIcon, FileTextIcon, XIcon, ChevronDownIcon, UploadIcon } from 'lucide-react'
import { exploreInitTree, exploreExpandNode, exploreGenerateContent, exploreGenerateFullArticle, exploreListWorkspaces, exploreSaveTree, exploreListTrees, exploreLoadTree, exploreDeleteTree, exploreImportMarkdown } from '@/api/lightrag'
import { toast } from 'sonner'
import type { TreeNode, TreeStructure, WorkspaceItem, SavedTreeMeta, AncestorNode, SiblingNode } from '@/api/lightrag'

const SUGGESTED_TOPICS = [
  '人工智能发展史',
  '量子计算基础',
  'Web 应用架构',
  '气候变化',
]

// ── Types ──────────────────────────────────────────────────────────────────

interface LayoutNode {
  id: string
  title: string
  nodeId: string
  summary: string
  children: LayoutNode[]
  _depth: number
  x: number
  y: number
  w: number
  h: number
}

// ── Layout constants ───────────────────────────────────────────────────────

const NODE_PAD_X = 20
const NODE_PAD_Y = 12
const NODE_MIN_W = 80
const LEVEL_GAP_X = 64
const SIBLING_GAP_Y = 14
const FONT_SIZE = 13
const NODE_RADIUS = 8

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
  const children = node.nodes ? node.nodes.map((c) => buildLayoutNode(c, depth + 1)) : []
  const title = node.title || ''
  const summary = node.summary || ''
  const tw = measureText(title) + NODE_PAD_X * 2
  const sw = summary ? measureText(summary.slice(0, 30), false, FONT_SIZE - 2) + NODE_PAD_X * 2 : 0
  const w = Math.max(tw, sw, NODE_MIN_W)
  const h = FONT_SIZE * 1.4 + NODE_PAD_Y * 2 + (summary ? FONT_SIZE * 1.2 + 4 : 0)
  return {
    id: node.node_id || node.title,
    title,
    nodeId: node.node_id || '',
    summary,
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

function drawEdge(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx = x2 - x1
  const cp = dx * 0.45
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.bezierCurveTo(x1 + cp, y1, x2 - cp, y2, x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  n: LayoutNode,
  isDark: boolean,
  isSelected: boolean,
  isExpanding: boolean,
) {
  const { x, y, w, h } = n
  const r = NODE_RADIUS
  const isRoot = n._depth === 0

  // Shadow
  ctx.save()
  ctx.fillStyle = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'
  ctx.translate(0, 2)
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()

  // Fill
  if (isRoot) {
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, isDark ? '#065f46' : '#10b981')
    grad.addColorStop(1, isDark ? '#064e3b' : '#059669')
    ctx.fillStyle = grad
  } else {
    ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc'
  }
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()

  // Left accent bar (non-root)
  if (!isRoot) {
    ctx.fillStyle = isDark ? '#059669' : '#059669'
    ctx.fillRect(x, y + 4, 3, h - 8)
  }

  // Border
  if (isSelected) {
    ctx.strokeStyle = isDark ? '#34d399' : '#059669'
    ctx.lineWidth = 2.5
    roundRect(ctx, x, y, w, h, r)
    ctx.stroke()
  } else if (isRoot) {
    ctx.strokeStyle = isDark ? '#34d399' : '#d1fae5'
    ctx.lineWidth = 1
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2))
    ctx.stroke()
  } else {
    // Child node border
    ctx.strokeStyle = isDark ? '#344966' : '#cbd5e1'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, r)
    ctx.stroke()
  }

  // Title
  ctx.fillStyle = isRoot ? '#ffffff' : (isSelected ? (isDark ? '#6ee7b7' : '#047857') : (isDark ? '#e2e8f0' : '#1e293b'))
  ctx.font = `bold ${FONT_SIZE}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(n.title, x + NODE_PAD_X, y + NODE_PAD_Y + FONT_SIZE / 2)

  // Summary
  if (n.summary && !isRoot) {
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'
    ctx.font = `${FONT_SIZE - 2}px system-ui, sans-serif`
    ctx.fillText(n.summary.slice(0, 30), x + NODE_PAD_X, y + NODE_PAD_Y + FONT_SIZE * 1.6 + 4)
  }

  // Expanding spinner
  if (isExpanding) {
    const dotX = x + w - NODE_PAD_X - 14
    const dotY = y + h / 2
    const ts = Date.now() / 350
    for (let i = 0; i < 3; i++) {
      const alpha = 0.3 + ((Math.sin(ts + i * 2) + 1) / 2) * 0.7
      ctx.globalAlpha = alpha
      ctx.fillStyle = isRoot ? '#bef264' : '#10b981'
      ctx.beginPath()
      ctx.arc(dotX + i * 6, dotY, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

// ── Pure draw function ─────────────────────────────────────────────────────

function drawTree(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  root: LayoutNode | null,
  px: number,
  py: number,
  zm: number,
  selectedId: string | null,
  expandingId: string | null,
  draggedNodeId: string | null = null,
) {
  const ctxOrNull = canvas.getContext('2d')
  if (!ctxOrNull || !root) return
  const ctx: CanvasRenderingContext2D = ctxOrNull

  const dpr = window.devicePixelRatio || 1
  const cw = container.clientWidth
  const ch = container.clientHeight

  // Only resize canvas when dimensions actually change to prevent flickering
  const targetWidth = Math.floor(cw * dpr)
  const targetHeight = Math.floor(ch * dpr)
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)

  ctx.save()
  ctx.translate(px, py)
  ctx.scale(zm, zm)

  // ── Draw grid background ──────────────────────────────────────────
  const isDark = document.documentElement.classList.contains('dark')
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.06)'
  const gridSpacing = 40
  // Calculate visible area in canvas coordinates
  const viewLeft = -px / zm
  const viewTop = -py / zm
  const viewRight = viewLeft + cw / zm
  const viewBottom = viewTop + ch / zm
  // Snap to grid
  const startX = Math.floor(viewLeft / gridSpacing) * gridSpacing
  const startY = Math.floor(viewTop / gridSpacing) * gridSpacing

  ctx.strokeStyle = gridColor
  ctx.lineWidth = 1 / zm
  ctx.beginPath()
  for (let x = startX; x <= viewRight; x += gridSpacing) {
    ctx.moveTo(x, viewTop)
    ctx.lineTo(x, viewBottom)
  }
  for (let y = startY; y <= viewBottom; y += gridSpacing) {
    ctx.moveTo(viewLeft, y)
    ctx.lineTo(viewRight, y)
  }
  ctx.stroke()

  const edgeColor = isDark ? '#334155' : '#cbd5e1'

  // Draw edges recursively
  function drawEdges(n: LayoutNode) {
    for (const child of n.children) {
      drawEdge(ctx, n.x + n.w, n.y + n.h / 2, child.x, child.y + child.h / 2, edgeColor)
      drawEdges(child)
    }
  }
  drawEdges(root)

  // Draw nodes recursively (nodes on top of edges)
  function drawNodes(n: LayoutNode) {
    // Skip the dragged node — draw it last so it's on top
    if (n.id === draggedNodeId) {
      for (const child of n.children) drawNodes(child)
      return
    }
    drawNode(ctx, n, isDark, n.id === selectedId, n.id === expandingId)
    for (const child of n.children) drawNodes(child)
  }
  drawNodes(root)
  // Draw dragged node on top
  if (draggedNodeId) {
    function findNode(n: LayoutNode): LayoutNode | null {
      if (n.id === draggedNodeId) return n
      for (const child of n.children) {
        const found = findNode(child)
        if (found) return found
      }
      return null
    }
    const dn = findNode(root)
    if (dn) drawNode(ctx, dn, isDark, true, dn.id === expandingId)
  }

  ctx.restore()
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function TreeMindExplore() {
  const { t } = useTranslation()
  const [topic, setTopic] = useState('')
  const [treeData, setTreeData] = useState<TreeStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // ── Per-node keywords state ──────────────────────────────────────
  const [nodeKeywords, setNodeKeywords] = useState<Record<string, string>>({})

  // ── Article generation state ──────────────────────────────────────
  const [headingStyle, setHeadingStyle] = useState('markdown')
  const [generatingArticle, setGeneratingArticle] = useState(false)
  const [generatedArticle, setGeneratedArticle] = useState<string | null>(null)

  // ── Save / Load state ────────────────────────────────────────────
  const [currentTreeId, setCurrentTreeId] = useState('')
  const [savedTrees, setSavedTrees] = useState<SavedTreeMeta[]>([])
  const [showSavePanel, setShowSavePanel] = useState(false)
  const [savingTree, setSavingTree] = useState(false)
  const savePanelRef = useRef<HTMLDivElement>(null)

  // ── Import state ─────────────────────────────────────────────────
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importMarkdownText, setImportMarkdownText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const handleImportFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.md') && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      toast.error('请选择 .md 格式的 Markdown 文件')
      return
    }
    setImportFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setImportMarkdownText(text)
    }
    reader.readAsText(file, 'utf-8')
    // Reset so the same file can be re-selected
    e.target.value = ''
  }, [])

  // ── Context menu state ───────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: LayoutNode
  } | null>(null)
  const [contextKeywords, setContextKeywords] = useState('')
  const [generatingContent, setGeneratingContent] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // ── Knowledge Base selector state (multi-select) ──────────────────
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<string[]>([])
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const wsDropdownRef = useRef<HTMLDivElement>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<LayoutNode | null>(null)
  const panRef = useRef({ x: 40, y: 20 })
  const zoomRef = useRef(1)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })
  const lastClickRef = useRef({ time: 0, x: 0, y: 0 })
  const nodeDragRef = useRef<{
    node: LayoutNode
    startMouseX: number
    startMouseY: number
    startNodeX: number
    startNodeY: number
  } | null>(null)

  // Rebuild layout from treeData
  const rebuildLayout = useCallback((data: TreeStructure) => {
    const nodes = data.structure || []
    if (nodes.length === 0) { rootRef.current = null; return }
    const root = buildLayoutNode(nodes[0], 0)
    layoutTree(root, 0, 0)
    rootRef.current = root

    // Auto-center
    requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return
      const ch = container.clientHeight
      const pad = 60
      panRef.current = { x: pad, y: Math.max(pad, ch / 2 - root.h / 2) }
      zoomRef.current = 1
      drawFrame()
    })
  }, [])

  useEffect(() => {
    if (treeData) rebuildLayout(treeData)
  }, [treeData, rebuildLayout])

  // Draw
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const draggedId = nodeDragRef.current?.node.id ?? null
    drawTree(
      canvas, container, rootRef.current,
      panRef.current.x, panRef.current.y, zoomRef.current,
      selectedNodeId, expandingNodeId, draggedId,
    )
  }, [selectedNodeId, expandingNodeId])

  useEffect(() => { drawFrame() }, [drawFrame])

  // Animate spinner while expanding
  useEffect(() => {
    if (!expandingNodeId) return
    const id = setInterval(drawFrame, 200)
    return () => clearInterval(id)
  }, [expandingNodeId, drawFrame])

  // ── Load workspaces / knowledge bases ────────────────────────────

  useEffect(() => {
    exploreListWorkspaces().then((data) => {
      setWorkspaces(data.workspaces)
    }).catch(() => {})
  }, [])

  // ── Close context menu / dropdown on outside click ────────────────

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setContextKeywords('')
      }
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  // ── Generate initial tree ─────────────────────────────────────────

  const handleGenerate = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setTreeData(null)
    setSelectedNodeId(null)
    setExpandingNodeId(null)
    try {
      const data = await exploreInitTree(topic.trim(), 4)
      setTreeData(data)
    } catch (err) {
      console.error('Failed to generate tree:', err)
      toast.error(t('treeMindExplore.generateError', '生成失败，请重试或换个主题'))
    } finally {
      setLoading(false)
    }
  }

  // ── Expand handler (must be before handleCanvasClick) ─────────────

  const handleExpandNode = async (node: LayoutNode) => {
    if (expandingNodeId) return // already expanding
    setExpandingNodeId(node.id)

    // ── Collect ancestors & siblings from current treeData ──────────
    const ancestors: AncestorNode[] = []
    const siblings: SiblingNode[] = []

    if (treeData) {
      // Find ancestor chain: root → … → parent (exclusive)
      function findAncestors(nodes: TreeNode[], chain: { title: string; summary: string }[]): boolean {
        for (const n of nodes) {
          if (n.node_id === node.nodeId || n.title === node.title) {
            // Found the target — chain contains all ancestors
            for (const c of chain) {
              ancestors.push({ title: c.title, summary: c.summary || '' })
            }
            return true
          }
          if (n.nodes && n.nodes.length > 0) {
            chain.push({ title: n.title, summary: n.summary || '' })
            if (findAncestors(n.nodes, chain)) return true
            chain.pop()
          }
        }
        return false
      }
      findAncestors(treeData.structure, [])

      // Find sibling nodes (children of the same parent that already exist)
      function findSiblings(nodes: TreeNode[]): boolean {
        for (const n of nodes) {
          if (n.node_id === node.nodeId || n.title === node.title) {
            // This node IS the target — siblings are the OTHER children of its parent
            // We need to look at the parent's children array
            return true
          }
          if (n.nodes && n.nodes.length > 0) {
            // Check if any child matches our target
            const match = n.nodes.find((c) => c.node_id === node.nodeId || c.title === node.title)
            if (match) {
              // n is the parent — collect all children except the target as siblings
              for (const sib of n.nodes) {
                if (sib !== match) {
                  siblings.push({ title: sib.title, summary: sib.summary || '' })
                }
              }
              return true
            }
            if (findSiblings(n.nodes)) return true
          }
        }
        return false
      }
      findSiblings(treeData.structure)
    }

    try {
      const result = await exploreExpandNode(node.title, node.summary, 4, ancestors, siblings)
      if (result.nodes.length === 0) return

      // Merge generated nodes into treeData
      setTreeData((prev) => {
        if (!prev) return prev
        const updated = JSON.parse(JSON.stringify(prev)) as TreeStructure

        // Count existing nodes to compute unique node_ids for new children
        function countAll(structure: TreeNode[]): number {
          let total = 0
          for (const n of structure) {
            total += 1
            if (n.nodes) total += countAll(n.nodes)
          }
          return total
        }
        const totalCount = countAll(updated.structure)

        // Find the target node by node_id ONLY (no title fallback)
        let foundCounter = totalCount
        function mergeInto(structure: TreeNode[]): boolean {
          for (const n of structure) {
            if (n.node_id === node.nodeId) {
              // Assign unique node_ids to new children
              const newNodes = result.nodes.map((c, i) => ({
                ...c,
                node_id: `${(foundCounter + i + 1).toString().padStart(4, '0')}`,
              }))
              n.nodes = [...(n.nodes || []), ...newNodes]
              foundCounter += result.nodes.length
              return true
            }
            if (n.nodes && mergeInto(n.nodes)) return true
          }
          return false
        }

        if (!mergeInto(updated.structure)) {
          // Fallback: if node_id not found, try matching by title (deep search)
          function findByTitle(structure: TreeNode[]): boolean {
            for (const n of structure) {
              if (n.title === node.title) {
                const newNodes = result.nodes.map((c, i) => ({
                  ...c,
                  node_id: `${(foundCounter + i + 1).toString().padStart(4, '0')}`,
                }))
                n.nodes = [...(n.nodes || []), ...newNodes]
                foundCounter += result.nodes.length
                return true
              }
              if (n.nodes && findByTitle(n.nodes)) return true
            }
            return false
          }
          findByTitle(updated.structure)
        }
        return updated
      })
    } catch (err) {
      console.error('Failed to expand node:', err)
    } finally {
      setExpandingNodeId(null)
    }
  }

  // Hit-test helper: find LayoutNode at canvas coordinates
  const hitTestNode = useCallback((mx: number, my: number): LayoutNode | null => {
    function search(n: LayoutNode): LayoutNode | null {
      if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) return n
      // Search children in reverse so topmost (last drawn) is found first
      for (let i = n.children.length - 1; i >= 0; i--) {
        const found = search(n.children[i])
        if (found) return found
      }
      return null
    }
    return rootRef.current ? search(rootRef.current) : null
  }, [])

  // ── Click / Double-click ──────────────────────────────────────────

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !rootRef.current) return

    // Check if this was actually a drag (mouse moved >5px)
    const drag = nodeDragRef.current
    if (drag) {
      const dx = Math.abs(e.clientX - drag.startMouseX)
      const dy = Math.abs(e.clientY - drag.startMouseY)
      if (dx > 5 || dy > 5) return // Was a drag, not a click
    }
    if (draggingRef.current) return // Was a canvas pan

    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

    const clicked = hitTestNode(mx, my)

    const now = Date.now()
    const dt = now - lastClickRef.current.time
    const dx = Math.abs(e.clientX - lastClickRef.current.x)
    const dy = Math.abs(e.clientY - lastClickRef.current.y)
    lastClickRef.current = { time: now, x: e.clientX, y: e.clientY }

    if (dt < 400 && dx < 8 && dy < 8 && clicked) {
      // Double-click — expand
      handleExpandNode(clicked)
      return
    }

    // Single click — select
    setSelectedNodeId(clicked ? clicked.id : null)
  }, [hitTestNode])

  // ── Cursor tracking ───────────────────────────────────────────────

  const [cursorStyle, setCursorStyle] = useState('default')

  // ── Right-click context menu ──────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas || !rootRef.current) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current
    const clicked = hitTestNode(mx, my)
    if (!clicked) return
    setContextMenu({ x: e.clientX, y: e.clientY, node: clicked })
    setContextKeywords('')
    setGeneratedContent(null)
  }, [hitTestNode])

  // ── Generate content from node ────────────────────────────────────

  const handleGenerateContent = async () => {
    const menu = contextMenu
    if (!menu) return
    setGeneratingContent(true)
    setGeneratedContent(null)
    try {
      const result = await exploreGenerateContent(
        menu.node.title,
        contextKeywords,
        selectedWorkspaces,
      )
      setGeneratedContent(result.content || '（无内容生成）')
    } catch (err) {
      console.error('Failed to generate content:', err)
      setGeneratedContent('生成失败，请重试')
    } finally {
      setGeneratingContent(false)
    }
  }

  // ── Add custom child node ────────────────────────────────────────

  const [customChildInput, setCustomChildInput] = useState('')

  const handleAddCustomChild = () => {
    const menu = contextMenu
    if (!menu || !treeData || !customChildInput.trim()) return
    const targetNodeId = menu.node.nodeId
    const titles = customChildInput.split('\n').map((s) => s.trim()).filter(Boolean)

    setTreeData((prev) => {
      if (!prev) return prev
      const updated = JSON.parse(JSON.stringify(prev)) as TreeStructure

      // Count existing nodes
      function countAll(structure: TreeNode[]): number {
        let total = 0
        for (const n of structure) { total += 1; if (n.nodes) total += countAll(n.nodes) }
        return total
      }
      const startCount = countAll(updated.structure)

      function findAndAdd(structure: TreeNode[], idx: { v: number }): boolean {
        for (const n of structure) {
          if (n.node_id === targetNodeId) {
            for (const t of titles) {
              idx.v++
              n.nodes = [...(n.nodes || []), {
                title: t,
                node_id: `${(startCount + idx.v).toString().padStart(4, '0')}`,
                summary: '',
                text: '',
                nodes: [],
              }]
            }
            return true
          }
          if (n.nodes && findAndAdd(n.nodes, idx)) return true
        }
        return false
      }
      findAndAdd(updated.structure, { v: 0 })
      return updated
    })
    setCustomChildInput('')
    setContextMenu(null)
  }

  // ── Delete node ──────────────────────────────────────────────────

  const handleDeleteNode = () => {
    const menu = contextMenu
    if (!menu || !treeData) return
    const targetNodeId = menu.node.nodeId

    setTreeData((prev) => {
      if (!prev) return prev
      const updated = JSON.parse(JSON.stringify(prev)) as TreeStructure

      function removeFrom(structure: TreeNode[]): boolean {
        for (let i = structure.length - 1; i >= 0; i--) {
          if (structure[i].node_id === targetNodeId) {
            structure.splice(i, 1)
            return true
          }
          if (structure[i].nodes && removeFrom(structure[i].nodes!)) return true
        }
        return false
      }
      removeFrom(updated.structure)
      return updated
    })
    setContextMenu(null)
  }

  // ── Generate full article from entire tree ───────────────────────

  const handleGenerateFullArticle = async () => {
    if (!treeData || generatingArticle) return
    setGeneratingArticle(true)
    setGeneratedArticle(null)

    // Build tree with keywords from the current treeData
    function buildWithKeywords(nodes: TreeNode[]): any[] {
      return nodes.map((n) => ({
        title: n.title,
        node_id: n.node_id,
        keywords: nodeKeywords[n.node_id || ''] || '',
        nodes: n.nodes ? buildWithKeywords(n.nodes) : [],
      }))
    }

    try {
      const result = await exploreGenerateFullArticle(
        buildWithKeywords(treeData.structure),
        selectedWorkspaces,
        headingStyle,
      )
      setGeneratedArticle(result.content || '（无内容生成）')
    } catch (err) {
      console.error('Failed to generate article:', err)
      setGeneratedArticle('生成失败，请重试')
    } finally {
      setGeneratingArticle(false)
    }
  }

  // ── Save tree ────────────────────────────────────────────────────

  const handleSaveTree = async () => {
    if (!treeData || savingTree) return
    setSavingTree(true)
    try {
      const result = await exploreSaveTree(
        currentTreeId,
        treeData.doc_name || topic || 'Untitled',
        treeData.structure,
        generatedArticle || '',
      )
      setCurrentTreeId(result.tree_id)
      // Refresh the saved trees list
      const list = await exploreListTrees()
      setSavedTrees(list.trees)
    } catch (err) {
      console.error('Failed to save tree:', err)
    } finally {
      setSavingTree(false)
    }
  }

  // ── Load tree ────────────────────────────────────────────────────

  const handleLoadTree = async (treeId: string) => {
    try {
      const data = await exploreLoadTree(treeId)
      setCurrentTreeId(data.tree_id)
      setTreeData({
        doc_name: data.doc_name,
        structure: data.structure,
      })
      if (data.article) {
        setGeneratedArticle(data.article)
      } else {
        setGeneratedArticle(null)
      }
      setShowSavePanel(false)
    } catch (err) {
      console.error('Failed to load tree:', err)
    }
  }

  // ── Delete tree ──────────────────────────────────────────────────

  const handleDeleteTree = async (treeId: string) => {
    try {
      await exploreDeleteTree(treeId)
      const list = await exploreListTrees()
      setSavedTrees(list.trees)
      if (currentTreeId === treeId) {
        setCurrentTreeId('')
      }
    } catch (err) {
      console.error('Failed to delete tree:', err)
    }
  }

  // ── Open save panel & load list ──────────────────────────────────

  const handleOpenSavePanel = async () => {
    setShowSavePanel(!showSavePanel)
    if (!showSavePanel) {
      try {
        const list = await exploreListTrees()
        setSavedTrees(list.trees)
      } catch { /* ignore */ }
    }
  }

  // ── Import markdown ──────────────────────────────────────────────

  const handleImportMarkdown = async () => {
    if (!importMarkdownText.trim() || importing) return
    setImporting(true)
    try {
      const data = await exploreImportMarkdown(importMarkdownText.trim())
      setTreeData({
        doc_name: data.doc_name,
        structure: data.structure,
      })
      setCurrentTreeId('')
      setGeneratedArticle(null)
      setShowImportDialog(false)
      setImportMarkdownText('')
      setImportFileName('')
    } catch (err) {
      console.error('Failed to import markdown:', err)
    } finally {
      setImporting(false)
    }
  }

  // ── Mouse handlers ────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

    const clickedNode = hitTestNode(mx, my)
    // Store mousedown state but don't set drag flags yet
    // This allows click handler to work if mouse doesn't move
    if (clickedNode) {
      nodeDragRef.current = {
        node: clickedNode,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startNodeX: clickedNode.x,
        startNodeY: clickedNode.y,
      }
      setSelectedNodeId(clickedNode.id)
    } else {
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      panStartRef.current = { x: panRef.current.x, y: panRef.current.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const drag = nodeDragRef.current
    if (drag) {
      const dx = e.clientX - drag.startMouseX
      const dy = e.clientY - drag.startMouseY
      // Only start dragging if moved more than 5 pixels
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setCursorStyle('grabbing')
        const scaledDx = dx / zoomRef.current
        const scaledDy = dy / zoomRef.current
        const prevX = drag.node.x
        const prevY = drag.node.y
        drag.node.x = drag.startNodeX + scaledDx
        drag.node.y = drag.startNodeY + scaledDy
        const deltaX = drag.node.x - prevX
        const deltaY = drag.node.y - prevY
        // Move children by same delta
        function moveChildren(n: LayoutNode) {
          for (const child of n.children) {
            child.x += deltaX
            child.y += deltaY
            moveChildren(child)
          }
        }
        moveChildren(drag.node)
        drawFrame()
        return
      }
    }
    // Check if we should start canvas panning
    if (!draggingRef.current && dragStartRef.current.x !== 0) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setCursorStyle('grabbing')
        draggingRef.current = true
      }
    }
    if (draggingRef.current) {
      // Canvas panning
      panRef.current = {
        x: panStartRef.current.x + (e.clientX - dragStartRef.current.x),
        y: panStartRef.current.y + (e.clientY - dragStartRef.current.y),
      }
      drawFrame()
      return
    }
    // Hover cursor tracking
    const canvas = canvasRef.current
    if (!canvas || !rootRef.current) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const my = (e.clientY - rect.top - panRef.current.y) / zoomRef.current
    const overNode = hitTestNode(mx, my)
    setCursorStyle(overNode ? 'grab' : 'default')
  }

  const handleMouseUp = () => {
    nodeDragRef.current = null
    draggingRef.current = false
    dragStartRef.current = { x: 0, y: 0 }
    drawFrame()
    // Restore cursor on next frame
    requestAnimationFrame(() => setCursorStyle('default'))
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    zoomRef.current = Math.max(0.2, Math.min(3, zoomRef.current * delta))
    drawFrame()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div className="flex h-full w-full flex-col px-1 py-1">
      {/* Input bar */}
      <div className="flex shrink-0 items-center gap-2 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-card/50 p-2 mb-1">
        <LightbulbIcon className="size-5 shrink-0 text-emerald-500" />
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('treeMindExplore.inputPlaceholder', '输入一个主题，如：机器学习、Python编程、量子计算...')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          disabled={loading}
        />
        <button
          onClick={handleGenerate}
          disabled={loading || !topic.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SendIcon className="size-3.5" />
          )}
          {t('treeMindExplore.generate', '生成')}
        </button>

        {/* Separator */}
        <div className="h-5 w-px bg-border/40" />

        {/* Import button */}
        <button
          onClick={() => setShowImportDialog(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          title={t('treeMindExplore.importMd', '导入 Markdown 思维导图')}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {t('treeMindExplore.import', '导入')}
        </button>

        {/* Save button (only when tree exists) */}
        {treeData && (
          <button
            onClick={handleSaveTree}
            disabled={savingTree}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
            title={t('treeMindExplore.saveTree', '保存当前思维导图')}
          >
            {savingTree ? <Loader2Icon className="size-3.5 animate-spin" /> : (
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            )}
            {t('treeMindExplore.save', '保存')}
          </button>
        )}

        {/* Load / History button */}
        <button
          onClick={handleOpenSavePanel}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${showSavePanel ? 'border-emerald-500/60 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
          title={t('treeMindExplore.loadTree', '加载已保存的思维导图')}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {t('treeMindExplore.history', '历史')}
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-card/30"
        style={{ cursor: cursorStyle }}
      >
        {treeData ? (
          <canvas
            ref={canvasRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            className="h-full w-full"
          />
        ) : (
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full flex-col items-center justify-center text-center"
              >
                <Loader2Icon className="mb-3 size-10 animate-spin text-emerald-500/70" />
                <p className="text-sm text-muted-foreground/70 max-w-md">
                  {t('treeMindExplore.generating', '正在生成思维导图…')}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
                  <span className="size-1.5 rounded-full bg-emerald-500/50 animate-pulse" />
                  <span className="size-1.5 rounded-full bg-emerald-500/50 animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="size-1.5 rounded-full bg-emerald-500/50 animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full flex-col items-center justify-center text-center px-4"
              >
                <div className="rounded-2xl border border-emerald-200/40 dark:border-emerald-700/30 bg-card/70 p-8 shadow-xl shadow-emerald-950/5 dark:shadow-emerald-500/10 backdrop-blur-md">
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100/60 dark:bg-emerald-900/30">
                    <LightbulbIcon className="size-7 text-emerald-500" />
                  </div>
                  <h2 className="mb-2 text-base font-semibold text-foreground/80">
                    {t('treeMindExplore.emptyTitle', '从一个问题开始')}
                  </h2>
                  <p className="mb-5 max-w-sm text-sm text-muted-foreground/70">
                    {t('treeMindExplore.emptyHint', '在上方输入一个主题，点击「生成」开始探索')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTED_TOPICS.map((s) => (
                      <motion.button
                        key={s}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onClick={() => setTopic(s)}
                        className="rounded-full border border-border/40 bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-emerald-500/40 hover:bg-emerald-50/60 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Zoom controls */}
        {treeData && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-border/30 bg-card/80 p-1 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => { zoomRef.current = Math.max(0.2, zoomRef.current * 0.8); drawFrame() }}
              className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
            >
              <ZoomOutIcon className="size-3.5" />
            </button>
            <span className="min-w-[36px] text-center text-[10px] text-muted-foreground">
              {Math.round(zoomRef.current * 100)}%
            </span>
            <button
              onClick={() => { zoomRef.current = Math.min(3, zoomRef.current * 1.25); drawFrame() }}
              className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
            >
              <ZoomInIcon className="size-3.5" />
            </button>
            <button
              onClick={() => {
                zoomRef.current = 1
                const container = containerRef.current
                const root = rootRef.current
                if (container && root) {
                  panRef.current = { x: 60, y: Math.max(60, container.clientHeight / 2 - root.h / 2) }
                }
                drawFrame()
              }}
              className="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-accent"
            >⟲</button>
          </div>
        )}

        {/* Unified right-side panel: Node + KB + Article */}
        {treeData && (
          <div className="absolute right-2 top-2 z-30 w-56 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-card/80 shadow-lg backdrop-blur-md">
            {/* Section: Selected Node */}
            {(() => {
              if (!selectedNodeId || !rootRef.current) return null
              function findNode(n: LayoutNode): LayoutNode | null {
                if (n.id === selectedNodeId) return n
                for (const child of n.children) {
                  const found = findNode(child)
                  if (found) return found
                }
                return null
              }
              const detailNode = findNode(rootRef.current)
              if (!detailNode) return null
              const kw = nodeKeywords[detailNode.nodeId] || ''
              return (
                <div className="border-b border-border/30">
                  <div className="px-2.5 py-2">
                    <p className="text-[10px] font-medium text-muted-foreground/60 mb-1">{t('treeMindExplore.nodeSection', '当前节点')}</p>
                    <p className="truncate text-xs font-medium mb-1.5">{detailNode.title}</p>
                    <label className="mb-1 block text-[9px] text-muted-foreground/50">{t('treeMindExplore.keywordsHint', '关键词')}</label>
                    <input
                      type="text"
                      value={kw}
                      onChange={(e) => setNodeKeywords((prev) => ({ ...prev, [detailNode.nodeId]: e.target.value }))}
                      placeholder={t('treeMindExplore.keywordsPlaceholder', '空格分隔...')}
                      className="w-full rounded-md border border-border/40 bg-background/60 px-2 py-1 text-[10px] outline-none placeholder:text-muted-foreground/30"
                    />
                  </div>
                </div>
              )
            })()}

            {/* Section: Knowledge Base */}
            <div className="border-b border-border/30 px-2.5 py-2">
              <p className="text-[10px] font-medium text-muted-foreground/60 mb-1.5">{t('treeMindExplore.kbSection', '知识库')}</p>
              <div ref={wsDropdownRef} className="relative">
                <button
                  onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                  className="flex w-full items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-[10px] text-foreground/70 hover:bg-accent/50"
                >
                  <DatabaseIcon className="size-3 text-emerald-500 shrink-0" />
                  <span className="flex-1 truncate text-left">
                    {selectedWorkspaces.length === 0
                      ? t('treeMindExplore.defaultWs', '不使用')
                      : `${selectedWorkspaces.length} ${t('treeMindExplore.kbCount', '个')}`}
                  </span>
                  <ChevronDownIcon className="size-3" />
                </button>
                {wsDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-full min-w-[200px] rounded-md border border-border/40 bg-card shadow-lg backdrop-blur-md z-50">
                    <div className="max-h-48 overflow-y-auto py-1">
                      <label className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[10px] ${selectedWorkspaces.length === 0 ? 'text-emerald-600' : 'text-foreground/70'} hover:bg-accent/50`}>
                        <input type="checkbox" className="size-3 accent-emerald-600" checked={selectedWorkspaces.length === 0} onChange={() => setSelectedWorkspaces([])} />
                        <span>{t('treeMindExplore.defaultWs', '不使用知识库')}</span>
                      </label>
                      {workspaces.filter((w) => w.name).map((ws) => {
                        const isSel = selectedWorkspaces.includes(ws.name)
                        return (
                          <label key={ws.name} className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[10px] ${isSel ? 'text-emerald-600 font-medium' : 'text-foreground/70'} hover:bg-accent/50`}>
                            <input type="checkbox" className="size-3 accent-emerald-600" checked={isSel}
                              onChange={() => setSelectedWorkspaces((p) => isSel ? p.filter((n) => n !== ws.name) : [...p, ws.name])} />
                            <DatabaseIcon className="size-3 shrink-0" />
                            <span className="flex-1 truncate">{ws.name}</span>
                            {ws.is_active && <span className="text-[8px] text-emerald-500">{t('treeMindExplore.active', '当前')}</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Article Generation */}
            <div className="px-2.5 py-2">
              <p className="text-[10px] font-medium text-muted-foreground/60 mb-1.5">{t('treeMindExplore.articleSection', '文章生成')}</p>
              <select
                value={headingStyle}
                onChange={(e) => setHeadingStyle(e.target.value)}
                className="mb-1.5 w-full rounded-md border border-border/40 bg-background/60 px-2 py-1 text-[10px] text-foreground/70 outline-none"
              >
                <option value="markdown">Markdown (#)</option>
                <option value="chinese">{t('treeMindExplore.styleChinese', '一、（一）1.')}</option>
                <option value="numeric">{t('treeMindExplore.styleNumeric', '1. 1.1. 1.1.1.')}</option>
                <option value="decimal">{t('treeMindExplore.styleDecimal', '1 1.1 1.1.1')}</option>
              </select>
              <button
                onClick={handleGenerateFullArticle}
                disabled={generatingArticle}
                className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {generatingArticle ? <Loader2Icon className="size-3 animate-spin" /> : <FileTextIcon className="size-3" />}
                {t('treeMindExplore.generateArticle', '生成整篇正文')}
              </button>
            </div>
          </div>
        )}

        {/* Generated article display modal — editable per-section */}
        <AnimatePresence>
        {generatedArticle && (
          <motion.div
            key="article-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="article-modal-title"
              className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border/40 bg-card shadow-2xl focus:outline-none"
            >
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h3 id="article-modal-title" className="text-sm font-semibold text-foreground/80">
                  {t('treeMindExplore.generatedArticle', '生成的文章')}
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">（点击文本框可直接编辑）</span>
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const blob = new Blob([generatedArticle], { type: 'text/markdown;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${treeData?.doc_name || 'article'}.md`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    title={t('treeMindExplore.downloadMd', '下载 Markdown')}
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setGeneratedArticle(null)}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(85vh - 56px)' }}>
                {(() => {
                  // Split article into sections by headings
                  const lines = generatedArticle.split('\n')
                  const sections: { heading: string; level: number; content: string[] }[] = []
                  let current: { heading: string; level: number; content: string[] } | null = null

                  const headingRe = /^(#{1,6}\s+|([一二三四五六七八九十]+[、．])|（[一二三四五六七八九十]+）|(\d+(?:\.\d+)*)[.．]\s+)/

                  for (const line of lines) {
                    const trimmed = line.trim()
                    if (headingRe.test(trimmed) || trimmed.match(/^[#\s]/)) {
                      // Detect heading
                      let level = 0
                      const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)/)
                      if (mdMatch) {
                        level = mdMatch[1].length
                      } else if (trimmed.match(/^[一二三四五六七八九十]+[、．]/)) {
                        level = 1
                      } else if (trimmed.match(/^（[一二三四五六七八九十]+）/)) {
                        level = 2
                      } else {
                        const numMatch = trimmed.match(/^(\d+(?:\.\d+)*)[.．]\s+/)
                        if (numMatch) level = numMatch[1].split('.').length
                      }

                      if (level > 0) {
                        if (current) sections.push(current)
                        current = { heading: trimmed, level, content: [] }
                        continue
                      }
                    }
                    if (current) {
                      current.content.push(line)
                    } else {
                      // Content before first heading — treat as preamble
                      current = { heading: '', level: 0, content: [line] }
                    }
                  }
                  if (current) sections.push(current)

                  return sections.map((sec, idx) => {
                    const headingClass = sec.level === 1
                      ? 'text-base font-bold text-foreground border-b border-border/20 pb-1'
                      : sec.level === 2
                        ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-400 border-l-[3px] border-emerald-500 pl-2'
                        : 'text-xs font-medium text-foreground/80 ml-2'

                    return (
                      <div key={idx} className="rounded-md border border-border/20 bg-background/30">
                        {sec.heading && (
                          <div className={`px-3 py-1.5 ${headingClass}`}>
                            {sec.heading}
                          </div>
                        )}
                        <textarea
                          defaultValue={sec.content.join('\n').trim()}
                          rows={Math.max(2, Math.min(12, sec.content.filter((l) => l.trim()).length + 1))}
                          className="w-full resize-y border-0 bg-transparent px-3 py-2 text-xs leading-relaxed text-foreground/80 outline-none placeholder:text-muted-foreground/30"
                          placeholder="在此编辑此节内容..."
                          onChange={() => {
                            // Update generatedArticle by reconstructing from sections
                            // We use a data attribute approach for simplicity
                            const allSections = document.querySelectorAll('[data-section-idx]')
                            const parts: string[] = []
                            allSections.forEach((el, sIdx) => {
                              if (sIdx < sections.length) {
                                const s = sections[sIdx]
                                if (s.heading) parts.push(s.heading)
                                const val = (el as HTMLTextAreaElement).value
                                if (val.trim()) parts.push(val)
                                parts.push('')
                              }
                            })
                            setGeneratedArticle(parts.join('\n').trim())
                          }}
                          data-section-idx={idx}
                        />
                      </div>
                    )
                  })
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Save panel overlay */}
        <AnimatePresence>
        {showSavePanel && (
          <motion.div
            key="save-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex items-start justify-end bg-black/10"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSavePanel(false) }}
          >
            <motion.div
              ref={savePanelRef}
              initial={{ opacity: 0, x: 16, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="save-panel-title"
              className="mr-4 mt-4 w-80 rounded-lg border border-border/40 bg-card shadow-2xl focus:outline-none"
            >
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
                <h3 id="save-panel-title" className="text-xs font-semibold text-foreground/80">
                  {t('treeMindExplore.savedTrees', '已保存的思维导图')}
                </h3>
                <button onClick={() => setShowSavePanel(false)} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {savedTrees.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground/50">
                    {t('treeMindExplore.noSavedTrees', '暂无保存的思维导图')}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {savedTrees.map((tree) => (
                      <div
                        key={tree.tree_id}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-colors ${currentTreeId === tree.tree_id ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-border/20 hover:bg-accent/30'}`}
                      >
                        <button
                          onClick={() => handleLoadTree(tree.tree_id)}
                          className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          <p className="truncate text-xs font-medium text-foreground/80">{tree.doc_name || 'Untitled'}</p>
                          <p className="text-[10px] text-muted-foreground/50">
                            {tree.node_count} {t('treeMindExplore.nodes', '节点')} · {new Date(tree.updated_at * 1000).toLocaleDateString()}
                          </p>
                        </button>
                        <button
                          onClick={() => handleDeleteTree(tree.tree_id)}
                          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          title={t('treeMindExplore.deleteTree', '删除')}
                        >
                          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Import markdown dialog */}
        <AnimatePresence>
        {showImportDialog && (
          <motion.div
            key="import-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowImportDialog(false); setImportMarkdownText(''); setImportFileName('') } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-md-title"
              className="mx-4 w-full max-w-lg rounded-lg border border-border/40 bg-card shadow-2xl focus:outline-none"
            >
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h3 id="import-md-title" className="text-sm font-semibold text-foreground/80">
                  {t('treeMindExplore.importTitle', '导入 Markdown 文档')}
                </h3>
                <button onClick={() => { setShowImportDialog(false); setImportMarkdownText(''); setImportFileName('') }} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground/80">
                  {t('treeMindExplore.importTitle', '导入 Markdown 文档')}
                </h3>
                <button onClick={() => { setShowImportDialog(false); setImportMarkdownText(''); setImportFileName('') }} className="text-muted-foreground hover:text-foreground">
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {/* File upload area */}
                <div
                  className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border/50 bg-background/40 px-4 py-6 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
                  onClick={() => importFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (!file) return
                    if (!file.name.endsWith('.md') && file.type !== 'text/markdown' && file.type !== 'text/plain') {
                      toast.error('请选择 .md 格式的 Markdown 文件')
                      return
                    }
                    setImportFileName(file.name)
                    const reader = new FileReader()
                    reader.onload = (ev) => { setImportMarkdownText(ev.target?.result as string) }
                    reader.readAsText(file, 'utf-8')
                  }}
                >
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    className="hidden"
                    onChange={handleImportFileSelect}
                  />
                  <UploadIcon className="mb-2 size-6 text-muted-foreground/50" />
                  {importFileName ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{importFileName}</span>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground/70">点击选择或拖拽 .md 文件到此处</span>
                      <span className="mt-1 text-[10px] text-muted-foreground/40">支持 Markdown 格式文档</span>
                    </>
                  )}
                </div>
                {/* Textarea for preview / manual editing */}
                <textarea
                  value={importMarkdownText}
                  onChange={(e) => setImportMarkdownText(e.target.value)}
                  placeholder={`# 主题\n## 子主题1\n### 细节A\n### 细节B\n## 子主题2\n## 子主题3`}
                  rows={10}
                  className="w-full resize-y rounded-md border border-border/40 bg-background/60 px-3 py-2 text-xs font-mono outline-none placeholder:text-muted-foreground/30"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowImportDialog(false); setImportMarkdownText(''); setImportFileName('') }}
                    className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('treeMindExplore.cancel', '取消')}
                  </button>
                  <button
                    onClick={handleImportMarkdown}
                    disabled={importing || !importMarkdownText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {importing ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                    {t('treeMindExplore.importBtn', '导入')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>



        {/* Context menu (right-click) */}
        <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="ctx-menu"
            ref={contextMenuRef}
            role="menu"
            aria-label={t('treeMindExplore.nodeMenu', '节点操作菜单')}
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-50 w-64 rounded-lg border border-border/40 bg-card shadow-xl backdrop-blur-md focus:outline-none"
            style={{ left: contextMenu.x - 20, top: contextMenu.y - 10 }}
          >
            <div className="border-b border-border/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <FileTextIcon className="size-3.5 text-emerald-500" />
                <button onClick={() => { setContextMenu(null); setContextKeywords('') }} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <XIcon className="size-3" />
                </button>
              </div>
              <p className="mt-1 text-xs font-medium truncate">{contextMenu.node.title}</p>
            </div>
            <div className="p-3 space-y-2">
              {/* Generate content */}
              <div>
                <label className="mb-1 block text-[10px] text-muted-foreground/60">
                  {t('treeMindExplore.keywordsHint', '关键词提示（可选）')}
                </label>
                <input
                  type="text"
                  value={contextKeywords}
                  onChange={(e) => setContextKeywords(e.target.value)}
                  placeholder={t('treeMindExplore.keywordsPlaceholder', '输入关键词，用空格分隔...')}
                  className="mb-1.5 w-full rounded-md border border-border/40 bg-background/60 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/30"
                  disabled={generatingContent}
                />
                <button
                  onClick={handleGenerateContent}
                  disabled={generatingContent}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {generatingContent ? <Loader2Icon className="size-3 animate-spin" /> : <FileTextIcon className="size-3" />}
                  {t('treeMindExplore.generateContent', '生成段落内容')}
                </button>
                {generatedContent !== null && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-md border border-border/30 bg-background/40 p-2">
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-foreground/80">{generatedContent}</p>
                  </div>
                )}
              </div>

              {/* Add custom child */}
              <div className="border-t border-border/30 pt-2">
                <label className="mb-1 block text-[10px] text-muted-foreground/60">
                  {t('treeMindExplore.addChildHint', '添加子节点（每行一个）')}
                </label>
                <textarea
                  value={customChildInput}
                  onChange={(e) => setCustomChildInput(e.target.value)}
                  placeholder={t('treeMindExplore.addChildPlaceholder', '输入子节点标题...')}
                  rows={2}
                  className="mb-1.5 w-full rounded-md border border-border/40 bg-background/60 px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/30 resize-none"
                />
                <button
                  onClick={handleAddCustomChild}
                  disabled={!customChildInput.trim()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40"
                >
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {t('treeMindExplore.addChild', '添加子节点')}
                </button>
              </div>

              {/* Delete node */}
              <div className="border-t border-border/30 pt-2">
                <button
                  onClick={handleDeleteNode}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-300/50 px-3 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  {t('treeMindExplore.deleteNode', '删除节点')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Hint */}
        {treeData && (
          <div className="absolute bottom-3 left-3 rounded-md bg-card/60 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
            {t('treeViewer.dblClickToExpand', '双击展开')} · {t('treeViewer.dragNode', '拖拽节点移动')} · {t('treeViewer.scrollToZoom')} · {t('treeViewer.dragToPan')} · <span className="text-emerald-500">{t('treeViewer.rightClick', '右键生成内容')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
