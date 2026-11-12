"""Desktop and mobile browser smoke tests for the Order RFQ Gmail compose flow."""
import re
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-TEST-001"
ORDER_PART_NAMES = ["RFQ E2E Bearing", "RFQ E2E Seal"]
ORDER_NUMBER_PATTERN = re.compile(r"\\bR-\\d{6}-\\d{6}(?:-\\d{2})?\\b")


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    page.wait_for_function(
        "() => !!sessionStorage.getItem('partsflow_auth_token') || "
        "!!localStorage.getItem('partsflow_auth_token')",
        timeout=10000,
    )


def mock_rfq_compose_api(page):
    captured = {}

    def handler(route):
        captured["payload"] = route.request.post_data_json
        route.fulfill(
            status=200,
            content_type="application/json",
            body=(
                '{"vendor":"RFQ E2E Vendor","groups":[{'
                '"group_key":"MC-RFQ-E2E|R|","subject":"RFQ E2E Vendor - MC-RFQ-E2E",'
                '"to":"rfq-primary@example.com","cc":["rfq-cc@example.com"],'
                '"order_numbers":["PO-E2E-001"],"message":"Please quote the following items.",'
                '"table_html":"<table border=\\"1\\" cellpadding=\\"0\\" cellspacing=\\"0\\"><tbody><tr><td style=\\"border:1px solid #333333;padding:6px 8px\\">SKU-1</td><td style=\\"border:1px solid #333333;padding:6px 8px\\">RFQ E2E Bearing</td></tr></tbody></table>",'
                '"table_text":"SKU-1 | RFQ E2E Bearing"}]}'
            ),
        )

    page.route("**/api/orders/rfq-compose/", handler)
    return captured


def assert_gmail_compose(page, captured):
    page.evaluate("""() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                write: async (items) => {
                    const html = await items[0].getType("text/html");
                    window.__rfqClipboardHtml = await html.text();
                    const plain = await items[0].getType("text/plain");
                    window.__rfqClipboardText = await plain.text();
                },
            },
        });
    }""")

    page.get_by_role("button", name="เตรียมอีเมล RFQ").click()
    copy_button = page.get_by_role("button", name="คัดลอกตารางและเปิด Gmail")
    copy_button.wait_for(timeout=10000)

    with page.expect_popup() as popup_info:
        copy_button.click()
    popup = popup_info.value
    popup.wait_for_url(re.compile(r"https://(mail\\.google\\.com|accounts\\.google\\.com)/.*"), timeout=15000)
    parsed = urlparse(popup.url)
    if parsed.hostname == "accounts.google.com":
        continuation = parse_qs(parsed.query).get("continue", [None])[0]
        assert continuation, f"Google sign-in URL has no Gmail continuation: {popup.url}"
        parsed = urlparse(continuation)
        assert parsed.hostname == "mail.google.com", f"Unexpected Google continuation: {continuation}"
    else:
        assert parsed.hostname == "mail.google.com"
    params = parse_qs(parsed.query)
    assert params.get("view") == ["cm"]
    assert params.get("to") == ["rfq-primary@example.com"]
    assert params.get("cc") == ["rfq-cc@example.com"]
    assert "RFQ E2E Vendor" in params.get("su", [""])[0]
    assert "MC-RFQ-E2E" in params.get("su", [""])[0]
    body = params.get("body", [""])[0]
    assert "Please quote the following items." in body
    assert "┌" not in body and "Order No." not in body
    assert not ORDER_NUMBER_PATTERN.search(body), "Order number unexpectedly appears in RFQ email body"

    html = page.evaluate("window.__rfqClipboardHtml")
    assert "<table" in html and "<td" in html
    assert "border:1px solid" in html
    assert "RFQ E2E Bearing" in html
    assert "<th" not in html
    assert "Order No." not in html
    assert "RFQ E2E Bearing" in page.evaluate("window.__rfqClipboardText")
    payload = captured.get("payload") or {}
    assert len(payload.get("order_ids") or []) == 2, payload
    assert payload.get("vendor_id"), payload
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


def test_desktop_order_rfq_gmail_compose(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    captured = mock_rfq_compose_api(page)
    select_orders_and_vendor(page)
    assert_gmail_compose(page, captured)
    page.close()


def test_mobile_order_rfq_gmail_compose(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    captured = mock_rfq_compose_api(page)
    select_orders_and_vendor(page, mobile=True)
    assert_gmail_compose(page, captured)
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            test_desktop_order_rfq_gmail_compose(browser)
            test_mobile_order_rfq_gmail_compose(browser)
        finally:
            browser.close()
    print("PASS: Order RFQ Gmail compose desktop and mobile browser E2E")


if __name__ == "__main__":
    main()
