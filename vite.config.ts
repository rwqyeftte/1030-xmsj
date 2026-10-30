import {defineConfig} from 'vite';

export default defineConfig(({mode}) => ({
  base: mode === 'pages' ? '/1030-xmsj/' : '/',
  // Figma transfer exports are local working files, not website assets.
  publicDir: mode === 'pages' ? false : 'public',
  build: {outDir: mode === 'pages' ? 'dist-pages' : 'dist'},
  plugins: mode === 'pages' ? [{
    name: 'omit-figma-capture-from-published-site',
    transformIndexHtml: (html: string) => html.replace(/<script>if\(location\.hash\.includes\("figmacapture="\)\)[\s\S]*?<\/script>/, ''),
  }] : [],
}));
