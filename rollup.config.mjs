import typescript from "@rollup/plugin-typescript"
import dts from "rollup-plugin-dts"

const banner = `/*!
 * GObjectify 1.0.0 - A type-safe, declarative TypeScript library for writing & interacting with GObject classes in GNOME JavaScript (GJS)
 * https://github.com/flattool/gobjectify
 *
 * MIT License
 *
 * Copyright (c) 2025 flattool
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */`

const input = "src/gobjectify.ts"
const output_dir = "dist"
const tsconfig = "./tsconfig.json"

export default [
    { // JS Bundle
        input,
        output: {
            file: `${output_dir}/gobjectify.js`,
            format: "esm",
            banner,
        },
        plugins: [
            typescript({
                tsconfig,
                compilerOptions: {
                    removeComments: true,
                },
            }),
        ],
    },
    { // TS Bundle
        input,
        output: {
            file: `${output_dir}/gobjectify.d.ts`,
            format: "esm",
            banner: banner + "\n// @ts-nocheck - Skip checking, to ensure this library wont cause issues for users with different TypeScript setups.",
        },
        plugins: [
            dts({
                tsconfig,
                compilerOptions: {
                    removeComments: false,
                },
            }),
        ],
    },
]
