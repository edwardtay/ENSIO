import { ChainId } from '@lifi/sdk'

export const CHAIN_MAP: Record<string, number> = {
  ethereum: ChainId.ETH,
  arbitrum: ChainId.ARB,
  base: ChainId.BAS,
  optimism: ChainId.OPT,
}

export const TOKEN_MAP: Record<string, { decimals: number; addresses: Record<number, string> }> = {
  USDC: {
    decimals: 6,
    addresses: {
      [ChainId.ETH]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      [ChainId.ARB]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      [ChainId.BAS]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      [ChainId.OPT]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    },
  },
  USDT: {
    decimals: 6,
    addresses: {
      [ChainId.ETH]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      [ChainId.ARB]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      [ChainId.BAS]: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      [ChainId.OPT]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
  },
  DAI: {
    decimals: 18,
    addresses: {
      [ChainId.ETH]: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      [ChainId.ARB]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      [ChainId.BAS]: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      [ChainId.OPT]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
  },
  FRAX: {
    decimals: 18,
    addresses: {
      [ChainId.ETH]: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
      [ChainId.ARB]: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
      [ChainId.OPT]: '0x2E3D870790dC77A83DD1d18184Acc7439A53f475',
    },
  },
  LUSD: {
    decimals: 18,
    addresses: {
      [ChainId.ETH]: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
      [ChainId.ARB]: '0x93b346b6BC2548dA6A1E7d98E9a421B42541425b',
      [ChainId.OPT]: '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819',
    },
  },
  GHO: {
    decimals: 18,
    addresses: {
      [ChainId.ETH]: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
      [ChainId.ARB]: '0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33',
    },
  },
}

/**
 * Vault token addresses used by LI.FI Composer for deposit / yield workflows.
 * Keyed by protocol:underlying, valued by chainId -> vault token address.
 */
export const VAULT_TOKEN_MAP: Record<
  string,
  { protocol: string; underlying: string; addresses: Record<number, string> }
> = {
  'aave:USDC': {
    protocol: 'aave',
    underlying: 'USDC',
    addresses: {
      [ChainId.ETH]: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', // aEthUSDC (Aave v3 Ethereum)
      [ChainId.BAS]: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // aBasUSDC (Aave v3 Base)
    },
  },
  'morpho:USDC': {
    protocol: 'morpho',
    underlying: 'USDC',
    addresses: {
      [ChainId.BAS]: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A', // Morpho vault USDC on Base
      [ChainId.ETH]: '0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB', // Morpho vault USDC on Ethereum
    },
  },
}

/**
 * Look up the vault token address for a given protocol + underlying token on a chain.
 * Returns undefined when no vault is known.
 */
export function getVaultTokenAddress(
  protocol: string,
  underlyingSymbol: string,
  chainId: number
): string | undefined {
  const key = `${protocol.toLowerCase()}:${underlyingSymbol.toUpperCase()}`
  return VAULT_TOKEN_MAP[key]?.addresses[chainId]
}

/**
 * Check whether a token address corresponds to a known vault token.
 */
export function isVaultToken(address: string): boolean {
  const lower = address.toLowerCase()
  for (const entry of Object.values(VAULT_TOKEN_MAP)) {
    for (const addr of Object.values(entry.addresses)) {
      if (addr.toLowerCase() === lower) return true
    }
  }
  return false
}

/** All token symbols the system supports */
export const SUPPORTED_TOKENS = Object.keys(TOKEN_MAP)

/** Tokens considered stablecoins for v4 hook eligibility */
export const STABLECOINS = SUPPORTED_TOKENS

/** Look up a token address on a specific chain. Returns undefined if not available. */
export function getTokenAddress(symbol: string, chainId: number): string | undefined {
  return TOKEN_MAP[symbol.toUpperCase()]?.addresses[chainId]
}

/** Get the decimals for a token symbol. Defaults to 18 if unknown. */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_MAP[symbol.toUpperCase()]?.decimals ?? 18
}
