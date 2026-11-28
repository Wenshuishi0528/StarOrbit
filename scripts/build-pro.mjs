import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { archivedReference } from './pro-reference.mjs';

export async function buildPro(directory, version, web = false) {
  const options = {
    bundle: true,
    format: 'iife',
    minify: true,
    legalComments: 'inline',
    write: false,
  };
  const [bundle, worker] = await Promise.all(
    ['src/pro/workbench.js', 'src/pro/solver-worker.js'].map((entry) =>
      build({ ...options, entryPoints: [entry] })
    )
  );
  const html = fs
    .readFileSync('src/pro/workbench.html', 'utf8')
    .replace('__VERSION__', version)
    .replace('__MAIN_URL__', web ? './index.html' : './StarOrbit.html')
    .replace('__PRO_CSS__', () =>
      ['src/pro/workbench.css', 'src/floating-windows.css']
        .map((file) => fs.readFileSync(file, 'utf8'))
        .join('\n')
    )
    .replace(
      '__EARTH_IMAGE__',
      () =>
        'data:image/jpeg;base64,' +
        fs.readFileSync('assets/earth/medium/day.jpg').toString('base64')
    )
    .replace(
      '__NIGHT_IMAGE__',
      () =>
        'data:image/jpeg;base64,' +
        fs.readFileSync('assets/earth/medium/night.jpg').toString('base64')
    )
    .replace('__PRO_REFERENCE__', archivedReference)
    .replace('__PRO_WORKER__', () =>
      worker.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
    )
    .replace('__PRO_JS__', () => bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'))
    .replace(
      '</head>',
      () =>
        '<!-- StarOrbit Pro · Wenshuishi · Original work: CC BY-NC 4.0. Earth imagery: Solar System Scope / INOVE, CC BY 4.0.\n' +
        'Archived CSS/KJZ ephemeris: BACC, 2026-10-19, https://en.cmse.gov.cn/news/202107/t20210722_48418.html\n' +
        'Harris–Priester density data: Montenbruck and Gill, Satellite Orbits, Table 3.8, doi:10.1007/978-3-642-58351-3.\n' +
        [
          'LICENSE',
          'node_modules/three/LICENSE',
          'node_modules/satellite.js/LICENSE.md',
          'node_modules/astronomy-engine/astronomy.js',
        ]
          .map((f) => {
            const s = fs.readFileSync(f, 'utf8');
            return f.endsWith('.js') ? s.split('*/')[0].slice(3) : s;
          })
          .join('\n')
          .replaceAll('-->', '-- >') +
        ' -->\n</head>'
    );
  const file = path.join(directory, 'StarOrbitPro.html');
  fs.writeFileSync(file + '.tmp', html);
  fs.renameSync(file + '.tmp', file);
}
