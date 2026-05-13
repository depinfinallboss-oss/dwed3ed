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

// Check wallet on startup
(async () => {
  console.log("👛 Wallet:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");
})();

let minted = 0;
let START_TIME = null;
let isBlasting = false;
const MAX_MINT = 2;
const TIME_LIMIT_MS = 10 * 60 * 1000;

async function sendTx(quantity, nonce) {
  const feeData = await provider.getFeeData();
  const tx = await contract.mintPublic(
    NFT_CONTRACT,
    FEE_RECIPIENT,
    wallet.address,
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
  if (START_TIME && Date.now() - START_TIME > TIME_LIMIT_MS) {
    console.log("⏰ 10 min limit reached — stopping!");
    console.log(`📊 Final: ${minted}/${MAX_MINT} minted`);
    process.exit(0);
    return;
  }

  if (minted >= MAX_MINT) {
    console.log(`🏆 Done! Got all ${minted}/${MAX_MINT} NFTs!`);
    process.exit(0);
    return;
  }

  try {
    // Use latest after blast failures to avoid stuck pending nonce
    const nonceType = isBlasting ? "latest" : "pending";
    const nonce = await provider.getTransactionCount(wallet.address, nonceType);
    const remaining = MAX_MINT - minted;
    console.log(`🚀 Need ${remaining} more. Nonce: ${nonce} (${nonceType})`);

    if (remaining === 2) {
      isBlasting = true;
      console.log("💥 Blasting TX1 + TX2 simultaneously!");

      // Use allSettled for sendTx too — prevents TX2 getting stuck
      const sendResults = await Promise.allSettled([
        sendTx(1, nonce),
        sendTx(1, nonce + 1),
      ]);

      const tx1Result = sendResults[0];
      const tx2Result = sendResults[1];

      // Only wait for txs that actually broadcast
      const waitPromises = [];
      if (tx1Result.status === "fulfilled") {
        console.log("✅ TX1 sent:", tx1Result.value.hash);
        waitPromises.push({ id: 1, promise: tx1Result.value.wait(), hash: tx1Result.value.hash });
      } else {
        console.log("❌ TX1 failed to broadcast:", tx1Result.reason?.message);
      }

      if (tx2Result.status === "fulfilled") {
        console.log("✅ TX2 sent:", tx2Result.value.hash);
        waitPromises.push({ id: 2, promise: tx2Result.value.wait(), hash: tx2Result.value.hash });
      } else {
        console.log("❌ TX2 failed to broadcast:", tx2Result.reason?.message);
      }

      // Wait for confirmations
      const receipts = await Promise.allSettled(waitPromises.map(w => w.promise));

      receipts.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value.status === 1) {
          minted += 1;
          console.log(`🎉 TX${waitPromises[i].id} MINTED! (${minted}/${MAX_MINT})`);
          console.log("🔗 https://etherscan.io/tx/" + waitPromises[i].hash);
        } else {
          console.log(`❌ TX${waitPromises[i].id} failed or reverted`);
        }
      });

      isBlasting = false;

      if (minted >= MAX_MINT) {
        console.log("🏆 DONE! Got both NFTs!");
        process.exit(0);
      } else {
        console.log(`🔄 Got ${minted}/${MAX_MINT} — retrying in 2s...`);
        setTimeout(blastMint, 2000);
      }

    } else if (remaining === 1) {
      isBlasting = false;
      console.log("🥈 Sending final TX...");
      const tx = await sendTx(1, nonce);
      console.log("✅ TX sent:", tx.hash);
      const receipt = await tx.wait();
      if (receipt && receipt.status === 1) {
        minted += 1;
        console.log(`🎉 MINTED! (${minted}/${MAX_MINT})`);
        console.log("🔗 https://etherscan.io/tx/" + tx.hash);
      } else {
        console.log("❌ TX failed or reverted");
      }
      if (minted >= MAX_MINT) {
        console.log("🏆 DONE! Got both NFTs!");
        process.exit(0);
      } else {
        console.log("🔄 Retrying in 2s...");
        setTimeout(blastMint, 2000);
      }
    }

  } catch (err) {
    isBlasting = false;
    console.error("❌ Failed:", err.message);
    console.log("🔄 Retrying in 2s...");
    setTimeout(blastMint, 2000);
  }
}

cron.schedule("40 59 16 13 5 *", () => {
  console.log("⏰ TIME TO MINT!");
  START_TIME = Date.now();
  blastMint();
}, { timezone: "UTC" });

console.log("✅ Bot armed — The Florentines");
console.log("🕐 Fires: May 13 at 16:59:40 UTC (9:59:40PM GMT+5)");
console.log("💰 Minting 2 NFTs at 0.0025 ETH each");
console.log("⛓️  Ethereum Mainnet via SeaDrop");
console.log("💥 Blasts both txs simultaneously!");
console.log("⛽ Gas: 5x current network price");
console.log("🔁 Keeps retrying for 10 minutes max");
console.log("⏳ Waiting...");

process.stdin.resume();

