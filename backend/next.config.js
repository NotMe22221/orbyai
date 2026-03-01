/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: 'standalone' output removed — Vercel manages deployment output natively

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },

  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = nextConfig;
