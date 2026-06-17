/** Browser-only IO side effects, isolated so the serializers stay pure and testable.
 *  Download follows services/selection-export.ts (Blob + transient anchor + revoke). */

export function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Reads a File as UTF-8 text. Uses FileReader (rather than File.text()) so it works
 *  across browsers and the jsdom test environment, which lacks File.text(). */
export function readFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

export function triggerPrint(): void {
  window.print();
}
