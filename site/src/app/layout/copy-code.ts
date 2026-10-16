/**
 * Handles a click on a code block's copy button (rendered at build time by scripts/markdown.ts).
 * Returns true if the click was one, so callers can stop handling it.
 */
export function copyCodeOnClick(event: MouseEvent): boolean {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy]');
  const code = button?.closest('.code')?.querySelector('pre');
  if (!button || !code) {
    return false;
  }
  const text = code.innerText.replace(/\n$/, '');
  const copied = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard API'));
  copied.then(
    () => flash(button, 'Copied'),
    () => flash(button, legacyCopy(text) ? 'Copied' : 'Copy failed'),
  );
  return true;
}

/** For browsers and embedded views that refuse the async clipboard API. */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function flash(button: HTMLButtonElement, label: string): void {
  button.textContent = label;
  button.dataset['state'] = label === 'Copied' ? 'done' : 'failed';
  setTimeout(() => {
    button.textContent = 'Copy';
    delete button.dataset['state'];
  }, 1500);
}
