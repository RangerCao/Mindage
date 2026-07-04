"""
Travel Planner — multi-modal route comparison agent.

Compares transportation modes (walking,公交,地铁, taxi, driving) between
two points within a city, reporting estimated time and cost for each mode.

Architecture:
  1. **高德地图 API** — 地理编码 + 各交通方式路径规划 (实时、精确)
  2. **LLM** — 仅用于生成自然语言推荐语 (可选)

Results are cached to avoid redundant API calls.
"""

import json
import os
import logging
import hashlib
from datetime import datetime
from typing import Optional

from openai import AsyncOpenAI
from lightrag.amap_api import AmapClient

logger = logging.getLogger("lightrag")

# ── Cache ──────────────────────────────────────────────────────────────────

TRAVEL_CACHE_FILENAME = "travel_cache.json"


class TravelCache:
    """Persistent cache for travel route results."""

    def __init__(self, working_dir: str):
        self._path = os.path.join(working_dir, TRAVEL_CACHE_FILENAME)
        self._data: dict[str, dict] = {}
        self._load()

    def _load(self):
        if os.path.isfile(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception as e:
                logger.error("Failed to load travel cache: %s", e)
                self._data = {}

    def _save(self):
        d = os.path.dirname(self._path)
        if d and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _make_key(origin: str, destination: str, city: str) -> str:
        raw = f"{city}|{origin}|{destination}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def get(self, origin: str, destination: str, city: str) -> Optional[dict]:
        key = self._make_key(origin, destination, city)
        entry = self._data.get(key)
        if entry:
            logger.info("Travel cache HIT for %s → %s (%s)", origin, destination, city)
            return entry.get("result")
        return None

    def set(self, origin: str, destination: str, city: str, result: dict):
        key = self._make_key(origin, destination, city)
        self._data[key] = {
            "origin": origin,
            "destination": destination,
            "city": city,
            "result": result,
            "cached_at": datetime.utcnow().isoformat(),
        }
        self._save()
        logger.info("Travel cache saved for %s → %s (%s)", origin, destination, city)

    def list_entries(self) -> list[dict]:
        return [
            {
                "key": k,
                "origin": v.get("origin"),
                "destination": v.get("destination"),
                "city": v.get("city"),
                "cached_at": v.get("cached_at"),
            }
            for k, v in self._data.items()
        ]

    def clear(self):
        self._data = {}
        self._save()


# ── Step 1: 高德地图 API 获取实时路线数据 ───────────────────────────────

RECOMMENDATION_PROMPT = """你是一个友好的出行助手。请根据以下交通方式对比数据，给出一条简短（50字以内）的综合推荐建议，说明推荐哪种方式及原因。

只输出推荐语本身，不要多余内容。"""


async def generate_recommendation(
    modes: list[dict],
    origin: str,
    destination: str,
    api_key: str,
    base_url: str,
    model: str = "glm-4-plus",
) -> str:
    """用 LLM 生成简短推荐语（可选，失败时返回空字符串）。"""
    if not api_key or not modes:
        return ""

    modes_text = "\n".join(
        f"  - {m['mode']}: {m.get('time_minutes', '?')}分钟, "
        f"{m.get('cost_yuan', '?')}元"
        for m in modes[:5]
    )

    user_prompt = (
        f"从「{origin}」到「{destination}」的交通方式对比：\n{modes_text}\n\n请给出推荐。"
    )

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": RECOMMENDATION_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip() or ""
    except Exception as e:
        logger.warning("推荐语生成失败: %s", e)
        return ""


# ── High-level planner ────────────────────────────────────────────────────


class TravelPlanner:
    """High-level travel planning service.

    Flow:
      1. Check cache
      2. Call 高德地图 API for route data (driving, transit, walking, bicycling)
      3. LLM generates a short recommendation text
      4. Cache and return result
    """

    def __init__(self, working_dir: str):
        self._cache = TravelCache(working_dir)
        # Load Amap config from environment
        self._amap_key = os.getenv("AMAP_API_KEY", "")
        # Load LLM config (optional, for recommendation)
        self._llm_api_key = os.getenv(
            "LLM_BINDING_API_KEY",
            os.getenv("OPENAI_API_KEY", ""),
        )
        self._llm_base_url = os.getenv(
            "LLM_BINDING_HOST",
            "https://open.bigmodel.cn/api/paas/v4",
        )
        self._llm_model = os.getenv("LLM_MODEL", "glm-4-plus")

    async def plan(
        self,
        origin: str,
        destination: str,
        city: str = "",
        force_refresh: bool = False,
    ) -> dict:
        """Plan a trip from origin to destination.

        Steps:
          1. Check cache first
          2. Call 高德地图 API for precise route data
          3. LLM generates recommendation (optional)
          4. Cache and return

        Args:
            origin: Starting point.
            destination: Destination.
            city: City name.
            force_refresh: If True, bypass cache.

        Returns:
            A dict with the planning result (city, origin, destination, modes, recommendation).
        """
        # Step 0: Cache check
        if not force_refresh:
            cached = self._cache.get(origin, destination, city)
            if cached:
                return cached

        # Step 1: Validate Amap API key
        if not self._amap_key:
            return {
                "error": (
                    "高德地图 API Key 未配置。\n"
                    "请前往 https://lbs.amap.com/ 免费注册，"
                    "获取 Key 后在 .env 中设置 AMAP_API_KEY。\n"
                    "个人开发者每月 15万次免费调用。"
                ),
                "origin": origin,
                "destination": destination,
                "city": city,
                "modes": [],
            }

        # Step 2: Query 高德地图 API
        amap = AmapClient(self._amap_key)
        try:
            result = await amap.plan_route(origin, destination, city)
        except Exception as e:
            logger.error("Amap route planning failed: %s", e)
            result = {
                "error": f"路线规划失败: {str(e)}",
                "origin": origin,
                "destination": destination,
                "city": city,
                "modes": [],
            }
        finally:
            await amap.close()

        # Step 3: Generate LLM recommendation (optional enhancement)
        if "error" not in result and result.get("modes"):
            try:
                rec = await generate_recommendation(
                    modes=result["modes"],
                    origin=origin,
                    destination=destination,
                    api_key=self._llm_api_key,
                    base_url=self._llm_base_url,
                    model=self._llm_model,
                )
                if rec:
                    result["recommendation"] = rec
            except Exception:
                pass

        # Cache the result
        if "error" not in result:
            self._cache.set(origin, destination, city, result)

        return result

    def get_history(self) -> list[dict]:
        return self._cache.list_entries()

    def clear_cache(self):
        self._cache.clear()
        if "error" not in result:
            self._cache.set(origin, destination, city, result)

        return result

    def get_history(self) -> list[dict]:
        return self._cache.list_entries()

    def clear_cache(self):
        self._cache.clear()
