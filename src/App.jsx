// Dalam startMinting function, tambahkan enhanced error handling:
let mintSuccess = false;
let retryCount = 0;
let txHash = null;
const maxRetries = advancedOptions.autoRetry ? 3 : 0;

while (!mintSuccess && retryCount <= maxRetries) {
  if (retryCount > 0) {
    addLog(`🔄 Retry ${retryCount}/${maxRetries}...`, 'warning');
    await randomDelay(2000, 5000); // Increased delay for retries
  }
  
  try {
    // Cek ulang balance sebelum setiap percobaan
    const currentBalance = await provider.getBalance(walletInfo.address);
    const currentBalanceEth = ethers.formatEther(currentBalance);
    
    const totalCost = (parseFloat(collectionInfo.price) * config.mintQuantity) + parseFloat(walletInfo.gasEstimate);
    
    if (parseFloat(currentBalanceEth) < totalCost) {
      throw new Error(`Insufficient balance: need ${totalCost}, have ${currentBalanceEth}`);
    }
    
    txHash = await executeMint(walletInfo, provider);
    mintSuccess = true;
    addLog(`✅ SUCCESS! TX: ${txHash}`, 'success');
    
  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    
    // Categorize errors for better messaging
    if (errorMsg.includes('insufficient funds')) {
      addLog(`❌ Insufficient funds: ${errorMsg}`, 'error');
      break;
    } else if (errorMsg.includes('already minted')) {
      addLog(`❌ Already minted: ${errorMsg}`, 'warning');
      walletInfo.hasMinted = true;
      break;
    } else if (errorMsg.includes('not started') || errorMsg.includes('paused')) {
      addLog(`❌ Mint not active: ${errorMsg}`, 'error');
      break;
    } else if (errorMsg.includes('max supply') || errorMsg.includes('sold out')) {
      addLog(`❌ Supply limit: ${errorMsg}`, 'error');
      break;
    } else {
      addLog(`❌ Attempt ${retryCount + 1} failed: ${errorMsg}`, 'error');
      retryCount++;
    }
  }
}
