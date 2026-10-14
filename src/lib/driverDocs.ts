import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const BUCKET = 'driver-documents';
const TTL_SECONDS = 3600;
const cache = new Map<string, { url: string; expires: number }>();

// Stored values are public-style URLs ending in /driver-documents/<path>.
export function docPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const i = value.indexOf(marker);
  if (i === -1) return null;
  const path = decodeURIComponent(value.slice(i + marker.length).split('?')[0]);
  return path || null;
}

// Short-lived private link for a stored document; falls back to the stored URL
// when signing is not possible (non-bucket URL, or the file is still public).
export async function signedDocUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const path = docPath(value);
  if (!path) return value;
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl) return value;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL_SECONDS - 120) * 1000 });
  return data.signedUrl;
}

export function useSignedUrl(value: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!value) return undefined;
    signedDocUrl(value).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return url;
}
