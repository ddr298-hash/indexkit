import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kr.indexkit.app',
  appName: '인덱스키트',
  webDir: 'out',
  plugins: {
    // Routes fetch()/XHR through native networking so requests to
    // blog.naver.com (no CORS headers) aren't blocked by the WebView.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
