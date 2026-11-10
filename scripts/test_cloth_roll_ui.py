"""Desktop and mobile E2E coverage for the Cloth Roll history and adjustment form."""
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"
EMPLOYEE_CODE = "UI-CLOTH-001"


def login(page):
    page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    page.get_by_label("Employee Code").fill(EMPLOYEE_CODE)
    page.get_by_role("button", name="Login").click()
    page.wait_for_function(
        "() => !!sessionStorage.getItem('partsflow_auth_token') || "
        "!!localStorage.getItem('partsflow_auth_token')",
        timeout=10000,
    )


def assert_history_layout(page, viewport_width):
    history = page.get_by_role("region", name="รายการประวัติ เลื่อนเพื่อดูรายการเพิ่มเติม")
    history.wait_for()
    rows = history.locator("tbody tr")
    assert rows.count() == 12, f"Expected 12 seeded rows, got {rows.count()}"

    # Ten 43px rows plus the sticky header should fit in the 480px scroll viewport.
    metrics = history.evaluate(
        """el => {
          const rows = [...el.querySelectorAll('tbody tr')];
          const box = el.getBoundingClientRect();
          const tenth = rows[9].getBoundingClientRect();
          const deleteButton = rows[0].querySelector('td:last-child button');
          const deleteBox = deleteButton?.getBoundingClientRect();
          return {
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            tenthRowBottom: tenth.bottom,
            viewportBottom: box.bottom,
            deleteButtonVisible: !!deleteBox && deleteBox.width > 0 &&
              deleteBox.left >= box.left && deleteBox.right <= box.right,
            documentWidth: document.documentElement.scrollWidth,
            windowWidth: window.innerWidth
          };
        }"""
    )
    assert metrics["scrollHeight"] > metrics["clientHeight"], metrics
    assert metrics["tenthRowBottom"] <= metrics["viewportBottom"] + 1, metrics
    assert metrics["scrollWidth"] <= metrics["clientWidth"] + 1, metrics
    assert metrics["deleteButtonVisible"], metrics
    assert metrics["documentWidth"] <= viewport_width, metrics

    # The remaining rows must be reachable by vertical scrolling.
    history.evaluate("(el) => { el.scrollTop = el.scrollHeight; }")
    assert rows.nth(11).is_visible()
    bottom = rows.nth(11).bounding_box()
    box = history.bounding_box()
    assert bottom and box and bottom["y"] < box["y"] + box["height"]


def run_viewport(browser, viewport, mobile):
    page = browser.new_page(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    login(page)
    page.goto(f"{BASE_URL}/cloth-rolls", wait_until="networkidle")
    page.get_by_role("heading", name="เบิกจ่ายเศษผ้า").wait_for()

    assert_history_layout(page, viewport["width"])

    # The ordinary withdrawal form must not expose an adjustment-only note.
    assert page.get_by_label("หมายเหตุ", exact=True).count() == 0

    page.locator("#cloth-roll-form").get_by_role("button", name="ปรับยอด", exact=True).click()
    note = page.get_by_label("หมายเหตุ", exact=True)
    note.wait_for()
    note.fill("E2E ตรวจนับยอดคงเหลือ")

    page.get_by_label("ยอดคงเหลือใหม่ (ม้วน) *").fill("96")
    page.get_by_role("button", name="บันทึกปรับยอด").click()
    page.get_by_text("บันทึกรายการสำเร็จ").wait_for()

    history = page.get_by_role("region", name="รายการประวัติ เลื่อนเพื่อดูรายการเพิ่มเติม")
    history.get_by_text("หมายเหตุ: E2E ตรวจนับยอดคงเหลือ", exact=True).wait_for()
    assert history.locator("tbody tr").count() == 13

    # Switching back to withdrawal hides the adjustment-only note field.
    page.locator("#cloth-roll-form").get_by_role("button", name="เบิก", exact=True).click()
    assert page.get_by_label("หมายเหตุ", exact=True).count() == 0
    page.close()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            run_viewport(browser, {"width": 1440, "height": 1000}, False)
            run_viewport(browser, {"width": 390, "height": 844}, True)
        finally:
            browser.close()
    print("PASS: Cloth Roll history scrolling, delete-button fit, and adjustment-only note on desktop and mobile.")


if __name__ == "__main__":
    main()
