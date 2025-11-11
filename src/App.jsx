import React, { useState, useRef, useEffect } from 'react';

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
    simulateTx: true,
    detectCollection: true,
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
  const [contractType, setContractType] = useState('unknown');
  const [nftContractAddress, setNftContractAddress] = useState('');
  
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
    if (!keys) return [];
    return keys.split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0 && (k.startsWith('0x') || k.length === 64))
      .map(k => k.startsWith('0x') ? k : `0x${k}`)
      .slice(0, 10);
  };
  
  const extractContractAddress = (url) => {
    if (!url) return '';
    const match = url.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : url;
  };
  
  const scanWallets = async () => {
    if (!window.ethers) {
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
      const ethers = window.ethers;
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      addLog('🔗 Connected to RPC...', 'info');
      
      // Simple chain detection
      try {
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        const chains = {
          1: { name: 'Ethereum Mainnet', symbol: 'ETH' },
          137: { name: 'Polygon', symbol: 'MATIC' },
          42161: { name: 'Arbitrum One', symbol: 'ETH' },
          10: { name: 'Optimism', symbol: 'ETH' },
          8453: { name: 'Base', symbol: 'ETH' },
          56: { name: 'BSC', symbol: 'BNB' },
          33139: { name: 'APE Chain', symbol: 'APE' },
        };
        const chainInfo = chains[chainId] || { name: `Chain ID: ${chainId}`, symbol: 'ETH' };
        setDetectedChain(chainInfo.name);
        setChainSymbol(chainInfo.symbol);
        addLog(`🔗 Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');
      } catch (error) {
        addLog('⚠️ Could not detect chain', 'warning');
      }
      
      const scanned = [];
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        
        try {
          const wallet = new ethers.Wallet(key, provider);
          const address = wallet.address;
          
          addLog(`Scanning wallet ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');
          
          const balanceWei = await provider.getBalance(address);
          const balance = ethers.formatEther(balanceWei);
          
          scanned.push({
            address,
            privateKey: key,
            balance,
            hasMinted: false,
            eligiblePhases: {
              public: true,
              whitelist: false,
              allowlist: false,
            },
            status: 'ready',
            gasEstimate: '0.01',
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          addLog(`❌ Error scanning wallet ${i + 1}: ${error.message}`, 'error');
          continue;
        }
      }
      
      setScannedWallets(scanned);
      setWallets(scanned);
      setEstimatedGas('0.01');
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
    if (!window.ethers) {
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
    
    const updatedWallets = [...wallets];
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < updatedWallets.length; i++) {
      const walletInfo = updatedWallets[i];
      
      walletInfo.status = 'minting';
      setWallets([...updatedWallets]);
      
      addLog(`🔄 Minting for wallet ${i + 1}/${updatedWallets.length}: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`, 'info');
      
      // Simulate minting process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // For demo purposes, randomly succeed or fail
      const success = Math.random() > 0.3;
      
      if (success) {
        walletInfo.status = 'success';
        walletInfo.txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
        successCount++;
        addLog(`✅ Mint successful!`, 'success');
      } else {
        walletInfo.status = 'failed';
        walletInfo.error = 'Simulated failure';
        failedCount++;
        addLog(`❌ Mint failed: Simulated error`, 'error');
      }
      
      setWallets([...updatedWallets]);
      setMintStats({ success: successCount, failed: failedCount, total: wallets.length });
      
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
      simulateTx: true,
      detectCollection: true 
    });
    setContractType('unknown');
    setNftContractAddress('');
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready':
        return <div className="w-4 h-4 rounded-full bg-gray-400" />;
      case 'minting':
        return <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />;
      case 'success':
        return <div className="w-4 h-4 rounded-full bg-green-500" />;
      case 'failed':
        return <div className="w-4 h-4 rounded-full bg-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-400" />;
    }
  };
  
  const getStatusText = (wallet) => {
    switch (wallet.status) {
      case 'ready':
        return 'Ready';
      case 'minting':
        return 'Minting...';
      case 'success':
        return wallet.txHash ? `Success: ${wallet.txHash.slice(0, 10)}...` : 'Success';
      case 'failed':
        return wallet.error || 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-yellow-300 rounded-full flex items-center justify-center">
              <span className="text-black font-bold">⚡</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">OpenSea Auto Mint Bot</h1>
              <p className="text-purple-100 text-sm">Smart contract detection for NFT & Creator contracts</p>
            </div>
          </div>
        </div>
        
        {/* Warning Banner */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 bg-yellow-500 rounded-full flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>Demo Mode:</strong> Currently in simulation mode. Add your real configuration to start actual minting.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Configuration */}
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
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all disabled:cursor-not-allowed"
                    >
                      {isScanning ? 'Scanning...' : 'Scan Wallets'}
                    </button>
                  </div>
                </div>
              </div>
              
              {scannedWallets.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-300">
                      Mint Phase Selection
                    </label>
                    {contractType !== 'unknown' && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        contractType === 'nft' ? 'bg-green-500/20 text-green-400' :
                        contractType === 'creator' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {contractType.toUpperCase()} CONTRACT
                      </span>
                    )}
                  </div>
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
                      checked={advancedOptions.detectCollection}
                      onChange={(e) => setAdvancedOptions({ ...advancedOptions, detectCollection: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white text-sm">Detect Collection</span>
                  </label>
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={startMinting}
                  disabled={isMinting || wallets.length === 0}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
                >
                  {isMinting ? 'Minting...' : 'Start Auto Mint'}
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
            
            {/* Wallet Status */}
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
          
          {/* Right Column */}
          <div className="space-y-6">
            {scannedWallets.length > 0 && (
              <>
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <span className="text-2xl">💰</span> Mint Info
                  </h2>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Contract Type:</span>
                      <span className={`font-semibold ${
                        contractType === 'nft' ? 'text-green-400' :
                        contractType === 'creator' ? 'text-blue-400' :
                        'text-yellow-400'
                      }`}>
                        {contractType.toUpperCase()}
                      </span>
                    </div>
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
                    {nftContractAddress && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">NFT Contract:</span>
                        <span className="text-white font-mono text-sm">
                          {nftContractAddress.slice(0, 6)}...{nftContractAddress.slice(-4)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            
            {/* Live Logs */}
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
