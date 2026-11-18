export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  // Existing LAN deployments can use HTTP, where the async Clipboard API is unavailable.
  const textarea = document.createElement("textarea");
  textarea.value = text; textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed"; textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try { textarea.select(); if (!document.execCommand("copy")) throw new Error("Clipboard unavailable"); }
  finally { textarea.remove(); }
}
