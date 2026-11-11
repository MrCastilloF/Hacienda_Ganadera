/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` se omite a propósito: en Windows requiere crear enlaces
  // simbólicos y falla sin privilegios. En Docker se usa `next start`.
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
