// The app loads these files at run time; a build without one of them starts broken.
export const BUILD_OUTPUTS = [
  'out/main/index.js',
  'out/preload/index.cjs',
  'out/preload/island.cjs',
  'out/renderer/index.html',
  'out/renderer/island.html',
] as const;

const PRELOADS = ['out/preload/index.cjs', 'out/preload/island.cjs'];
// A sandboxed preload can only require Electron and a few Node modules, never a sibling chunk.
const RELATIVE_REQUIRE = /require\(\s*["']\.{1,2}\//;

// The packaged island page connects to nothing: the dev server socket is development only.
const DEV_SOCKET = /ws:\/\//;

/** What is wrong with the build in `out/`; `read` returns null for a missing file. */
export function buildProblems(read: (path: string) => string | null): string[] {
  const problems: string[] = [];
  for (const path of BUILD_OUTPUTS) {
    const content = read(path);
    if (content === null) problems.push(`${path} manque`);
    else if (PRELOADS.includes(path) && RELATIVE_REQUIRE.test(content)) {
      problems.push(`${path} charge un autre fichier, refusé par le bac à sable`);
    } else if (path === 'out/renderer/island.html' && DEV_SOCKET.test(content)) {
      problems.push(`${path} autorise encore le serveur de développement`);
    }
  }
  return problems;
}
