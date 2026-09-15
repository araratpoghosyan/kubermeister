/** Trigger a browser download of an in-memory text blob. */
export function downloadTextFile(filename: string, text: string, type = 'text/plain'): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
