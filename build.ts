const result = await Bun.build({
  entrypoints: ['./src/main.ts'],
  minify: {
    identifiers: false,
  },
  sourcemap: 'linked',
  target: 'bun',
  compile: {
    outfile: 'dist/bot',
  },
  external: [
    '@nestjs/microservices',
    '@nestjs/platform-express',
    'ffmpeg-static',
    'class-transformer/storage',
    '@nestjs/platform-socket.io',
  ],
  bytecode: false,
});

if (result.success) {
  console.log('Build successful!');
} else {
  console.error('Build failed:', result.logs);
  process.exit(1);
}

export {};
