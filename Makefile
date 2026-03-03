.PHONY: devnet init web bot test check console install

devnet:
	clarinet devnet start --from-genesis

init:
	pnpm --filter @satcurve/bot exec tsx scripts/init-devnet.ts

web:
	pnpm --filter @satcurve/web dev

bot:
	pnpm --filter @satcurve/bot dev

test:
	vitest run

check:
	clarinet check

console:
	clarinet console

install:
	pnpm install
