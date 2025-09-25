// esbuild.config.js
const { build } = require("esbuild");

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  sourcemap: true,
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-secrets-manager",
    "@aws-sdk/lib-dynamodb",
  ],
}).catch(() => process.exit(1));
