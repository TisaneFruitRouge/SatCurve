// @redstone-finance/oracles-smartweave-contracts ships raw .ts source files
// with no compiled output, causing tsc to fail when following the import chain
// from @redstone-finance/sdk. This ambient declaration shadows the package so
// TypeScript treats it as an untyped module instead of compiling its source.
declare module "@redstone-finance/oracles-smartweave-contracts";
