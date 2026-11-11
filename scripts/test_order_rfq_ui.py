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


def assert_gmail_compose(page, expected_order_numbers):
    with page.expect_popup() as popup_info:
        page.get_by_role("button", name="สร้างอีเมลและเปิด Gmail").click()
    popup = popup_info.value
    popup.wait_for_url("https://mail.google.com/**", timeout=15000)
    parsed = urlparse(popup.url)
    params = parse_qs(parsed.query)
    assert params.get("view") == ["cm"]
    assert params.get("to") == ["rfq-primary@example.com"]
    assert params.get("cc") == ["rfq-cc@example.com"]
    assert "RFQ E2E Vendor" in params.get("su", [""])[0]
    assert "MC-RFQ-E2E" in params.get("su", [""])[0]
    body = params.get("body", [""])[0]
    assert "Please quote the following items." in body
    assert "Order No. | Part ID | Description | Maker | Qty | Unit" in body
    for order_number in expected_order_numbers:
        assert order_number in body
    popup.close()


def test_desktop_order_rfq_gmail_compose(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.on("response", lambda response: print(
        f"RFQ E2E orders API {response.status}: {response.url} :: "
        f"{response.text()[:1200]}"
    ) if "/api/orders/?" in response.url else None)
    page.goto(f"{BASE_URL}/orders", wait_until="networkidle")

    expected_order_numbers = []
    for part_name in ORDER_PART_NAMES:
        row = page.locator("tbody tr").filter(has_text=part_name)
        try:
            row.wait_for(timeout=10000)
        except Exception:
            print("Desktop Order page text:", page.locator("body").inner_text()[:5000])
            raise
        row_text = row.inner_text()
        match = ORDER_NUMBER_PATTERN.search(row_text)
        assert match, f"Could not read generated Order Number from row: {row_text}"
        expected_order_numbers.append(match.group(0))
        row.locator("input[type=checkbox]").first.check()

    page.get_by_role("button", name="ขอราคา (RFQ)").click()
    dialog = page.get_by_role("dialog", name="สร้างอีเมลขอราคา RFQ · 2 Order")
    vendor_input = dialog.get_by_placeholder("ค้นหาชื่อ Vendor")
    vendor_input.fill("RFQ E2E Vendor")
    dialog.get_by_role("option", name="RFQ E2E Vendor").click()
    assert_gmail_compose(page, expected_order_numbers)
    page.close()


def test_mobile_order_rfq_gmail_compose(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/orders", wait_until="networkidle")

    expected_order_numbers = []
    for part_name in ORDER_PART_NAMES:
        card = page.locator(".m-order-card").filter(has_text=part_name)
        card.wait_for()
        card_text = card.inner_text()
        match = ORDER_NUMBER_PATTERN.search(card_text)
        assert match, f"Could not read generated Order Number from card: {card_text}"
        expected_order_numbers.append(match.group(0))
        card.locator('input[type="checkbox"]').check()

    page.get_by_role("button", name="ขอราคา (RFQ)").click()
    dialog = page.get_by_role("dialog", name="สร้างอีเมลขอราคา RFQ · 2 Order")
    vendor_input = dialog.get_by_placeholder("ค้นหาชื่อ Vendor")
    vendor_input.fill("RFQ E2E Vendor")
    dialog.get_by_role("option", name="RFQ E2E Vendor").click()
    assert_gmail_compose(page, expected_order_numbers)
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
