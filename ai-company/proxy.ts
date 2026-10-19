import { NextResponse, type NextRequest } from 'next/server';

// Optional HTTP Basic auth. Set COMPANY_PASSWORD to turn it on (any username works).
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const password = process.env.COMPANY_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(':') + 1);
      if (safeEqual(supplied, password)) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AI Company", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
