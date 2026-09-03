import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_TAGS = new Set(['sapa-analytics', 'kpi', 'stats', 'report']);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tag?: string; tags?: string[]; secret?: string };
    const secretEnv = process.env.REVALIDATE_SECRET;
    if (secretEnv) {
      const headerSecret = req.headers.get('x-revalidate-secret');
      const bodySecret = body.secret;
      if (headerSecret !== secretEnv && bodySecret !== secretEnv) {
        return NextResponse.json({ status: 'error', error: 'Unauthorized' }, { status: 401 });
      }
    }

    const tags: string[] = body.tags ?? (body.tag ? [body.tag] : []);
    if (tags.length === 0) {
      return NextResponse.json({ status: 'error', error: 'tag/tags required (sapa-analytics|kpi|stats|report|all)' }, { status: 400 });
    }

    const toRevalidate = tags.includes('all') ? Array.from(ALLOWED_TAGS) : tags.filter((t) => ALLOWED_TAGS.has(t));
    if (toRevalidate.length === 0) {
      return NextResponse.json({ status: 'error', error: `unknown tag. allowed: ${Array.from(ALLOWED_TAGS).join(', ')}|all` }, { status: 400 });
    }

    for (const t of toRevalidate) (revalidateTag as unknown as (tag: string) => void)(t);

    return NextResponse.json({ status: 'ok', revalidated: toRevalidate });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : 'Gagal revalidate' }, { status: 500 });
  }
}
