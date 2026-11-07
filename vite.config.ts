import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // 绑定 0.0.0.0，方便手机在同一局域网内访问做真机验证。
    host: true,
    port: 5173,
    strictPort: true,
  },
});
