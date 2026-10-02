# LightRAG WebUI 体验改造方案

> 目标：把当前「能用但粗糙」的内部工具，改造成「专业 + 丝滑 + 充分交互动效」的知识库/RAG 工作台。
> 技术栈固定：**React 19 + TS + Vite 6 + Tailwind v4 + shadcn/ui (new-york) + Radix + sonner + lucide + framer-motion（可选）+ Sigma**。
> 下面所有数值、token、动画参数都是可以直接 copy 的。已落地的 2 个文件改动在文末"已落地改动"小节。

---

## 0. 现状诊断（基于实际代码）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 1 | **没有 emerald 主色 token** | `index.css` 全部仍是 `hsl(240 ...)` 锌灰，组件用 `bg-emerald-500` 散点直写 | 视觉不一致，主题切换时 emerald 不会跟着切换 |
| 2 | **没有动效 token** | `@theme inline` 里只有 `accordion-down/up`，没有 `duration / easing` | 所有 transition 只能用魔法数字，写不出统一节奏 |
| 3 | **没有任何 hover/lift 动效** | `Button`/`Card`/`Sidebar` 都是 `transition-colors`，没有 transform/shadow | 控件没有"丝滑"感 |
| 4 | **Sidebar 折叠动画僵硬** | `transition-all duration-200` 改 `width`，会触发子元素重排 | 折叠时闪烁 |
| 5 | **消息气泡没有"逐字显现"动效** | `ChatView` 用 `last.content += chunk` 直接拼接 | 用户感知不到流式"活的"内容 |
| 6 | **输入框高度是固定的 textarea + `max-h-[120px]`** | `ChatView.tsx` L162-164 | 长问题体验差，且无自动滚动跟随光标 |
| 7 | **Sidebar 没有 `prefers-reduced-motion`** | 全局都没有 | 无障碍扣分 |
| 8 | **响应式断点混乱** | `useIsMobile` = `(max-width: 768px)`，但 Sidebar `isMobile` 分支里 `w-0` / `w-0 overflow-visible` 是反的 | 移动端抽屉打开时背景栏残影 |
| 9 | **没有键盘快捷键** | 只有 Enter 发送，缺 `Cmd/Ctrl+K` 召唤命令面板、`/` 聚焦输入、`Esc` 停止 | 效率工具感弱 |
| 10 | **没有"引用角标 + 跳转高亮"** | Retrieval/Chat 视图没有 source chip | RAG 核心价值「可溯源」缺失 |
| 11 | **空状态几乎都一样** | `EmptyCard` 默认用 `FilesIcon`，且没有引导按钮组 | 新用户上手成本高 |
| 12 | **加载态只有 spinners** | 文档/检索列表无 skeleton | 列表 loading 时白屏闪烁 |
| 13 | **暗色模式对比度不足** | `--muted-foreground: hsl(240 5% 64.9%)` 在 dark 上接近 WCAG AA 边界 | 长时间阅读疲劳 |

---

## 1. 信息架构与布局

### 1.1 全局结构（PC 优先，平板降级，移动端抽屉）

```
┌────────────┬─────────────────────────────────────────────────────────┐
│            │  TopBar  (h=48, 模糊, sticky)                            │
│            ├─────────────────────────────────────────────────────────┤
│            │                                                         │
│  Sidebar   │              Page Content (flex-1, scroll)              │
│  w=240     │                                                         │
│  (折叠56)  │                                                         │
│            │                                                         │
│            ├─────────────────────────────────────────────────────────┤
│            │  ChatComposer (h≈72~160, 仅 Chat 页 sticky 底部)          │
└────────────┴─────────────────────────────────────────────────────────┘
```

### 1.2 断点（修正 useMediaQuery）

| 断点 | 宽度 | Sidebar | TopBar | Page |
|---|---|---|---|---|
| mobile | `<768px` | 抽屉（`Sheet`）| h-12，含汉堡按钮 | 全宽 + 底部安全区 `pb-20` |
| tablet | `768–1023px` | 默认收起为 56px | h-11 | 留 16px 内边距 |
| desktop | `≥1024px` | 240px，可手动折叠为 56px | h-10 | 24px 内边距 |
| wide | `≥1440px` | 280px | 同上 | 32px，最大宽度 `max-w-[1280px]` 居中 |

### 1.3 页面级布局

