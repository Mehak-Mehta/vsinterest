import svelte from "rollup-plugin-svelte";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser  from "rollup-plugin-terser";
import sveltePreprocess from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss"
import path from "path";
import fs from "fs";


const production = !process.env.ROLLUP_WATCH;

export default fs
  .readdirSync(path.join(__dirname, "webviews", "pages"))
  .map((input) => {
    const name = input.split(".")[0];
    return {
      input: "webviews/pages/" + input,
      output: {
        sourcemap: true,
        format: "iife",
        name: "app",
        file: "out/compiled/" + name + ".js",
        
      },
      plugins: [
        svelte({
          dev: !production,
          emitCss: true,
          preprocess: sveltePreprocess(),
          
        }),
        postcss({
          extract: true,
          sourceMap: true,
          extract: path.resolve("out/compiled/" + name + ".css")
      }),
      
        resolve({
          browser: true,
          dedupe: ["svelte"],
        }),
        commonjs(),
        typescript({
          tsconfig: "webviews/tsconfig.json",
          sourceMap: !production,
          inlineSources: !production,
        }),

        
        production && terser(),
      ],
      watch: {
        clearScreen: false,
      },
    };
  });