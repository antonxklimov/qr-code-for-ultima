declare module 'jszip' {
  interface JSZip {
    file(name: string, data: string | Uint8Array | ArrayBuffer, options?: { base64: boolean }): JSZip;
    generateAsync(options?: { type: string }): Promise<Blob>;
  }
  interface JSZipConstructor {
    new (): JSZip;
  }
  const JSZip: JSZipConstructor;
  export default JSZip;
} 