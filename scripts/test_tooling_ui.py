"""Browser end-to-end tests against a disposable local SQLite backend.

The test server and database are isolated from Render/production. The backend is
seeded by scripts/seed_tooling_e2e.py before this script is run.
"""
import re
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-TEST-001"
ITEM_NAME = "E2E Test Sealant"


def login(page):
    def log_login_response(response):
        if "/auth/login/" in response.url:
            print(f"Login API status: {response.status}")
            if response.status >= 400:
                print("Login API error body:", response.text())

    page.on("response", log_login_response)
    page.on("requestfailed", lambda request: print(
        f"Browser request failed: {request.url} :: {request.failure}"
    ) if "/api/" in request.url else None)
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    try:
        page.wait_for_function(
            "() => !!sessionStorage.getItem('partsflow_auth_token') || "
            "!!localStorage.getItem('partsflow_auth_token')",
            timeout=10000,
        )
    except Exception as exc:
        message = ""
        error = page.locator(".alert.error")
        if error.count():
            message = error.first.inner_text()
        raise AssertionError(f"Login failed; visible error={message!r}") from exc


def test_desktop_tooling_qr_withdrawal_and_history(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.goto(f"{BASE_URL}/tooling", wait_until="networkidle")

    page.get_by_role("heading", name="Tooling").wait_for()
    page.get_by_text(ITEM_NAME).wait_for()
    tooling_row = page.locator("tbody tr").filter(has_text=ITEM_NAME)
    tooling_row.get_by_text("Model-E2E-01").wait_for()
    tooling_row.get_by_text("MM-4-46-1").wait_for()
    tooling_row.locator("td").nth(7).get_by_text("4", exact=True).wait_for()

    page.get_by_role("button", name="QR", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("heading", name=f"QR เบิก {ITEM_NAME}").wait_for()
    dialog.locator(f'img[alt="QR Code {ITEM_NAME}"]').wait_for()
    dialog.get_by_role("button", name="ปิด").click()

    page.get_by_role("button", name="เบิก", exact=True).click()
    page.get_by_label("จำนวนที่เบิก *").fill("1")
    page.get_by_label("ผู้เบิก *").select_option(label="Tooling UI Tester")
    vehicle_select = page.get_by_label("เบอร์รถเครื่องมือ *")
    assert vehicle_select.locator("option").count() == 14
    vehicle_select.select_option("7")
    page.get_by_label("เหตุผล *").select_option("DAMAGED")
    page.get_by_label("Remark").fill("Desktop E2E smoke test")
    page.get_by_role("button", name="ยืนยันเบิก").click()

    page.get_by_text("บันทึกการเบิกแล้ว").wait_for()
    page.locator("tbody tr").first.locator("td").nth(5).get_by_text("3").wait_for()

    page.get_by_role("button", name=re.compile("ประวัติการเบิก")).click()
    history_row = page.locator("tbody tr").filter(has_text=ITEM_NAME)
    history_row.get_by_text("Tooling UI Tester").first.wait_for()
    history_row.get_by_text("7", exact=True).wait_for()
    history_row.get_by_text("ชำรุด").wait_for()
    history_row.get_by_text("Desktop E2E smoke test").wait_for()
    page.close()


def test_mobile_safety_stock_shows_tooling_when_parts_are_empty(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/safety-stock", wait_until="networkidle")

    page.get_by_text("Tooling ต่ำกว่า Min").wait_for()
    page.get_by_text(ITEM_NAME).wait_for()
    page.get_by_text("Location: MM-4-46-1").wait_for()
    order_input = page.get_by_label(f"จำนวนที่ต้อง Order {ITEM_NAME}")
    assert order_input.input_value() == "4"
    assert page.get_by_text("Tooling ต่ำกว่า Min").is_visible()
    page.close()



def test_mobile_tooling_withdrawal_vehicle_number_dropdown(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/tooling", wait_until="networkidle")
    target_card = page.locator("tbody tr").filter(has_text="E2E Test Sealant")
    target_card.get_by_role("button", name="เบิก", exact=True).click()
    vehicle_select = page.get_by_label("เบอร์รถเครื่องมือ *")
    assert vehicle_select.locator("option").count() == 14
    vehicle_select.select_option("13")
    assert vehicle_select.input_value() == "13"
    page.get_by_label("เหตุผล *").select_option("LOST")
    assert page.get_by_label("เหตุผล *").is_visible()
    page.close()



def test_desktop_tooling_add_uses_gray_suggested_equipment_number(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.goto(f"{BASE_URL}/tooling", wait_until="networkidle")
    page.get_by_role("button", name=re.compile("เพิ่มอุปกรณ์")).click()
    page.get_by_label("Location").fill("MM-4-46-2")
    page.get_by_label("จำนวนที่ต้องสั่ง").fill("6")

    number_input = page.get_by_label("หมายเลขอุปกรณ์")
    suggested = number_input.get_attribute("placeholder")
    assert re.fullmatch(r"GTOOL[0-9]{5}", suggested or "")
    assert number_input.input_value() == ""

    page.get_by_label("ชื่ออุปกรณ์ *").fill("E2E Suggested Number Item")
    page.get_by_role("button", name="บันทึก", exact=True).click()
    row = page.locator("tbody tr").filter(has_text="E2E Suggested Number Item")
    row.locator("td").nth(1).get_by_text(suggested, exact=True).wait_for()
    page.close()


def test_mobile_tooling_add_shows_editable_suggestion(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/tooling", wait_until="networkidle")
    page.get_by_role("button", name=re.compile("เพิ่มอุปกรณ์")).click()
    page.get_by_label("Location").fill("MM-4-46-3")
    page.get_by_label("จำนวนที่ต้องสั่ง").fill("8")
    assert page.get_by_label("Location").input_value() == "MM-4-46-3"
    assert page.get_by_label("จำนวนที่ต้องสั่ง").input_value() == "8"

    number_input = page.get_by_label("หมายเลขอุปกรณ์")
    number_input.fill("GTOOL00042")
    assert number_input.input_value() == "GTOOL00042"
    page.close()

def test_desktop_gauge_control_equipment_cards(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.goto(f"{BASE_URL}/tools", wait_until="networkidle")

    page.get_by_role("heading", name="ยืม-คืนอุปกรณ์เครื่องมือ").wait_for()
    page.get_by_role("button", name="⬇ Backup Excel").wait_for()
    card = page.locator(".gauge-equipment-card").filter(has_text="E2E-GAUGE-001")
    card.get_by_text("E2E Gauge Caliper").wait_for()
    card.get_by_text("Digital Caliper").wait_for()
    card.get_by_text("Gauge Test Maker").wait_for()
    card.get_by_text("GAUGE-SN-001").wait_for()
    card.get_by_text("Phase4").wait_for()
    card.get_by_text("QA Shelf A1").wait_for()
    assert page.locator(".gauge-equipment-grid .gauge-equipment-card").count() == 1
    assert page.locator(".gauge-equipment-grid table").count() == 0

    card.get_by_role("button", name="QR", exact=True).click()
    page.get_by_role("heading", name="QR Code - E2E-GAUGE-001").wait_for()
    page.locator(".modal-head button").click()
    page.close()


def test_mobile_gauge_control_equipment_cards(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/tools", wait_until="networkidle")
    page.get_by_role("button", name="⬇ Backup Excel").wait_for()
    nav_metrics = page.locator(".m-bottom-nav a").first.evaluate(
        "(el) => ({ minHeight: getComputedStyle(el).minHeight, bottom: getComputedStyle(el.parentElement).bottom })"
    )
    assert nav_metrics == {"minHeight": "52px", "bottom": "12px"}

    card = page.locator(".gauge-equipment-card").filter(has_text="E2E-GAUGE-001")
    card.get_by_text("E2E Gauge Caliper").wait_for()
    assert card.is_visible()
    assert page.locator(".gauge-equipment-grid table").count() == 0
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.close()


def test_desktop_stock_backup_button(browser):
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    login(page)
    page.goto(f"{BASE_URL}/stock", wait_until="networkidle")
    page.get_by_role("heading", name="Stock").wait_for()
    page.get_by_role("button", name="⬇ Backup Excel").wait_for()
    page.close()


def test_mobile_stock_backup_button(browser):
    page = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
        has_touch=True,
    )
    login(page)
    page.goto(f"{BASE_URL}/stock", wait_until="networkidle")
    page.get_by_role("heading", name="Stock").wait_for()
    page.get_by_role("button", name="⬇ Backup Excel").wait_for()
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            test_desktop_tooling_qr_withdrawal_and_history(browser)
            test_desktop_stock_backup_button(browser)
            test_mobile_stock_backup_button(browser)
            test_desktop_gauge_control_equipment_cards(browser)
            test_mobile_gauge_control_equipment_cards(browser)
            test_mobile_safety_stock_shows_tooling_when_parts_are_empty(browser)
            test_desktop_tooling_add_uses_gray_suggested_equipment_number(browser)
            test_mobile_tooling_add_shows_editable_suggestion(browser)
            test_mobile_tooling_withdrawal_vehicle_number_dropdown(browser)
        finally:
            browser.close()
    print("PASS: isolated desktop Tooling and Gauge Control, mobile Tooling/Gauge Control, and mobile Safety Stock E2E tests")


if __name__ == "__main__":
    main()
