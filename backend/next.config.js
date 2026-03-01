/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel-optimised: enable standalone output for smaller deploys
  output: 'standalone',

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

  // Required for ElevenLabs + Deploy AI fetch calls from server components
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = nextConfig;
