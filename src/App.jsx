import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    launchpadUrl: '',
    contractAddress: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'normal',
  });
  
  const [mintPhases, setMintPhases] = useState({
    public: false,
    whitelist: false,
    allowlist: false,
  });
  
  const [advancedOptions, setAdvancedOptions] = useState({
    autoRetry: false,
    sniperMode: false,
    flashbots: false,
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
      .filter(k => k.length > 0 && k.startsWith('0x'))
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
    const apiKeys = {
      1: 'YourEtherscanAPIKey',
      137: 'YourPolygonscanAPIKey',
    };
    
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
      33139: 'https://apescan.io/api',
    };
    
    const apiUrl = apiUrls[chainId];
    if (!apiUrl) {
      return [
        "function mint() public payable",
        "function mint(uint256) public payable",
        "function mint(uint256,uint256) public payable",
        "function publicMint() public payable",
        "function publicMint(uint256) public payable",
        "function safeMint(address) public payable",
        "function safeMint(address,uint256) public payable",
        "function claim() public payable",
        "function claim(uint256) public payable",
        "function purchase(uint256) public payable",
        "function buy(uint256) public payable",
        "function mintNFT() public payable",
        "function mintNFT(uint256) public payable",
        "function whitelistMint() public payable",
        "function whitelistMint(uint256) public payable",
        "function allowlistMint() public payable",
        "function allowlistMint(uint256) public payable",
        "function mintPrice() public view returns (uint256)",
        "function cost() public view returns (uint256)",
        "function price() public view returns (uint256)",
        "function getPrice() public view returns (uint256)",
        "function totalSupply() public view returns (uint256)",
        "function maxSupply() public view returns (uint256)",
        "function balanceOf(address) public view returns (uint256)",
        "function paused() public view returns (bool)",
        "function publicSaleActive() public view returns (bool)",
        "function saleIsActive() public view returns (bool)"
      ];
    }
    
    try {
      const response = await fetch(
        `${apiUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKeys[chainId] || ''}`
      );
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        addLog(`✅ Successfully fetched verified contract ABI`, 'success');
        return JSON.parse(data.result);
      }
    } catch (error) {
      addLog(`⚠️ Could not fetch ABI from explorer, using comprehensive generic ABI`, 'warning');
    }
    
    return [
      "function mint() public payable",
      "function mint(uint256) public payable",
      "function mint(uint256,uint256) public payable",
      "function publicMint() public payable",
      "function publicMint(uint256) public payable",
      "function safeMint(address) public payable",
      "function safeMint(address,uint256) public payable",
      "function claim() public payable",
      "function claim(uint256) public payable",
      "function purchase(uint256) public payable",
      "function buy(uint256) public payable",
      "function mintNFT() public payable",
      "function mintNFT(uint256) public payable",
      "function whitelistMint() public payable",
      "function whitelistMint(uint256) public payable",
      "function allowlistMint() public payable",
      "function allowlistMint(uint256) public payable",
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function getPrice() public view returns (uint256)",
      "function totalSupply() public view returns (uint256)",
      "function maxSupply() public view returns (uint256)",
      "function balanceOf(address) public view returns (uint256)",
      "function paused() public view returns (bool)",
      "function publicSaleActive() public view returns (bool)",
      "function saleIsActive() public view returns (bool)"
    ];

    }
    
    try {
      const response = await fetch(
        `${apiUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKeys[chainId] || ''}`
      );
      const data = await response.json();
      
      if (data.status === '1' && data.result) {
        return JSON.parse(data.result);
      }
    } catch (error) {
      addLog(`⚠️ Could not fetch ABI, using generic ERC721 ABI`, 'warning');
    }
    
    return [
      "function mint() public payable",
      "function publicMint() public payable",
      "function mint(uint256 quantity) public payable",
      "function publicMint(uint256 quantity) public payable",
      "function whitelistMint() public payable",
      "function allowlistMint() public payable",
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function balanceOf(address owner) public view returns (uint256)"
    ];
  };
  
  const detectMintFunction = (abi) => {
    const mintFunctions = abi.filter(item => 
      item.type === 'function' && 
      (item.name?.toLowerCase().includes('mint') || item.name === 'claim')
    );
    
    const priorities = [
      { name: 'publicMint', params: 0 },
      { name: 'mint', params: 0 },
      { name: 'whitelistMint', params: 0 },
      { name: 'allowlistMint', params: 0 },
      { name: 'claim', params: 0 },
    ];
    
    for (const priority of priorities) {
      const found = mintFunctions.find(f => 
        f.name === priority.name && 
        (!f.inputs || f.inputs.length === priority.params)
      );
      if (found) return { name: found.name, hasQuantity: false };
    }
    
    const withQuantity = mintFunctions.find(f => 
      f.inputs && 
      f.inputs.length === 1 && 
      f.inputs[0].type === 'uint256'
    );
    
    if (withQuantity) {
      return { name: withQuantity.name, hasQuantity: true };
    }
    
    return { name: mintFunctions[0]?.name || 'mint', hasQuantity: false };
  };
  
  const getMintPrice = async (provider, contractAddress, abi) => {
    try {
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      const priceGetters = ['mintPrice', 'cost', 'price', 'getMintPrice'];
      
      for (const getter of priceGetters) {
        try {
          const price = await contract[getter]();
          return ethers.formatEther(price);
        } catch (e) {
          continue;
        }
      }
      
      return '0';
    } catch (error) {
      addLog(`⚠️ Could not fetch mint price, assuming free mint`, 'warning');
      return '0';
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
      setEstimatedGas(scanned[0]?.gasEstimate || '0.002');
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) scanned`, 'success');
      
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
          
          addLog(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
          
          const mintValue = ethers.parseEther(mintPrice);
          
          addLog(`📤 Sending transaction...`, 'info');
          
          let tx;
          try {
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
            addLog(`⚠️ Trying alternative mint method...`, 'warning');
            
            const mintVariations = [
              { fn: 'mint', params: [] },
              { fn: 'publicMint', params: [] },
              { fn: 'mint', params: [1] },
              { fn: 'publicMint', params: [1] },
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
  
  const clearAll = () => {
    setConfig({
      launchpadUrl: '',
      contractAddress: '',
      rpcUrl: '',
      privateKeys: '',
      gasLevel: 'normal',
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
    setAdvancedOptions({ autoRetry: false, sniperMode: false, flashbots: false });
    setContractABI(null);
    setMintFunctionName('');
    setMintFunctionHasQuantity(false);
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
  
  const getExplorerUrl = (chainId, txHash) => {
    const explorers = {
      1: 'https://etherscan.io',
      5: 'https://goerli.etherscan.io',
      11155111: 'https://sepolia.etherscan.io',
      137: 'https://polygonscan.com',
      80001: 'https://mumbai.polygonscan.com',
      42161: 'https://arbiscan.io',
      10: 'https://optimistic.etherscan.io',
      8453: 'https://basescan.org',
      56: 'https://bscscan.com',
      33139: 'https://apescan.io',
    };
    
    return `${explorers[chainId] || 'https://etherscan.io'}/tx/${txHash}`;
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
                  <p className="text-xs text-gray-400 mt-1">
                    Get free RPC from: Alchemy, Infura, QuickNode, or public RPCs
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Private Keys (max 10, one per line, must start with 0x)
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
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gas Level</label>
                    <select
                      value={config.gasLevel}
                      onChange={(e) => setConfig({ ...config, gasLevel: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="low">Low (Slower, -20%)</option>
                      <option value="normal">Normal (Recommended)</option>
                      <option value="high">High (Faster, +20%)</option>
                    </select>
                  </div>
                  
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
                          Scan Eligible
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
                  Advanced Options (Optional)
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
                      checked={advancedOptions.sniperMode}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, sniperMode: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Sniper Mode</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={advancedOptions.flashbots}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, flashbots: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Flashbots</span>
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
                      Start Mint
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
                            href={getExplorerUrl(1, wallet.txHash)}
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
