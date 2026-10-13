"""Diagnósticos seguros de Postiz: el texto del proveedor se inspecciona en memoria y nunca se devuelve."""
import datetime as dt
from email.utils import parsedate_to_datetime
import json
import re

MESSAGES = {
    'POSTIZ_AUTH_REQUIRED': 'Postiz no está autenticado: corré «postiz auth:login» o cargá POSTIZ_API_KEY en .env.',
    'POSTIZ_PERMISSION_DENIED': 'Revisar los permisos de Postiz para esta operación.',
    'POSTIZ_CREDITS_EXHAUSTED': 'Revisar los créditos o límites del plan de Postiz.',
    'POSTIZ_RATE_LIMITED': 'Postiz alcanzó su límite de solicitudes. Esperar antes de otra consulta.',
    'POSTIZ_PROVIDER_UNAVAILABLE': 'Postiz informó una falla del servicio. Conservar el intento y revisar su estado.',
    'POSTIZ_REQUEST_REJECTED': 'Postiz rechazó la solicitud. Revisar los parámetros del intento conservado.',
    'POSTIZ_RESPONSE_UNCERTAIN': 'No hay respuesta verificable de Postiz. Consultar el intento existente antes de reenviar.',
    'POSTIZ_SCHEMA_INVALID': 'Postiz respondió sin JSON verificable. Conservar el intento para revisión.',
    'POSTIZ_NOT_AVAILABLE': 'No encuentro el CLI de Postiz: npm install -g postiz.',
}


class PostizError(RuntimeError):
    def __init__(self, code, *, http_status=None, retry_after_seconds=None, retry_at=None):
        self.code = code if isinstance(code, str) and code in MESSAGES else 'POSTIZ_RESPONSE_UNCERTAIN'
        self.http_status = http_status if type(http_status) is int and 100 <= http_status <= 599 else None
        self.retry_after_seconds = retry_after_seconds if type(retry_after_seconds) is int and retry_after_seconds >= 0 else None
        self.retry_at = None
        try:
            target = dt.datetime.fromisoformat(retry_at) if isinstance(retry_at, str) else None
            if target is not None and target.tzinfo:
                self.retry_at = target.astimezone(dt.timezone.utc).isoformat()
        except (ValueError, OverflowError):pass
        message = MESSAGES[self.code]
        if self.retry_at:message += ' Próxima consulta no antes de ' + self.retry_at + '.'
        super().__init__(self.code + ': ' + message)

    def diagnostic(self):
        result = {'code':self.code, 'message':str(self)}
        if self.http_status is not None:result['http_status'] = self.http_status
        if self.retry_after_seconds is not None:result['retry_after_seconds'] = self.retry_after_seconds
        if self.retry_at is not None:result['retry_at'] = self.retry_at
        return result


def _text(value):
    if isinstance(value, str):return value[:100_000]
    if isinstance(value, (dict,list)):
        try:return json.dumps(value, ensure_ascii=False)[:100_000]
        except (TypeError,ValueError):pass
    return ''


def _retry_after(text, now):
    match = re.search(r'(?im)^\s*retry-after\s*:\s*([^\r\n]+)', text)
    if not match:match = re.search(r'(?i)"retry-after"\s*:\s*(?:"([^"\r\n]+)"|([0-9]+))', text)
    if not match:return None,None
    value = next((part for part in match.groups() if part is not None), '').strip()
    try:
        if re.fullmatch(r'[0-9]{1,8}', value):
            seconds = int(value)
            target = now + dt.timedelta(seconds=seconds)
        else:
            target = parsedate_to_datetime(value)
            if not target.tzinfo:return None,None
            target = target.astimezone(dt.timezone.utc)
            seconds = max(0, int((target-now).total_seconds()+0.999999))
        return seconds,target.isoformat()
    except (TypeError,ValueError,OverflowError):return None,None


def error_for_output(value, *, now=None, default_code='POSTIZ_RESPONSE_UNCERTAIN'):
    text = _text(value)
    match = re.search(r'(?i)\bHTTP(?:/\d(?:\.\d)?)?\s*[:=]?\s*([1-5][0-9]{2})\b', text)
    # Installed CLI wraps response.status as "API Error (429)" (uploads use
    # "Upload failed (429)"). Neither form forwards response headers.
    if not match:match = re.search(r'(?i)\b(?:API Error|Upload failed)\s*\(([1-5][0-9]{2})\)', text)
    if not match:match = re.search(r'(?i)["\']?(?:statusCode|status_code|status|code)["\']?\s*[:=]\s*["\']?([1-5][0-9]{2})\b', text)
    status = int(match[1]) if match else None
    lower = text.casefold()
    if status==401:code='POSTIZ_AUTH_REQUIRED'
    elif status==403:code='POSTIZ_PERMISSION_DENIED'
    elif status==402:code='POSTIZ_CREDITS_EXHAUSTED'
    elif status==429:code='POSTIZ_RATE_LIMITED'
    elif status and status>=500:code='POSTIZ_PROVIDER_UNAVAILABLE'
    elif any(term in lower for term in ('insufficient credits','credits exhausted','credit balance exhausted')):code='POSTIZ_CREDITS_EXHAUSTED'
    elif any(term in lower for term in ('too many requests','rate limit')):code='POSTIZ_RATE_LIMITED'
    elif any(term in lower for term in ('unauthorized','not authenticated','token expired','expired token','oauth failed','invalid token')):code='POSTIZ_AUTH_REQUIRED'
    elif any(term in lower for term in ('forbidden','permission denied')):code='POSTIZ_PERMISSION_DENIED'
    elif status and 400<=status<500:code='POSTIZ_REQUEST_REJECTED'
    else:code=default_code
    seconds,at = _retry_after(text, now or dt.datetime.now(dt.timezone.utc)) if code=='POSTIZ_RATE_LIMITED' else (None,None)
    return PostizError(code, http_status=status, retry_after_seconds=seconds, retry_at=at)


def remote_failure(value):
    """Safe fields for a provider-confirmed failed post, retaining its local ID."""
    error = error_for_output(value, default_code='POSTIZ_REQUEST_REJECTED')
    return {'error':str(error), 'error_code':error.code, 'error_diagnostic':error.diagnostic()}
