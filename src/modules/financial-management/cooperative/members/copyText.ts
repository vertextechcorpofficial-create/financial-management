export async function copyCooperativeText(text: string, container: HTMLElement, button?: HTMLButtonElement | null) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Use the selection-based clipboard command when the browser blocks the Clipboard API.
    }
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  container.appendChild(input);
  try {
    input.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
    button?.focus({ preventScroll: true });
  }
}