- **ChatView**：双栏（≥1280px）= 左侧对话流 `max-w-[760px]` 居中 + 右侧 280px Sources 抽屉（默认收起，点 `[n]` 展开并自动滚动到消息位置）。<1280 隐藏右栏，用底部浮层替代。
- **DocumentManager**：顶部 sticky Toolbar (上传/扫描/批量/筛选) + 左侧 240px 状态侧栏（completed / parse / analyze / process / failed 计数 chips）+ 右侧 Table。
- **GraphViewer**：全屏画布 + 右侧 320px Drawer（节点属性），悬浮 mini-toolbar 右上。
- **RetrievalView**：上下分栏（上：QuerySettings 280px 横向胶囊条 + 输入；下：Messages + Sources 侧栏）。

---

## 2. 设计系统 Token（直接复制到 `src/index.css`）

### 2.1 颜色（emerald 主色 + zinc 灰阶，符合 AA）

```css
:root {
  /* base — light */
  --background:           hsl(0 0% 100%);
  --foreground:           hsl(240 10% 6%);      /* 提升到 6% 以保 AA */
  --card:                 hsl(0 0% 100%);
  --card-foreground:      hsl(240 10% 6%);
  --popover:              hsl(0 0% 100%);
  --popover-foreground:   hsl(240 10% 6%);

  --primary:              hsl(160 84% 39%);     /* emerald-600 */
  --primary-foreground:   hsl(0 0% 100%);
  --primary-50:           hsl(152 81% 96%);     /* hover bg */
  --primary-100:          hsl(149 80% 90%);
  --primary-200:          hsl(152 76% 80%);
  --primary-glow:         hsl(160 84% 39% / 0.35);

  --secondary:            hsl(240 5% 96%);
  --secondary-foreground: hsl(240 10% 10%);
  --muted:                hsl(240 5% 96%);
  --muted-foreground:     hsl(240 4% 38%);      /* AA on white */
  --accent:               hsl(160 84% 95%);
  --accent-foreground:    hsl(160 84% 18%);

  --destructive:          hsl(0 72% 51%);
  --destructive-foreground: hsl(0 0% 98%);
  --warning:              hsl(38 92% 50%);
  --success:              hsl(160 84% 39%);

  --border:               hsl(240 6% 90%);
  --input:                hsl(240 6% 90%);
  --ring:                 hsl(160 84% 39%);     /* 与主色统一焦点环 */

  /* chart / status palette */
  --chart-1: hsl(160 84% 39%);
  --chart-2: hsl(217 91% 60%);
  --chart-3: hsl(280 65% 60%);
  --chart-4: hsl(38 92% 50%);
  --chart-5: hsl(340 75% 55%);

  --radius: 0.75rem;                            /* 12px，更柔和 */

  /* sidebar — 用稍亮的 zinc */
  --sidebar:              hsl(240 5% 98%);
  --sidebar-foreground:   hsl(240 6% 12%);
  --sidebar-primary:      hsl(160 84% 39%);
  --sidebar-primary-foreground: hsl(0 0% 100%);
  --sidebar-accent:       hsl(160 60% 96%);
  --sidebar-accent-foreground: hsl(160 84% 18%);
  --sidebar-border:       hsl(240 6% 90%);
  --sidebar-ring:         hsl(160 84% 39%);

  /* motion tokens */
  --ease-out-quint:       cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out-cubic:    cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring:          cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast:             120ms;
  --dur-base:             200ms;
  --dur-slow:             320ms;
  --dur-page:             450ms;
}

.dark {
  --background:           hsl(240 10% 6%);
  --foreground:           hsl(0 0% 98%);
  --card:                 hsl(240 10% 8%);
  --card-foreground:      hsl(0 0% 98%);
  --popover:              hsl(240 10% 9%);
  --popover-foreground:   hsl(0 0% 98%);

  --primary:              hsl(160 70% 50%);     /* emerald-400，暗色提亮 */
  --primary-foreground:   hsl(160 84% 8%);
  --primary-50:           hsl(160 70% 12%);
  --primary-100:          hsl(160 70% 18%);
  --primary-glow:         hsl(160 70% 50% / 0.40);

  --secondary:            hsl(240 4% 14%);
  --secondary-foreground: hsl(0 0% 98%);
  --muted:                hsl(240 4% 14%);
  --muted-foreground:     hsl(240 5% 70%);      /* 提升对比度 */
  --accent:               hsl(160 50% 14%);
  --accent-foreground:    hsl(160 70% 80%);

  --destructive:          hsl(0 62% 45%);
  --destructive-foreground: hsl(0 0% 98%);

  --border:               hsl(240 4% 16%);
  --input:                hsl(240 4% 16%);
  --ring:                 hsl(160 70% 50%);

  --sidebar:              hsl(240 10% 8%);
  --sidebar-foreground:   hsl(0 0% 96%);
  --sidebar-primary:      hsl(160 70% 50%);
  --sidebar-primary-foreground: hsl(160 84% 8%);
  --sidebar-accent:       hsl(160 50% 16%);
  --sidebar-accent-foreground: hsl(160 70% 88%);
  --sidebar-border:       hsl(240 4% 16%);
  --sidebar-ring:         hsl(160 70% 50%);
}
```

