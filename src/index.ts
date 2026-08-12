export const grammarFiles = Object.freeze({
  bash: "tree-sitter-bash.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  csharp: "tree-sitter-c-sharp.wasm",
  css: "tree-sitter-css.wasm",
  go: "tree-sitter-go.wasm",
  html: "tree-sitter-html.wasm",
  java: "tree-sitter-java.wasm",
  javascript: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  json: "tree-sitter-json.wasm",
  python: "tree-sitter-python.wasm",
  ruby: "tree-sitter-ruby.wasm",
  rust: "tree-sitter-rust.wasm",
  scala: "tree-sitter-scala.wasm",
  tsx: "tree-sitter-tsx.wasm",
  typescript: "tree-sitter-typescript.wasm",
});

export type GrammarName = keyof typeof grammarFiles;

export function wasmURL(grammar: GrammarName): URL {
  return new URL(`../wasm/${grammarFiles[grammar]}`, import.meta.url);
}
