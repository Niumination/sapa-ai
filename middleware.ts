// ─── Middleware — Protect session pages: /dashboard/akun, /dashboard/laporan, /dashboard/admin ───

import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // All session-required pages + restricted APIs live here.
  // (PR-4b: jalur restricted /api/dtsen/* sengaja TIDAK di sini — gate + audit
  // per-role di dalam route agar lebih kaya dari sekadar "ada sesi")
  const protectedPaths = ['/dashboard/akun', '/dashboard/laporan', '/dashboard/admin', '/api/chat-logs'];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Allow /api/auth/* (login/logout/me)
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // API: return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page: redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const admin = await verifyToken(token);
  if (!admin) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/akun/:path*', '/dashboard/laporan/:path*', '/dashboard/admin/:path*', '/api/chat-logs/:path*'],
};
