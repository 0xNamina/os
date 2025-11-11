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
  const [allContracts, setAllContracts] = useState([]); // Track multiple contracts
  const [selectedContractIdx, setSelectedContractIdx] = useState(0);
  
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
      addLog(`❌ Gagal deteksi chain: ${error.message}`, 'error');
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
    };
    
    const apiUrl = apiUrls[chainId];
    const defaultABI = [
      "function mint() public payable",
      "function publicMint() public payable",
      "function mint(uint256 quantity) public payable",
      "function publicMint(uint256 quantity) public payable",
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function balanceOf(address owner) public view returns (uint256)",
      "function claim(address to, uint256 amount) public",
      "function claim(uint256 amount) public",
    ];
    
    if (!apiUrl) {
      return defaultABI;
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
      addLog(`⚠️ Gagal fetch ABI, menggunakan default`, 'warning');
    }
    
    return defaultABI;
  };
  
  const detectMintFunction = (abi) => {
    const mintFunctions = abi.filter(item => 
      item.type === 'function' && 
      (item.name?.toLowerCase().includes('mint') || 
       item.name?.toLowerCase().includes('claim') ||
       item.name === 'claim')
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
      addLog(`⚠️ Gagal fetch harga, asumsikan gratis`, 'warning');
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
    
    const contractAddresses = extractContractAddresses(config.launchpadUrl || config.contractAddress);
    if (contractAddresses.length === 0) {
      addLog('❌ Tidak ada contract address valid', 'error');
      return;
    }
    
    setIsScanning(true);
    addLog('🔍 Memulai scan wallet...', 'info');
    addLog(`🔍 Ditemukan ${contractAddresses.length} contract untuk di-scan`, 'info');
    
    const keys = parsePrivateKeys(config.privateKeys);
    if (keys.length === 0) {
      addLog('❌ Tidak ada private key valid (harus dimulai dengan 0x)', 'error');
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
      addLog(`🔗 Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');
      
      const scannedContracts = [];
      
      for (const contractAddr of contractAddresses) {
        addLog(`📋 Scanning contract: ${contractAddr}`, 'info');
        
        try {
          addLog('📄 Fetch ABI...', 'info');
          const abi = await getContractABI(contractAddr, chainInfo.chainId);
          
          const mintFunc = detectMintFunction(abi);
          addLog(`🎯 Mint function: ${mintFunc.name}(${mintFunc.hasQuantity ? 'uint256' : ''})`, 'info');
          
          addLog('💰 Fetch harga mint...', 'info');
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
                eligiblePhases: {
                  public: true,
                  whitelist: false,
                  allowlist: false,
                },
                status: hasMinted ? 'already_minted' : 'ready',
                gasEstimate,
              });
              
              await new Promise(resolve => setTimeout(resolve, 300));
              
            } catch (error) {
              addLog(`  ❌ Error scan wallet ${i + 1}: ${error.message}`, 'error');
              continue;
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
          addLog(`❌ Error scan contract ${contractAddr}: ${error.message}`, 'error');
          continue;
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
      setScannedWallets(firstContract.wallets);
      setWallets(firstContract.wallets);
      setEstimatedGas(firstContract.wallets[0]?.gasEstimate || '0.002');
      
      addLog(`✅ Scan selesai! ${scannedContracts.length} contract(s) scanned`, 'success');
      
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
    addLog(`🔄 Beralih ke contract: ${contract.address}`, 'info');
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
    addLog(`📋 Phase terpilih: ${selectedPhases.join(', ')}`, 'info');
    
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
        addLog(`❌ Gagal: Saldo tidak cukup (butuh ${totalCost.toFixed(4)} ${chainSymbol}, punya ${walletInfo.balance} ${chainSymbol})`, 'error');
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
          
          addLog(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
          
          const mintValue = ethers.parseEther(mintPrice);
          
          addLog(`📤 Kirim transaksi...`, 'info');
          
          let tx;
          const mintVariations = [
            { fn: mintFunctionName, params: [], hasQuantity: false },
            { fn: mintFunctionName, params: [1], hasQuantity: true },
            { fn: 'mint', params: [] },
            { fn: 'publicMint', params: [] },
            { fn: 'mint', params: [1] },
            { fn: 'publicMint', params: [1] },
            { fn: 'claim', params: [] },
          ];
          
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
            throw new Error('Semua metode mint gagal. Contract mungkin tidak aktif atau wallet tidak eligible.');
          }
          
          addLog(`⏳ Menunggu konfirmasi... TX: ${tx.hash}`, 'info');
          
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            mintSuccess = true;
            txHash = receipt.hash;
            addLog(`✅ Berhasil! TX: ${txHash}`, 'success');
          } else {
            throw new Error('Transaksi gagal');
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
        walletInfo.error = 'Transaksi gagal setelah retry';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
      
      setWallets([...updatedWallets]);
      
      if (i < updatedWallets.length - 1) {
        addLog(`⏳ Tunggu 5 detik sebelum wallet berikutnya...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    setIsMinting(false);
    addLog('🎉 Proses mint selesai!', 'success');
    addLog(`📊 Hasil: ${successCount} sukses, ${failedCount} gagal dari ${updatedWallets.length}`, 'info');
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
    setAllContracts([]);
    setSelectedContractIdx(0);
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
        return 'Siap';
      case 'minting':
        return 'Minting...';
      case 'success':
        return wallet.txHash ? `Sukses: ${wallet.txHash.slice(0, 10)}...` : 'Sukses';
      case 'failed':
        return wallet.error || 'Gagal';
      case 'skipped':
        return wallet.error || 'Skip';
      case 'already_minted':
        return 'Sudah Mint';
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
              <p className="text-purple-100 text-sm">Mint NFT ke multiple contracts dengan satu kali setup</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>⚠️ Peringatan Keamanan:</strong> Private key hanya disimpan di memory. Selalu verifikasi alamat contract sebelum mint. Transaksi tidak bisa dibatalkan!
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🔧</span> Konfigurasi
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    OpenSea Link / Contract Address
                  </label>
                  <input
                    type="text"
                    value={config.launchpadUrl}
                    onChange={(e) => setConfig({ ...config, launchpadUrl: e.target.value })}
                    placeholder="https://opensea.io/... atau 0x... atau multiple 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {extractContractAddresses(config.launchpadUrl).length > 0 && (
                    <div className="text-xs text-green-400 mt-2 space-y-1">
                      <p>✅ Terdeteksi {extractContractAddresses(config.launchpadUrl).length} contract:</p>
                      {extractContractAddresses(config.launchpadUrl).map((addr, idx) => (
                        <p key={idx} className="ml-2 font-mono">{idx + 1}. {addr}</p>
                      ))}
                    </div>
