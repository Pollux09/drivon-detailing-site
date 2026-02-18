#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parent
ENV_PATH = ROOT_DIR / ".env"
PHONE_RE = re.compile(r"^[0-9+()\-\s]{6,25}$")
MAX_BODY_BYTES = 20_000
SERVICES_CACHE_TTL_SECONDS = 60

_services_cache_lock = Lock()
_services_cache_until = 0.0
_services_cache_data: list[dict[str, Any]] | None = None


def load_dotenv(path: Path) -> None:
  if not path.exists():
    return
  for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip().strip("'").strip('"')
    if key and key not in os.environ:
      os.environ[key] = value


def parse_admin_ids() -> list[str]:
  raw = os.getenv("ADMIN_IDS", "")
  result: list[str] = []
  for part in raw.split(","):
    value = part.strip()
    if value:
      result.append(value)
  return result


def clean_text(value: Any, max_len: int) -> str:
  if not isinstance(value, str):
    return ""
  compact = " ".join(value.strip().split())
  return compact[:max_len]


def clean_comment(value: Any, max_len: int) -> str:
  if not isinstance(value, str):
    return ""
  normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
  lines = [line.strip() for line in normalized.split("\n")]
  return "\n".join(line for line in lines if line)[:max_len]


def validate_payload(payload: dict[str, Any]) -> tuple[dict[str, str] | None, str | None]:
  name = clean_text(payload.get("name"), 80)
  phone = clean_text(payload.get("phone"), 40)
  car = clean_text(payload.get("car"), 120)
  service = clean_text(payload.get("service"), 120)
  comment = clean_comment(payload.get("comment"), 600)

  if not name:
    return None, "name_required"
  if not phone:
    return None, "phone_required"
  if not PHONE_RE.fullmatch(phone):
    return None, "phone_invalid"
  if not car:
    return None, "car_required"
  if not service:
    return None, "service_required"

  return {
    "name": name,
    "phone": phone,
    "car": car,
    "service": service,
    "comment": comment,
  }, None


def build_admin_message(data: dict[str, str], client_ip: str) -> str:
  ts = datetime.now().strftime("%d.%m.%Y %H:%M")
  comment = data["comment"] or "—"
  return (
    "🆕 Новая заявка с сайта DRIVON\n"
    f"Имя: {data['name']}\n"
    f"Телефон: {data['phone']}\n"
    f"Автомобиль: {data['car']}\n"
    f"Услуга: {data['service']}\n"
    f"Комментарий: {comment}\n"
    f"IP: {client_ip}\n"
    f"Время: {ts}"
  )


def send_telegram_message(
  bot_token: str,
  chat_id: str,
  text: str,
  thread_id: str | None,
) -> tuple[bool, str | None]:
  url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
  payload: dict[str, Any] = {
    "chat_id": chat_id,
    "text": text,
    "disable_web_page_preview": True,
  }
  if thread_id:
    payload["message_thread_id"] = int(thread_id)

  req = Request(
    url,
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json; charset=utf-8"},
    method="POST",
  )
  try:
    with urlopen(req, timeout=12) as resp:
      raw = resp.read().decode("utf-8")
    body = json.loads(raw)
    if body.get("ok"):
      return True, None
    return False, str(body.get("description") or "telegram_unknown_error")
  except HTTPError as err:
    return False, f"http_{err.code}"
  except URLError:
    return False, "telegram_unreachable"
  except Exception:
    return False, "telegram_request_failed"


def normalize_database_url(value: str) -> str:
  database_url = value.strip()
  if database_url.startswith("postgres://"):
    return "postgresql://" + database_url.removeprefix("postgres://")
  if database_url.startswith("postgresql+asyncpg://"):
    return "postgresql://" + database_url.removeprefix("postgresql+asyncpg://")
  return database_url


async def fetch_active_services(database_url: str) -> list[dict[str, Any]]:
  import asyncpg

  conn = await asyncpg.connect(dsn=database_url, timeout=10)
  try:
    rows = await conn.fetch(
      """
      SELECT id, name, description, duration_minutes, base_price
      FROM services
      WHERE is_active = TRUE
      ORDER BY name ASC
      """
    )
    services: list[dict[str, Any]] = []
    for row in rows:
      services.append(
        {
          "id": int(row["id"]),
          "name": str(row["name"]),
          "description": str(row["description"] or ""),
          "duration_minutes": int(row["duration_minutes"]),
          "base_price": str(row["base_price"]),
        }
      )
    return services
  finally:
    await conn.close()


