"""Thin client for the separate qr-withdraw Supabase project.

This does NOT touch the standalone qr-withdraw.vercel.app site, its own
database connection, or any already-printed QR code - those keep working
completely unchanged. This module only calls the admin_* RPC functions that
already exist in that project (gated by a shared admin key checked inside
Postgres), so PartsFlow's own permission system becomes a second, additional
way to reach the same item catalog and withdrawal history.
"""

from __future__ import annotations

import os

import requests


class QrWithdrawConfigError(RuntimeError):
    pass


class QrWithdrawRequestError(RuntimeError):
    pass


def _env(name: str) -> str:
    return str(os.getenv(name, "") or "").strip()


def _config():
    url = _env("QR_WITHDRAW_SUPABASE_URL")
    anon_key = _env("QR_WITHDRAW_ANON_KEY")
    admin_key = _env("QR_WITHDRAW_ADMIN_KEY")
    if not url or not anon_key or not admin_key:
        raise QrWithdrawConfigError(
            "ยังไม่ได้ตั้งค่า QR_WITHDRAW_SUPABASE_URL / QR_WITHDRAW_ANON_KEY / "
            "QR_WITHDRAW_ADMIN_KEY บน Backend"
        )
    return url, anon_key, admin_key


def _rpc(fn_name: str, params: dict):
    url, anon_key, admin_key = _config()
    try:
        resp = requests.post(
            f"{url}/rest/v1/rpc/{fn_name}",
            json={"p_key": admin_key, **params},
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {anon_key}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        raise QrWithdrawRequestError(f"เชื่อมต่อระบบเบิกของ QR ไม่สำเร็จ: {exc}") from None

    if resp.status_code == 401 or (resp.status_code == 400 and "unauthorized" in resp.text.lower()):
        raise QrWithdrawRequestError("Admin Key ของระบบเบิกของ QR ไม่ถูกต้อง")
    if not resp.ok:
        detail = ""
        try:
            detail = resp.json().get("message") or resp.json().get("hint") or ""
        except ValueError:
            detail = resp.text[:200]
        raise QrWithdrawRequestError(detail or f"ระบบเบิกของ QR ตอบกลับผิดพลาด ({resp.status_code})")
    return resp.json()


def list_items():
    return _rpc("admin_items", {})


def upsert_item(code: str, name: str, spec: str):
    return _rpc("admin_upsert_item", {"p_code": code, "p_name": name, "p_spec": spec})


def delete_item(code: str):
    return _rpc("admin_delete_item", {"p_code": code})


def list_withdrawals(limit: int = 2000):
    return _rpc("admin_logs", {"p_limit": limit})
