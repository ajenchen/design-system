#!/usr/bin/env node

if (process.argv.length !== 3 || !['clean', 'quiet'].includes(process.argv[2])) {
  process.stderr.write('provider hook output probe requires one closed mode\n')
  process.exit(64)
}

if (process.argv[2] === 'clean') process.stdout.write('clean')
