export async function deriveKey(pass: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), {name:'PBKDF2'}, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash:'SHA-256'},
    keyMaterial, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
}

export async function encryptJSON(obj: unknown, pass: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pass, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
  return {
    v:'1', alg:'AES-GCM', kdf:'PBKDF2-SHA256', iters:200000,
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

export async function decryptJSON(blob: any, pass: string) {
  const iv   = Uint8Array.from(atob(blob.iv), c => c.charCodeAt(0));
  const salt = Uint8Array.from(atob(blob.salt), c => c.charCodeAt(0));
  const key  = await deriveKey(pass, salt);
  const ct   = Uint8Array.from(atob(blob.ct), c => c.charCodeAt(0));
  const pt   = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}
