import { ethers } from "hardhat";
import { ERC20ABI } from "../../nextjs/contracts/externalContracts";
import { parseUnits, parseEther } from "viem";

const RICH_ACCOUNT = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";

// Token addresses on Arbitrum
const TOKENS = {
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  USDCe: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
};

async function main() {
  // Get the addresses to fund from command line
  const signers = await ethers.getSigners();
  const addresses = signers.map(signer => signer.address);
  addresses.push("0x02aD0f9CaB40dEf1D6563bfC84F5AeA4282842aF");
  if (addresses.length === 0) {
    console.log("Please provide at least one address to fund");
    return;
  }

  // Impersonate the rich account
  await ethers.provider.send("hardhat_impersonateAccount", [RICH_ACCOUNT]);
  const signer = await ethers.getSigner(RICH_ACCOUNT);

  // Fund each address with each token
  for (const address of addresses) {
    console.log(`\nFunding ${address}...`);

    for (const [symbol, tokenAddress] of Object.entries(TOKENS)) {
      const token = new ethers.Contract(tokenAddress, ERC20ABI, signer);
      const decimals = await token.decimals();
      const amount = parseUnits("1000", Number(decimals)); // Parse 1000 tokens with proper decimals

      try {
        const tx = await token.transfer(address, Number(amount));
        await tx.wait();
        console.log(`✓ Sent 1000 ${symbol}`);
      } catch (error) {
        console.error(`✗ Failed to send ${symbol}:`, error);
      }
    }

    await signer.sendTransaction({
      to: address,
      value: parseEther("1.0"),
    });
    console.log(`✓ Sent 1 ETH`);
  }

  // Stop impersonating
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [RICH_ACCOUNT]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
