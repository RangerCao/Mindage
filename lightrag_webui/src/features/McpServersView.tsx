import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ServerIcon,
  PlusIcon,
  Trash2Icon,
  PlugIcon,
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  XIcon,
  WrenchIcon,
  PlayIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import {
  type McpServer,
  type McpToolInfo,
  listMcpServers,
  addMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  checkMcpServerStatus,
  listMcpTools,
  callMcpTool,
  connectAllMcp,
  reconnectMcpServer,
  getMcpConnections,
} from '@/api/lightrag'

// ── Component ──────────────────────────────────────────────────────────────

export default function McpServersView() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<McpServer[]>([])
  const [tools, setTools] = useState<McpToolInfo[]>([])
  const [connections, setConnections] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [toolAvailable, setToolAvailable] = useState(false)

  // ── Load servers ─────────────────────────────────────────────────────

  const loadServers = useCallback(async () => {
    try {
      const data = await listMcpServers()
      setServers(data.servers ?? [])
    } catch (e: any) {
      console.error('Failed to load MCP servers:', e)
      toast.error(t('mcp.loadError', 'Failed to load MCP servers'))
    } finally {
      setLoading(false)
    }
  }, [t])

  // ── Load tools ─────────────────────────────────────────────────────────

  const loadTools = useCallback(async () => {
    try {
      const data = await listMcpTools()
      setTools(data.tools ?? [])
      setToolAvailable(data.available ?? false)
    } catch {
      setTools([])
      setToolAvailable(false)
    }
  }, [])

  // ── Load connections ───────────────────────────────────────────────────

  const loadConnections = useCallback(async () => {
    try {
      const data = await getMcpConnections()
      setConnections(data.connections ?? {})
    } catch {
      setConnections({})
    }
  }, [])

  useEffect(() => {
    loadServers()
    loadTools()
    loadConnections()
  }, [loadServers, loadTools, loadConnections])

  // ── Toggle ────────────────────────────────────────────────────────────

  const handleToggle = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleMcpServer(id)
        setServers((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: updated.enabled } : s)))
        toast.success(
          updated.enabled
            ? t('mcp.enabled', 'Server enabled')
            : t('mcp.disabled', 'Server disabled'),
        )
      } catch (e: any) {
        toast.error(t('mcp.toggleError', 'Failed to toggle server'))
      }
    },
    [t],
  )

  // ── Delete ────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteMcpServer(id)
        setServers((prev) => prev.filter((s) => s.id !== id))
        toast.success(t('mcp.deleted', 'Server deleted'))
      } catch (e: any) {
        toast.error(t('mcp.deleteError', 'Failed to delete server'))
      }
    },
    [t],
  )

  // ── Check single status ───────────────────────────────────────────────

  const handleCheckStatus = useCallback(async (id: string) => {
    try {
      const result = await checkMcpServerStatus(id)
      setServers((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: result.status as McpServer['status'] } : s,
        ),
      )
    } catch {
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'error' as McpServer['status'] } : s)),
      )
    }
  }, [])

  // ── Check all statuses ────────────────────────────────────────────────

  const handleCheckAllStatus = useCallback(async () => {
    for (const server of servers) {
      if (server.enabled) {
        handleCheckStatus(server.id)
      }
    }
  }, [servers, handleCheckStatus])

  // ── Connect all ────────────────────────────────────────────────────────

  const handleConnectAll = useCallback(async () => {
    try {
      const result = await connectAllMcp()
      toast.success(t('mcp.connectedAll', 'Connected to all enabled servers'))
      setTools(result.tools ?? [])
      loadConnections()
      loadServers()
    } catch {
      toast.error(t('mcp.connectError', 'Failed to connect'))
    }
  }, [t, loadConnections, loadServers])

  // ── Reconnect single server ────────────────────────────────────────────

  const handleReconnect = useCallback(
    async (id: string) => {
      try {
        await reconnectMcpServer(id)
        toast.success(t('mcp.reconnected', 'Reconnected'))
        loadTools()
        loadConnections()
        loadServers()
      } catch {
        toast.error(t('mcp.reconnectError', 'Failed to reconnect'))
      }
    },
    [t, loadTools, loadConnections, loadServers],
  )

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {t('mcp.title', 'MCP Servers')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t('mcp.description', 'Manage Model Context Protocol servers for tool integration')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 0 && (
            <>
              <button
                onClick={handleConnectAll}
                className="inline-flex items-center gap-1 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
              >
                <PlugIcon className="size-3.5" />
                {t('mcp.connectAll', 'Connect All')}
              </button>
              <button
                onClick={handleCheckAllStatus}
                className="inline-flex items-center gap-1 rounded-lg border-2 border-gray-300 px-2.5 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-accent dark:border-gray-600"
              >
                <RefreshCwIcon className="size-3.5" />
                {t('mcp.checkAll', 'Check All')}
              </button>
            </>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-gray-600 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
          >
            <PlusIcon className="size-3.5" />
            {t('mcp.addServer', 'Add Server')}
          </button>
        </div>
      </div>

      {/* Add-server form */}
      {showForm && (
        <AddServerForm
          onSave={async (server) => {
            try {
              const created = await addMcpServer(server)
              setServers((prev) => [...prev, created])
              setShowForm(false)
              toast.success(t('mcp.added', 'Server added'))
            } catch {
              toast.error(t('mcp.addError', 'Failed to add server'))
            }
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Tools panel */}
      {toolAvailable && tools.length > 0 && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20">
          <button
            onClick={() => setShowTools((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            {showTools ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <WrenchIcon className="size-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-foreground">
              {t('mcp.availableTools', 'Available Tools')} ({tools.length})
            </span>
          </button>
          {showTools && (
            <div className="space-y-2 border-t-2 border-blue-200 px-4 py-3 dark:border-blue-800">
              {tools.map((tool) => (
                <ToolCard key={tool.full_name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Server list */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {servers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <ServerIcon className="size-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {t('mcp.noServers', 'No MCP servers configured')}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-300 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-accent dark:border-gray-600"
            >
              <PlusIcon className="size-3.5" />
              {t('mcp.addFirst', 'Add your first MCP server')}
            </button>
          </div>
        ) : (
          servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              connectionStatus={connections[server.id]}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onCheckStatus={handleCheckStatus}
              onReconnect={handleReconnect}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Tool Card ──────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: McpToolInfo }) {
  const { t } = useTranslation()
  const [showCall, setShowCall] = useState(false)
  const [argsJson, setArgsJson] = useState('{}')
  const [result, setResult] = useState<string | null>(null)
  const [calling, setCalling] = useState(false)

  const handleCall = async () => {
    let args: Record<string, any>
    try {
      args = JSON.parse(argsJson)
    } catch {
      toast.error(t('mcp.invalidJson', 'Invalid JSON arguments'))
      return
    }
    setCalling(true)
    try {
      const res = await callMcpTool(tool.full_name, args)
      if (res.success) {
        setResult(res.result ?? 'OK')
        toast.success(t('mcp.toolSuccess', 'Tool executed'))
      } else {
        setResult(`Error: ${res.error}`)
        toast.error(t('mcp.toolError', 'Tool execution failed'))
      }
    } catch (e: any) {
      setResult(`Error: ${e.message || e}`)
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <WrenchIcon className="size-3.5 shrink-0 text-blue-500" />
            <span className="truncate font-mono text-xs font-medium text-foreground">
              {tool.full_name}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
            [{tool.server_name}] {tool.description}
          </p>
        </div>
        <button
          onClick={() => setShowCall((v) => !v)}
          className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-[10px] text-foreground/70 hover:bg-accent dark:border-gray-600"
        >
          <PlayIcon className="mr-1 inline size-3" />
          {t('mcp.callTool', 'Call')}
        </button>
      </div>
      {showCall && (
        <div className="mt-2 space-y-2">
          <textarea
            value={argsJson}
            onChange={(e) => setArgsJson(e.target.value)}
            placeholder='{"key": "value"}'
            rows={3}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[11px] outline-none focus:border-blue-400 dark:border-gray-600 dark:bg-gray-900"
          />
          <button
            onClick={handleCall}
            disabled={calling}
            className="inline-flex items-center gap-1 rounded bg-blue-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {calling ? <Loader2Icon className="size-3 animate-spin" /> : <PlayIcon className="size-3" />}
            {t('mcp.execute', 'Execute')}
          </button>
          {result !== null && (
            <pre className="max-h-40 overflow-auto rounded bg-gray-100 p-2 font-mono text-[10px] text-foreground dark:bg-gray-800">
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Server Form ────────────────────────────────────────────────────────

function AddServerForm({
  onSave,
  onCancel,
}: {
  onSave: (server: Partial<McpServer>) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'streamable-http'>('stdio')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (transport === 'stdio') {
      if (!command.trim()) {
        toast.error(t('mcp.commandRequired', 'Command is required for stdio transport'))
        return
      }
    } else {
      if (!url.trim()) {
        toast.error(t('mcp.urlRequired', 'URL is required for HTTP transport'))
        return
      }
    }
    setSaving(true)
    try {
      const args = argsText
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean)
      const payload: Partial<McpServer> = {
        name: name.trim() || undefined,
        transport,
      }
      if (transport === 'stdio') {
        payload.command = command.trim()
        payload.args = args
      } else {
        payload.url = url.trim()
      }
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/50 p-4 dark:border-emerald-700 dark:bg-emerald-950/20">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {t('mcp.newServer', 'New MCP Server')}
        </span>
        <button
          onClick={onCancel}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('mcp.name', 'Name')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('mcp.namePlaceholder', 'e.g. My MCP Server')}
            className="w-full rounded-md border-2 border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('mcp.transport', 'Transport')}
          </label>
          <div className="flex gap-1.5">
            {([
              ['stdio', t('mcp.transportStdio', 'Stdio')],
              ['sse', t('mcp.transportSSE', 'SSE')],
              ['streamable-http', t('mcp.transportHTTP', 'Streamable HTTP')],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTransport(value)}
                className={`rounded-md border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  transport === value
                    ? 'border-emerald-400 bg-emerald-500 text-white dark:border-emerald-600'
                    : 'border-gray-300 bg-white text-foreground/70 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {transport === 'stdio' ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('mcp.command', 'Command')} <span className="text-red-400">*</span>
              </label>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('mcp.commandPlaceholder', 'e.g. python')}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('mcp.args', 'Arguments')}
              </label>
              <textarea
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={t('mcp.argsPlaceholder', 'One argument per line')}
                rows={3}
                className="w-full rounded-md border-2 border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('mcp.url', 'Server URL')} <span className="text-red-400">*</span>
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                transport === 'sse'
                  ? t('mcp.urlPlaceholderSSE', 'e.g. http://localhost:8080/sse')
                  : t('mcp.urlPlaceholderHTTP', 'e.g. http://localhost:8080/mcp')
              }
              className="w-full rounded-md border-2 border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-emerald-400 dark:border-gray-600 dark:bg-gray-900"
            />
            <p className="mt-1 text-[10px] text-muted-foreground/50">
              {transport === 'sse'
                ? t('mcp.urlHintSSE', 'SSE endpoint for Server-Sent Events transport')
                : t('mcp.urlHintHTTP', 'Streamable HTTP endpoint (POST-based JSON-RPC)')}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border-2 border-gray-300 px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-accent dark:border-gray-600"
          >
            {t('mcp.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg border-2 border-emerald-300 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 dark:border-emerald-600"
          >
            {saving ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SaveIcon className="size-3.5" />
            )}
            {t('mcp.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Server Card ────────────────────────────────────────────────────────────

function ServerCard({
  server,
  connectionStatus,
  onToggle,
  onDelete,
  onCheckStatus,
  onReconnect,
}: {
  server: McpServer
  connectionStatus?: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onCheckStatus: (id: string) => void
  onReconnect: (id: string) => void
}) {
  const { t } = useTranslation()
  const transport = server.transport || 'stdio'
  const displayName = server.name || (transport === 'stdio' ? server.command : server.url) || t('mcp.unnamed', '(unnamed)')

  const statusColor =
    server.status === 'connected'
      ? 'text-emerald-500'
      : server.status === 'error'
        ? 'text-red-500'
        : 'text-gray-400'

  const StatusIcon = server.status === 'connected' ? CheckCircleIcon : XCircleIcon

  const transportLabel =
    transport === 'sse' ? 'SSE' : transport === 'streamable-http' ? 'HTTP' : 'Stdio'

  const transportColor =
    transport === 'stdio'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      : transport === 'sse'
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'

  // Connection badge
  const connBadge = connectionStatus ? (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        connectionStatus === 'connected'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : connectionStatus === 'disabled'
            ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
      }`}
    >
      {connectionStatus}
    </span>
  ) : null

  return (
    <div className="rounded-lg border-2 border-gray-300 bg-card/60 transition-colors hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600">
      {/* Header row */}
      <div className="flex items-center gap-3 border-b-2 border-gray-200 px-4 py-2.5 dark:border-gray-700">
        <div className="flex size-8 items-center justify-center rounded-lg border-2 border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900">
          <PlugIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${transportColor}`}>
              {transportLabel}
            </span>
            <StatusIcon className={`size-3.5 shrink-0 ${statusColor}`} />
            {connBadge}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {transport === 'stdio'
              ? `${server.command ?? ''} ${server.args?.join(' ') ?? ''}`
              : server.url ?? ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Reconnect */}
          {server.enabled && (
            <button
              onClick={() => onReconnect(server.id)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              title={t('mcp.reconnect', 'Reconnect')}
            >
              <PlugIcon className="size-3.5" />
            </button>
          )}
          {/* Check status */}
          <button
            onClick={() => onCheckStatus(server.id)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            title={t('mcp.checkStatus', 'Check status')}
          >
            <RefreshCwIcon className="size-3.5" />
          </button>
          {/* Toggle */}
          <button
            onClick={() => onToggle(server.id)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              server.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                server.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <button
            onClick={() => onDelete(server.id)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 px-4 py-3">
        {server.tools && server.tools.length > 0 && (
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {t('mcp.tools', 'Tools')}:
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {server.tools.map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] text-foreground/70 dark:border-gray-600 dark:bg-gray-900"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Connection info */}
        <div className="rounded-md border border-gray-200 bg-gray-50/50 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="text-[11px] font-medium text-muted-foreground">
            {transport === 'stdio' ? t('mcp.command', 'Command') : t('mcp.url', 'Server URL')}
          </div>
          <div className="mt-0.5 font-mono text-xs text-foreground/80">
            {transport === 'stdio'
              ? `${server.command ?? ''} ${server.args?.join(' ') ?? ''}`
              : server.url ?? ''}
          </div>
        </div>
      </div>
    </div>
  )
}
