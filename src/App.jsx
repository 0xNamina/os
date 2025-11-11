import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  // ... (kode state yang sama sampai scanWallets function)

  const scanWallets = async () => {
    if (!ethers) {
      addLog('❌ Ethers.js not loaded yet, please refresh page', 'error');
      return;
    }
    
    if (!config.rpcUrl || !config.privateKeys) {
      addLog('❌ Please fill RPC URL and Private Keys', 'error');
      return;
    }
    
    const contractAddr = config.contractAddress || extractContractAddress(config.launchpadUrl);
    if (!contractAddr || !contractAddr.startsWith('0x') || contractAddr.length !== 42) {
      addLog('❌ Invalid contract address', 'error');
      return;
    }
    
    setIsScanning(true);
    addLog('🔍 Starting wallet scan...', 'info');
    
    const keys = parsePrivateKeys(config.privateKeys);
    if (keys.length === 0) {
      addLog('❌ No valid private keys found (must start with 0x)', 'error');
      setIsScanning(false);
      return;
    }
    
    addLog(`📝 Found ${keys.length} wallet(s) to scan`, 'info');
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      addLog('🔗 Connected to RPC...', 'info');
      
      const chainInfo = await detectChainFromRPC(config.rpcUrl);
      setDetectedChain(chainInfo.name);
      setChainSymbol(chainInfo.symbol);
      addLog(`🔗 Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');
      
      addLog('📄 Fetching contract ABI...', 'info');
      const abi = await getContractABI(contractAddr, chainInfo.chainId);
      setContractABI(abi);
      
      // Enhanced mint function detection for OpenSea Launchpad
      const mintFunc = detectMintFunction(abi);
      setMintFunctionName(mintFunc.name);
      setMintFunctionHasQuantity(mintFunc.hasQuantity);
      addLog(`🎯 Detected mint function: ${mintFunc.name}(${mintFunc.hasQuantity ? 'uint256 quantity' : ''})`, 'info');
      
      addLog('💰 Fetching mint price...', 'info');
      const price = await getMintPrice(provider, contractAddr, abi);
      setMintPrice(price);
      addLog(`💰 Mint Price: ${price} ${chainInfo.symbol}`, 'info');
      
      const contract = new ethers.Contract(contractAddr, abi, provider);
      const scanned = [];
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        
        try {
          const wallet = new ethers.Wallet(key, provider);
          const address = wallet.address;
          
          addLog(`Scanning wallet ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');
          
          const balanceWei = await provider.getBalance(address);
          const balance = ethers.formatEther(balanceWei);
          
          let hasMinted = false;
          try {
            const nftBalance = await contract.balanceOf(address);
            hasMinted = Number(nftBalance) > 0;
          } catch (e) {
            hasMinted = false;
          }
          
          // Check eligibility for different mint phases
          const eligiblePhases = {
            public: await checkPublicMintEligibility(contract, address),
            whitelist: await checkWhitelistEligibility(contract, address),
            allowlist: await checkAllowlistEligibility(contract, address),
          };
          
          let gasEstimate = '0.002';
          try {
            const estimateParams = { 
              value: ethers.parseEther(price),
              from: address 
            };
            
            const gasLimit = mintFunc.hasQuantity 
              ? await contract[mintFunc.name].estimateGas(1, estimateParams)
              : await contract[mintFunc.name].estimateGas(estimateParams);
              
            const feeData = await provider.getFeeData();
            const gasCost = gasLimit * feeData.gasPrice;
            gasEstimate = ethers.formatEther(gasCost);
          } catch (e) {
            // Use default
          }
          
          scanned.push({
            address,
            privateKey: key,
            balance,
            hasMinted,
            eligiblePhases,
            status: hasMinted ? 'already_minted' : 'ready',
            gasEstimate,
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          addLog(`❌ Error scanning wallet ${i + 1}: ${error.message}`, 'error');
          continue;
        }
      }
      
      setScannedWallets(scanned);
      setWallets(scanned);
      setEstimatedGas(scanned[0]?.gasEstimate || '0.002');
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) scanned`, 'success');
      
      // Auto-enable available phases
      const availablePhases = {
        public: scanned.some(w => w.eligiblePhases.public),
        whitelist: scanned.some(w => w.eligiblePhases.whitelist),
        allowlist: scanned.some(w => w.eligiblePhases.allowlist),
      };
      
      setMintPhases(availablePhases);
      addLog(`🎯 Available phases: ${Object.keys(availablePhases).filter(k => availablePhases[k]).join(', ') || 'None'}`, 'info');
      
    } catch (error) {
      addLog(`❌ Scan failed: ${error.message}`, 'error');
    }
    
    setIsScanning(false);
  };

  // New functions for OpenSea Launchpad compatibility
  const checkPublicMintEligibility = async (contract, address) => {
    try {
      // Check if public mint is active
      const publicMintActive = await contract.publicMintActive?.() || 
                              await contract.isPublicMintActive?.() || 
                              await contract.mintStarted?.() || 
                              true; // Assume true if no method exists
      return publicMintActive;
    } catch (e) {
      return true; // Assume eligible if check fails
    }
  };

  const checkWhitelistEligibility = async (contract, address) => {
    try {
      // Check whitelist status
      const isWhitelisted = await contract.isWhitelisted?.(address) || 
                           await contract.whitelist?.(address) || 
                           await contract.whitelisted?.(address) ||
                           false;
      return isWhitelisted;
    } catch (e) {
      return false;
    }
  };

  const checkAllowlistEligibility = async (contract, address) => {
    try {
      // Check allowlist status
      const isAllowlisted = await contract.isAllowlisted?.(address) || 
                           await contract.allowlist?.(address) || 
                           await contract.allowlisted?.(address) ||
                           false;
      return isAllowlisted;
    } catch (e) {
      return false;
    }
  };

  const detectMintFunction = (abi) => {
    // Enhanced function detection for OpenSea Launchpad contracts
    const mintFunctions = abi.filter(item => 
      item.type === 'function' && 
      (item.name?.toLowerCase().includes('mint') || 
       item.name === 'claim' ||
       item.name?.toLowerCase().includes('purchase') ||
       item.name?.toLowerCase().includes('buy'))
    );
    
    // Priority order for OpenSea contracts
    const priorities = [
      { name: 'mint', params: 0 },
      { name: 'publicMint', params: 0 },
      { name: 'mintPublic', params: 0 },
      { name: 'claim', params: 0 },
      { name: 'purchase', params: 0 },
      { name: 'buy', params: 0 },
      { name: 'whitelistMint', params: 0 },
      { name: 'allowlistMint', params: 0 },
      { name: 'mintWhitelist', params: 0 },
      { name: 'mintAllowlist', params: 0 },
    ];
    
    for (const priority of priorities) {
      const found = mintFunctions.find(f => 
        f.name === priority.name && 
        (!f.inputs || f.inputs.length === priority.params)
      );
      if (found) return { name: found.name, hasQuantity: false };
    }
    
    // Check for quantity-based functions
    const withQuantity = mintFunctions.find(f => 
      f.inputs && 
      f.inputs.length === 1 && 
      f.inputs[0].type === 'uint256'
    );
    
    if (withQuantity) {
      return { name: withQuantity.name, hasQuantity: true };
    }
    
    // Check for OpenSea-specific mint functions
    const openSeaMint = mintFunctions.find(f => 
      f.inputs && 
      f.inputs.length >= 1 && 
      (f.name === 'mint' || f.name === 'publicMint')
    );
    
    if (openSeaMint) {
      return { name: openSeaMint.name, hasQuantity: openSeaMint.inputs.length === 1 };
    }
    
    return { name: mintFunctions[0]?.name || 'mint', hasQuantity: false };
  };

  const startMinting = async () => {
    if (!ethers) {
      addLog('❌ Ethers.js not loaded yet', 'error');
      return;
    }
    
    if (wallets.length === 0) {
      addLog('❌ Please scan wallets first', 'error');
      return;
    }
    
    const selectedPhases = Object.keys(mintPhases).filter(k => mintPhases[k]);
    if (selectedPhases.length === 0) {
      addLog('❌ Please select at least one mint phase', 'error');
      return;
    }
    
    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Starting mint process...', 'info');
    addLog(`📋 Selected phases: ${selectedPhases.join(', ')}`, 'info');
    
    const contractAddr = config.contractAddress || extractContractAddress(config.launchpadUrl);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const updatedWallets = [...wallets];
    
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < updatedWallets.length; i++) {
      const walletInfo = updatedWallets[i];
      
      walletInfo.status = 'minting';
      setWallets([...updatedWallets]);
      
      addLog(`🔄 Minting for wallet ${i + 1}/${updatedWallets.length}: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`, 'info');
      
      if (walletInfo.hasMinted) {
        walletInfo.status = 'skipped';
        walletInfo.error = 'Already minted';
        setWallets([...updatedWallets]);
        addLog(`⏭️ Skipped: Already minted`, 'warning');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      const totalCost = parseFloat(mintPrice) + parseFloat(walletInfo.gasEstimate);
      if (parseFloat(walletInfo.balance) < totalCost) {
        walletInfo.status = 'failed';
        walletInfo.error = 'Insufficient balance';
        setWallets([...updatedWallets]);
        addLog(`❌ Failed: Insufficient balance (need ${totalCost.toFixed(4)} ${chainSymbol}, have ${walletInfo.balance} ${chainSymbol})`, 'error');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Check phase eligibility
      const eligibleForSelectedPhase = selectedPhases.some(phase => walletInfo.eligiblePhases[phase]);
      if (!eligibleForSelectedPhase) {
        walletInfo.status = 'failed';
        walletInfo.error = 'Not eligible for selected phase';
        setWallets([...updatedWallets]);
        addLog(`❌ Failed: Wallet not eligible for selected mint phase`, 'error');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      let mintSuccess = false;
      let retryCount = 0;
      let txHash = null;
      
      while (!mintSuccess && retryCount <= (advancedOptions.autoRetry ? 3 : 0)) {
        if (retryCount > 0) {
          addLog(`🔄 Retry attempt ${retryCount}/3...`, 'warning');
        }
        
        try {
          const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
          const contract = new ethers.Contract(contractAddr, contractABI, wallet);
          
          const feeData = await provider.getFeeData();
          let gasPrice = feeData.gasPrice;
          
          if (config.gasLevel === 'high') {
            gasPrice = (gasPrice * 120n) / 100n;
          } else if (config.gasLevel === 'low') {
            gasPrice = (gasPrice * 80n) / 100n;
          }
          
          // Sniper mode: increase gas for faster confirmation
          if (advancedOptions.sniperMode) {
            gasPrice = (gasPrice * 150n) / 100n;
          }
          
          addLog(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
          
          const mintValue = ethers.parseEther(mintPrice);
          
          addLog(`📤 Sending transaction...`, 'info');
          
          let tx;
          try {
            // Try the detected mint function first
            if (mintFunctionHasQuantity) {
              const mintWithQuantity = contract.getFunction(`${mintFunctionName}(uint256)`);
              tx = await mintWithQuantity(1, {
                value: mintValue,
                gasPrice: gasPrice,
                gasLimit: 300000,
              });
            } else {
              const mintWithoutParams = contract.getFunction(`${mintFunctionName}()`);
              tx = await mintWithoutParams({
                value: mintValue,
                gasPrice: gasPrice,
                gasLimit: 300000,
              });
            }
          } catch (txError) {
            addLog(`⚠️ Trying alternative mint methods...`, 'warning');
            
            // Enhanced mint method variations for OpenSea Launchpad
            const mintVariations = [
              { fn: 'mint', params: [] },
              { fn: 'publicMint', params: [] },
              { fn: 'mintPublic', params: [] },
              { fn: 'claim', params: [] },
              { fn: 'purchase', params: [] },
              { fn: 'buy', params: [] },
              { fn: 'mint', params: [1] },
              { fn: 'publicMint', params: [1] },
              { fn: 'mintPublic', params: [1] },
              { fn: 'whitelistMint', params: [] },
              { fn: 'allowlistMint', params: [] },
            ];
            
            let success = false;
            for (const variation of mintVariations) {
              try {
                addLog(`Trying ${variation.fn}(${variation.params.join(',')})...`, 'info');
                
                if (variation.params.length === 0) {
                  tx = await contract[variation.fn]({
                    value: mintValue,
                    gasPrice: gasPrice,
                    gasLimit: 300000,
                  });
                } else {
                  tx = await contract[variation.fn](...variation.params, {
                    value: mintValue,
                    gasPrice: gasPrice,
                    gasLimit: 300000,
                  });
                }
                success = true;
                break;
              } catch (e) {
                continue;
              }
            }
            
            if (!success) {
              throw new Error('All mint methods failed. Contract may not be active or wallet not eligible.');
            }
          }
          
          addLog(`⏳ Waiting for confirmation... TX: ${tx.hash}`, 'info');
          
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            mintSuccess = true;
            txHash = receipt.hash;
            addLog(`✅ Success! TX: ${txHash}`, 'success');
          } else {
            throw new Error('Transaction failed');
          }
          
        } catch (error) {
          addLog(`❌ Mint attempt failed: ${error.message}`, 'error');
          retryCount++;
          
          if (retryCount > (advancedOptions.autoRetry ? 3 : 0)) {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (mintSuccess) {
        walletInfo.status = 'success';
        walletInfo.txHash = txHash;
        successCount++;
        setMintStats(prev => ({ ...prev, success: prev.success + 1 }));
      } else {
        walletInfo.status = 'failed';
        walletInfo.error = 'Transaction failed after retries';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
      
      setWallets([...updatedWallets]);
      
      if (i < updatedWallets.length - 1) {
        addLog(`⏳ Waiting 5 seconds before next wallet...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    setIsMinting(false);
    addLog('🎉 Minting process completed!', 'success');
    addLog(`📊 Results: ${successCount} success, ${failedCount} failed out of ${updatedWallets.length}`, 'info');
  };

  // ... (sisanya tetap sama)
};

export default OpenSeaAutoMint;
