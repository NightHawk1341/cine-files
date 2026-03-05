import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('access_token')?.value;

    if (!token) {
      const loginUrl = new URL('/api/auth/yandex', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Note: Full JWT verification with role check happens in the admin layout
    // Middleware only checks for token existence for performance
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
