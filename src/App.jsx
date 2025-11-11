import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    launchpadUrl: '',
    contractAddress: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'high',
    customGasLimit: '400000',
    mintQuantity: '1'
  });
  
  const [mintPhases, setMintPhases] = useState({
    public: false,
    whitelist: false,
    allowlist: false,
  });
  
  const [advancedOptions, setAdvancedOptions] = useState({
    autoRetry: true,
    sniperMode: false,
    flashbots: false,
    maxPriorityFee: '2',
    maxFee: '30',
    simulateTx: true,
  });
  
  const [wallets, setWallets] = useState([]);
  const [scannedWallets, setScannedWallets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintStats, setMintStats] = useState({ success: 0, failed: 0, total: 0 });
  const [mintPrice, setMintPrice] = useState('0');
  const [estimatedGas, setEstimatedGas] = useState('0');
  const [detectedChain, setDetectedChain] = useState('');
  const [chainSymbol, setChainSymbol] = useState('ETH');
  const [contractABI, setContractABI] = useState(null);
  const [mintFunctionName, setMintFunctionName] = useState('');
  const [mintFunctionHasQuantity, setMintFunctionHasQuantity] = useState(false);
  const [mintFunctionParams, setMintFunctionParams] = useState([]);
  const [contractDetails, setContractDetails] = useState({});
  
  const logsEndRef = useRef(null);
  
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [logs]);
  
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };
  
  const parsePrivateKeys = (keys) => {
    return keys.split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0 && (k.startsWith('0x') || k.length === 64))
      .map(k => k.startsWith('0x') ? k : `0x${k}`)
      .slice(0, 10);
  };
  
  const extractContractAddress = (url) => {
    const match = url.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : url;
  };
  
  const detectChainFromRPC = async (rpcUrl) => {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      
      const chains = {
        1: { name: 'Ethereum Mainnet', symbol: 'ETH' },
        5: { name: 'Goerli Testnet', symbol: 'ETH' },
        11155111: { name: 'Sepolia Testnet', symbol: 'ETH' },
        137: { name: 'Polygon', symbol: 'MATIC' },
        80001: { name: 'Mumbai Testnet', symbol: 'MATIC' },
        42161: { name: 'Arbitrum One', symbol: 'ETH' },
        10: { name: 'Optimism', symbol: 'ETH' },
        8453: { name: 'Base', symbol: 'ETH' },
        43114: { name: 'Avalanche', symbol: 'AVAX' },
        56: { name: 'BSC', symbol: 'BNB' },
        33139: { name: 'APE Chain', symbol: 'APE' },
      };
      
      const chainInfo = chains[chainId] || { name: `Chain ID: ${chainId}`, symbol: 'ETH' };
      return { name: chainInfo.name, symbol: chainInfo.symbol, chainId };
    } catch (error) {
      addLog(`❌ Failed to detect chain: ${error.message}`, 'error');
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0 };
    }
  };
  
  const getContractABI = async (contractAddress, chainId) => {
    // Enhanced ABI with comprehensive mint functions
    const comprehensiveABI = [
      // Standard mint functions
      "function mint() external payable",
      "function mint(uint256 quantity) external payable",
      "function publicMint() external payable",
      "function publicMint(uint256 quantity) external payable",
      "function mintPublic() external payable",
      "function mintPublic(uint256 quantity) external payable",
      
      // Whitelist functions
      "function whitelistMint() external payable",
      "function whitelistMint(uint256 quantity) external payable",
      "function allowlistMint() external payable",
      "function allowlistMint(uint256 quantity) external payable",
      "function preSaleMint() external payable",
      "function preSaleMint(uint256 quantity) external payable",
      
      // Claim functions
      "function claim() external payable",
      "function claim(uint256 quantity) external payable",
      
      // Airdrop functions
      "function airdropMint() external payable",
      
      // Free mint functions
      "function freeMint() external",
      "function freeMint(uint256 quantity) external",
      
      // Price functions
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function publicPrice() public view returns (uint256)",
      "function getMintPrice() public view returns (uint256)",
      "function PRICE() public view returns (uint256)",
      
      // Sale status functions
      "function publicSale() public view returns (bool)",
      "function whitelistSale() public view returns (bool)",
      "function saleState() public view returns (uint256)",
      "function mintEnabled() public view returns (bool)",
      "function isPublicSaleActive() public view returns (bool)",
      
      // Balance functions
      "function balanceOf(address owner) public view returns (uint256)",
      
      // Total supply
      "function totalSupply() external view returns (uint256)",
      "function MAX_SUPPLY() public view returns (uint256)",
      "function maxSupply() public view returns (uint256)",
      
      // EIP-721 standard
      "function safeTransferFrom(address from, address to, uint256 tokenId) external",
      "function ownerOf(uint256 tokenId) external view returns (address)",
      "function approve(address to, uint256 tokenId) external",
      
      // Owner functions
      "function owner() public view returns (address)"
    ];
    
    // Try to fetch from blockchain explorer first
    const apiUrls = {
      1: 'https://api.etherscan.io/api',
      5: 'https://api-goerli.etherscan.io/api',
      11155111: 'https://api-sepolia.etherscan.io/api',
      137: 'https://api.polygonscan.com/api',
      80001: 'https://api-testnet.polygonscan.com/api',
      42161: 'https://api.arbiscan.io/api',
      10: 'https://api-optimistic.etherscan.io/api',
      8453: 'https://api.basescan.org/api',
      56: 'https://api.bscscan.com/api',
      33139: 'https://api.apescan.io/api',
    };
    
    const apiUrl = apiUrls[chainId];
    if (!apiUrl) {
      addLog(`ℹ️ Using comprehensive ABI for unknown chain`, 'info');
      return comprehensiveABI;
    }
    
    try {
      const response = await fetch(
        `${apiUrl}?module=contract&action=getabi&address=${contractAddress}`
      );
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        addLog(`✅ Fetched ABI from blockchain explorer`, 'success');
        const fetchedABI = JSON.parse(data.result);
        // Combine with our comprehensive ABI to ensure we have all common functions
        return [...fetchedABI, ...comprehensiveABI.filter(item => 
          !fetchedABI.some(fetched => fetched.name === item.name)
        )];
      } else {
        addLog(`ℹ️ Using comprehensive ABI (explorer not available)`, 'info');
        return comprehensiveABI;
      }
    } catch (error) {
      addLog(`ℹ️ Using comprehensive ABI: ${error.message}`, 'info');
      return comprehensiveABI;
    }
  };
  
  const detectMintFunction = (abi) => {
    const mintFunctions = abi.filter(item => 
      item.type === 'function' && 
      (item.name?.toLowerCase().includes('mint') || 
       item.name?.toLowerCase().includes('claim') ||
       item.name?.toLowerCase().includes('public') ||
       item.name?.toLowerCase().includes('airdrop'))
    );
    
    if (mintFunctions.length === 0) {
      addLog('❌ No mint functions found in ABI', 'error');
      return { name: 'mint', hasQuantity: false, params: [] };
    }
    
    addLog(`🔍 Found ${mintFunctions.length} potential mint functions`, 'info');
    
    // Priority order for mint functions (most common first)
    const priorityFunctions = [
      { name: 'mint', params: 0, payable: true },
      { name: 'publicMint', params: 0, payable: true },
      { name: 'mintPublic', params: 0, payable: true },
      { name: 'claim', params: 0, payable: true },
      { name: 'mint', params: 1, payable: true },
      { name: 'publicMint', params: 1, payable: true },
      { name: 'whitelistMint', params: 0, payable: true },
      { name: 'allowlistMint', params: 0, payable: true },
      { name: 'freeMint', params: 0, payable: false },
      { name: 'airdropMint', params: 0, payable: true },
    ];
    
    // Find the best matching function
    for (const priority of priorityFunctions) {
      const found = mintFunctions.find(f => 
        f.name === priority.name && 
        (!f.inputs || f.inputs.length === priority.params) &&
        (f.stateMutability === 'payable' || !priority.payable)
      );
      
      if (found) {
        addLog(`🎯 Selected mint function: ${found.name}(${'uint256 '.repeat(priority.params).trim()})`, 'success');
        return { 
          name: found.name, 
          hasQuantity: priority.params > 0, 
          params: priority.params > 0 ? [parseInt(config.mintQuantity)] : [] 
        };
      }
    }
    
    // Fallback to first payable mint function
    const fallback = mintFunctions.find(f => f.stateMutability === 'payable') || mintFunctions[0];
    if (fallback) {
      const hasQuantity = fallback.inputs && fallback.inputs.length > 0;
      addLog(`⚠️ Using fallback mint function: ${fallback.name}`, 'warning');
      return { 
        name: fallback.name, 
        hasQuantity: hasQuantity,
        params: hasQuantity ? [parseInt(config.mintQuantity)] : []
      };
    }
    
    addLog('❌ No suitable mint function found', 'error');
    return { name: 'mint', hasQuantity: false, params: [] };
  };
  
  const analyzeContract = async (provider, contractAddress, abi) => {
    try {
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const details = {};
      
      // Check sale status
      const saleCheckers = ['publicSale', 'isPublicSaleActive', 'mintEnabled', 'saleState'];
      for (const checker of saleCheckers) {
        try {
          if (contract[checker]) {
            const status = await contract[checker]();
            details.saleStatus = { checker, status: status.toString() };
            addLog(`📊 Sale status (${checker}): ${status}`, 'info');
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Get mint price
      const priceGetters = ['mintPrice', 'cost', 'price', 'publicPrice', 'getMintPrice', 'PRICE'];
      for (const getter of priceGetters) {
        try {
          if (contract[getter]) {
            const price = await contract[getter]();
            if (price && price.toString() !== '0') {
              details.mintPrice = ethers.formatEther(price);
              addLog(`💰 Mint Price: ${details.mintPrice} ${chainSymbol}`, 'success');
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Get supply info
      try {
        if (contract.totalSupply) {
          const totalSupply = await contract.totalSupply();
          details.totalSupply = totalSupply.toString();
          addLog(`📈 Total Supply: ${details.totalSupply}`, 'info');
        }
      } catch (e) {}
      
      try {
        if (contract.MAX_SUPPLY || contract.maxSupply) {
          const maxSupply = await (contract.MAX_SUPPLY ? contract.MAX_SUPPLY() : contract.maxSupply());
          details.maxSupply = maxSupply.toString();
          addLog(`📊 Max Supply: ${details.maxSupply}`, 'info');
        }
      } catch (e) {}
      
      setContractDetails(details);
      return details.mintPrice || '0';
      
    } catch (error) {
      addLog(`⚠️ Contract analysis failed: ${error.message}`, 'warning');
      return '0';
    }
  };
  
  const simulateTransaction = async (wallet, contract, functionName, params, value, gasPrice) => {
    if (!advancedOptions.simulateTx) return true;
    
    try {
      addLog(`🔍 Simulating transaction...`, 'info');
      
      // Use callStatic to simulate the transaction
      const callParams = params.length > 0 ? [...params, { value }] : [{ value }];
      
      if (params.length > 0) {
        await contract.callStatic[functionName](...params, { value });
      } else {
        await contract.callStatic[functionName]({ value });
      }
      
      addLog(`✅ Simulation successful`, 'success');
      return true;
    } catch (error) {
      addLog(`❌ Simulation failed: ${error.message}`, 'error');
      return false;
    }
  };
  
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
      addLog('❌ No valid private keys found', 'error');
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
      addLog(`🔗 Chain: ${chainInfo.name} (${chainSymbol})`, 'info');
      
      addLog('📄 Fetching contract ABI...', 'info');
      const abi = await getContractABI(contractAddr, chainInfo.chainId);
      setContractABI(abi);
      
      addLog('🔍 Analyzing contract...', 'info');
      const price = await analyzeContract(provider, contractAddr, abi);
      setMintPrice(price);
      
      const mintFunc = detectMintFunction(abi);
      setMintFunctionName(mintFunc.name);
      setMintFunctionHasQuantity(mintFunc.hasQuantity);
      setMintFunctionParams(mintFunc.params);
      
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
            if (hasMinted) {
              addLog(`ℹ️ Wallet already has ${nftBalance} NFT(s)`, 'info');
            }
          } catch (e) {
            hasMinted = false;
          }
          
          // Estimate gas with better error handling
          let gasEstimate = '0.01';
          try {
            const value = ethers.parseEther(price || '0');
            let gasLimit;
            
            // Use specific function to avoid ambiguity
            if (mintFunc.hasQuantity) {
              const specificFunction = contract.getFunction(`${mintFunc.name}(uint256)`);
              gasLimit = await specificFunction.estimateGas(1, { value });
            } else {
              const specificFunction = contract.getFunction(`${mintFunc.name}()`);
              gasLimit = await specificFunction.estimateGas({ value });
            }
            
            const feeData = await provider.getFeeData();
            const gasCost = gasLimit * (feeData.gasPrice || feeData.maxFeePerGas || BigInt(30000000000));
            gasEstimate = ethers.formatEther(gasCost);
            addLog(`⛽ Gas estimate: ${gasEstimate} ${chainSymbol}`, 'info');
          } catch (e) {
            addLog(`⚠️ Gas estimation failed, using default`, 'warning');
          }
          
          scanned.push({
            address,
            privateKey: key,
            balance,
            hasMinted,
            eligiblePhases: {
              public: true,
              whitelist: false,
              allowlist: false,
            },
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
      setEstimatedGas(scanned[0]?.gasEstimate || '0.01');
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) ready`, 'success');
      
      if (scanned.length > 0) {
        setMintPhases({ ...mintPhases, public: true });
      }
      
    } catch (error) {
      addLog(`❌ Scan failed: ${error.message}`, 'error');
    }
    
    setIsScanning(false);
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
    
    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Starting mint process...', 'info');
    
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
      
      // Skip checks
      if (walletInfo.hasMinted) {
        walletInfo.status = 'skipped';
        walletInfo.error = 'Already minted';
        setWallets([...updatedWallets]);
        addLog(`⏭️ Skipped: Already minted`, 'warning');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        continue;
      }
      
      let mintSuccess = false;
      let retryCount = 0;
      let txHash = null;
      let lastError = null;
      
      while (!mintSuccess && retryCount <= (advancedOptions.autoRetry ? 3 : 0)) {
        if (retryCount > 0) {
          addLog(`🔄 Retry attempt ${retryCount}/3...`, 'warning');
        }
        
        try {
          const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
          const contract = new ethers.Contract(contractAddr, contractABI, wallet);
          
          const feeData = await provider.getFeeData();
          let gasPrice = feeData.gasPrice || feeData.maxFeePerGas || BigInt(30000000000);
          
          // Apply gas level multiplier
          if (config.gasLevel === 'high') {
            gasPrice = (gasPrice * 150n) / 100n;
          } else if (config.gasLevel === 'low') {
            gasPrice = (gasPrice * 80n) / 100n;
          }
          
          addLog(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
          
          const mintValue = ethers.parseEther(mintPrice || '0');
          const gasLimit = parseInt(config.customGasLimit) || 400000;
          
          addLog(`📤 Sending transaction with ${gasLimit} gas limit...`, 'info');
          
          let tx;
          let usedFunction = mintFunctionName;
          let usedParams = mintFunctionParams;
          
          try {
            // Try simulation first
            const canSimulate = await simulateTransaction(
              wallet, contract, mintFunctionName, mintFunctionParams, mintValue, gasPrice
            );
            
            if (!canSimulate && advancedOptions.simulateTx) {
              throw new Error('Transaction simulation failed');
            }
            
            // Execute transaction
            if (mintFunctionHasQuantity) {
              const specificFunction = contract.getFunction(`${mintFunctionName}(uint256)`);
              tx = await specificFunction(parseInt(config.mintQuantity), {
                value: mintValue,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
              });
            } else {
              const specificFunction = contract.getFunction(`${mintFunctionName}()`);
              tx = await specificFunction({
                value: mintValue,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
              });
            }
          } catch (txError) {
            addLog(`⚠️ Primary method failed, trying alternatives...`, 'warning');
            lastError = txError;
            
            // Try alternative mint functions with different approaches
            const alternativeFunctions = [
              { name: 'mint', params: [], payable: true },
              { name: 'mint', params: [parseInt(config.mintQuantity)], payable: true },
              { name: 'publicMint', params: [], payable: true },
              { name: 'publicMint', params: [parseInt(config.mintQuantity)], payable: true },
              { name: 'mintPublic', params: [], payable: true },
              { name: 'claim', params: [], payable: true },
              { name: 'freeMint', params: [], payable: false },
            ];
            
            let alternativeSuccess = false;
            for (const alt of alternativeFunctions) {
              try {
                if (contract[alt.name]) {
                  addLog(`Trying ${alt.name}(${alt.params.join(',')})...`, 'info');
                  
                  const txConfig = {
                    gasPrice: gasPrice,
                    gasLimit: gasLimit,
                  };
                  
                  if (alt.payable) {
                    txConfig.value = mintValue;
                  }
                  
                  if (alt.params.length === 0) {
                    tx = await contract[alt.name](txConfig);
                  } else {
                    tx = await contract[alt.name](...alt.params, txConfig);
                  }
                  
                  usedFunction = alt.name;
                  usedParams = alt.params;
                  alternativeSuccess = true;
                  addLog(`✅ Alternative function ${alt.name} worked!`, 'success');
                  break;
                }
              } catch (e) {
                continue;
              }
            }
            
            if (!alternativeSuccess) {
              throw new Error(`All mint methods failed. Possible reasons: sale not active, not whitelisted, or contract paused.`);
            }
          }
          
          addLog(`⏳ Waiting for confirmation... TX: ${tx.hash}`, 'info');
          txHash = tx.hash;
          
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            mintSuccess = true;
            addLog(`✅ Mint successful! TX: ${tx.hash}`, 'success');
            
            // Verify NFT was minted
            try {
              const nftBalance = await contract.balanceOf(walletInfo.address);
              const newBalance = Number(nftBalance);
              addLog(`🎉 Verified: Wallet now has ${newBalance} NFT(s)`, 'success');
            } catch (e) {
              addLog(`ℹ️ Could not verify NFT balance: ${e.message}`, 'info');
            }
          } else {
            throw new Error('Transaction reverted by contract');
          }
          
        } catch (error) {
          lastError = error;
          addLog(`❌ Mint attempt ${retryCount + 1} failed: ${error.message}`, 'error');
          retryCount++;
          
          if (retryCount > (advancedOptions.autoRetry ? 3 : 0)) {
            break;
          }
          
          // Wait before retry
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
        walletInfo.error = lastError?.message || 'Transaction failed after retries';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        
        // Provide specific error guidance
        if (lastError?.message.includes('sale not active')) {
          addLog(`💡 Tip: The sale may not be active yet or may require whitelist`, 'info');
        } else if (lastError?.message.includes('whitelist')) {
          addLog(`💡 Tip: Wallet may not be whitelisted for this sale`, 'info');
        }
      }
      
      setWallets([...updatedWallets]);
      
      // Wait between wallets to avoid rate limiting
      if (i < updatedWallets.length - 1) {
        addLog(`⏳ Waiting 2 seconds before next wallet...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    setIsMinting(false);
    addLog('🎉 Minting process completed!', 'success');
    addLog(`📊 Results: ${successCount} success, ${failedCount} failed out of ${updatedWallets.length}`, 'info');
  };
  
  const clearAll = () => {
    setConfig({
      launchpadUrl: '',
      contractAddress: '',
      rpcUrl: '',
      privateKeys: '',
      gasLevel: 'high',
      customGasLimit: '400000',
      mintQuantity: '1'
    });
    setWallets([]);
    setScannedWallets([]);
    setLogs([]);
    setMintStats({ success: 0, failed: 0, total: 0 });
    setMintPrice('0');
    setEstimatedGas('0');
    setDetectedChain('');
    setChainSymbol('ETH');
    setMintPhases({ public: false, whitelist: false, allowlist: false });
    setAdvancedOptions({ 
      autoRetry: true, 
      sniperMode: false, 
      flashbots: false, 
      maxPriorityFee: '2', 
      maxFee: '30',
      simulateTx: true 
    });
    setContractABI(null);
    setMintFunctionName('');
    setMintFunctionHasQuantity(false);
    setMintFunctionParams([]);
    setContractDetails({});
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'waiting':
      case 'ready':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'minting':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
      case 'already_minted':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const getStatusText = (wallet) => {
    switch (wallet.status) {
      case 'waiting':
      case 'ready':
        return 'Ready';
      case 'minting':
        return 'Minting...';
      case 'success':
        return wallet.txHash ? `Success: ${wallet.txHash.slice(0, 10)}...` : 'Success';
      case 'failed':
        return wallet.error || 'Failed';
      case 'skipped':
        return wallet.error || 'Skipped';
      case 'already_minted':
        return 'Already Minted';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-300" />
            <div>
              <h1 className="text-3xl font-bold text-white">OpenSea Auto Mint Bot</h1>
              <p className="text-purple-100 text-sm">Production-ready NFT minting for multiple wallets</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>Security Warning:</strong> Private keys are stored only in memory and never saved. Always verify contract addresses before minting. This is a real minting tool - transactions are irreversible!
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📝</span> Configuration
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    OpenSea Link / Contract Address
                  </label>
                  <input
                    type="text"
                    value={config.launchpadUrl}
                    onChange={(e) => setConfig({ ...config, launchpadUrl: e.target.value, contractAddress: extractContractAddress(e.target.value) })}
                    placeholder="https://opensea.io/... or 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {config.contractAddress && (
                    <p className="text-xs text-green-400 mt-1">
                      Detected contract: {config.contractAddress}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    RPC URL {detectedChain && <span className="text-purple-400">({detectedChain})</span>}
                  </label>
                  <input
                    type="text"
                    value={config.rpcUrl}
                    onChange={(e) => setConfig({ ...config, rpcUrl: e.target.value })}
                    placeholder="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Private Keys (max 10, one per line)
                  </label>
                  <textarea
                    value={config.privateKeys}
                    onChange={(e) => setConfig({ ...config, privateKeys: e.target.value })}
                    placeholder="0xabc123...&#10;0xdef456...&#10;0xghi789..."
                    rows={4}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {parsePrivateKeys(config.privateKeys).length}/10 valid wallets
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gas Level</label>
                    <select
                      value={config.gasLevel}
                      onChange={(e) => setConfig({ ...config, gasLevel: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="low">Low (-20%)</option>
                      <option value="normal">Normal</option>
                      <option value="high">High (+50%)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gas Limit</label>
                    <input
                      type="text"
                      value={config.customGasLimit}
                      onChange={(e) => setConfig({ ...config, customGasLimit: e.target.value })}
                      placeholder="400000"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Quantity</label>
                    <input
                      type="number"
                      value={config.mintQuantity}
                      onChange={(e) => setConfig({ ...config, mintQuantity: e.target.value })}
                      placeholder="1"
                      min="1"
                      max="10"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1"></div>
                  <div className="flex items-end">
                    <button
                      onClick={scanWallets}
                      disabled={isScanning || isMinting}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all disabled:cursor-not-allowed"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Scan className="w-4 h-4" />
                          Scan Wallets
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {scannedWallets.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Mint Phase Selection
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mintPhases.public}
                        onChange={(e) => setMintPhases({ ...mintPhases, public: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-white">Public Mint</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mintPhases.whitelist}
                        onChange={(e) => setMintPhases({ ...mintPhases, whitelist: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-white">Whitelist Mint</span>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mintPhases.allowlist}
                        onChange={(e) => setMintPhases({ ...mintPhases, allowlist: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-white">Allowlist Mint</span>
                    </label>
                  </div>
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Advanced Options
                </label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancedOptions.autoRetry}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, autoRetry: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Auto-retry (3x)</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancedOptions.simulateTx}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, simulateTx: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Simulate TX</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancedOptions.sniperMode}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, sniperMode: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Sniper Mode</span>
                  </label>
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={startMinting}
                  disabled={isMinting || wallets.length === 0}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Minting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Start Auto Mint
                    </>
                  )}
                </button>
                
                <button
                  onClick={clearAll}
                  disabled={isMinting || isScanning}
                  className="px-6 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 text-white py-3 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
            </div>
            
            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">📊</span> Wallet Status ({wallets.length} wallets)
                </h2>
                
                <div className="space-y-2">
                  {wallets.map((wallet, idx) => (
                    <div key={idx} className="bg-slate-700/30 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(wallet.status)}
                        <div className="flex-1">
                          <p className="text-white font-mono text-sm">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </p>
                          <p className="text-gray-400 text-xs">Balance: {wallet.balance} {chainSymbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          wallet.status === 'success' ? 'text-green-400' :
                          wallet.status === 'failed' ? 'text-red-400' :
                          wallet.status === 'minting' ? 'text-blue-400' :
                          wallet.status === 'skipped' ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}>
                          {getStatusText(wallet)}
                        </p>
                        {wallet.txHash && (
                          <a
                            href={`https://etherscan.io/tx/${wallet.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {mintStats.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{mintStats.success}</p>
                      <p className="text-xs text-gray-400">Success</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{mintStats.failed}</p>
                      <p className="text-xs text-gray-400">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-400">{mintStats.total}</p>
                      <p className="text-xs text-gray-400">Total</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="space-y-6">
            {scannedWallets.length > 0 && (
              <>
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-2xl">💰</span> Mint Info
                  </h2>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Mint Price:</span>
                      <span className="text-white font-semibold">{mintPrice} {chainSymbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Est. Gas:</span>
                      <span className="text-white font-semibold">{estimatedGas} {chainSymbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Quantity:</span>
                      <span className="text-white font-semibold">{config.mintQuantity}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-700">
                      <span className="text-gray-400">Total Cost:</span>
                      <span className="text-purple-400 font-bold">
                        {(parseFloat(mintPrice) + parseFloat(estimatedGas)).toFixed(4)} {chainSymbol}
                      </span>
                    </div>
                    {detectedChain && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Chain:</span>
                        <span className="text-white font-semibold">{detectedChain}</span>
                      </div>
                    )}
                    {mintFunctionName && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Mint Function:</span>
                        <span className="text-white font-mono text-sm">
                          {mintFunctionName}({mintFunctionHasQuantity ? 'uint256' : ''})
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {Object.keys(contractDetails).length > 0 && (
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="text-2xl">📋</span> Contract Details
                    </h2>
                    
                    <div className="space-y-3">
                      {contractDetails.saleStatus && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Sale Status:</span>
                          <span className={`font-semibold ${
                            contractDetails.saleStatus.status === 'true' || contractDetails.saleStatus.status === '1' 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`}>
                            {contractDetails.saleStatus.status === 'true' || contractDetails.saleStatus.status === '1' ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      )}
                      {contractDetails.totalSupply && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Total Supply:</span>
                          <span className="text-white font-semibold">{contractDetails.totalSupply}</span>
                        </div>
                      )}
                      {contractDetails.maxSupply && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Max Supply:</span>
                          <span className="text-white font-semibold">{contractDetails.maxSupply}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📜</span> Live Logs
              </h2>
              
              <div className="bg-slate-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No logs yet. Start by scanning wallets.</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-gray-500 flex-shrink-0">[{log.timestamp}]</span>
                        <span className={
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'success' ? 'text-green-400' :
                          log.type === 'warning' ? 'text-yellow-400' :
                          'text-gray-300'
                        }>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center text-gray-400 text-sm pb-4">
          <p>⚠️ This is a real minting tool. Transactions are irreversible. Use at your own risk.</p>
          <p className="mt-1">Always verify contract addresses and test with small amounts first.</p>
          <p className="mt-2">Made with 💜 for the NFT community</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
