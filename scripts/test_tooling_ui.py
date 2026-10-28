"""Isolated desktop/mobile UI smoke tests using mocked API responses.

These tests intentionally never call the production Render API or mutate live stock.
Run after building the frontend with VITE_API_BASE_URL=/api and starting Vite preview.
"""
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_ID = "00000000-0000-0000-0000-000000000010"
ITEM_ID = "00000000-0000-0000-0000-000000000020"


def employee_payload():
    permissions = {
        "can_view_dashboard": True,
        "can_view_parts": True,
        "can_view_history": True,
        "can_view_safety_stock": True,
        "can_view_tooling": True,
        "can_withdraw_tooling": True,
        "can_add_tooling": True,
        "can_edit_tooling": True,
        "can_delete_tooling": True,
    }
    return {
        "id": EMPLOYEE_ID,
        "employee_code": "UI-TEST-001",
        "name": "Tooling UI Tester",
        "role": "TOOLING_TESTER",
        "department": "QA",
        "permissions": permissions,
    }


def tooling_item(quantity=4):
    return {
        "id": ITEM_ID,
        "name": "Test Sealant",
        "detail": "UI test item",
        "maker": "Test Maker",
        "quantity": quantity,
        "min_quantity": 2,
        "unit": "pcs",
        "active": True,
        "low_stock": quantity < 2,
    }


def install_mock_api(page, *, initial_quantity=4):
    state = {
        "quantity": initial_quantity,
        "transactions": [],
        "withdrawal_payloads": [],
    }

    def handle(route):
        request = route.request
        path = request.url.split("?", 1)[0]
        method = request.method

        if path.endswith("/auth/me/"):
            route.fulfill(json={
                "token": "isolated-ui-test-token",
                "employee": employee_payload(),
                "remember_mobile": False,
            })
        elif path.endswith("/tooling/items/") and method == "GET":
            item = tooling_item(state["quantity"])
            route.fulfill(json={"count": 1, "results": [item]})
        elif path.endswith(f"/tooling/items/{ITEM_ID}/withdraw/") and method == "POST":
            payload = request.post_data_json
            state["withdrawal_payloads"].append(payload)
            qty = int(payload["quantity"])
            if qty < 1 or qty > state["quantity"]:
                route.fulfill(status=400, json={"detail": "จำนวนคงเหลือไม่เพียงพอ"})
                return
            state["quantity"] -= qty
            transaction = {
                "id": "00000000-0000-0000-0000-000000000030",
                "item_id": ITEM_ID,
                "item_name": "Test Sealant",
                "quantity": qty,
                "requester_id": payload["requester_id"],
                "requester_name": "Tooling UI Tester",
                "created_by_name": "Tooling UI Tester",
                "reason": payload["reason"],
                "reason_label": "หาย" if payload["reason"] == "LOST" else "ชำรุด",
                "remark": payload.get("remark", ""),
                "created_at": "2026-10-28T08:00:00+07:00",
            }
            state["transactions"].insert(0, transaction)
            route.fulfill(status=201, json={
                "item": tooling_item(state["quantity"]),
                "transaction": transaction,
            })
        elif path.endswith("/tooling/history/"):
            route.fulfill(json={
                "count": len(state["transactions"]),
                "results": state["transactions"],
            })
        elif path.endswith("/options/"):
            route.fulfill(json={"employees": [{
                "id": EMPLOYEE_ID,
                "employee_code": "UI-TEST-001",
                "name": "Tooling UI Tester",
                "department": "QA",
                "role": "TOOLING_TESTER",
            }]})
        elif path.endswith("/tooling/safety-stock/"):
            item = tooling_item(0)
            route.fulfill(json={"count": 1, "results": [item]})
        elif path.endswith("/safety-stock/"):
            route.fulfill(json={"count": 0, "results": []})
        else:
            route.fulfill(status=404, json={"detail": f"Unmocked API route: {path}"})

    page.add_init_script(
        "sessionStorage.setItem('partsflow_auth_token', 'isolated-ui-test-token')"
    )
    page.route("**/api/**", handle)
    return state


def test_desktop_tooling_withdrawal_and_qr(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    state = install_mock_api(page)
    page.goto(f"{BASE_URL}/tooling", wait_until="networkidle")

    page.get_by_role("heading", name="Tooling").wait_for()
    page.get_by_text("Test Sealant").wait_for()
    page.get_by_role("button", name="QR", exact=True).click()
    page.get_by_role("dialog").get_by_role(
        "heading", name="QR เบิก Test Sealant"
    ).wait_for()
    page.get_by_role("dialog").locator('img[alt="QR Code Test Sealant"]').wait_for()
    page.get_by_role("dialog").get_by_role("button", name="ปิด").click()

    page.get_by_role("button", name="เบิก", exact=True).click()
    page.get_by_label("จำนวนที่เบิก *").fill("1")
    page.get_by_label("ผู้เบิก *").select_option(EMPLOYEE_ID)
    page.get_by_label("เหตุผล *").select_option("DAMAGED")
    page.get_by_label("Remark").fill("Desktop UI smoke test")
    page.get_by_role("button", name="ยืนยันเบิก").click()

    page.get_by_text("บันทึกการเบิกแล้ว").wait_for()
    page.locator("tbody tr").first.locator("td").nth(3).get_by_text("3").wait_for()
    assert len(state["withdrawal_payloads"]) == 1
    assert state["withdrawal_payloads"][0] == {
        "quantity": "1",
        "requester_id": EMPLOYEE_ID,
        "reason": "DAMAGED",
        "remark": "Desktop UI smoke test",
    }
    page.close()


def test_mobile_safety_stock_shows_tooling_without_false_empty_state(browser):
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    install_mock_api(page, initial_quantity=0)
    page.goto(f"{BASE_URL}/safety-stock", wait_until="networkidle")

    page.get_by_text("Tooling ต่ำกว่า Min").wait_for()
    page.get_by_text("Test Sealant").wait_for()
    assert page.get_by_text("Tooling ต่ำกว่า Min").is_visible()
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            test_desktop_tooling_withdrawal_and_qr(browser)
            test_mobile_safety_stock_shows_tooling_without_false_empty_state(browser)
        finally:
            browser.close()
    print("PASS: desktop Tooling QR/withdrawal and mobile Tooling Safety Stock UI tests")


if __name__ == "__main__":
    main()
