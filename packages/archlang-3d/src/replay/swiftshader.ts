/** The flags that make Chromium render WebGL in software, the same on every machine (plan §6.5). */
export const SWIFTSHADER_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
