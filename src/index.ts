export const grammarFiles = Object.freeze({
  go: "tree-sitter-go.wasm",
  java: "tree-sitter-java.wasm",
  javascript: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  scala: "tree-sitter-scala.wasm",
  tsx: "tree-sitter-tsx.wasm",
  typescript: "tree-sitter-typescript.wasm",
});

export type GrammarName = keyof typeof grammarFiles;

export function wasmURL(grammar: GrammarName): URL {
  return new URL(`../wasm/${grammarFiles[grammar]}`, import.meta.url);
}
