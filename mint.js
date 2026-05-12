require("dotenv").config();
const { ethers } = require("ethers");
const cron = require("node-cron");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const SEADROP = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";
const NFT_CONTRACT = "0x31bbc8Af58717059A356fdeF3d4B04160906FEB1";
const FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719";
const MINT_PRICE_ETH = 0.0025;

const ABI = [
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable"
];

const contract = new ethers.Contract(SEADROP, ABI, wallet);

(async () => {
  console.log("Wallet:", wallet.address);

  const balance = await provider.getBalance(wallet.address);

  console.log(
    "Balance:",
    ethers.formatEther(balance),
    "ETH"
  );
})();

let minted = 0;
let START_TIME = null;
const MAX_MINT = 2;
const TIME_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

async function sendTx(quantity, nonce) {
  const feeData = await provider.getFeeData();
  const tx = await contract.mintPublic(
    NFT_CONTRACT,
    FEE_RECIPIENT,
    ethers.ZeroAddress,
    quantity,
    {
      value: ethers.parseEther((MINT_PRICE_ETH * quantity).toFixed(6)),
      gasLimit: 250000,
      maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 5n : undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 5n : undefined,
      nonce: nonce,
    }
  );
  return tx;
}

async function blastMint() {
  // Stop if time limit reached
  if (START_TIME && Date.now() - START_TIME > TIME_LIMIT_MS) {
    console.log("⏰ 10 min limit reached — stopping!");
    console.log(`📊 Final: ${minted}/${MAX_MINT} minted`);
    process.exit(0);
    return;
  }

  // Stop if already minted max
  if (minted >= MAX_MINT) {
    console.log(`🏆 Done! Got all ${minted}/${MAX_MINT} NFTs!`);
    process.exit(0);
    return;
  }

  try {
    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    const remaining = MAX_MINT - minted;
    console.log(`🚀 Need ${remaining} more NFT(s). Nonce: ${nonce}`);

    if (remaining === 2) {
      // Try to mint 1st NFT
      console.log("🥇 Sending TX1 (1st NFT)...");
      const tx1 = await sendTx(1, nonce);
      console.log("✅ TX1 sent:", tx1.hash);

      const receipt1 = await tx1.wait();
      if (receipt1) {
        minted += 1;
        console.log(`🎉 1st NFT MINTED! (${minted}/${MAX_MINT})`);
        console.log("🔗 https://etherscan.io/tx/" + tx1.hash);
      }

      // Always retry — will handle 2nd NFT on next call
      console.log("🔄 Going for 2nd NFT in 2s...");
      setTimeout(blastMint, 2000);

    } else if (remaining === 1) {
      // Only 2nd NFT left
      console.log("🥈 Sending TX2 (2nd NFT)...");
      const tx2 = await sendTx(1, nonce);
      console.log("✅ TX2 sent:", tx2.hash);

      const receipt2 = await tx2.wait();
      if (receipt2) {
        minted += 1;
        console.log(`🎉 2nd NFT MINTED! (${minted}/${MAX_MINT})`);
        console.log("🔗 https://etherscan.io/tx/" + tx2.hash);
      }

      if (minted >= MAX_MINT) {
        console.log("🏆 DONE! Got both NFTs!");
        process.exit(0);
      } else {
        // 2nd mint failed, retry
        console.log("🔄 Retrying 2nd NFT in 2s...");
        setTimeout(blastMint, 2000);
      }
    }

  } catch (err) {
    console.error("❌ Failed:", err.message);
    console.log("🔄 Retrying in 2s...");
    setTimeout(blastMint, 2000);
  }
}

// May 13 10:00 PM GMT+5 = 17:00 UTC
// Fire 20 seconds early
cron.schedule("40 59 16 13 5 *", () => {
  console.log("⏰ TIME TO MINT!");
  START_TIME = Date.now();
  blastMint();
}, { timezone: "UTC" });

console.log("✅ Bot armed — The Florentines");
console.log("🕐 Fires: May 13 at 16:59:40 UTC (9:59:40PM GMT+5)");
console.log("💰 Minting 2 NFTs at 0.0025 ETH each");
console.log("⛓️  Ethereum Mainnet via SeaDrop");
console.log("🥇 Mints 1st first, then 2nd if successful");
console.log("⛽ Gas: 5x current network price");
console.log("🔁 Keeps retrying for 10 minutes max");
console.log("⏳ Waiting...");

process.stdin.resume();
