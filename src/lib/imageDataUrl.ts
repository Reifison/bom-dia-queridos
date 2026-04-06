/** Converts a data URL to an object URL to reduce duplicate large strings in memory. Caller must revoke when done. */
export function dataUrlToObjectUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) {
    throw new Error('INVALID_DATA_URL');
  }
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mimeMatch = /^data:([^;]+)/.exec(header);
  const mime = mimeMatch?.[1] ?? 'image/png';

  let bytes: Uint8Array;
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    const decoded = decodeURIComponent(data);
    bytes = new TextEncoder().encode(decoded);
  }

  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
