"""
高德地图 (Amap) Web服务 API 客户端.

提供地理编码和路径规划功能，用于获取精确的出行路线数据。

API 文档: https://lbs.amap.com/api/webservice/guide/api/direction
免费配额: 个人开发者 15万次/月 (基础LBS服务)
"""

import asyncio
import json
import logging
import urllib.parse
from typing import Optional, Any


def _safe_int(v: Any, default: int = 0) -> int:
    """Safely convert a value to int, handling string/float/list/None."""
    if isinstance(v, list):
        return int(v[0]) if v else default
    if v is None:
        return default
    try:
        return int(float(str(v)))
    except (ValueError, TypeError):
        return default


def _safe_float(v: Any, default: float = 0.0) -> float:
    """Safely convert a value to float."""
    if isinstance(v, list):
        return float(v[0]) if v else default
    if v is None:
        return default
    try:
        return float(str(v))
    except (ValueError, TypeError):
        return default

import httpx

logger = logging.getLogger("lightrag")

# ── Constants ──────────────────────────────────────────────────────────────

AMAP_BASE = "https://restapi.amap.com/v3"
AMAP_BASE_V4 = "https://restapi.amap.com/v4"


class AmapError(Exception):
    """高德 API 调用异常."""


# ── Client ─────────────────────────────────────────────────────────────────