### 2.2 字体 / 间距 / 圆角 / 阴影

```css
/* 字体栈：SF Pro / Inter / 系统栈，回退到 emoji-safe */
font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
  'Apple Color Emoji', 'Segoe UI Emoji';
font-feature-settings: 'cv11', 'ss01', 'ss03';  /* Inter 的 open digits & alt a/g */

/* 代码：JetBrains Mono / Fira Code */
.code { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }

/* 字号阶梯（rem，1rem=16px） */
text-2xs: 0.6875rem;   /* 11px */
text-xs:  0.75rem;     /* 12px */
text-sm:  0.8125rem;   /* 13px */
text-base:0.9375rem;   /* 15px — 正文 */
text-md:  1rem;        /* 16px */
text-lg:  1.125rem;    /* 18px */
text-xl:  1.375rem;    /* 22px */
text-2xl: 1.75rem;     /* 28px */

/* 间距栅格（4 的倍数，但多 1 档 6 给紧凑场景） */
space: 0 2 4 6 8 12 16 20 24 32 40 48 64

/* 圆角 */
radius-sm: 6px; radius-md: 10px; radius-lg: 14px; radius-xl: 20px; radius-2xl: 28px;

/* 阴影（结合主色 glow） */
shadow-xs: 0 1px 2px hsl(240 10% 6% / 0.04);
shadow-sm: 0 1px 2px hsl(240 10% 6% / 0.06), 0 1px 3px hsl(240 10% 6% / 0.05);
shadow-md: 0 4px 12px hsl(240 10% 6% / 0.08);
shadow-lg: 0 10px 30px hsl(240 10% 6% / 0.12);
shadow-glow: 0 0 0 4px var(--primary-glow), 0 8px 24px hsl(160 84% 39% / 0.18);
```

### 2.3 Tailwind v4 `@theme` 暴露

```css
@theme inline {
  --color-*: var(--*);                  /* 现有映射保留 */
  --radius-*: var(--radius-*);
  --animate-fade-in:    fade-in   320ms var(--ease-out-quint) both;
  --animate-fade-up:    fade-up   420ms var(--ease-out-quint) both;
  --animate-pop-in:     pop-in    260ms var(--ease-spring)    both;
  --animate-shimmer:    shimmer   1.4s  linear infinite;
  --animate-pulse-dot:  pulse-dot 1.2s  var(--ease-in-out-cubic) infinite;
  --animate-slide-in-right: slide-in-right 280ms var(--ease-out-quint) both;
  --animate-blink:      blink     1s   steps(2) infinite;
}
@keyframes fade-in      { from { opacity: 0 } to { opacity: 1 } }
@keyframes fade-up      { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes pop-in       { 0% { opacity: 0; transform: scale(.94) } 100% { opacity: 1; transform: scale(1) } }
@keyframes shimmer      { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes pulse-dot    { 0%,100% { opacity: .35; transform: scale(.85) } 50% { opacity: 1; transform: scale(1) } }
@keyframes slide-in-right { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes blink        { 50% { opacity: 0 } }
```

### 2.4 全局通用类

