"""Reglas de evidencia de publicación que comparten la cola y el inventario.

Postiz IDs identify jobs, not native posts. In particular TikTok UPLOAD success
is an inbox receipt and never proof that the user completed a public post.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from postiz_errors import remote_failure


def settings_of(post):
    value = post.get("settings") or {}
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


NATIVE_PATTERNS = {"instagram", "tiktok", "youtube", "linkedin"}


def _native_id(value, red):
    patterns = {"instagram": r"[1-9][0-9]{0,29}", "tiktok": r"[1-9][0-9]{14,24}",
                "youtube": r"[A-Za-z0-9_-]{11}", "linkedin": r"urn:li:(?:share|ugcPost):[1-9][0-9]{0,29}"}
    if type(value) not in (str, int) or red not in patterns:
        return None
    value = str(value)
    if value.casefold() in {"missing", "null", "none", "undefined", "placeholder", "unknown", "pending", "true", "false"}:
        return None
    return value if re.fullmatch(patterns[red], value) else None


def _native_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
        path = parsed.path.rstrip("/")
        if host == "instagram.com" and (m := re.fullmatch(r"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]{5,40})", path)):
            return "instagram", m[1], "https://www.instagram.com" + path + "/"
        if host == "tiktok.com" and (m := re.fullmatch(r"/@[A-Za-z0-9_.]{1,40}/(?:video|photo)/([1-9][0-9]{14,24})", path)):
            return "tiktok", m[1], "https://www.tiktok.com" + path
        if host in {"youtube.com", "youtu.be"}:
            vid = (re.fullmatch(r"/shorts/([A-Za-z0-9_-]{11})", path) or re.fullmatch(r"/([A-Za-z0-9_-]{11})", path) if host == "youtu.be" or path.startswith("/shorts") else None)
            if not vid and path == "/watch":
                q = re.search(r"(?:^|&)v=([A-Za-z0-9_-]{11})", parsed.query or "")
                vid = q
            if vid:
                return "youtube", vid[1], "https://www.youtube.com/watch?v=" + vid[1]
        if host == "instagram.com" and re.fullmatch(r"/stories/[A-Za-z0-9_.]{1,30}/[1-9][0-9]{0,29}/?", parsed.path):
            return "instagram", parsed.path.rstrip("/").split("/")[-1], "https://www.instagram.com" + parsed.path.rstrip("/") + "/"
        if host == "linkedin.com":
            match = re.fullmatch(r"/feed/update/(urn:li:(?:share|ugcPost|activity):[1-9][0-9]{0,29})/?", parsed.path)
            if match:
                return "linkedin", match[1], "https://www.linkedin.com/feed/update/" + match[1] + "/"
    except ValueError:
        pass
    return None


def native_evidence(post, red):
    """A provider job/upload ID or arbitrary URL is not a public post identity.

    Valid native identity and URL are alternative evidence. Discard unusable
    fields; conflicting usable identities must be reconciled instead of picked.
    Instagram shortcodes/Story URLs and Graph media IDs are distinct identifiers.
    """
    ids = {ident for key in ("releaseId", "native_id") if (ident := _native_id(post.get(key), red))}
    urls = [found for key in ("releaseURL", "native_url") if (found := _native_url(post.get(key)))]
    if len(ids) > 1 or any(platform != red for platform, _, _ in urls) or len({x[:2] for x in urls}) > 1:
        return None, None
    native_id = next(iter(ids), None)
    found = urls[0] if urls else None
    if native_id and found and (red in {"youtube", "tiktok"} or red == "linkedin" and not found[1].startswith("urn:li:activity:")) and native_id != found[1]:
        return None, None
    return native_id, found[2] if found else None


def channel_state(local, remote, now=None, inbox_default=True):
    now = now or datetime.now(timezone.utc)
    base = dict(local)
    base["observed_at"] = now.isoformat()
    if remote is None:
        # Missing from a bounded list does not prove deletion or failure.
        base["estado"] = "incierto"
        base["reason"] = "El ID exacto no aparece en la lectura de Postiz; no se reenvía."
        return base
    red = local.get("red")
    observed_integration = remote.get("integration_id") or (remote.get("integration") or {}).get("id")
    if local.get("integration_id") and observed_integration and local["integration_id"] != observed_integration:
        base.update(estado="incierto", reason="El ID remoto corresponde a otra integración; no se atribuye a esta cuenta.")
        return base
    state = str(remote.get("state") or "").upper()
    base["provider_state"] = state
    base["integration_id"] = remote.get("integration_id") or (remote.get("integration") or {}).get("id") or local.get("integration_id")
    native_id, native_url = native_evidence(remote, red)
    base.update(native_id=native_id, native_url=native_url)
    method = settings_of(remote).get("content_posting_method") or local.get("posting_method")
    inbox = red == "tiktok" and (method == "UPLOAD" or (method is None and inbox_default))
    if "ERROR" in state or state in {"FAILED", "FAILURE"}:
        base.update(estado="fallido", **remote_failure(remote.get("error") or remote.get("errorMessage") or state))
    elif state == "PUBLISHED":
        if inbox and not native_id and not native_url:
            raw = remote.get("publishDate") or local.get("date_utc")
            sent = datetime.fromisoformat(raw.replace("Z", "+00:00")) if raw else None
            expires = sent + timedelta(hours=24) if sent else None
            base["estado"] = "inbox_vencido" if expires and now >= expires else "enviado_inbox"
            base["inbox_expires_at"] = expires.isoformat() if expires else None
            base["reason"] = "Requiere publicación y confirmación desde TikTok; Postiz confirma sólo la entrega al inbox."
        elif native_id or native_url or red not in NATIVE_PATTERNS:
            # Para las redes sin patrón nativo conocido, el PUBLISHED de Postiz es la evidencia disponible.
            base["estado"] = "publicado"
            # Postiz currently stores publishDate from the requested schedule;
            # its list contract exposes no native publication timestamp. Keep
            # proof of publication separate from proof of its exact time.
            if base.get("published_at") is not None:
                base.setdefault("legacy_published_at", base["published_at"])
            base["published_at"] = None
            base["published_at_basis"] = "native_timestamp_required"
            base["scheduled_at"] = remote.get("publishDate") or local.get("date_utc")
            base.pop("provider_published_at_candidate", None)
            candidate = remote.get("publishedAt")
            if isinstance(candidate, str):
                try:
                    parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
                    if parsed.tzinfo is not None and parsed <= now:
                        # Preserve an unexpected field without silently treating
                        # an undocumented provider field as a native timestamp.
                        base["provider_published_at_candidate"] = candidate
                except ValueError:
                    pass
        else:
            base["estado"] = "pendiente_confirmacion"
            base["reason"] = "Postiz indica éxito pero falta ID nativo o URL pública verificable."
    elif state in {"QUEUE", "SCHEDULED"}:
        base["estado"] = "agendado"
    elif state == "DRAFT":
        base["estado"] = "en_revision"
    elif state in {"PROCESSING", "PENDING", "PUBLISHING"}:
        base["estado"] = "en_curso"
    else:
        base["estado"] = "incierto"
        base["reason"] = "Estado remoto no reconocido; requiere reconciliación."
    return base


def aggregate_state(posts, requested):
    active = [p for p in posts if p.get("estado") != "cancelado"]
    by_red = {p.get("red"): p.get("estado", "incierto") for p in active}
    states = [by_red.get(red, "pendiente") for red in requested]
    if not states:
        return "en_revision"
    if all(s == "publicado" for s in states):
        return "publicado"
    if all(s == "agendado" for s in states):
        return "agendado"
    if all(s == "en_revision" for s in states):
        return "en_revision"
    if all(s == "fallido" for s in states):
        return "fallido"
    if len(set(states)) == 1:
        return states[0]
    return "parcial"


# Qué admite cada red a través de Postiz. Las redes que no figuran se aceptan con un solo archivo y Postiz valida.
VIDEO_NETS = {"instagram", "youtube", "tiktok", "linkedin", "facebook", "x", "threads", "bluesky", "pinterest", "mastodon"}
IMAGE_NETS = {"instagram", "linkedin", "tiktok", "facebook", "x", "threads", "bluesky", "pinterest", "mastodon", "google"}
CAROUSEL_MAX = {"instagram": 10, "linkedin": 20, "tiktok": 35, "facebook": 10, "x": 4, "threads": 10, "bluesky": 4, "mastodon": 4}


def format_capability(red, formato, media_kinds, integration=None, schema=None):
    """Matriz conservadora, respaldada por el schema vigente de cada canal."""
    if integration is None:
        return {"status": "pendiente", "reason": "La cuenta no aparece en Postiz (integrations:list)."}
    if integration.get("disabled"):
        return {"status": "pendiente", "reason": "La cuenta está deshabilitada en Postiz."}
    if not schema:
        return {"status": "pendiente", "reason": "Falta consultar el schema actual del canal."}
    count = len(media_kinds)
    pictures = count > 0 and all(k == "image" for k in media_kinds)
    video = media_kinds == ["video"]
    known = red in VIDEO_NETS | IMAGE_NETS
    supported = False
    if formato == "story":
        supported = red == "instagram" and count == 1
        reason = "Las historias van sólo a Instagram, con un archivo."
    elif formato == "carousel":
        limit = CAROUSEL_MAX.get(red)
        mixed_ok = red in {"instagram", "facebook", "threads"} and all(k in {"image", "video"} for k in media_kinds)
        supported = bool(limit) and 2 <= count <= limit and (pictures or mixed_ok)
        reason = f"{red} no admite este carrusel" + (f" (hasta {limit} imágenes)" if limit else "") + "."
    elif formato == "image":
        supported = media_kinds == ["image"] and (red in IMAGE_NETS or not known)
        reason = "Este canal requiere video (YouTube) o no admite imágenes."
    elif formato in {"reel", "video"}:
        supported = video and (red in VIDEO_NETS or not known)
        reason = "Requiere un único archivo de video."
    else:
        reason = "Formato no implementado por la cola."
    return {"status": "soportado" if supported else "no_aplicable", "reason": "Compatible con el schema actual." if supported else reason}