def load_active_services() -> tuple[list[dict[str, Any]] | None, str | None]:
  global _services_cache_until, _services_cache_data

  database_url = normalize_database_url(os.getenv("DATABASE_URL", ""))
  if not database_url:
    return None, "database_not_configured"

  now = time.monotonic()
  with _services_cache_lock:
    if _services_cache_data is not None and now < _services_cache_until:
      return list(_services_cache_data), None

  try:
    services = asyncio.run(fetch_active_services(database_url))
  except ModuleNotFoundError:
    return None, "asyncpg_not_installed"
  except Exception:
    return None, "services_query_failed"

  with _services_cache_lock:
    _services_cache_data = services
    _services_cache_until = now + SERVICES_CACHE_TTL_SECONDS
  return list(services), None


class AppHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args: Any, **kwargs: Any) -> None:
    super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

  def end_headers(self) -> None:
    self.send_header("Cache-Control", "no-store")
    super().end_headers()

  def respond_json(self, status: int, data: dict[str, Any]) -> None:
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(raw)))
    self.end_headers()
    self.wfile.write(raw)

  def do_OPTIONS(self) -> None:
    path = urlparse(self.path).path
    if path == "/api/request":
      self.send_response(HTTPStatus.NO_CONTENT)
      self.send_header("Allow", "POST, OPTIONS")
      self.end_headers()
      return
    if path == "/api/services":
      self.send_response(HTTPStatus.NO_CONTENT)
      self.send_header("Allow", "GET, OPTIONS")
      self.end_headers()
      return
    self.send_error(HTTPStatus.NOT_FOUND)
    return

  def do_GET(self) -> None:
    path = urlparse(self.path).path
    if path != "/api/services":
      super().do_GET()
      return

    services, error = load_active_services()
    if error or services is None:
      if error in {"database_not_configured", "asyncpg_not_installed"}:
        status = HTTPStatus.INTERNAL_SERVER_ERROR
      else:
        status = HTTPStatus.BAD_GATEWAY
      self.respond_json(status, {"ok": False, "error": error or "services_unavailable"})
      return

    self.respond_json(HTTPStatus.OK, {"ok": True, "services": services, "count": len(services)})

  def do_POST(self) -> None:
    path = urlparse(self.path).path
    if path != "/api/request":
      self.send_error(HTTPStatus.NOT_FOUND)
      return

    bot_token = os.getenv("BOT_TOKEN", "").strip()
    admin_ids = parse_admin_ids()
    thread_id = os.getenv("TELEGRAM_THREAD_ID", "").strip() or None
    if not bot_token or not admin_ids:
      self.respond_json(
        HTTPStatus.INTERNAL_SERVER_ERROR,
        {"ok": False, "error": "server_not_configured"},
      )
      return

    try:
      length = int(self.headers.get("Content-Length", "0"))
    except ValueError:
      length = 0

    if length <= 0 or length > MAX_BODY_BYTES:
      self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid_body_size"})
      return

    raw = self.rfile.read(length)
    try:
      payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
      self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid_json"})
      return

    if not isinstance(payload, dict):
      self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "invalid_payload"})
      return

    valid, error = validate_payload(payload)
    if error or valid is None:
      self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": error or "invalid_payload"})
      return

    client_ip = self.client_address[0] if self.client_address else "-"
    text = build_admin_message(valid, client_ip)

    delivered = 0
    errors: list[str] = []
    for admin_id in admin_ids:
      success, send_error = send_telegram_message(bot_token, admin_id, text, thread_id)
      if success:
        delivered += 1
      elif send_error:
        errors.append(f"{admin_id}:{send_error}")

    if delivered == 0:
      self.respond_json(
        HTTPStatus.BAD_GATEWAY,
        {"ok": False, "error": "telegram_send_failed", "details": errors},
      )
      return

    self.respond_json(HTTPStatus.OK, {"ok": True, "delivered": delivered})


def main() -> None:
  load_dotenv(ENV_PATH)

  host = os.getenv("HOST", "127.0.0.1")
  port = int(os.getenv("PORT", "8000"))

  server = ThreadingHTTPServer((host, port), AppHandler)
  print(f"DRIVON server started: http://{host}:{port}")
  print("Endpoints: POST /api/request, GET /api/services")
  print("Required env for /api/request: BOT_TOKEN, ADMIN_IDS")
  print("Required env for /api/services: DATABASE_URL")
  server.serve_forever()


if __name__ == "__main__":
  main()
