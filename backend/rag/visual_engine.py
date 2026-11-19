"""
In-chat Visual Engine (Multi-Format Engineering Visuals).
Supports 5 structured visual kinds:
  - diagram:  Flowcharts, pipelines, state machines, block diagrams (React Flow + Dagre)
  - packet:   Bit-field headers, datagrams, frames, registers (IPv6, TCP, Ethernet, MIPS)
  - sequence: Protocol handshakes, message passing, timing interactions
  - layers:   Protocol stacks, OSI/TCP-IP, memory hierarchy, layered architectures
  - chart:    Quantitative line, area, and bar graphs (Recharts)
"""

import json
import logging
import time
import uuid
import requests
from typing import Dict, Any, Optional, List
from config import settings
from db import ChatModel, BookModel
from rag.vector_store import get_vector_store

logger = logging.getLogger(__name__)

ACTIVE_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest"
]

VALID_VARIANTS = {"start", "process", "decision", "data", "highlight"}
VALID_CHART_TYPES = {"line", "area", "bar"}
VALID_COLORS = {"blue", "indigo", "emerald", "amber", "violet", "rose", "cyan", "slate"}
DEFAULT_HEX_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#ef4444"]


def _sanitize_visual_spec(spec: Dict[str, Any], fallback_title: str) -> Optional[Dict[str, Any]]:
    """Validates and normalizes Gemini JSON output across all 5 visual kinds."""
    if not isinstance(spec, dict):
        return None

    kind = str(spec.get("kind", "")).lower().strip()
    title = str(spec.get("title") or fallback_title).strip()[:80]
    summary = str(spec.get("summary") or "Visual representation generated from textbook context.").strip()

    # 1. FLOW / BLOCK DIAGRAM
    if kind == "diagram":
        raw_nodes = spec.get("nodes") or []
        raw_edges = spec.get("edges") or []
        if not isinstance(raw_nodes, list) or len(raw_nodes) < 2:
            return None

        seen_ids = set()
        clean_nodes = []
        for idx, n in enumerate(raw_nodes[:14]):
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id") or f"n{idx + 1}").strip()
            if nid in seen_ids:
                continue
            seen_ids.add(nid)
            variant = str(n.get("variant") or "process").lower().strip()
            clean_nodes.append({
                "id": nid,
                "label": str(n.get("label") or f"Step {idx + 1}").strip()[:60],
                "subtitle": str(n.get("subtitle") or "").strip()[:100],
                "variant": variant if variant in VALID_VARIANTS else "process"
            })

        if len(clean_nodes) < 2:
            return None

        clean_edges = []
        for e in raw_edges:
            if not isinstance(e, dict):
                continue
            src = str(e.get("source") or "").strip()
            tgt = str(e.get("target") or "").strip()
            if src in seen_ids and tgt in seen_ids and src != tgt:
                clean_edges.append({
                    "source": src,
                    "target": tgt,
                    "label": str(e.get("label") or "").strip()[:28],
                    "animated": bool(e.get("animated", False))
                })

        direction = str(spec.get("direction") or "TB").upper().strip()
        return {
            "kind": "diagram",
            "title": title,
            "summary": summary,
            "direction": direction if direction in {"TB", "LR"} else "TB",
            "nodes": clean_nodes,
            "edges": clean_edges
        }

    # 2. PACKET / HEADER / REGISTER BIT-FIELD LAYOUT
    if kind == "packet":
        raw_rows = spec.get("rows") or []
        if not isinstance(raw_rows, list) or len(raw_rows) == 0:
            return None

        bits_per_row = int(spec.get("bits_per_row") or 32)
        if bits_per_row not in {8, 16, 32, 64}:
            bits_per_row = 32

        clean_rows = []
        for row in raw_rows[:16]:
            if not isinstance(row, dict):
                continue
            raw_fields = row.get("fields") or []
            clean_fields = []
            for f in raw_fields:
                if not isinstance(f, dict) or not f.get("name"):
                    continue
                try:
                    bits = max(1, int(f.get("bits") or 8))
                except (ValueError, TypeError):
                    bits = 8
                color = str(f.get("color") or "blue").lower().strip()
                clean_fields.append({
                    "name": str(f.get("name")).strip()[:45],
                    "bits": bits,
                    "value": str(f.get("value") or "").strip()[:40],
                    "description": str(f.get("description") or "").strip()[:140],
                    "color": color if color in VALID_COLORS else "blue"
                })
            if clean_fields:
                clean_rows.append({
                    "label": str(row.get("label") or "").strip()[:24],
                    "fields": clean_fields
                })

        if not clean_rows:
            return None

        return {
            "kind": "packet",
            "title": title,
            "summary": summary,
            "bits_per_row": bits_per_row,
            "unit": str(spec.get("unit") or "bits").strip()[:12],
            "rows": clean_rows
        }

    # 3. SEQUENCE / HANDSHAKE / TIMING DIAGRAM
    if kind == "sequence":
        raw_parts = spec.get("participants") or []
        raw_msgs = spec.get("messages") or []
        if not isinstance(raw_parts, list) or len(raw_parts) < 2 or not isinstance(raw_msgs, list) or len(raw_msgs) < 1:
            return None

        seen_p = set()
        clean_parts = []
        for idx, p in enumerate(raw_parts[:6]):
            if not isinstance(p, dict):
                continue
            pid = str(p.get("id") or f"p{idx + 1}").strip()
            if pid in seen_p:
                continue
            seen_p.add(pid)
            clean_parts.append({
                "id": pid,
                "name": str(p.get("name") or f"Actor {idx + 1}").strip()[:32],
                "subtitle": str(p.get("subtitle") or "").strip()[:45]
            })

        if len(clean_parts) < 2:
            return None

        clean_msgs = []
        for m in raw_msgs[:16]:
            if not isinstance(m, dict):
                continue
            src = str(m.get("from") or "").strip()
            tgt = str(m.get("to") or "").strip()
            if src in seen_p and tgt in seen_p:
                mtype = str(m.get("type") or "sync").lower().strip()
                clean_msgs.append({
                    "from": src,
                    "to": tgt,
                    "label": str(m.get("label") or "").strip()[:60],
                    "note": str(m.get("note") or "").strip()[:80],
                    "type": mtype if mtype in {"sync", "reply", "async"} else "sync"
                })

        if not clean_msgs:
            return None

        return {
            "kind": "sequence",
            "title": title,
            "summary": summary,
            "participants": clean_parts,
            "messages": clean_msgs
        }

    # 4. LAYERED STACK / ARCHITECTURE
    if kind == "layers":
        raw_layers = spec.get("layers") or []
        if not isinstance(raw_layers, list) or len(raw_layers) < 2:
            return None

        clean_layers = []
        for idx, layer in enumerate(raw_layers[:10]):
            if not isinstance(layer, dict) or not layer.get("name"):
                continue
            color = str(layer.get("color") or "blue").lower().strip()
            items = layer.get("items") or []
            clean_items = [str(it).strip()[:36] for it in items[:6] if str(it).strip()] if isinstance(items, list) else []
            clean_layers.append({
                "level": str(layer.get("level") or f"L{len(raw_layers) - idx}").strip()[:16],
                "name": str(layer.get("name")).strip()[:50],
                "subtitle": str(layer.get("subtitle") or "").strip()[:110],
                "items": clean_items,
                "color": color if color in VALID_COLORS else "blue"
            })

        if len(clean_layers) < 2:
            return None

        return {
            "kind": "layers",
            "title": title,
            "summary": summary,
            "layers": clean_layers
        }

    # 5. DATA / MATHEMATICAL CHART
    if kind == "chart":
        raw_series = spec.get("series") or []
        raw_data = spec.get("data") or []
        if not isinstance(raw_series, list) or not isinstance(raw_data, list):
            return None
        if len(raw_series) == 0 or len(raw_data) < 2:
            return None

        clean_series = []
        for idx, s in enumerate(raw_series[:5]):
            if not isinstance(s, dict) or not s.get("key"):
                continue
            clean_series.append({
                "key": str(s["key"]).strip(),
                "name": str(s.get("name") or s["key"]).strip(),
                "color": str(s.get("color") or DEFAULT_HEX_COLORS[idx % len(DEFAULT_HEX_COLORS)]).strip()
            })

        if not clean_series:
            return None

        clean_data = [d for d in raw_data[:20] if isinstance(d, dict) and "x" in d]
        if len(clean_data) < 2:
            return None

        chart_type = str(spec.get("chart_type") or "area").lower().strip()
        return {
            "kind": "chart",
            "chart_type": chart_type if chart_type in VALID_CHART_TYPES else "area",
            "title": title,
            "summary": summary,
            "x_label": str(spec.get("x_label") or "").strip(),
            "y_label": str(spec.get("y_label") or "").strip(),
            "series": clean_series,
            "data": clean_data
        }

    return None


