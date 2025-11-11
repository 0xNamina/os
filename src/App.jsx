let tx;
          let success = false;
          let lastError = null;
          
          const mintVariations = [
            { fn: 'mint', params: [] },
            { fn: 'publicMint', params: [] },
            { fn: 'mint', params: [1] },
            { fn: 'publicMint', params: [1] },
            { fn: 'whitelistMint', params: [] },
            { fn: 'allowlistMint', params: [] },
            { fn: 'claim', params: [] },
          ];
          
          for (const variation of mintVariations) {
            try {
              addLog(`  Coba ${variation.fn}(${variation.params.length > 0 ? '...' : ''})...`, 'info');
              
              // Check if function exists and is callable
              if (typeof contract[variation.fn] !== 'function') {
                continue;
              }
              
              const txOptions = {
                value: mintValue,
                gasPrice: gasPrice,
                gasLimit: 800000,
              };
              
              let txData;
              if (variation.params.length === 0) {
                txData = await contract[variation.fn](txOptions);
              } else if (variation.params.length === 1) {
                txData = await contract[variation.fn](variation.params[0], txOptions);
              } else {
                txData = await contract[variation.fn](...variation.params, txOptions);
              }
              
              tx = txData;
              success = true;
              addLog(`  ✅ Transaksi dikirim dengan ${variation.fn}`, 'success');
              break;
            } catch (e) {
              lastError = e.message;
              continue;
            }
          }
          
          if (!success) {
            throw new Error(`Semua metode mint gagal. ${lastError ? 'Error: ' + lastError : 'Contract mungkin tidak aktif'}`);
          }  const getContractABI = async (contractAddress, chainId) => {
    const defaultABI = [
      {
        "type": "function",
        "name": "mint",
        "inputs": [],
        "outputs": [],
        "stateMutability": "payable"
      },
      {
        "type": "function",
        "name": "publicMint",
        "inputs": [],
        "outputs": [],
        "stateMutability": "payable"
      },
      {
        "type": "function",
        "name": "mint",
        "inputs": [{"type": "uint256", "name": "quantity"}],
        "outputs": [],
        "stateMutability": "payable"
      },
      {
        "type": "function",
        "name": "publicMint",
        "inputs": [{"type": "uint256", "name": "quantity"}],
        "outputs": [],
        "stateMutability": "payable"
      },
      {
        "type": "function",
        "name": "mintPrice",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
      },
      {
        "type": "function",
        "name": "cost",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
      },
      {
        "type": "function",
        "name": "price",
        "inputs": [],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
      },
      {
        "type": "function",
        "name": "balanceOf",
        "inputs": [{"type": "address", "name": "owner"}],
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view"
      }
    ];
    
    return defaultABI;
  };import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    launchpadUrl: '',
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
  const [allContracts, setAllContracts] = useState([]);
  const [selectedContractIdx, setSelectedContractIdx] = useState(0);
  const [showAdvancedABI, setShowAdvancedABI] = useState(false);
  const [manualABI, setManualABI] = useState('');
  const [manualMintFunction, setManualMintFunction] = useState('mint');
  
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
  
  const extractContractAddresses = (url) => {
    const addresses = url.match(/0x[a-fA-F0-9]{40}/g);
    return addresses ? [...new Set(addresses)] : [];
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
        250: { name: 'Fantom', symbol: 'FTM' },
        100: { name: 'Gnosis', symbol: 'xDAI' },
        2522: { name: 'Fraxtal', symbol: 'ETH' },
      };
      
      const chainInfo = chains[chainId] || { name: `Chain ID: ${chainId}`, symbol: 'ETH' };
      return { name: chainInfo.name, symbol: chainInfo.symbol, chainId };
    } catch (error) {
      addLog(`❌ Gagal deteksi chain: ${error.message}`, 'error');
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0 };
    }
  };
      
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
        250: { name: 'Fantom', symbol: 'FTM' },
        100: { name: 'Gnosis', symbol: 'xDAI' },
        2522: { name: 'Fraxtal', symbol: 'ETH' },
      };
      
      const chainInfo = chains[chainId] || { name: `Chain ID: ${chainId}`, symbol: 'ETH' };
      return { name: chainInfo.name, symbol: chainInfo.symbol, chainId };
    } catch (error) {
      addLog(`❌ Gagal deteksi chain: ${error.message}`, 'error');
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0 };
    }
  };
  
  const getContractABI = async (contractAddress, chainId) => {
    const defaultABI = [
      "function mint() public payable",
      "function publicMint() public payable",
      "function mint(uint256 quantity) public payable",
      "function publicMint(uint256 quantity) public payable",
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function balanceOf(address owner) public view returns (uint256)",
    ];
    
    return defaultABI;
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
      return '0';
    }
  };
  
  const scanWallets = async () => {
    if (!ethers) {
      addLog('❌ Ethers.js belum loaded', 'error');
      return;
    }
    
    if (!config.rpcUrl || !config.privateKeys) {
      addLog('❌ Isi RPC URL dan Private Keys', 'error');
      return;
    }
    
    const contractAddresses = extractContractAddresses(config.launchpadUrl);
    if (contractAddresses.length === 0) {
      addLog('❌ Tidak ada contract address valid', 'error');
      return;
    }
    
    setIsScanning(true);
    addLog('🔍 Memulai scan wallet...', 'info');
    addLog(`🔍 Ditemukan ${contractAddresses.length} contract`, 'info');
    
    const keys = parsePrivateKeys(config.privateKeys);
    if (keys.length === 0) {
      addLog('❌ Tidak ada private key valid', 'error');
      setIsScanning(false);
      return;
    }
    
    addLog(`🔍 Ditemukan ${keys.length} wallet(s)`, 'info');
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      addLog('🔗 Terhubung ke RPC...', 'info');
      
      const chainInfo = await detectChainFromRPC(config.rpcUrl);
      setDetectedChain(chainInfo.name);
      setChainSymbol(chainInfo.symbol);
      addLog(`🔗 Chain: ${chainInfo.name}`, 'info');
      
      const scannedContracts = [];
      
      for (const contractAddr of contractAddresses) {
        addLog(`📋 Scanning contract: ${contractAddr.slice(0, 10)}...`, 'info');
        
        try {
          const abi = await getContractABI(contractAddr, chainInfo.chainId);
          const mintFunc = detectMintFunction(abi);
          addLog(`🎯 Mint function: ${mintFunc.name}`, 'info');
          
          const price = await getMintPrice(provider, contractAddr, abi);
          addLog(`💰 Harga: ${price} ${chainInfo.symbol}`, 'info');
          
          const contract = new ethers.Contract(contractAddr, abi, provider);
          const contractScanned = [];
          
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            
              try {
                const wallet = new ethers.Wallet(key, provider);
                const address = wallet.address;
                
                addLog(`  Scan ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');
                
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
                
                contractScanned.push({
                  address,
                  privateKey: key,
                  balance,
                  hasMinted,
                  status: hasMinted ? 'already_minted' : 'ready',
                  gasEstimate,
                });
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
              } catch (error) {
                addLog(`  ❌ Error: ${error.message}`, 'error');
              }
          }
          
          scannedContracts.push({
            address: contractAddr,
            abi,
            mintFunction: mintFunc.name,
            mintFunctionHasQuantity: mintFunc.hasQuantity,
            price,
            wallets: contractScanned,
          });
          
        } catch (error) {
          addLog(`❌ Error scan contract: ${error.message}`, 'error');
        }
      }
      
      if (scannedContracts.length === 0) {
        addLog('❌ Tidak ada contract berhasil di-scan', 'error');
        setIsScanning(false);
        return;
      }
      
      setAllContracts(scannedContracts);
      setSelectedContractIdx(0);
      
      const firstContract = scannedContracts[0];
      setContractABI(firstContract.abi);
      setMintFunctionName(firstContract.mintFunction);
      setMintFunctionHasQuantity(firstContract.mintFunctionHasQuantity);
      setMintPrice(firstContract.price);
      setWallets(firstContract.wallets);
      setEstimatedGas(firstContract.wallets[0]?.gasEstimate || '0.002');
      
      addLog(`✅ Scan selesai!`, 'success');
      
      if (firstContract.wallets.length > 0) {
        setMintPhases({ ...mintPhases, public: true });
      }
      
    } catch (error) {
      addLog(`❌ Scan gagal: ${error.message}`, 'error');
    }
    
    setIsScanning(false);
  };
  
  const switchContract = (idx) => {
    setSelectedContractIdx(idx);
    const contract = allContracts[idx];
    setContractABI(contract.abi);
    setMintFunctionName(contract.mintFunction);
    setMintFunctionHasQuantity(contract.mintFunctionHasQuantity);
    setMintPrice(contract.price);
    setWallets(contract.wallets);
    setEstimatedGas(contract.wallets[0]?.gasEstimate || '0.002');
    addLog(`🔄 Beralih ke contract: ${contract.address.slice(0, 10)}...`, 'info');
  };
  
  const startMinting = async () => {
    if (!ethers) {
      addLog('❌ Ethers.js belum loaded', 'error');
      return;
    }
    
    if (wallets.length === 0) {
      addLog('❌ Scan wallet terlebih dahulu', 'error');
      return;
    }
    
    const selectedPhases = Object.keys(mintPhases).filter(k => mintPhases[k]);
    if (selectedPhases.length === 0) {
      addLog('❌ Pilih minimal 1 mint phase', 'error');
      return;
    }
    
    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Memulai mint...', 'info');
    
    const currentContract = allContracts[selectedContractIdx];
    const contractAddr = currentContract.address;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const updatedWallets = [...wallets];
    
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < updatedWallets.length; i++) {
      const walletInfo = updatedWallets[i];
      
      walletInfo.status = 'minting';
      setWallets([...updatedWallets]);
      
      addLog(`📄 Mint wallet ${i + 1}/${updatedWallets.length}: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`, 'info');
      
      if (walletInfo.hasMinted) {
        walletInfo.status = 'skipped';
        walletInfo.error = 'Sudah mint';
        setWallets([...updatedWallets]);
        addLog(`⭐️ Skip: Sudah mint`, 'warning');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      const totalCost = parseFloat(mintPrice) + parseFloat(walletInfo.gasEstimate);
      if (parseFloat(walletInfo.balance) < totalCost) {
        walletInfo.status = 'failed';
        walletInfo.error = 'Saldo tidak cukup';
        setWallets([...updatedWallets]);
        addLog(`❌ Gagal: Saldo tidak cukup`, 'error');
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
          addLog(`📄 Retry ${retryCount}/3...`, 'warning');
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
          
          const mintValue = ethers.parseEther(mintPrice);
          addLog(`📤 Kirim transaksi...`, 'info');
          
          const mintVariations = [
            { fn: 'mint', params: [] },
            { fn: 'publicMint', params: [] },
            { fn: 'mint', params: [1] },
            { fn: 'publicMint', params: [1] },
            { fn: 'whitelistMint', params: [] },
            { fn: 'allowlistMint', params: [] },
            { fn: 'claim', params: [] },
          ];
          
          let tx;
          let success = false;
          for (const variation of mintVariations) {
            try {
              addLog(`  Coba ${variation.fn}(${variation.params.join(',')})...`, 'info');
              
              if (variation.params.length === 0) {
                tx = await contract[variation.fn]({
                  value: mintValue,
                  gasPrice: gasPrice,
                  gasLimit: 500000,
                });
              } else {
                tx = await contract[variation.fn](...variation.params, {
                  value: mintValue,
                  gasPrice: gasPrice,
                  gasLimit: 500000,
                });
              }
              success = true;
              break;
            } catch (e) {
              continue;
            }
          }
          
          if (!success) {
            throw new Error('Semua metode mint gagal');
          }
          
          if (tx && tx.hash) {
            addLog(`⏳ Menunggu konfirmasi... TX: ${tx.hash}`, 'info');
            
            try {
              const receipt = await tx.wait();
              
              if (receipt && receipt.status === 1) {
                mintSuccess = true;
                txHash = receipt.hash;
                addLog(`✅ Berhasil! TX: ${txHash}`, 'success');
              } else {
                throw new Error('Transaksi reverted di blockchain - cek contract conditions');
              }
            } catch (waitError) {
              throw new Error(`Error menunggu tx: ${waitError.message}`);
            }
          } else {
            throw new Error('Transaksi tidak dikembalikan');
          }
          
        } catch (error) {
          addLog(`❌ Mint gagal: ${error.message}`, 'error');
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
        walletInfo.error = 'Transaksi gagal';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
      
      setWallets([...updatedWallets]);
      
      if (i < updatedWallets.length - 1) {
        addLog(`⏳ Tunggu 5 detik...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    setIsMinting(false);
    addLog('🎉 Mint selesai!', 'success');
  };
  
  const clearAll = () => {
    setConfig({ launchpadUrl: '', rpcUrl: '', privateKeys: '', gasLevel: 'normal' });
    setWallets([]);
    setLogs([]);
    setMintStats({ success: 0, failed: 0, total: 0 });
    setMintPrice('0');
    setEstimatedGas('0');
    setDetectedChain('');
    setChainSymbol('ETH');
    setMintPhases({ public: false, whitelist: false, allowlist: false });
    setAdvancedOptions({ autoRetry: false, sniperMode: false, flashbots: false });
    setAllContracts([]);
    setSelectedContractIdx(0);
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'minting': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
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
              <p className="text-purple-100 text-sm">Mint NFT ke multiple contracts</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>⚠️ Peringatan:</strong> Transaksi tidak bisa dibatalkan! Verifikasi contract address sebelum mint.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">🔧 Konfigurasi</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">OpenSea Link / Contract Address</label>
                  <input
                    type="text"
                    value={config.launchpadUrl}
                    onChange={(e) => setConfig({ ...config, launchpadUrl: e.target.value })}
                    placeholder="https://opensea.io/... atau 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                  />
                  {extractContractAddresses(config.launchpadUrl).length > 0 && (
                    <p className="text-xs text-green-400 mt-1">✅ Terdeteksi {extractContractAddresses(config.launchpadUrl).length} contract</p>
                  )}
                </div>

                {allContracts.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Pilih Contract untuk Mint</label>
                    <select
                      value={selectedContractIdx}
                      onChange={(e) => switchContract(Number(e.target.value))}
                      disabled={isMinting}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                    >
                      {allContracts.map((c, idx) => (
                        <option key={idx} value={idx}>
                          Contract {idx + 1}: {c.address.slice(0, 10)}... (Harga: {c.price} {chainSymbol})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">RPC URL {detectedChain && <span className="text-purple-400">({detectedChain})</span>}</label>
                  <input
                    type="text"
                    value={config.rpcUrl}
                    onChange={(e) => setConfig({ ...config, rpcUrl: e.target.value })}
                    placeholder="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Private Keys (max 10, satu per baris)</label>
                  <textarea
                    value={config.privateKeys}
                    onChange={(e) => setConfig({ ...config, privateKeys: e.target.value })}
                    placeholder="0xabc123...&#10;0xdef456..."
                    rows={4}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">{parsePrivateKeys(config.privateKeys).length}/10 wallet valid</p>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gas Level</label>
                    <select
                      value={config.gasLevel}
                      onChange={(e) => setConfig({ ...config, gasLevel: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                    >
                      <option value="low">Low (-20%)</option>
                      <option value="normal">Normal</option>
                      <option value="high">High (+20%)</option>
                    </select>
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={scanWallets}
                      disabled={isScanning || isMinting}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2"
                    >
                      {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                      {isScanning ? 'Scanning...' : 'Scan'}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedOptions.autoRetry}
                    onChange={(e) => setAdvancedOptions({ ...advancedOptions, autoRetry: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-white text-sm">Auto-retry (3x)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAdvancedABI}
                    onChange={(e) => setShowAdvancedABI(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-white text-sm">Advanced: Manual ABI/Function</span>
                </label>

                {showAdvancedABI && (
                  <div className="space-y-2 bg-slate-700/30 p-3 rounded border border-slate-600">
                    <input
                      type="text"
                      value={manualMintFunction}
                      onChange={(e) => setManualMintFunction(e.target.value)}
                      placeholder="Nama fungsi mint (contoh: mint, publicMint, claim)"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                    />
                    <textarea
                      value={manualABI}
                      onChange={(e) => setManualABI(e.target.value)}
                      placeholder="Paste minimal ABI JSON (opsional)"
                      rows={3}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded px-3 py-2 text-white text-xs font-mono"
                    />
                  </div>
                )}
                
                <div className="flex gap-3">
                  <button
                    onClick={startMinting}
                    disabled={isMinting || wallets.length === 0}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                  >
                    {isMinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                    {isMinting ? 'Minting...' : 'Start Mint'}
                  </button>
                  
                  <button
                    onClick={clearAll}
                    disabled={isMinting || isScanning}
                    className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            
            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4">📊 Wallet Status ({wallets.length})</h2>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {wallets.map((wallet, idx) => (
                    <div key={idx} className="bg-slate-700/30 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(wallet.status)}
                        <div className="flex-1">
                          <p className="text-white font-mono text-sm">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</p>
                          <p className="text-gray-400 text-xs">Balance: {wallet.balance} {chainSymbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          wallet.status === 'success' ? 'text-green-400' :
                          wallet.status === 'failed' ? 'text-red-400' :
                          wallet.status === 'minting' ? 'text-blue-400' :
                          'text-gray-400'
                        }`}>
                          {wallet.status === 'ready' ? 'Siap' : wallet.status === 'minting' ? 'Minting...' : wallet.status === 'success' ? 'Sukses' : wallet.status === 'failed' ? wallet.error || 'Gagal' : 'Skip'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                
                {mintStats.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{mintStats.success}</p>
                      <p className="text-xs text-gray-400">Sukses</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{mintStats.failed}</p>
                      <p className="text-xs text-gray-400">Gagal</p>
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
            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4">💰 Mint Info</h2>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Harga Mint:</span>
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
                      <span className="text-white font-mono text-sm">{mintFunctionName}()</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">📜 Live Logs</h2>
              
              <div className="bg-slate-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Belum ada logs. Mulai dengan scan wallets.</p>
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
          <p>⚠️ Ini adalah tool mint real. Transaksi tidak bisa dibatalkan!</p>
          <p className="mt-1">Selalu verifikasi contract address sebelum mint.</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
