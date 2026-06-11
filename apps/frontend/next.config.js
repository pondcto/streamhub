const fs = require("fs");

class NormalizeWindowsPathsPlugin {
  apply(compiler) {
    compiler.hooks.normalModuleFactory.tap("NormalizeWindowsPathsPlugin", (nmf) => {
      nmf.hooks.beforeResolve.tap("NormalizeWindowsPathsPlugin", (resolveData) => {
        if (process.platform !== "win32" || !resolveData) {
          return;
        }

        if (typeof resolveData.context === "string") {
          try {
            resolveData.context = fs.realpathSync.native(resolveData.context);
          } catch {
            // keep original path
          }
        }

        if (typeof resolveData.request === "string" && resolveData.request.startsWith(".")) {
          return;
        }

        if (typeof resolveData.request === "string" && /^[A-Za-z]:[\\/]/.test(resolveData.request)) {
          try {
            resolveData.request = fs.realpathSync.native(resolveData.request);
          } catch {
            // keep original path
          }
        }
      });

      nmf.hooks.afterResolve.tap("NormalizeWindowsPathsPlugin", (resolveData) => {
        if (process.platform !== "win32" || !resolveData.createData) {
          return;
        }

        const { createData } = resolveData;
        for (const key of ["resource", "context"]) {
          const value = createData[key];
          if (typeof value === "string") {
            try {
              createData[key] = fs.realpathSync.native(value);
            } catch {
              // keep original path
            }
          }
        }
      });
    });
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  webpack: (config, { dev }) => {
    if (process.platform === "win32") {
      config.plugins.push(new NormalizeWindowsPathsPlugin());
      // Prevent stale webpack cache entries with mismatched path casing.
      config.cache = false;
    }

    return config;
  },
};

module.exports = nextConfig;
