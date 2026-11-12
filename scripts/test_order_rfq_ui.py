"""Desktop and mobile browser smoke tests for creating Gmail RFQ drafts."""
import re
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-TEST-001"
ORDER_PART_NAMES = ["RFQ E2E Bearing", "RFQ E2E Seal"]


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    page.wait_for_function(
        "() => !!sessionStorage.getItem('partsflow_auth_token') || "
        "!!localStorage.getItem('partsflow_auth_token')",
        timeout=10000,
    )


def mock_gmail_draft_api(page):
    captured = {}

    def handler(route):
        captured["payload"] = route.request.post_data_json
        route.fulfill(
            status=200,
            content_type="application/json",
            body=(
                '{"sender_email":"parts@example.com","drafts":[{'
                '"group_key":"MC-RFQ-E2E|R|","subject":"RFQ E2E Vendor - MC-RFQ-E2E",'
                '"to":"rfq-primary@example.com","cc":["rfq-cc@example.com"],'
                '"order_numbers":["PO-E2E-001"],"draft_id":"draft-e2e-123",'
                '"draft_url":"https://mail.google.com/mail/u/0/#drafts/draft-e2e-123",'
                '"sender_email":"parts@example.com"}]}'
            ),
        )

    page.route("**/api/orders/rfq-drafts/", handler)
    return captured


def assert_gmail_draft(page, captured):
    page.get_by_role("button", name="สร้าง Gmail Draft").click()
    page.get_by_text("สร้าง Gmail Draft แล้ว", exact=False).wait_for(timeout=10000)
    payload = captured.get("payload") or {}
    assert len(payload.get("order_ids") or []) == 2, payload
    assert payload.get("vendor_id"), payload

    page.get_by_text("rfq-primary@example.com").wait_for()
    page.get_by_text("PO-E2E-001").wait_for()
    with page.expect_popup() as popup_info:
        page.get_by_role("button", name="เปิด Gmail Draft").click()
    popup = popup_info.value
    popup.wait_for_url(re.compile(r"https://mail\.google\.com/mail/u/0/#drafts/draft-e2e-123"), timeout=10000)
    assert "draft-e2e-123" in popup.url
    popup.close()


def select_orders_and_vendor(page, mobile=False):
    page.goto(f"{BASE_URL}/orders", wait_until="networkidle")
    for part_name in ORDER_PART_NAMES:
        if mobile:
            card = page.locator(".m-order-card").filter(has_text=part_name)
            card.wait_for()
            card.locator('input[type="checkbox"]').check()
        else:
            row = page.locator("tbody tr").filter(has_text=part_name)
            row.wait_for(timeout=10000)
            row.locator("input[type=checkbox]").first.check()

    page.get_by_role("button", name="ขอราคา (RFQ)").click()
    dialog = page.locator(".modal-card").filter(has_text="สร้างอีเมลขอราคา RFQ · 2 Order")
    vendor_input = dialog.get_by_placeholder("ค้นหาชื่อ Vendor")
    vendor_input.fill("RFQ E2E Vendor")
    dialog.get_by_role("option", name="RFQ E2E Vendor").click()


def test_desktop_order_rfq_gmail_draft(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    captured = mock_gmail_draft_api(page)
    select_orders_and_vendor(page)
    assert_gmail_draft(page, captured)
    page.close()


def test_mobile_order_rfq_gmail_draft(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    captured = mock_gmail_draft_api(page)
    select_orders_and_vendor(page, mobile=True)
    assert_gmail_draft(page, captured)
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            test_desktop_order_rfq_gmail_draft(browser)
            test_mobile_order_rfq_gmail_draft(browser)
        finally:
            browser.close()
    print("PASS: Order RFQ Gmail draft desktop and mobile browser E2E")


if __name__ == "__main__":
    main()
