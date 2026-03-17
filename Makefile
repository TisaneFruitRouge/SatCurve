.PHONY: devnet init web bot test check console install tag-testnet

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

# Push a testnet release tag to trigger the GitHub Actions deployment workflow.
# Usage: make tag-testnet VERSION=0.2.0
tag-testnet:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make tag-testnet VERSION=<semver>  (e.g. VERSION=0.1.0)"; \
		exit 1; \
	fi
	git tag v$(VERSION)-testnet
	git push origin v$(VERSION)-testnet
	@echo "Tag v$(VERSION)-testnet pushed — GitHub Actions will deploy to testnet."