class VisualEngine:
    def __init__(self):
        self.api_key = settings.gemini_api_key

    def _call_gemini_json(self, prompt: str, target_tokens: int = 3584) -> Dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.15,
                "maxOutputTokens": target_tokens,
                "responseMimeType": "application/json",
                "thinkingConfig": {"thinkingBudget": 0}
            }
        }

        last_error = None
        for model_name in ACTIVE_MODELS:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
            for _ in range(2):
                try:
                    logger.info(f"Generating visual spec using {model_name}...")
                    res = requests.post(url, headers=headers, json=payload, timeout=60)
                    if res.status_code in [500, 503, 429]:
                        time.sleep(2)
                        continue
                    res.raise_for_status()
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            return json.loads(parts[0]["text"].strip())
                except Exception as e:
                    last_error = e
                    logger.warning(f"Visual generation error on {model_name}: {e}")
                    time.sleep(1.5)

        raise last_error or Exception("Failed to generate visual JSON from Gemini.")

    def _collect_context(
        self,
        book_id: str,
        chat_id: Optional[str],
        mode: str,
        query: str,
        context_text: Optional[str]
    ) -> Dict[str, str]:
        book_info = BookModel.find_by_book_id(book_id) or {}
        book_title = book_info.get("title", "Engineering Textbook")
        book_subject = book_info.get("subject", "Engineering")

        blocks: List[str] = [f"Textbook: {book_title}\nSubject: {book_subject}"]

        if mode == "post_response" and context_text:
            blocks.append(f"Target Assistant Explanation:\n{context_text.strip()[:3000]}")

        if chat_id:
            chat = ChatModel.find_by_chat_id(chat_id)
            if chat and chat.get("messages"):
                lines = [
                    f"{m['role'].upper()}: {m['content'].strip()[:800]}"
                    for m in chat["messages"][-10:]
                    if m.get("role") in ["user", "assistant"] and m.get("content")
                ]
                if lines:
                    blocks.append("Active Chat Discussion:\n" + "\n".join(lines))

        if query.strip():
            try:
                docs, _, _, _ = get_vector_store().query(query_text=query, n_results=3, book_id=book_id)
                if docs:
                    blocks.append("Relevant Textbook Excerpts:\n" + "\n---\n".join(d[:800] for d in docs))
            except Exception as e:
                logger.warning(f"ChromaDB lookup skipped for visual: {e}")

        return {
            "book_title": book_title,
            "book_subject": book_subject,
            "context": "\n\n".join(blocks)
        }

    def generate_visual(
        self,
        book_id: str,
        user_id: str,
        query: str = "",
        chat_id: Optional[str] = None,
        mode: str = "query",
        visual_preference: str = "auto",
        context_text: Optional[str] = None
    ) -> Dict[str, Any]:
        ctx = self._collect_context(book_id, chat_id, mode, query, context_text)
        user_req = query.strip() or "Visualize the core concept from the current discussion."
        fallback_title = query[:50].strip() or f"{ctx['book_subject']} Overview"

        prompt = f"""You are an expert engineering textbook illustrator. Choose the MOST ACCURATE visual format for the concept and return strictly ONE JSON object matching its schema.

User Request: {user_req}
Requested Format: {visual_preference}

FORMAT SELECTION GUIDE (when Requested Format is 'auto'):
- Use "packet" for packet/datagram/frame headers, memory layouts, CPU instruction formats, or registers (e.g., IPv6 datagram, IPv4 header, TCP/UDP header, Ethernet frame, MIPS instruction, IEEE 754 float).
- Use "sequence" for step-by-step communication between actors over time (e.g., TCP 3-way handshake, TLS/SSL handshake, HTTP request/response, DNS resolution, bus read/write cycle).
- Use "layers" for stacked architectures or hierarchies (e.g., OSI 7-layer model, TCP/IP stack, memory hierarchy, OS architecture, compiler phases stack).
- Use "chart" for numeric curves, quantitative comparisons, complexity growth, or plots (e.g., Big-O curves, diode I-V curve, frequency response, benchmark comparison).
- Use "diagram" for flowcharts, state machines, signal/data pipelines, logic block diagrams, or algorithms (e.g., MUX/DMUX flow, FSM, CPU datapath, sorting flow).

Context:
{ctx["context"]}

SCHEMAS (output ONLY ONE):

1) kind == "packet" (Bit-field / Header / Register):
{{
  "kind": "packet",
  "title": "Short title (e.g., IPv6 Datagram Header)",
  "summary": "One concise sentence.",
  "bits_per_row": 32,
  "unit": "bits",
  "rows": [
    {{
      "label": "0-31",
      "fields": [
        {{ "name": "Version", "bits": 4, "value": "6 (0110)", "description": "IP version number", "color": "blue" }},
        {{ "name": "Traffic Class", "bits": 8, "value": "DSCP + ECN", "description": "Priority and congestion", "color": "indigo" }},
        {{ "name": "Flow Label", "bits": 20, "value": "", "description": "Identifies packet flow", "color": "violet" }}
      ]
    }}
  ]
}}
Packet rules: Sum of bits in a standard row must equal bits_per_row (e.g., 32). For wide multi-row fields like 128-bit IPv6 addresses, place them in their own row with bits: 128. Allowed colors: blue, indigo, emerald, amber, violet, rose, cyan, slate.

2) kind == "sequence" (Protocol Handshake / Interaction):
{{
  "kind": "sequence",
  "title": "Short title",
  "summary": "One concise sentence.",
  "participants": [
    {{ "id": "c", "name": "Client", "subtitle": "Active opener" }},
    {{ "id": "s", "name": "Server", "subtitle": "Listening port" }}
  ],
  "messages": [
    {{ "from": "c", "to": "s", "label": "SYN (seq=x)", "type": "sync", "note": "Initiate connection" }},
    {{ "from": "s", "to": "c", "label": "SYN-ACK (seq=y, ack=x+1)", "type": "reply", "note": "" }}
  ]
}}

3) kind == "layers" (Layered Stack / Hierarchy):
{{
  "kind": "layers",
  "title": "Short title",
  "summary": "One concise sentence.",
  "layers": [
    {{ "level": "Layer 7", "name": "Application", "subtitle": "End-user network services", "items": ["HTTP", "DNS", "SMTP"], "color": "blue" }}
  ]
}}

4) kind == "diagram" (Flowchart / Block Diagram / Pipeline):
{{
  "kind": "diagram",
  "title": "Short title",
  "summary": "One concise sentence.",
  "direction": "TB" or "LR",
  "nodes": [
    {{ "id": "n1", "label": "Short title (max 5 words)", "subtitle": "Concise detail", "variant": "start" | "process" | "decision" | "data" | "highlight" }}
  ],
  "edges": [
    {{ "source": "n1", "target": "n2", "label": "Short label (max 3 words)", "animated": true or false }}
  ]
}}
Diagram rules: 4 to 10 nodes; keep edge labels very short (1-3 words max); no LaTeX $ delimiters.

5) kind == "chart" (Quantitative Graph):
{{
  "kind": "chart",
  "chart_type": "line" | "area" | "bar",
  "title": "Short title",
  "summary": "One concise sentence.",
  "x_label": "X-axis",
  "y_label": "Y-axis",
  "series": [{{ "key": "s1", "name": "Series name", "color": "#3b82f6" }}],
  "data": [{{ "x": "10", "s1": 10 }}]
}}"""

        if self.api_key:
            try:
                raw_spec = self._call_gemini_json(prompt)
                clean_spec = _sanitize_visual_spec(raw_spec, fallback_title)
                if clean_spec:
                    return {
                        "visual_id": f"vis_{uuid.uuid4().hex[:12]}",
                        "mode": mode,
                        "visual": clean_spec
                    }
            except Exception as e:
                logger.error(f"Visual generation failed, falling back: {e}")

        return {
            "visual_id": f"vis_{uuid.uuid4().hex[:12]}",
            "mode": mode,
            "visual": {
                "kind": "diagram",
                "title": fallback_title,
                "summary": "Fallback structural diagram (LLM unavailable).",
                "direction": "TB",
                "nodes": [
                    {"id": "1", "label": ctx["book_subject"], "subtitle": "Core domain", "variant": "start"},
                    {"id": "2", "label": "Key Mechanism", "subtitle": "Primary operating principle", "variant": "process"},
                    {"id": "3", "label": "System Output", "subtitle": "Applied engineering result", "variant": "highlight"}
                ],
                "edges": [
                    {"source": "1", "target": "2", "label": "drives", "animated": True},
                    {"source": "2", "target": "3", "label": "produces", "animated": False}
                ]
            }
        }


_visual_engine: Optional[VisualEngine] = None


def get_visual_engine() -> VisualEngine:
    global _visual_engine
    if _visual_engine is None:
        _visual_engine = VisualEngine()
    return _visual_engine