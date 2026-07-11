function toExactArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes.slice(0);

  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

export function createDownloadBlob(bytes: Uint8Array | ArrayBuffer, mimeType: string = "application/pdf") {
  const data = toExactArrayBuffer(bytes);
  return new Blob([data], { type: mimeType });
}

export async function downloadFile(bytes: Uint8Array | ArrayBuffer, filename: string, mimeType: string = "application/pdf") {
  const blob = createDownloadBlob(bytes, mimeType);

  if (blob.size === 0) {
    throw new Error(`Cannot download ${filename}: generated file is empty.`);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  
  // Need to append for Firefox
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // Give the browser time to read larger PDFs
}
