"""Desktop and mobile browser smoke tests for the Order RFQ Gmail compose flow."""
from urllib.parse import parse_qs, urlparse
import re
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-TEST-001"
ORDER_PART_NAMES = ["RFQ E2E Bearing", "RFQ E2E Seal"]
ORDER_NUMBER_PATTERN = re.compile(r"\bR-\d{6}-\d{6}(?:-\d{2})?\b")


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    page.wait_for_function(
        "() => !!sessionStorage.getItem('partsflow_auth_token') || "
        "!!localStorage.getItem('partsflow_auth_token')",
        timeout=10000,
    )


def assert_gmail_compose(page):
    # Simulate the rich clipboard API and verify that PartsFlow writes HTML table data.
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

    page.get_by_role("button", name="สร้างอีเมลและเปิด Gmail").click()
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
    popup.close()


def test_desktop_order_rfq_gmail_compose(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.on("response", lambda response: print(
        f"RFQ E2E orders API {response.status}: {response.url} :: "
        f"{response.text()[:1200]}"
    ) if "/api/orders/?" in response.url else None)
    page.goto(f"{BASE_URL}/orders", wait_until="networkidle")

    for part_name in ORDER_PART_NAMES:
        row = page.locator("tbody tr").filter(has_text=part_name)
        try:
            row.wait_for(timeout=10000)
        except Exception:
            print("Desktop Order page text:", page.locator("body").inner_text()[:5000])
            raise
        row.locator("input[type=checkbox]").first.check()

    page.get_by_role("button", name="ขอราคา (RFQ)").click()
    dialog = page.locator(".modal-card").filter(has_text="สร้างอีเมลขอราคา RFQ · 2 Order")
    vendor_input = dialog.get_by_placeholder("ค้นหาชื่อ Vendor")
    vendor_input.fill("RFQ E2E Vendor")
    dialog.get_by_role("option", name="RFQ E2E Vendor").click()
    assert_gmail_compose(page)
    page.close()


def test_mobile_order_rfq_gmail_compose(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/orders", wait_until="networkidle")

    for part_name in ORDER_PART_NAMES:
        card = page.locator(".m-order-card").filter(has_text=part_name)
        card.wait_for()
        card.locator('input[type="checkbox"]').check()

    page.get_by_role("button", name="ขอราคา (RFQ)").click()
    dialog = page.locator(".modal-card").filter(has_text="สร้างอีเมลขอราคา RFQ · 2 Order")
    vendor_input = dialog.get_by_placeholder("ค้นหาชื่อ Vendor")
    vendor_input.fill("RFQ E2E Vendor")
    dialog.get_by_role("option", name="RFQ E2E Vendor").click()
    assert_gmail_compose(page)
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
