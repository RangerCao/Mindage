# Frequently Asked Questions (FAQ)

## General

### What is LightRAG?

LightRAG is a Retrieval-Augmented Generation (RAG) framework that uses graph-based knowledge representation for enhanced information retrieval. The system extracts entities and relationships from documents, builds a knowledge graph, and uses multiple retrieval modes for queries.

### What are the different query modes?

LightRAG supports five query modes:

- **local**: Context-dependent retrieval focused on specific entities
- **global**: Community/summary-based broad knowledge retrieval
- **hybrid**: Combines local and global approaches
- **naive**: Direct vector search without graph traversal
- **mix**: Integrates KG and vector retrieval (recommended with reranker)

### What storage backends are supported?

LightRAG supports multiple storage backends:

- **KV Storage**: JSON, Redis, PostgreSQL, MongoDB
- **Vector Storage**: NanoVectorDB, Faiss, Milvus, Qdrant, PostgreSQL (pgvector)
- **Graph Storage**: NetworkX, Neo4j, PostgreSQL, Memgraph
- **Document Status**: JSON, PostgreSQL, MongoDB

## Installation & Setup

### How do I install LightRAG?

```bash
# Using uv (recommended)
uv sync --extra api

# Using pip
pip install -e ".[api]"

# For offline deployment with all backends
pip install -e ".[offline]"
```

### What Python version is required?

LightRAG requires Python 3.10 or higher.

### How do I start the API server?

```bash
# Development mode
uvicorn lightrag.api.lightrag_server:app --reload

# Production mode
lightrag-server

# Multi-worker production
lightrag-gunicorn
```

### How do I configure LLM and embedding models?

Copy `env.example` to `.env` and configure:

```bash
# LLM configuration
LLM_BINDING=openai
LLM_MODEL=gpt-4
OPENAI_API_KEY=sk-...

# Embedding configuration
EMBEDDING_BINDING=openai
EMBEDDING_MODEL=text-embedding-ada-002
```

## Features

### What is MCP (Model Context Protocol)?

MCP is a protocol for tool integration that allows LightRAG to execute external tools and functions. Enable it with:

```bash
LIGHTRAG_MCP_ENABLED=true
```

### How does RBAC work?

LightRAG uses role-based access control with three roles:

- **admin**: Full access including user management
- **user**: Can upload documents and execute queries
- **guest**: Read-only access (when enabled)

Roles are assigned during user creation and enforced automatically.

### Can I change my password?

Yes, use the password change endpoint:

```bash
curl -X PUT http://localhost:9621/users/me/password \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password": "oldpass", "new_password": "newpass"}'
```

### How do I enable Prometheus metrics?

1. Install prometheus-client:
   ```bash
   pip install prometheus-client
   ```

2. Enable in `.env`:
   ```bash
   LIGHTRAG_METRICS_ENABLED=true
   ```

3. Access metrics at `http://localhost:9621/metrics`

### What is request tracing?

Request tracing generates or propagates an `X-Request-ID` header for each request, enabling distributed tracing across services. Enable with:

```bash
LIGHTRAG_REQUEST_TRACING_ENABLED=true
```

### How do I enable JSON logging?

Set the log format in `.env`:

```bash
LIGHTRAG_LOG_FORMAT=json
```

This outputs one JSON object per line, suitable for log aggregation systems.

## Usage

### How do I insert documents?

```python
import asyncio
from lightrag import LightRAG

async def main():
    rag = LightRAG(working_dir="./rag_storage")
    await rag.initialize_storages()

    # Single document
    await rag.ainsert("Text content")

    # Multiple documents
    await rag.ainsert(["Text 1", "Text 2"])

    # With file paths
    await rag.ainsert("Text", file_paths=["doc.pdf"])

    await rag.finalize_storages()

asyncio.run(main())
```

### How do I query the knowledge graph?

```python
from lightrag import QueryParam

result = await rag.aquery(
    "Your question",
    param=QueryParam(
        mode="hybrid",
        top_k=60,
        chunk_top_k=20
    )
)
print(result)
```

### What file formats are supported?

LightRAG supports:

- Plain text (.txt)
- PDF (.pdf)
- Word documents (.docx)
- PowerPoint (.pptx)
- Excel (.xlsx)
- And more via parser plugins

### How do I use a custom embedding function?

```python
from lightrag.utils import wrap_embedding_func_with_attrs

@wrap_embedding_func_with_attrs(embedding_dim=1536, max_token_size=8192)
async def custom_embed(texts: list[str]) -> np.ndarray:
    # Your custom embedding logic
    return embeddings

rag = LightRAG(
    working_dir="./storage",
    embedding_func=custom_embed
)
```

## Troubleshooting

### Error: `AttributeError: __aenter__`

This usually means storages are not initialized. Always call:

```python
await rag.initialize_storages()
```

before using the RAG instance.

### Error: `KeyError: 'history_messages'`

Same as above - ensure `initialize_storages()` is called.

### Documents not being processed

Check the pipeline status:

```bash
curl http://localhost:9621/health
```

Look for `pipeline_busy` and `pipeline_active` fields.

### High memory usage

Consider:

- Reducing `MAX_GRAPH_NODES` (default: 1000)
- Using a vector database backend instead of in-memory storage
- Enabling LLM cache: `ENABLE_LLM_CACHE=true`

### Slow query performance

Try:

- Using `mode="mix"` with a reranker
- Increasing `top_k` and `chunk_top_k`
- Enabling caching: `ENABLE_LLM_CACHE=true`
- Using a faster LLM provider

### Embedding model switch causes errors

When changing embedding models, you MUST clear the data directory because existing vectors won't match the new model's embedding space.

```bash
# Backup if needed
mv rag_storage rag_storage.backup

# Clear and re-ingest
rm -rf rag_storage/*
```

You can keep the LLM cache:
```bash
mv rag_storage.backup/kv_store_llm_response_cache.json rag_storage/
```

## Deployment

### How do I deploy behind a reverse proxy?

Set the API prefix:

```bash
LIGHTRAG_API_PREFIX=/lightrag
```

Configure your reverse proxy to strip the prefix before forwarding to LightRAG.

### Can I run multiple workers?

Yes, use gunicorn:

```bash
lightrag-gunicorn --workers 4
```

Or set in `.env`:
```bash
WORKERS=4
```

### How do I enable HTTPS?

```bash
SSL=true
SSL_CERTFILE=/path/to/cert.pem
SSL_KEYFILE=/path/to/key.pem
```

### How do I restrict CORS origins?

```bash
CORS_ORIGINS=http://localhost:3000,https://myapp.com
```

## Performance

### What's the recommended batch size for insertion?

Default `max_parallel_insert=3`. For faster ingestion, increase to 4-10:

```python
rag = LightRAG(..., max_parallel_insert=8)
```

### How do I optimize for large documents?

- Use semantic chunking: `chunking_strategy="semantic"`
- Adjust chunk size: `chunk_size=1200`
- Enable VLM for images: `VLM_PROCESS_ENABLE=true`

### What's the maximum document size?

No hard limit, but consider:

- Breaking large documents into chunks
- Using streaming insertion for very large files
- Adjusting `max_total_tokens` for query context

## Development

### How do I run tests?

```bash
# Backend tests
./scripts/test.sh tests

# Frontend tests
cd lightrag_webui
bun test

# With coverage
bun test --coverage
```

### How do I contribute?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

See `AGENTS.md` for coding conventions and architecture guidelines.

### Where can I get help?

- GitHub Issues: Report bugs and request features
- GitHub Discussions: Ask questions and share ideas
- Documentation: https://docs.qoder.com/qoderwork/introduction