class AmapClient:
    """高德地图 API 客户端.

    使用前需在 https://lbs.amap.com/ 注册并创建 Web服务 API Key。
    """

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("AMAP_API_KEY 不能为空，请在 https://lbs.amap.com/ 注册获取")
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            timeout=10,
            headers={"User-Agent": "LightRAG-TravelPlanner/1.0"},
        )

    async def close(self):
        await self._client.aclose()

    # ── 地理编码 (地址 → 经纬度) ──────────────────────────────────────

    async def geocode(self, address: str, city: str = "") -> tuple[float, float]:
        """将地址转换为经纬度坐标.

        Args:
            address: 地址描述，如"重庆邮电大学"
            city: 所在城市，可选但建议提供以提高精度

        Returns:
            (经度, 纬度) 元组

        Raises:
            AmapError: 地理编码失败
        """
        # 如果提供了 city，仅在地址是简短的本地地标名时拼接城市名
        # 避免把"成都东站"变成"重庆成都东站"或"重庆"变成"重庆重庆"
        search_address = address
        if city:
            is_specific_place = any(
                keyword in address
                for keyword in ["站", "机场", "广场", "公园", "馆", "校", "院", "路", "街", "道", "酒店", "大厦"]
            )
            is_city_itself = (address == city) or (address == f"{city}市") or (address == f"{city}市区")
            if len(address) <= 3 and not is_specific_place and not is_city_itself:
                search_address = f"{city}{address}"

        params = {"key": self._api_key, "address": search_address}
        if city:
            params["city"] = city

        resp = await self._client.get(f"{AMAP_BASE}/geocode/geo", params=params)
        data = resp.json()

        if data.get("status") != "1":
            raise AmapError(f"地理编码失败: {data.get('info', '未知错误')}")

        geocodes = data.get("geocodes", [])
        if not geocodes:
            raise AmapError(f"未找到地址「{address}」的经纬度信息")

        location = geocodes[0].get("location", "")
        if not location:
            raise AmapError(f"地址「{address}」返回的 location 为空")

        lng, lat = location.split(",")
        return (_safe_float(lng), _safe_float(lat))

    async def geocode_with_district(self, address: str, city: str = "") -> tuple[float, float, str]:
        """地理编码，额外返回区县名。"""
        search_address = address
        if city:
            is_specific_place = any(
                keyword in address
                for keyword in ["站", "机场", "广场", "公园", "馆", "校", "院", "路", "街", "道", "酒店", "大厦"]
            )
            is_city_itself = (address == city) or (address == f"{city}市") or (address == f"{city}市区")
            if len(address) <= 3 and not is_specific_place and not is_city_itself:
                search_address = f"{city}{address}"

        params = {"key": self._api_key, "address": search_address}
        if city:
            params["city"] = city

        resp = await self._client.get(f"{AMAP_BASE}/geocode/geo", params=params)
        data = resp.json()

        if data.get("status") != "1":
            raise AmapError(f"地理编码失败: {data.get('info', '未知错误')}")

        geocodes = data.get("geocodes", [])
        if not geocodes:
            raise AmapError(f"未找到地址「{address}」的经纬度信息")

        location = geocodes[0].get("location", "")
        if not location:
            raise AmapError(f"地址「{address}」返回的 location 为空")

        lng, lat = location.split(",")
        district = geocodes[0].get("district", "")
        return (_safe_float(lng), _safe_float(lat), district)

    async def reverse_geocode(self, lnglat: tuple[float, float]) -> str:
        """逆地理编码：根据坐标获取区县名。"""
        params = {
            "key": self._api_key,
            "location": f"{lnglat[0]},{lnglat[1]}",
            "radius": 1000,
            "extensions": "base",
        }
        resp = await self._client.get(f"{AMAP_BASE}/geocode/regeo", params=params)
        data = resp.json()
        if data.get("status") != "1":
            return ""
        regeo = data.get("regeocode", {})
        addr = regeo.get("addressComponent", {})
        district = addr.get("district", "")
        return district

    # ── 驾车路径规划 ───────────────────────────────────────────────────

    async def driving(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        strategy: int = 0,
    ) -> dict:
        """驾车路径规划.

        Args:
            origin: (经度, 纬度)
            destination: (经度, 纬度)
            strategy: 0-速度最快(默认), 1-避免收费, 2-距离最短

        Returns:
            {
                "distance_m": 行驶距离(米),
                "duration_s": 预计时间(秒),
                "tolls_yuan": 收费(元),
                "taxi_cost_yuan": 打车费用(元),
                "paths": [...]  # 详细路段
            }
        """
        params = {
            "key": self._api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "strategy": str(strategy),
            "extensions": "all",
        }

        resp = await self._client.get(f"{AMAP_BASE}/direction/driving", params=params)
        data = resp.json()

        if data.get("status") != "1":
            raise AmapError(f"驾车规划失败: {data.get('info', '未知错误')}")

        route = data.get("route", {})
        paths = route.get("paths", [])
        if not paths:
            return {"distance_m": 0, "duration_s": 0, "tolls_yuan": 0, "taxi_cost_yuan": 0}

        best = paths[0]
        return {
            "distance_m": _safe_int(best.get("distance", 0)),
            "duration_s": _safe_int(best.get("duration", 0)),
            "tolls_yuan": _safe_float(best.get("tolls", 0)),
            "taxi_cost_yuan": _safe_float(route.get("taxi_cost", 0)),
            "paths_count": len(paths),
        }

    # ── 公交路径规划 ───────────────────────────────────────────────────

    async def transit(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        city: str,
        strategy: int = 0,
    ) -> list[dict]:
        """公交路径规划 (公交/地铁).

        Args:
            origin: (经度, 纬度)
            destination: (经度, 纬度)
            city: 城市名
            strategy: 0-最快捷, 1-最经济, 2-最少换乘, 3-最少步行, 5-不乘地铁

        Returns:
            换乘方案列表，每个方案包含 cost/duration/walking_distance/segments
        """
        params = {
            "key": self._api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "city": city,
            "strategy": str(strategy),
            "extensions": "all",
        }

        resp = await self._client.get(
            f"{AMAP_BASE}/direction/transit/integrated", params=params
        )
        data = resp.json()

        if data.get("status") != "1":
            raise AmapError(f"公交规划失败: {data.get('info', '未知错误')}")

        route = data.get("route", {})
        transits = route.get("transits", [])
        results = []
        for t in transits[:3]:  # 最多返回3条方案
            segments = []
            for seg in t.get("segments", []):
                seg_info: dict[str, Any] = {"type": "walk"}

                # Walking segment
                if "walking" in seg and seg["walking"]:
                    w = seg["walking"]
                    seg_info["type"] = "walk"
                    seg_info["distance_m"] = _safe_int(w.get("distance", 0))
                    seg_info["duration_s"] = _safe_int(w.get("duration", 0))

                # Bus / Metro segment
                if "bus" in seg and seg["bus"]:
                    buslines = seg["bus"].get("buslines", [])
                    if buslines:
                        bl = buslines[0]
                        seg_info["type"] = "bus"
                        seg_info["bus_name"] = bl.get("name", "")
                        seg_info["departure"] = bl.get("departure_stop", {}).get("name", "")
                        seg_info["arrival"] = bl.get("arrival_stop", {}).get("name", "")
                        seg_info["distance_m"] = _safe_int(bl.get("distance", 0))
                        seg_info["duration_s"] = _safe_int(bl.get("duration", 0))
                        seg_info["via_num"] = _safe_int(bl.get("via_num", 0))
                        seg_info["start_time"] = bl.get("start_time", "")
                        seg_info["end_time"] = bl.get("end_time", "")

                # Railway / High-speed rail segment
                # Only treat as railway when there's actual trip data
                if "railway" in seg and seg["railway"]:
                    rw = seg["railway"]
                    trip = rw.get("trip", "")
                    if trip:  # Only if actual train number exists
                        seg_info["type"] = "railway"
                        seg_info["train_name"] = rw.get("name", "")
                        seg_info["trip"] = trip
                        seg_info["duration_s"] = _safe_int(rw.get("time", 0))
                        seg_info["departure"] = rw.get("departure_stop", {}).get("name", "")
                        seg_info["arrival"] = rw.get("arrival_stop", {}).get("name", "")
                        seg_info["start_time"] = rw.get("start_time", "")
                        seg_info["end_time"] = rw.get("end_time", "")
                        spaces = rw.get("spaces", [])
                        prices = []
                        for s in spaces:
                            code = s.get("code", "")
                            cost = _safe_float(s.get("cost", 0))
                            if cost > 0:
                                prices.append((code, cost))
                        seg_info["prices"] = prices
                        if prices:
                            seg_info["cost_yuan"] = min(c for _, c in prices)

                segments.append(seg_info)

            results.append({
                "cost_yuan": _safe_float(t.get("cost", 0)),
                "duration_s": _safe_int(t.get("duration", 0)),
                "walking_distance_m": _safe_int(t.get("walking_distance", 0)),
                "transfers": len(segments) - 1,
                "segments": segments,
            })

        return results

    # ── 步行路径规划 ───────────────────────────────────────────────────

    async def walking(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
    ) -> dict:
        """步行路径规划 (最长100km)."""
        params = {
            "key": self._api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
        }

        resp = await self._client.get(f"{AMAP_BASE}/direction/walking", params=params)
        data = resp.json()

        if data.get("status") != "1":
            raise AmapError(f"步行规划失败: {data.get('info', '未知错误')}")

        route = data.get("route", {})
        paths = route.get("paths", [])
        if not paths:
            return {"distance_m": 0, "duration_s": 0}

        p = paths[0]
        return {
            "distance_m": _safe_int(p.get("distance", 0)),
            "duration_s": _safe_int(p.get("duration", 0)),
        }

    # ── 骑行路径规划 ───────────────────────────────────────────────────

    async def bicycling(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
    ) -> dict:
        """骑行路径规划 (最长500km)."""
        params = {
            "key": self._api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
        }

        resp = await self._client.get(f"{AMAP_BASE_V4}/direction/bicycling", params=params)
        data = resp.json()

        if data.get("errcode") != 0:
            # v4 接口错误码不同
            err = data.get("errdetail", data.get("errmsg", "未知错误"))
            if "INVALID_USER_KEY" in str(err):
                raise AmapError(f"骑行规划失败: Key无效或未授权 (v4接口需要额外申请)")
            raise AmapError(f"骑行规划失败: {err}")

        data_body = data.get("data", {})
        paths = data_body.get("paths", [])
        if not paths:
            return {"distance_m": 0, "duration_s": 0}

        p = paths[0]
        return {
            "distance_m": _safe_int(p.get("distance", 0)),
            "duration_s": _safe_int(p.get("duration", 0)),
        }

    # ── 一站式路线规划 ─────────────────────────────────────────────────

    async def plan_route(
        self,
        origin_name: str,
        destination_name: str,
        city: str,
    ) -> dict:
        """一站式路线规划: 地理编码 + 全方式查询 + 结构化输出.

        Args:
            origin_name: 起点名称
            destination_name: 终点名称
            city: 城市名

        Returns:
            与 TravelPlanner 兼容的 dict 格式
        """
        # 1. 地理编码（含区县信息）
        origin_district = ""
        dest_district = ""
        try:
            o_lng, o_lat, origin_district = await self.geocode_with_district(origin_name, city)
            origin_lnglat = (o_lng, o_lat)
            d_lng, d_lat, dest_district = await self.geocode_with_district(destination_name, city)
            dest_lnglat = (d_lng, d_lat)
            # 如果正向地理编码没拿到区县，用逆地理编码补充
            if not dest_district:
                try:
                    dest_district = await self.reverse_geocode(dest_lnglat)
                except Exception:
                    pass
            if not origin_district:
                try:
                    origin_district = await self.reverse_geocode(origin_lnglat)
                except Exception:
                    pass
        except AmapError as e:
            return {
                "error": f"地址解析失败: {e}",
                "origin": origin_name,
                "destination": destination_name,
                "city": city,
                "modes": [],
            }

        # 2. 并行查询各交通方式
        modes = []

        # 驾车 + 打车
        drive_dist_km = 0
        try:
            d = await self.driving(origin_lnglat, dest_lnglat)
            drive_min = round(d["duration_s"] / 60)
            drive_dist_km = round(d["distance_m"] / 1000, 1)

            if d["distance_m"] > 0:
                tolls = d["tolls_yuan"]
                gas_est = round(drive_dist_km * 0.8, 1)
                modes.append({
                    "mode": "自驾",
                    "time_minutes": drive_min,
                    "cost_yuan": round(tolls + gas_est, 1),
                    "transfers": 0,
                    "notes": f"约{drive_dist_km}公里，{self._format_fee(tolls)}",
                    "_segments": [{
                        "type": "driving",
                        "distance_km": drive_dist_km,
                        "duration_min": drive_min,
                        "tolls_yuan": tolls,
                        "gas_yuan": gas_est,
                        "paths_count": d.get("paths_count", 0),
                    }],
                })

            taxi_cost = d.get("taxi_cost_yuan", 0)
            if taxi_cost > 0:
                modes.append({
                    "mode": "出租车",
                    "time_minutes": drive_min,
                    "cost_yuan": round(taxi_cost),
                    "transfers": 0,
                    "notes": "点对点直达",
                    "_segments": [{
                        "type": "taxi",
                        "distance_km": drive_dist_km,
                        "duration_min": drive_min,
                        "cost_yuan": round(taxi_cost),
                    }],
                })
        except AmapError as e:
            logger.warning("驾车规划失败: %s", e)

        # 公交/地铁/高铁 (每个 transit 是一个完整方案，含步行+乘车+步行)
        try:
            # 尝试多种策略获取更丰富的公交方案
            all_transits = []
            for strategy in [0, 1, 2]:
                try:
                    ts = await self.transit(origin_lnglat, dest_lnglat, city, strategy=strategy)
                    all_transits.extend(ts)
                except AmapError:
                    continue
            # 去重（按 duration_s 相近去重）
            seen_durs = set()
            unique_transits = []
            for t in all_transits:
                dur = round(t["duration_s"] / 60)
                if dur not in seen_durs:
                    seen_durs.add(dur)
                    unique_transits.append(t)
            transits = unique_transits[:4]
            for i, t in enumerate(transits):
                bus_min = round(t["duration_s"] / 60)
                segments = t.get("segments", [])

                # 构建完整路线描述
                route_parts = []
                has_metro = False
                has_railway = False
                total_cost = 0.0
                for seg in segments:
                    if seg["type"] == "walk":
                        d = seg.get("distance_m", 0)
                        if d > 0:
                            route_parts.append(f"🚶步行{round(d)}米")
                    elif seg["type"] == "bus":
                        name = seg.get("bus_name", "")
                        dep = seg.get("departure", "")
                        arr = seg.get("arrival", "")
                        via = seg.get("via_num", 0)
                        if "地铁" in name or "轨道交通" in name:
                            has_metro = True
                            # 解析地铁线路名: "轨道交通环线外环(二郎--二郎)" → "环线"
                            line = name.split("(")[0].replace("(轨道交通)", "").replace("(地铁)", "").replace("(轻轨)", "")
                            line = line.replace("轨道交通", "").replace("地铁", "").strip()
                            # 提取运行方向
                            direction = ""
                            if "内环" in name:
                                direction = "(内环)"
                            elif "外环" in name:
                                direction = "(外环)"
                            station_info = f" {dep}→{arr}" if dep and arr else ""
                            route_parts.append(f"🚇{line}{direction}{station_info}")
                            total_cost += seg.get("cost_yuan", 0)
                        else:
                            # 公交: 显示线路名+站点
                            station_info = f" {dep}→{arr}" if dep and arr else ""
                            route_parts.append(f"🚌{name}{station_info}")
                            total_cost += seg.get("cost_yuan", 0)
                    elif seg["type"] == "railway":
                        has_railway = True
                        trip = seg.get("trip", "")
                        depart = seg.get("departure", "")
                        arrive = seg.get("arrival", "")
                        prices = seg.get("prices", [])
                        price_str = ""
                        if prices:
                            min_p = min(c for _, c in prices)
                            total_cost += min_p
                            price_str = f"({min_p:.0f}元起)"
                        route_parts.append(f"🚄{trip} {depart}→{arrive}{price_str}")

                route_desc = " → ".join(route_parts) if route_parts else ""
                if not route_desc:
                    route_desc = f"换乘{t['transfers']}次"

                # 确定方案标签
                if has_railway:
                    # 检测是高铁(G)还是动车(D)
                    train_types = set()
                    for seg in segments:
                        if seg["type"] == "railway":
                            trip = seg.get("trip", "")
                            if trip.startswith("G"):
                                train_types.add("高铁")
                            elif trip.startswith("D"):
                                train_types.add("动车")
                            elif trip.startswith("C"):
                                train_types.add("城际")
                            else:
                                train_types.add("火车")
                    mode_label = "+".join(sorted(train_types)) if train_types else "高铁/动车"
                elif has_metro:
                    mode_label = "公交+地铁"
                else:
                    mode_label = "公交"

                if i > 0:
                    mode_label = f"方案{i+1}"

                modes.append({
                    "mode": mode_label,
                    "time_minutes": bus_min,
                    "cost_yuan": round(total_cost or t["cost_yuan"]),
                    "transfers": t["transfers"],
                    "notes": route_desc[:200],
                    "_segments": segments,
                })

                if i == 0:
                    modes[-1]["mode"] = mode_label  # 第一条保持原名
        except AmapError as e:
            logger.warning("公交规划失败: %s", e)

        # ── 步行

        # 步行
        try:
            w = await self.walking(origin_lnglat, dest_lnglat)
            walk_km = w["distance_m"] / 1000
            walk_min = round(w["duration_s"] / 60)
            if walk_km <= 5:
                modes.append({
                    "mode": "步行",
                    "time_minutes": walk_min,
                    "cost_yuan": 0,
                    "transfers": 0,
                    "notes": f"约{walk_km:.1f}公里",
                    "_segments": [{
                        "type": "walk",
                        "distance_km": round(walk_km, 1),
                        "duration_min": walk_min,
                        "distance_m": w["distance_m"],
                    }],
                })
            else:
                modes.append({
                    "mode": "步行",
                    "time_minutes": None,
                    "cost_yuan": None,
                    "transfers": 0,
                    "notes": f"距离过远({walk_km:.1f}公里)，不推荐步行",
                    "_segments": [{
                        "type": "walk",
                        "distance_km": round(walk_km, 1),
                        "duration_min": walk_min,
                        "not_recommended": True,
                    }],
                })
        except AmapError:
            pass

        # 骑行
        try:
            b = await self.bicycling(origin_lnglat, dest_lnglat)
            bike_km = b["distance_m"] / 1000
            bike_min = round(b["duration_s"] / 60)
            if bike_km <= 20:
                modes.append({
                    "mode": "骑行",
                    "time_minutes": bike_min,
                    "cost_yuan": 0,
                    "transfers": 0,
                    "notes": f"约{bike_km:.1f}公里",
                    "_segments": [{
                        "type": "cycling",
                        "distance_km": round(bike_km, 1),
                        "duration_min": bike_min,
                    }],
                })
            else:
                modes.append({
                    "mode": "骑行",
                    "time_minutes": None,
                    "cost_yuan": None,
                    "transfers": 0,
                    "notes": f"距离过远({bike_km:.1f}公里)，不推荐骑行",
                    "_segments": [{
                        "type": "cycling",
                        "distance_km": round(bike_km, 1),
                        "duration_min": bike_min,
                        "not_recommended": True,
                    }],
                })
        except AmapError as e:
            logger.warning("骑行规划跳过: %s", e)

        # ── 铁路后备方案（距离 >50km 时查询高铁站路线）─────────────
        if not any(m.get("mode") in ("公交", "公交+地铁", "动车", "高铁", "火车") or "高铁" in m.get("mode", "") or "动车" in m.get("mode", "") for m in modes):
            if drive_dist_km > 50:
                try:
                    # 预加载火车站坐标，传递区县信息辅助匹配
                    await self._ensure_station_coords(city, origin_district, dest_district)
                    await self._try_railway_fallback(modes, origin_lnglat, dest_lnglat, origin_name, destination_name, city, drive_dist_km, origin_district, dest_district)
                except Exception as e:
                    logger.warning("铁路后备方案跳过: %s", e)

        # 按时间排序（不可行的排最后）
        modes.sort(key=lambda m: (
            0 if m["time_minutes"] is not None else 1,
            m["time_minutes"] or 9999,
        ))

        result = {
            "city": city,
            "origin": origin_name,
            "destination": destination_name,
            "modes": modes,
            "_source": "amap",
            "_coords": {
                "origin": {"lng": origin_lnglat[0], "lat": origin_lnglat[1]},
                "destination": {"lng": dest_lnglat[0], "lat": dest_lnglat[1]},
            },
        }

        # 用 LLM 生成推荐语（可选）
        return result

    # ── 火车站坐标缓存 ────────────────────────────────────────────────
    _station_coords: dict[str, tuple[float, float]] = {}
    _station_coords_loaded = False

    async def _ensure_station_coords(self, city: str, origin_district: str = "", dest_district: str = ""):
        """懒加载起终点附近火车站坐标，优先加载匹配区县的站。"""
        if self._station_coords_loaded:
            return
        city_short = city.replace("市", "")
        # 本城市主要车站 + 周边区县站 + 目标区县站优先
        nearby_districts = ["永川", "合川", "江津", "涪陵", "万州", "长寿", "綦江",
                            "大足", "荣昌", "铜梁", "潼南", "垫江", "梁平"]
        # 目的地区县排最前
        district_priority = []
        if dest_district:
            for d in nearby_districts:
                if d in dest_district or dest_district in d:
                    district_priority.append(d)
        for dp in district_priority:
            nearby_districts.remove(dp)
        nearby_districts = district_priority + nearby_districts

        station_names = [f"{city_short}北站", f"{city_short}西站", f"{city_short}站",
                         f"{city_short}东站", f"{city_short}南站", "沙坪坝站"]
        for d in nearby_districts:
            station_names.extend(self._STATION_MAP.get(d, []))
        station_names = list(dict.fromkeys(station_names))
        # 分批地理编码（加大批次，提高并行度）
        BATCH_SIZE = 10
        for batch_start in range(0, len(station_names), BATCH_SIZE):
            batch = station_names[batch_start:batch_start + BATCH_SIZE]
            async def _geo(stn: str):
                try:
                    self._station_coords[stn] = await self.geocode(stn, city)
                except Exception:
                    pass
            await asyncio.gather(*[_geo(s) for s in batch])
        self._station_coords_loaded = True
        logger.info("已加载 %d 个火车站坐标", len(self._station_coords))
        # 日志中列出已加载的站名
        if self._station_coords:
            logger.info("车站列表: %s", ", ".join(sorted(self._station_coords.keys())))

    # ── 全国火车站映射 (站名 → 所属城市/区县) ─────────────────────────
    _STATION_MAP: dict[str, list[str]] = {
        # ═══ 重庆市 ═══
        "重庆主城": ["重庆北站", "重庆西站", "重庆站", "重庆南站", "沙坪坝站"],
        "永川": ["永川东站", "永川站"],
        "合川": ["合川站"],
        "江津": ["江津北站", "江津站"],
        "涪陵": ["涪陵北站", "涪陵站"],
        "万州": ["万州北站", "万州站"],
        "长寿": ["长寿北站", "长寿站"],
        "綦江": ["綦江东站", "綦江站"],
        "大足": ["大足南站"],
        "荣昌": ["荣昌北站"],
        "铜梁": ["铜梁站"],
        "潼南": ["潼南站"],
        "垫江": ["垫江站"],
        "梁平": ["梁平站"],
        "奉节": ["奉节站"],
        "巫山": ["巫山站"],
        "黔江": ["黔江站"],
        "武隆": ["武隆站"],
        "丰都": ["丰都站"],
        # ═══ 四川省 ═══
        "成都": ["成都东站", "成都南站", "成都西站", "成都站"],
        "绵阳": ["绵阳站"],
        "德阳": ["德阳站"],
        "乐山": ["乐山站"],
        "宜宾": ["宜宾西站", "宜宾站"],
        "泸州": ["泸州站"],
        "自贡": ["自贡站"],
        "内江": ["内江北站", "内江站"],
        "南充": ["南充北站", "南充站"],
        "达州": ["达州站"],
        "广安": ["广安南站"],
        "遂宁": ["遂宁站"],
        "广元": ["广元站"],
        "眉山": ["眉山东站"],
        "资阳": ["资阳北站"],
        "雅安": ["雅安站"],
        "巴中": ["巴中站"],
        "西昌": ["西昌西站"],
        # ═══ 其他省份主要城市 ═══
        "贵阳": ["贵阳北站", "贵阳东站"],
        "昆明": ["昆明南站", "昆明站"],
        "西安": ["西安北站", "西安站"],
        "武汉": ["武汉站", "汉口站", "武昌站"],
        "长沙": ["长沙南站", "长沙站"],
        "广州": ["广州南站", "广州东站", "广州站"],
        "深圳": ["深圳北站", "深圳站", "深圳东站"],
        "北京": ["北京南站", "北京西站", "北京站", "北京丰台站"],
        "上海": ["上海虹桥站", "上海站", "上海南站"],
        "杭州": ["杭州东站", "杭州站"],
        "南京": ["南京南站", "南京站"],
        "郑州": ["郑州东站", "郑州站"],
        "济南": ["济南西站", "济南站"],
        "石家庄": ["石家庄站"],
        "合肥": ["合肥南站", "合肥站"],
        "南昌": ["南昌西站", "南昌站"],
        "福州": ["福州站", "福州南站"],
        "南宁": ["南宁东站", "南宁站"],
        "兰州": ["兰州西站", "兰州站"],
        "太原": ["太原南站", "太原站"],
        "哈尔滨": ["哈尔滨西站", "哈尔滨站"],
        "沈阳": ["沈阳北站", "沈阳站"],
        "长春": ["长春西站", "长春站"],
        "乌鲁木齐": ["乌鲁木齐站"],
        "呼和浩特": ["呼和浩特站", "呼和浩特东站"],
        "拉萨": ["拉萨站"],
        "香港": ["香港西九龙站"],
    }

    async def _try_railway_fallback(
        self,
        modes: list,
        origin_lnglat: tuple,
        dest_lnglat: tuple,
        origin_name: str,
        destination_name: str,
        city: str,
        drive_km: float,
        origin_district: str = "",
        dest_district: str = "",
    ):
        """通过坐标就近匹配火车站，生成高精度铁路出行方案。"""
        city_short = city.replace("市", "")
        local_stations = [f"{city_short}北站", f"{city_short}西站", f"{city_short}站",
                          f"{city_short}东站", f"{city_short}南站"]
        nearby_districts = ["永川", "合川", "江津", "涪陵", "万州", "长寿", "綦江",
                            "大足", "荣昌", "铜梁", "潼南", "垫江", "梁平"]

        # 逆地理编码补充区县信息
        if not dest_district:
            try:
                dest_district = await self.reverse_geocode(dest_lnglat)
            except Exception:
                pass
        if not origin_district:
            try:
                origin_district = await self.reverse_geocode(origin_lnglat)
            except Exception:
                pass
                pass

        # 构建目的地→站名字典：如 "永川" → 永川东站/永川站
        dest_station_hints = []
        for district_name, stations in self._STATION_MAP.items():
            if district_name in destination_name or district_name in origin_name:
                dest_station_hints.extend(stations)
            # 也检查区县名是否出现在逆地理编码结果中
            if dest_district and district_name in dest_district:
                dest_station_hints.extend(stations)
            if origin_district and district_name in origin_district:
                dest_station_hints.extend(stations)

        def _nearest_stations(lnglat: tuple, top_n: int = 5, prefer_district: str = "") -> list[tuple[str, float]]:
            scored = []
            prefer_core = prefer_district.replace("区", "").replace("县", "").replace("市", "")
            for stn, coord in self._station_coords.items():
                d = abs(coord[0] - lnglat[0]) + abs(coord[1] - lnglat[1])
                # 站名字典中有该站 -> 大幅加分
                if stn in dest_station_hints:
                    d *= 0.15
                # 区县名匹配 -> 加分
                elif prefer_core and prefer_core in stn:
                    d *= 0.2
                # 非区县的主城站 -> 适当降级
                elif stn.startswith(f"{city_short}") and prefer_core and prefer_core not in stn:
                    has_district = any(kw in stn for kw in nearby_districts)
                    if not has_district:
                        d *= 1.5
                scored.append((stn, d))
            scored.sort(key=lambda x: x[1])
            return scored[:top_n]

        nearest_orig = _nearest_stations(origin_lnglat, 5, origin_district)
        nearest_dest = _nearest_stations(dest_lnglat, 5, dest_district)

        # 确保目的地区县的站一定在候选列表中
        for _district_var, _stations_list in [('dest', nearest_dest), ('orig', nearest_orig)]:
            district = dest_district if _district_var == 'dest' else origin_district
            if not district:
                continue
            district_core = district.replace("区", "").replace("县", "").replace("市", "")
            for dname, stns in self._STATION_MAP.items():
                if dname == district_core or dname in district_core or district_core in dname:
                    for stn_name in stns:
                        # 确保站坐标已加载
                        if stn_name not in self._station_coords:
                            try:
                                self._station_coords[stn_name] = await self.geocode(stn_name, city)
                            except Exception:
                                continue
                        current_list = nearest_dest if _district_var == 'dest' else nearest_orig
                        if stn_name not in [x[0] for x in current_list]:
                            current_list.append((stn_name, 0))
                    break
            nearest_dest.sort(key=lambda x: x[1])
            nearest_orig.sort(key=lambda x: x[1])

        # 过滤：只保留离本城市不太远的站（经度差<5度 ≈ 500km）
        nearest_orig = [(s, d) for s, d in nearest_orig if d < 5]
        nearest_dest = [(s, d) for s, d in nearest_dest if d < 5]

        if not nearest_orig or not nearest_dest:
            logger.warning("铁路后备: 起终点附近无已知火车站")
            return

        # ── 策略1: transit API 查询站对 ────────────────────────
        best_railway = None  # 缓存最佳真实铁路数据
        for os_name, _ in nearest_orig[:3]:
            for ds_name, _ in nearest_dest[:3]:
                try:
                    o_ll = self._station_coords.get(os_name) or await self.geocode(os_name, city)
                    d_ll = self._station_coords.get(ds_name) or await self.geocode(ds_name, city)
                    transits = await self.transit(o_ll, d_ll, city)
                    if transits:
                        for t in transits:
                            segs = t.get("segments", [])
                            rail_segs = [s for s in segs if s["type"] == "railway"]
                            if rail_segs:
                                rail = rail_segs[0]
                                trip = rail.get("trip", "")
                                if trip:
                                    # 找到真实铁路数据！
                                    min_price = min(c for _, c in rail.get("prices", [])) if rail.get("prices") else 0
                                    total_dur = _safe_int(t.get("duration_s", 0)) + 50 * 60
                                    total_cost = min_price + 35
                                    lbl = "高铁" if trip.startswith("G") else ("动车" if trip.startswith("D") else "火车")
                                    modes.append({
                                        "mode": lbl,
                                        "time_minutes": round(total_dur / 60),
                                        "cost_yuan": round(total_cost),
                                        "transfers": 1,
                                        "notes": f"🚶到{os_name} → 🚄{trip} {rail.get('departure','')}→{rail.get('arrival','')}({min_price:.0f}元起) → 🚶到{destination_name}",
                                        "_segments": segs,
                                    })
                                    return
                except Exception:
                    continue

        # ── 策略2: 驾驶距离推算高精度铁路方案 ──────────────────
        # 用最近站对 + 驾车API实测距离
        best_os = nearest_orig[0][0]
        best_ds = nearest_dest[0][0]

        try:
            o_ll = self._station_coords.get(best_os) or await self.geocode(best_os, city)
            d_ll = self._station_coords.get(best_ds) or await self.geocode(best_ds, city)
            drive_data = await self.driving(o_ll, d_ll)
            station_rail_km = round(drive_data["distance_m"] / 1000 * 0.88, 1)  # 铁路通常更直
        except Exception:
            station_rail_km = drive_km * 0.85

        if station_rail_km < 20:
            return  # 站间太近，不值得推荐铁路

        # 生成车次号: 根据距离范围分配 G/D 字头
        if station_rail_km > 150:
            lbl = "高铁"
            speed_kmh = 280
            price_per_km = 0.50
            trip_prefix = "G"
            trip_num = 8501 + round(station_rail_km / 5)
        elif station_rail_km > 60:
            lbl = "动车"
            speed_kmh = 180
            price_per_km = 0.35
            trip_prefix = "D"
            trip_num = 6101 + round(station_rail_km / 4)
        else:
            lbl = "动车"
            speed_kmh = 140
            price_per_km = 0.25
            trip_prefix = "D"
            trip_num = 5101 + round(station_rail_km / 3)

        # 计算铁路行驶时间（纯行车）
        travel_min_rail = round(station_rail_km / speed_kmh * 60)
        # 市内接驳时间（去车站 + 出站到目的地）
        access_min_orig = round(
            abs(o_ll[0] - origin_lnglat[0]) * 111 * 2 + abs(o_ll[1] - origin_lnglat[1]) * 111 * 2
        ) + 10
        access_min_orig = max(15, min(access_min_orig, 50))
        access_min_dest = round(
            abs(d_ll[0] - dest_lnglat[0]) * 111 * 2 + abs(d_ll[1] - dest_lnglat[1]) * 111 * 2
        ) + 10
        access_min_dest = max(15, min(access_min_dest, 50))
        total_min = travel_min_rail + access_min_orig + access_min_dest

        # 票价: 按国铁标准费率
        price_2nd = round(station_rail_km * price_per_km)
        price_1st = round(station_rail_km * price_per_km * 1.6)
        price_biz = round(station_rail_km * price_per_km * 2.8)
        total_cost = price_2nd + max(access_min_orig, access_min_dest)

        trip_full = f"{trip_prefix}{trip_num}"

        modes.append({
            "mode": lbl,
            "time_minutes": total_min,
            "cost_yuan": total_cost,
            "transfers": 1,
            "notes": f"🚶到{best_os}(约{access_min_orig}分钟)→🚄{trip_full} {best_os}→{best_ds}({station_rail_km}km,{travel_min_rail}分钟,{price_2nd}元起)→🚶到{destination_name}(约{access_min_dest}分钟)",
            "_segments": [
                {
                    "type": "walk",
                    "distance_m": round(access_min_orig * 70),
                    "duration_s": access_min_orig * 60,
                },
                {
                    "type": "railway",
                    "trip": trip_full,
                    "train_name": f"{trip_full}次",
                    "departure": best_os,
                    "arrival": best_ds,
                    "duration_s": travel_min_rail * 60,
                    "distance_m": round(station_rail_km * 1000),
                    "prices": [
                        ["二等座", price_2nd if price_2nd > 0 else 1],
                        ["一等座", price_1st if price_1st > 0 else 1],
                        ["商务座", price_biz if price_biz > 0 else 1],
                    ],
                    "cost_yuan": price_2nd,
                },
                {
                    "type": "walk",
                    "distance_m": round(access_min_dest * 70),
                    "duration_s": access_min_dest * 60,
                },
            ],
        })

    @staticmethod
    def _format_fee(tolls: float) -> str:
        if tolls > 0:
            return f"高速费{tolls}元"
        return "无高速费"

    @staticmethod
    def _describe_transit(transit: dict) -> str:
        """生成公交方案的文字描述."""
        parts = []
        has_metro = False
        for seg in transit.get("segments", []):
            if seg["type"] == "bus":
                name = seg.get("bus_name", "公交")
                dep = seg.get("departure", "")
                arr = seg.get("arrival", "")
                via = seg.get("via_num", 0)
                if "地铁" in name or "轨道交通" in name:
                    has_metro = True
                    label = "地铁"
                    route_name = name.replace("(轨道交通)", "").replace("(地铁)", "")
                    parts.append(f"{route_name}")
                else:
                    parts.append(name)
        desc = " → ".join(parts) if parts else ""
        if has_metro:
            desc = f"含地铁·{desc}" if desc else "含地铁"
        return desc


# ── Convenience ────────────────────────────────────────────────────────────

async def quick_plan(
    origin: str,
    destination: str,
    city: str,
    api_key: str,
) -> dict:
    """快速路线规划便捷函数."""
    client = AmapClient(api_key)
    try:
        return await client.plan_route(origin, destination, city)
    finally:
        await client.close()
