import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  webpack(config, { webpack }) {
    // Vinext probes this hook without a Webpack implementation.
    if (!webpack?.NormalModuleReplacementPlugin) return config;
    // Apply the runtime flag only through Next.js's Webpack build.
    config.plugins.push(new webpack.DefinePlugin({
      "process.env.FRAME_RUNTIME": JSON.stringify("node"),
    }));
    // A replacement plugin also handles the cloudflare: URL scheme, which a
    // normal resolve.alias cannot handle in Webpack.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "lib/vercel-env.ts"),
    ));
    return config;
  },
};

export default nextConfig;
