export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // Skip auth if env vars are not configured
  if (!user || !pass) return new Response(null, { status: 200 });

  const authorization = request.headers.get('authorization');
  if (authorization) {
    const [scheme, encoded] = authorization.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const [inputUser, inputPass] = decoded.split(':');
      if (inputUser === user && inputPass === pass) {
        return new Response(null, { status: 200 });
      }
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PerfStack Workshop", charset="UTF-8"',
    },
  });
}