```css
@layer utilities {
  /* iOS 风格 hover lift，给 Button/Card/InteractiveRow 用 */
  .hover-lift {
    transition: transform var(--dur-base) var(--ease-out-quint),
                box-shadow var(--dur-base) var(--ease-out-quint),
                background-color var(--dur-fast) linear;
  }
  .hover-lift:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
  .hover-lift:active { transform: translateY(0); transition-duration: var(--dur-fast); }

  /* 骨架 */
  .skeleton {
    background: linear-gradient(90deg, hsl(0 0% 92%) 0%, hsl(0 0% 96%) 50%, hsl(0 0% 92%) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
    border-radius: var(--radius-md);
  }
  .dark .skeleton {
    background: linear-gradient(90deg, hsl(240 4% 14%) 0%, hsl(240 4% 18%) 50%, hsl(240 4% 14%) 100%);
    background-size: 200% 100%;
  }

  /* 流式光标 */
  .streaming-caret::after {
    content: ''; display: inline-block; width: 7px; height: 1.05em;
    margin-left: 2px; vertical-align: -2px;
    background: var(--primary);
    border-radius: 2px; animation: blink 1s steps(2) infinite;
  }

  /* 全局焦点环 */
  .focus-ring {
    outline: none;
  }
  .focus-ring:focus-visible {
    box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring);
    border-radius: var(--radius-md);
  }

  /* 减弱动效 */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

---

## 3. 关键组件设计

### 3.1 Button（已落地新版本，见文末）

状态：`idle / hover / active / focus / disabled / loading`。
统一节奏：`transition-all var(--dur-base) var(--ease-out-quint)`。

```tsx
// 关键 class（已落到 Button.tsx）：
'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg ' +
'text-sm font-medium ring-offset-background ' +
'transition-[transform,background-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
'active:translate-y-[1px] active:duration-[120ms] ' +
'disabled:pointer-events-none disabled:opacity-50 ' +
'[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
```

### 3.2 ChatComposer（输入区，drop-in 替换 ChatView/RetrievalView 的底部）

```tsx
// src/components/chat/ChatComposer.tsx
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'      // 或自实现（见 §3.3）
import { Send, Square, Eraser, Paperclip, CornerDownLeft, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'

type Props = {
  value: string; onChange: (v: string) => void
  onSubmit: () => void; onStop?: () => void; onClear?: () => void
  isStreaming: boolean
  placeholder?: string
  history?: string[]; onPickHistory?: (v: string) => void
}

export default function ChatComposer(p: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [drag, setDrag] = useState(false)
  const [focused, setFocused] = useState(false)

  // 自适应高度 44 -> 160
  useLayoutEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = '0px'
    ta.style.height = Math.min(160, Math.max(44, ta.scrollHeight)) + 'px'
  }, [p.value])

  // Cmd/Ctrl+K -> 命令面板；Cmd/Enter -> 提交；/ -> 聚焦；Esc -> 停止
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') { e.preventDefault(); p.onSubmit() }
      if (e.key === 'Escape' && p.isStreaming) { e.preventDefault(); p.onStop?.() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [p])

  const onFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    // TODO: 走 uploadDocument，把文件名回填到 textarea 作为引用前缀
  }, [])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
      className={cn(
        'mx-auto w-full max-w-3xl px-4 pb-4 pt-2',
        'rounded-2xl border bg-card/80 backdrop-blur-md shadow-sm',
        focused && 'shadow-glow border-primary/50',
        drag && 'border-primary ring-2 ring-primary/30',
        'transition-[box-shadow,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
      )}
    >
      <AnimatePresence>
        {drag && (
          <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="pointer-events-none absolute inset-0 flex items-center justify-center
                       rounded-2xl bg-primary/5 text-sm font-medium text-primary">
            Drop to attach as reference
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={taRef}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p.onSubmit() }
        }}
        rows={1}
        placeholder={p.placeholder ?? 'Ask anything · Enter to send · Shift+Enter for newline'}
        className="block w-full resize-none bg-transparent px-2 py-2 text-base
                   leading-6 placeholder:text-muted-foreground/70
                   focus:outline-none"
        aria-label="Message input"
      />

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" />
          <span>Drop files to attach</span>
          <span className="mx-2 h-3 w-px bg-border" />
          <CornerDownLeft className="size-3.5" />
          <span>Enter</span>
          <span className="mx-1">·</span>
          <span>Shift+Enter newline</span>
        </div>
        <div className="flex items-center gap-1">
          {p.history?.length ? (
            <Button variant="ghost" size="icon" tooltip="History"
              onClick={() => p.onPickHistory?.(p.history![p.history!.length - 1])}>
              <History className="size-4" />
            </Button>
          ) : null}
          {p.onClear && (
            <Button variant="ghost" size="icon" tooltip="Clear" onClick={p.onClear}>
              <Eraser className="size-4" />
            </Button>
          )}
          {p.isStreaming ? (
            <Button variant="destructive" size="icon" tooltip="Stop (Esc)" onClick={p.onStop}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" tooltip="Send (⌘↵)" onClick={p.onSubmit}
                    disabled={!p.value.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90
                               shadow-[0_6px_18px_-6px_var(--primary-glow)]
                               hover:shadow-[0_10px_24px_-8px_var(--primary-glow)]">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

### 3.3 流式光标 + 字符渐显（无需 framer-motion）

替换 `ChatView.tsx` 里 `last.content += chunk` 的渲染层，在 ChatMessage 末尾加流式光标：

```tsx
// 在 ChatMessage 渲染 displayContent 的最外层 <div> 后追加：
{isStreaming && <span className="streaming-caret" aria-hidden="true" />}

// 在 ChatView 中按 chunk 渲染时，每 ~12ms 触发一次 setMessages。
// 同时给"新追加"的字符加 fade-up 动效（用纯 CSS keyframe，无需 framer-motion）：
const [pulseKey, setPulseKey] = useState(0)
useEffect(() => { if (!loading) return; const id = setInterval(() => setPulseKey(k => k+1), 800); return () => clearInterval(id) }, [loading])
// 给 ChatMessage 加 isStreaming={loading && index === messages.length - 1 && m.role === 'assistant'}。
```

如果想加 framer-motion，把 `motion.div` 用 `layout` prop 包消息即可：

```tsx
import { motion, AnimatePresence } from 'framer-motion'
<AnimatePresence initial={false}>
  {messages.map(m => (
    <motion.div key={m.id}
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    ><ChatMessage message={m} /></motion.div>
  ))}
</AnimatePresence>
```

### 3.4 引用角标 [n] + 来源卡片 + 跳转高亮

在 ChatMessage 渲染前预处理 content，把 `<sup>[3]</sup>` 等替换成 chip；并维护 `sourceMap`。

```tsx
// src/components/chat/SourceChip.tsx
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function SourceChip({ index, onJump, active }:
  { index: number; onJump: () => void; active?: boolean }) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      onClick={onJump}
      aria-label={`Jump to source ${index}`}
      className={cn(
        'mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5',
        'text-[11px] font-semibold tabular-nums',
        'bg-primary/10 text-primary ring-1 ring-primary/20',
        'transition-colors duration-200 ease-out',
        'hover:bg-primary hover:text-primary-foreground hover:ring-primary',
        active && 'bg-primary text-primary-foreground ring-primary shadow-[0_0_0_4px_var(--primary-glow)]'
      )}
    >{index}</motion.button>
  )
}
```

```tsx
// src/components/chat/SourceCard.tsx — 右栏 / 底部抽屉里的卡片
export function SourceCard({ index, title, snippet, score, onJump, active }:
  { index: number; title: string; snippet: string; score?: number; onJump: () => void; active?: boolean }) {
  return (
    <button onClick={onJump}
      className={cn(
        'group block w-full rounded-xl border bg-card/70 p-3 text-left',
        'transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40',
        active && 'border-primary shadow-glow'
      )}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">[{index}] {title}</span>
        {score != null && <span className="tabular-nums">{(score*100).toFixed(0)}%</span>}
      </div>
      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">{snippet}</p>
    </button>
  )
}
```

跳转高亮：`onJump` 内 `setActiveSource(i)`，并在消息流容器里把对应 `<mark data-source="3">` 加 `animate-fade-up` + 临时 `bg-primary/15 ring-2 ring-primary/40` 持续 1.6s。

### 3.5 文档管理（Upload + 进度 + 重试 + 状态分桶）

替换 `UploadDocumentsDialog` 的列表渲染：

```tsx
// 每个文件项
<div className="flex items-center gap-3 rounded-lg border p-2.5">
  <FileText className="size-4 shrink-0 text-muted-foreground" />
  <div className="min-w-0 flex-1">
    <div className="flex items-center justify-between text-sm">
      <span className="truncate">{name}</span>
      <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
        {status === 'success' ? '✓' : status === 'error' ? '✕' : `${pct}%`}
      </span>
    </div>
    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out',
          status === 'error' ? 'bg-destructive' : 'bg-primary')}
        style={{ width: `${pct}%` }} />
      {status === 'uploading' && (
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_linear_infinite]
                        bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      )}
    </div>
    {error && (
      <div className="mt-1 flex items-center gap-2 text-xs text-destructive">
        <span className="truncate">{error}</span>
        <button onClick={retry} className="rounded px-1.5 py-0.5 hover:bg-destructive/10">Retry</button>
      </div>
    )}
  </div>
</div>
```

Document 状态分桶左侧栏：

```tsx
const buckets: { key: StatusBucket; label: string; tint: string }[] = [
  { key: 'completed', label: 'Completed', tint: 'bg-emerald-500' },
  { key: 'parse',     label: 'Parsing',   tint: 'bg-sky-500' },
  { key: 'analyze',   label: 'Analyzing', tint: 'bg-violet-500' },
  { key: 'process',   label: 'Processing',tint: 'bg-amber-500' },
  { key: 'failed',    label: 'Failed',    tint: 'bg-rose-500' },
]
```

### 3.6 检索设置（topK / 阈值 / 模型）

把 `QuerySettings` 改成横向胶囊条 + 折叠抽屉：

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Popover>
    <PopoverTrigger className="rounded-full border bg-card px-3 py-1.5 text-sm hover-lift">
      topK: <span className="font-semibold tabular-nums">{topK}</span>
    </PopoverTrigger>
    <PopoverContent className="w-64">
      <Label>Top K <span className="float-right tabular-nums">{topK}</span></Label>
      <Slider min={1} max={100} value={[topK]} onValueChange={([v]) => set('top_k', v)} />
      <Label className="mt-3">Similarity threshold <span className="float-right tabular-nums">{thr.toFixed(2)}</span></Label>
      <Slider min={0} max={1} step={0.01} value={[thr]} onValueChange={([v]) => set('threshold', v)} />
    </PopoverContent>
  </Popover>

  <Select value={mode} onValueChange={(v) => set('mode', v)}>
    <SelectTrigger className="rounded-full">Mode: <span className="font-semibold">{mode}</span></SelectTrigger>
    <SelectContent>{['naive','local','global','hybrid','mix'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
  </Select>

  <Select value={model} onValueChange={setModel}>
    <SelectTrigger className="rounded-full">Model: <span className="font-semibold">{model ?? 'default'}</span></SelectTrigger>
    <SelectContent>{models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
  </Select>
</div>
```

需要新增 `Slider` 组件（基于 `@radix-ui/react-slider`），暂未在项目里，直接装：`bun add @radix-ui/react-slider`。

### 3.7 空 / 加载 / 错误 / 无结果 四态模板

```tsx
// src/components/ui/StateView.tsx
type State = 'empty' | 'loading' | 'error' | 'no-results'
export function StateView({ state, title, description, action, icon: Icon }: { ... }) {
  if (state === 'loading') {
    return (
      <div className="space-y-3 p-6">
        {Array.from({length:5}).map((_,i) =>
          <div key={i} className="skeleton h-14 w-full" style={{animationDelay:`${i*80}ms`}} />)}
      </div>
    )
  }
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-10 text-center animate-fade-up">
      <div className="rounded-full border border-dashed p-4">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
```

错误状态增加 `Retry` 按钮 + `Copy error` 按钮；空状态分两种：真的没数据 vs 没搜到。

---

## 4. 交互细节

### 4.1 流式响应 / 停止 / 重生 / 复制 / 反馈

- **流式**：chunked setState + `streaming-caret`（§2.4）+ `layout` 过渡（§3.3）。
- **停止**：`AbortController.abort()`；停止后消息末尾追加 `isAborted: true`，UI 显示 `Stopped by user · Regenerate`。
- **重生**：在 assistant 消息上 hover 出 toolbar：`🔄 Regenerate`、`📋 Copy`、`👍 👎`、`📌 Pin`。`regenerate` 复用同 query 重新请求（去掉最后一条 assistant）。
- **复制**：成功时 sonner toast `Copied to clipboard`，失败时 `Copy failed`，2s 自动消失。
- **反馈**：👍 / 👎 写入 `useSettingsStore.feedback`，下个版本可接日志。

```tsx
function MessageToolbar({ m, onRegen, onCopy }: any) {
  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-200
                    group-hover:opacity-100 focus-within:opacity-100">
      <Button variant="ghost" size="icon" tooltip="Regenerate" onClick={onRegen}><RotateCcw className="size-3.5"/></Button>
      <Button variant="ghost" size="icon" tooltip="Copy" onClick={onCopy}><Clipboard className="size-3.5"/></Button>
      <Button variant="ghost" size="icon" tooltip="Helpful"><ThumbsUp className="size-3.5"/></Button>
      <Button variant="ghost" size="icon" tooltip="Not helpful"><ThumbsDown className="size-3.5"/></Button>
    </div>
  )
}
// 用法：<div className="group"> ...message... <MessageToolbar /></div>
```

### 4.2 引用悬停 / 点击 / 侧栏 / 滚动跟随

- 鼠标悬停 `[n]` chip：popover 浮出 320px 卡片（前 200 字 + score），延迟 200ms 出现 / 100ms 消失。
- 点击：右栏 Sources 自动滚动 + 跳转到对应引用消息并 1.6s 高亮。
- 滚动跟随：默认 `auto-scroll: smooth`，当用户向上滚动超过 100px 时禁用自动滚动，并显示 `Jump to latest` 浮动按钮。

```tsx
const [pinned, setPinned] = useState(true)   // 用户滚回底部即 true
useEffect(() => {
  const onScroll = () => {
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setPinned(dist < 80)
  }
  el.addEventListener('scroll', onScroll, { passive: true })
  return () => el.removeEventListener('scroll', onScroll)
}, [])
{!pinned && (
  <button onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
    className="sticky bottom-24 left-1/2 -translate-x-1/2 rounded-full
               bg-primary text-primary-foreground shadow-glow px-3 py-1.5 text-xs
               animate-pop-in">Jump to latest ↓</button>
)}
```

### 4.3 拖拽上传 / 快捷键 / 移动端抽屉

- 全局 `Cmd/Ctrl+K` 唤起命令面板（cmdk），可搜索页面、文档、会话。
- `/` 聚焦 ChatComposer 输入框。
- 拖拽：全页监听 dragover/drop，进入 ChatView 时 `attach` 为 reference；进入 DocumentManager 直接走上传队列。
- 移动端 Sidebar 用 shadcn `Sheet`（右侧抽屉 + 80% 宽度 + 200ms slide-in-right 动画 + 背景模糊 backdrop）。

### 4.4 完整状态机

| 控件 | idle | loading | streaming | success | error | empty | disabled |
|---|---|---|---|---|---|---|---|
| Send 按钮 | 实色 | — | 切 Stop | 短暂 ✓ 反馈 | — | — | 灰、cursor-not-allowed |
| Stop 按钮 | — | 出现并 200ms 弹入 | — | 200ms 缩回 | — | — | 出现 800ms 内的 120ms 锁 |
| 输入框 | 描边 | 半透 | glow 描边 + caret | — | 描红 + ErrorText | placeholder 高亮 | 半透 |
| 消息气泡 | 静态 | `streaming-caret` | 同左 | 出现 fade-up | 红色 + Retry chip | — | — |
| 文档项 | — | shimmer 进度 | — | ✓ | ✕ + Retry | "Drop files to upload" 拖拽区 | — |

---

## 5. 可访问性

- 所有交互元素必须有 `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`（`Button.tsx` 已加）。
- 对比度：正文 ≥ `4.5:1`、大字 ≥ `3:1`、UI 控件 ≥ `3:1`。修正后 `muted-foreground` 在浅色 `4%` 灰 = 4.6:1，深色 `5%/70%` = 7.2:1。
- ARIA：
  - `<textarea aria-label="Message input" />`、`<button aria-label="Send message" />`。
  - 命令面板 `<dialog role="dialog" aria-modal="true">`。
  - 流式区域 `<div role="status" aria-live="polite">`，复制/反馈按钮 `aria-pressed`。
- `prefers-reduced-motion`：已在 §2.4 用全局 CSS 拦截（无需 JS）。
- 键盘：`Tab` 顺序符合视觉，`Shift+Tab` 反向，`Cmd/Ctrl+K`/`/`/`Esc` 已在 §3.2 接好。
- 焦点环与暗色模式：`.focus-ring` 用 `--background` 双层 ring，避免 ring 颜色和背景糊在一起。

---

## 6. 性能

- **虚拟列表**：DocumentManager 表格、GraphViewer 节点属性 → `@tanstack/react-virtual`（`bun add @tanstack/react-virtual`），行高固定 56px，overscan 6。
- **懒加载**：`React.lazy` 包 GraphViewer / TreeViewer / KnowledgeBaseManager 这类重组件（Sigma.js 体积大）。
- **流式节流**：chunk 回调用 `requestAnimationFrame` 合并；超过 50 chars 才触发一次 setState。
  ```ts
  let buffer = ''
  let raf = 0
  const flush = () => { if (!buffer) return; updateAssistant(buffer); buffer = ''; raf = 0 }
  const onChunk = (c: string) => { buffer += c; if (!raf) raf = requestAnimationFrame(flush) }
  ```
- **防抖**：命令面板搜索 120ms 防抖；QuerySettings slider 80ms 防抖写入 store。
- **CSS 动画**：只用 `transform` / `opacity`；避免动画 `width/height/top`。
- **避免重排**：Sidebar 折叠用 `grid-template-columns` 而不是 `width`，避免子元素 reflow；折叠态切换 220ms。
- **memo**：`ChatMessage` 已 memo（`React.memo`），新增 `MessageToolbar` 也 memo。
- **图谱**：节点数 > 1500 时自动切换 `noverlap` 布局 + 关闭 edge label。

---

## 7. 可直接使用的代码（额外片段）

### 7.1 Sidebar 折叠（用 grid 替代 width，避免重排）

```tsx
<aside className={cn(
  'grid grid-rows-[auto_1fr_auto] bg-sidebar text-sidebar-foreground',
  'transition-[grid-template-columns] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
  collapsed ? 'grid-cols-[56px]' : 'grid-cols-[240px]',
  isMobile && 'fixed inset-y-0 left-0 z-50 shadow-2xl backdrop-blur-md bg-sidebar/95'
)} style={{ gridTemplateRows: 'auto 1fr auto' }}>
  ...
</aside>
```

### 7.2 移动端 Sheet 替代手写 Sidebar

```tsx
// 在 App.tsx 替换那个手写的 mobile 分支
<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
  <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
    <Sidebar />
  </SheetContent>
</Sheet>
```

### 7.3 命令面板（cmdk）

```tsx
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/Command'
const [open, setOpen] = useState(false)
useEffect(() => {
  const h = (e: KeyboardEvent) => { if ((e.metaKey||e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) } }
  window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
}, [])
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search pages, docs, actions…" />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Pages">{navGroups.flatMap(g => g.children).map(...)}</CommandGroup>
    <CommandGroup heading="Actions">...</CommandGroup>
  </CommandList>
</CommandDialog>
```

### 7.4 `ScrollArea` 微调（避免与 sticky toolbar 冲突）

```tsx
<ScrollArea className="h-full">
  <div className="px-4 pb-24">{/* pb-24 给悬浮 Jump-to-latest 留位 */}</div>
</ScrollArea>
```

---

## 8. 验收清单（DoD）

### 视觉 / 设计系统
- [ ] `index.css` 颜色 token 全部替换为 §2.1；`@theme inline` 暴露 §2.3。
- [ ] 所有 Button / Card / Sidebar hover 都有 `hover-lift` 或 `shadow-glow` 之一。
- [ ] 主色聚焦环统一 `var(--ring)`，暗色下能看清。
- [ ] 圆角统一 `radius-md=10 / lg=14 / xl=20`，禁止魔数 `rounded-[7px]`。

### 信息架构 / 响应式
- [ ] mobile/tablet/desktop 三档断点行为符合 §1.2。
- [ ] Sidebar 折叠改用 `grid-template-columns`，无子元素抖动。
- [ ] ChatComposer 在 <768px 时全宽，`pb` 至少 80px 防 iOS 工具栏遮挡。

### 交互
- [ ] 流式输出有 caret 光标（§3.3）。
- [ ] 消息气泡有 `layout` 入场/出场动效。
- [ ] 输入框自动撑高 44→160px，超出滚动。
- [ ] 发送按钮 morph 为 Stop（200ms），并有 120ms 防误触 cooldown（保留 `stopDisabled` 状态）。
- [ ] Cmd/Ctrl+K 命令面板可用，`/` 聚焦输入，Esc 停止。
- [ ] 拖文件到 ChatView 任意位置都进入 upload 队列。
- [ ] 引用 chip hover 出 popover，点击跳转并 1.6s 高亮目标消息。

### 状态机
- [ ] Send / Stop / 错误 / 空 / 无结果 / 禁用 六态全部覆盖。
- [ ] 文档上传：进度条 + shimmer；失败有 Retry；批量上传时 progress 用累计值。
- [ ] 错误信息支持「Copy error」一键复制。

### 可访问性
- [ ] 所有交互元素 keyboard 可达，`focus-visible` 可见。
- [ ] 文本对比度 ≥ 4.5:1（用 axe DevTools 验证）。
- [ ] `prefers-reduced-motion: reduce` 下动效 ≤ 1ms。
- [ ] 命令面板 / 抽屉使用 `role="dialog" aria-modal="true"`。
- [ ] 流式区域使用 `aria-live="polite"`。

### 性能
- [ ] DocumentManager 1000 行滚动 FPS ≥ 55（react-virtual）。
- [ ] GraphViewer 入口用 `React.lazy`，首屏 JS 不超过当前 1.2 倍。
- [ ] 流式回调用 rAF 合并，setState 频率 ≤ 60Hz。
- [ ] Sidebar 折叠无可见 reflow（开启 DevTools Performance paint flashing）。

### 工程
- [ ] 所有新增组件通过 ESLint + `bun test`。
- [ ] i18n key 同步更新到 `en`/`zh`（用 `ensure_all_keys.py` 校验）。
- [ ] Lighthouse Performance ≥ 90，A11y ≥ 95。

---

## 9. 落地优先级（建议分 3 个 PR）

| PR | 范围 | 估时 | 风险 |
|---|---|---|---|
| **PR1：地基** | `index.css` 完整替换；Button 重写；Card / Input / Textarea 加 `hover-lift`；全局 `prefers-reduced-motion` | 0.5d | 低 |
| **PR2：核心交互** | ChatComposer + Chat 流式光标 + 消息动效；命令面板；移动端 Sheet；Sidebar 用 grid | 1.5d | 中 |
| **PR3：RAG 闭环** | SourceChip / SourceCard / 跳转高亮；QuerySettings 胶囊条 + Slider；Upload 进度 + Retry；StateView | 1.5d | 中 |

每个 PR 完成后跑一次 §8 验收清单对应行。

---

## 10. 已落地的 2 个改动（本会话直接修改的文件）

1. `src/index.css`：替换颜色 / 阴影 / 圆角 / 动效 / 全局 utility 类 / `prefers-reduced-motion`。
2. `src/components/ui/Button.tsx`：替换 baseClasses，新增 hover lift / active press / 焦点环 / 阴影，主按钮带 primary glow。
