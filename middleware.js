export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // Skip auth if env vars are not configured — pass through
  if (!user || !pass) return;

  const authorization = request.headers.get('authorization');
  if (authorization) {
    const [scheme, encoded] = authorization.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const colon = decoded.indexOf(':');
      const inputUser = decoded.substring(0, colon);
      const inputPass = decoded.substring(colon + 1);
      // Credentials match — pass through to the static file
      if (inputUser === user && inputPass === pass) return;
    }
  }

  // No or wrong credentials — prompt for login
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PerfStack Workshop", charset="UTF-8"',
    },
  });
}
