import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Dois alvos de build a partir do mesmo código:
//   vite build                 -> dist/       (deploy no Vercel)
//   vite build --mode offline  -> dist-offline/CBHPM-offline.html
//
// O dist/ normal não abre por file:// (caminhos absolutos + CORS em módulos ES),
// daí o alvo offline com tudo embutido num arquivo só.
export default defineConfig(({ mode }) => {
  const offline = mode === "offline";

  return {
    plugins: [react(), ...(offline ? [viteSingleFile()] : [])],
    build: {
      outDir: offline ? "dist-offline" : "dist",
      // a base da CBHPM tem ~5 MB de JSON; o aviso padrão de 500 kB só faz ruído
      chunkSizeWarningLimit: 8000,
      assetsInlineLimit: offline ? 100_000_000 : 4096,
    },
  };
});
