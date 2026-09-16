const INSTALLED_KEY = "__partsflowDrawingPathEnhancerInstalled";
const BUTTON_CLASS = "pf-open-drawing-folder";

function cleanPath(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function parentPath(value) {
  const path = cleanPath(value);
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (!url.pathname.endsWith("/")) {
        const parts = url.pathname.split("/");
        const last = parts[parts.length - 1] || "";
        if (last.includes(".")) {
          parts.pop();
          url.pathname = `${parts.join("/") || "/"}/`;
        }
      }
      return url.toString();
    } catch {
      return path;
    }
  }

  const trimmed = path.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  const last = segments[segments.length - 1] || "";
  if (!last.includes(".")) return trimmed;
  return trimmed.slice(0, Math.max(0, trimmed.length - last.length)).replace(/[\\/]+$/, "");
}

function toOpenUrl(folder) {
  const value = cleanPath(folder);
  if (!value) return "";
  if (/^(https?|file):\/\//i.test(value)) return value;
  if (/^\\\\/.test(value)) {
    return `file://${value.replace(/^\\\\/, "").replace(/\\/g, "/")}`;
  }
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return `file:///${value.replace(/\\/g, "/")}`;
  }
  return `file:///${value.replace(/\\/g, "/")}`;
}

async function copyPath(value) {
  const text = cleanPath(value);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  }
}

export async function openDrawingFolder(rawPath) {
  const folder = parentPath(rawPath);
  if (!folder) {
    window.alert("ยังไม่ได้ระบุ Drawing Path");
    return;
  }

  // HTTPS browsers often block file:// and UNC navigation. Copy the folder
  // path first so the user always has a usable fallback for Explorer/Win+R.
  await copyPath(folder);
  const url = toOpenUrl(folder);
  let opened = null;
  try {
    opened = window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    opened = null;
  }

  if (!opened && !/^https?:\/\//i.test(url)) {
    window.alert(
      `Browser ไม่อนุญาตให้เปิด Folder จากหน้าเว็บโดยตรง\n\nระบบคัดลอก Path ไว้แล้ว:\n${folder}\n\nเปิด File Explorer หรือกด Win+R แล้ววาง Path ได้เลย`
    );
  }
}

function enhanceDrawingFields() {
  document.querySelectorAll("label.field, .field").forEach((field) => {
    const labelText = String(field.querySelector("span")?.textContent || "").toLowerCase();
    if (!labelText.includes("drawing path")) return;
    const input = field.querySelector("input");
    if (!input || field.querySelector(`.${BUTTON_CLASS}`)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ghost ${BUTTON_CLASS}`;
    button.textContent = "📁 เปิด Folder";
    button.addEventListener("click", () => openDrawingFolder(input.value));
    field.appendChild(button);
  });
}

export function installDrawingPathEnhancer() {
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;
  enhanceDrawingFields();
  const observer = new MutationObserver(enhanceDrawingFields);
  observer.observe(document.body, { childList: true, subtree: true });
}
