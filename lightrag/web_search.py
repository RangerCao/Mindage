"""
Web Search Tool — search the web and fetch page content.

Provides a unified interface for searching the web and extracting
text content from result pages. Currently uses DuckDuckGo (via ddgs)
as the primary backend with httpx-based Bing fallback.

Results are cached to avoid redundant network requests.
"""

import json
import os
import logging
import hashlib
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger("lightrag")

# ── Cache ──────────────────────────────────────────────────────────────────

SEARCH_CACHE_FILENAME = "search_cache.json"


class SearchCache:
    """Persistent cache for web search results."""

    def __init__(self, working_dir: str):
        self._path = os.path.join(working_dir, SEARCH_CACHE_FILENAME)
        self._data: dict[str, list[dict]] = {}
        self._load()

    def _load(self):
        if os.path.isfile(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception as e:
                logger.error("Failed to load search cache: %s", e)
                self._data = {}

    def _save(self):
        d = os.path.dirname(self._path)
        if d and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _make_key(query: str) -> str:
        return hashlib.md5(query.encode("utf-8")).hexdigest()

    def get(self, query: str) -> Optional[list[dict]]:
        key = self._make_key(query)
        entry = self._data.get(key)
        if entry:
            return entry.get("results")
        return None

    def set(self, query: str, results: list[dict]):
        key = self._make_key(query)
        self._data[key] = {
            "query": query,
            "results": results,
            "cached_at": datetime.utcnow().isoformat(),
        }
        self._save()


# ── Web Search Tool ────────────────────────────────────────────────────────


class WebSearchTool:
    """Search the web and fetch page content.

    Uses DuckDuckGo (via ddgs) as the primary search backend.
    Can also fetch content from individual URLs.
    Results are cached to avoid redundant requests.
    """

    def __init__(self, working_dir: str = ""):
        self._cache = SearchCache(working_dir)

    # ── Public API ─────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        max_results: int = 5,
        fetch_content: bool = False,
        force_refresh: bool = False,
    ) -> list[dict]:
        """Search the web and return results.

        Args:
            query: Search query string.
            max_results: Maximum number of results to return.
            fetch_content: If True, also fetch and extract text from each result URL.
            force_refresh: If True, bypass cache.

        Returns:
            A list of result dicts with keys: title, url, snippet, (and content if fetched)
        """
        # Check cache
        if not force_refresh:
            cached = self._cache.get(query)
            if cached is not None:
                logger.info("Search cache HIT for: %s", query[:60])
                return cached[:max_results]

        # Perform search
        results = self._search_ddg(query, max_results)
        if not results:
            results = self._search_bing(query, max_results)

        # Fallback: return basic info
        if not results:
            results = [{"title": "No results", "url": "", "snippet": f"No search results found for: {query}"}]

        # Fetch page content if requested
        if fetch_content and results:
            for r in results:
                if r.get("url"):
                    r["content"] = self._fetch_page_text(r["url"])

        # Cache results
        self._cache.set(query, results)

        return results

    # ── DuckDuckGo backend ──────────────────────────────────────────────

    def _search_ddg(self, query: str, max_results: int) -> list[dict]:
        """Search using DuckDuckGo."""
        try:
            from ddgs import DDGS

            with DDGS() as ddgs:
                raw = list(ddgs.text(query, max_results=max_results))
                results = []
                for r in raw:
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("href", ""),
                        "snippet": r.get("body", ""),
                    })
                if results:
                    logger.info("DDG search OK: %d results for: %s", len(results), query[:60])
                return results
        except ImportError:
            logger.warning("ddgs not installed, skipping DuckDuckGo search")
            return []
        except Exception as e:
            logger.warning("DDG search failed for '%s': %s", query[:60], e)
            return []

    # ── Bing fallback backend ───────────────────────────────────────────

    def _search_bing(self, query: str, max_results: int) -> list[dict]:
        """Fallback: search using Bing via httpx."""
        try:
            import httpx
            from bs4 import BeautifulSoup

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "zh-CN,zh;q=0.9",
            }
            import urllib.parse

            url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"

            with httpx.Client(headers=headers, timeout=15, verify=False) as client:
                resp = client.get(url, follow_redirects=True)
                if resp.status_code != 200:
                    return []

                soup = BeautifulSoup(resp.text, "html.parser")
                items = soup.select(".b_algo")
                results = []
                for item in items[:max_results]:
                    h2 = item.select_one("h2 a")
                    caption = item.select_one(".b_caption p")
                    if h2:
                        results.append({
                            "title": h2.get_text(strip=True),
                            "url": h2.get("href", ""),
                            "snippet": caption.get_text(strip=True)[:300] if caption else "",
                        })
                if results:
                    logger.info("Bing search OK: %d results for: %s", len(results), query[:60])
                return results
        except Exception as e:
            logger.warning("Bing search failed: %s", e)
            return []

    # ── Page content fetcher ───────────────────────────────────────────

    def _fetch_page_text(self, url: str, max_chars: int = 3000) -> str:
        """Fetch a web page and extract its main text content."""
        if not url:
            return ""
        try:
            import httpx
            from bs4 import BeautifulSoup

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
            }
            with httpx.Client(headers=headers, timeout=10, verify=False) as client:
                resp = client.get(url, follow_redirects=True)
                if resp.status_code != 200:
                    return ""

                soup = BeautifulSoup(resp.text, "html.parser")

                # Remove script/style elements
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()

                text = soup.get_text(separator="\n", strip=True)
                # Clean up: remove empty lines, limit length
                lines = [l.strip() for l in text.split("\n") if l.strip()]
                text = "\n".join(lines[:200])
                return text[:max_chars]
        except Exception as e:
            logger.debug("Failed to fetch page %s: %s", url[:60], e)
            return ""
