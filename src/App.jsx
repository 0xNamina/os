import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap } from 'lucide-react';

const ethers = window.ethers;

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    launchpadUrl: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'normal',
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
  const [allContracts, setAllContracts] = useState([]);
  const [selectedContractIdx, setSelectedContractIdx] = useState(0);
  const [autoRetry, setAutoRetry] = useState(false);
  
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
  
  const getChainInfo = (chainId) => {
    const chains = {
      1: { name: 'Ethereum', symbol: 'ETH' },
      137: { name: 'Polygon', symbol: 'MATIC' },
      42161: { name: 'Arbitrum', symbol: 'ETH' },
      8453: { name: 'Base', symbol: 'ETH' },
      33139: { name: 'APE Chain', symbol: 'APE' },
      56: { name: 'BSC', symbol: 'BNB' },
    };
    return chains[chainId] || { name: 'Unknown', symbol: 'ETH' };
  };
  
  const scanWallets = async () => {
    if (!ethers) {
      addLog('Ethers.js not loaded', 'error');
      return;
    }
    
    if (!config.rpcUrl || !config.privateKeys) {
      addLog('Please fill RPC URL and Private Keys', 'error');
      return;
    }
    
    const contractAddresses = extractContractAddresses(config.launchpadUrl);
    if (contractAddresses.length === 0) {
      addLog('No valid contract addresses found', 'error');
      return;
    }
    
    setIsScanning(true);
    addLog('Starting wallet scan', 'info');
    addLog(`Found ${contractAddresses.length} contracts`, 'info');
    
    const keys = parsePrivateKeys(config.privateKeys);
    if (keys.length === 0) {
      addLog('No valid private keys found', 'error');
      setIsScanning(false);
      return;
    }
    
    addLog(`Found ${keys.length} wallets`, 'info');
    
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      addLog('Connected to RPC', 'info');
      
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const chainInfo = getChainInfo(chainId);
      
      setDetectedChain(chainInfo.name);
      setChainSymbol(chainInfo.symbol);
      addLog(`Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');
      
      const scannedContracts = [];
      
      for (const contractAddr of contractAddresses) {
        addLog(`Scanning contract: ${contractAddr.slice(0, 10)}...`, 'info');
        
        const contractScanned = [];
        
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          
          try {
            const wallet = new ethers.Wallet(key, provider);
            const address = wallet.address;
            
            addLog(`Wallet ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');
            
            const balanceWei = await provider.getBalance(address);
            const balance = ethers.formatEther(balanceWei);
            
            contractScanned.push({
              address,
              privateKey: key,
              balance,
              status: 'ready',
              gasEstimate: '0.002',
            });
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (error) {
            addLog(`Error scanning wallet: ${error.message}`, 'error');
          }
        }
        
        scannedContracts.push({
          address: contractAddr,
          wallets: contractScanned,
          price: '0',
        });
      }
      
      if (scannedContracts.length === 0) {
        addLog('No contracts scanned successfully', 'error');
        setIsScanning(false);
        return;
      }
      
      setAllContracts(scannedContracts);
      setSelectedContractIdx(0);
      setWallets(scannedContracts[0].wallets);
      setMintPrice(scannedContracts[0].price);
      setEstimatedGas('0.002');
      
      addLog('Scan complete', 'success');
      
    } catch (error) {
      addLog(`Scan failed: ${error.message}`, 'error');
    }
    
    setIsScanning(false);
  };
  
  const switchContract = (idx) => {
    setSelectedContractIdx(idx);
    const contract = allContracts[idx];
    setWallets(contract.wallets);
    setMintPrice(contract.price);
    addLog(`Switched to contract: ${contract.address.slice(0, 10)}...`, 'info');
  };
  
  const startMinting = async () => {
    if (!ethers) {
      addLog('Ethers.js not loaded', 'error');
      return;
    }
    
    if (wallets.length === 0) {
      addLog('Please scan wallets first', 'error');
      return;
    }
    
    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('Starting mint process', 'info');
    
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
      
      addLog(`Minting wallet ${i + 1}/${updatedWallets.length}`, 'info');
      
      const totalCost = parseFloat(mintPrice) + parseFloat(walletInfo.gasEstimate);
      if (parseFloat(walletInfo.balance) < totalCost) {
        walletInfo.status = 'failed';
        walletInfo.error = 'Insufficient balance';
        setWallets([...updatedWallets]);
        addLog(`Failed: Insufficient balance`, 'error');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      let mintSuccess = false;
      let retryCount = 0;
      
      while (!mintSuccess && retryCount <= (autoRetry ? 3 : 0)) {
        if (retryCount > 0) {
          addLog(`Retry attempt ${retryCount}/3`, 'warning');
        }
        
        try {
          const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
          
          const feeData = await provider.getFeeData();
          let gasPrice = feeData.gasPrice;
          
          if (config.gasLevel === 'high') {
            gasPrice = (gasPrice * 120n) / 100n;
          } else if (config.gasLevel === 'low') {
            gasPrice = (gasPrice * 80n) / 100n;
          }
          
          const mintValue = ethers.parseEther(mintPrice);
          
          const mintVariations = [
            { fn: 'mint', params: [] },
            { fn: 'publicMint', params: [] },
            { fn: 'mint', params: [1] },
            { fn: 'publicMint', params: [1] },
            { fn: 'claim', params: [] },
          ];
          
          let tx = null;
          let success = false;
          
          for (const variation of mintVariations) {
            try {
              addLog(`Trying ${variation.fn}...`, 'info');
              
              const contract = new ethers.Contract(contractAddr, [{type: 'function', name: variation.fn, stateMutability: 'payable'}], wallet);
              
              if (variation.params.length === 0) {
                tx = await contract[variation.fn]({
                  value: mintValue,
                  gasPrice: gasPrice,
                  gasLimit: 800000,
                });
              } else {
                tx = await contract[variation.fn](...variation.params, {
                  value: mintValue,
                  gasPrice: gasPrice,
                  gasLimit: 800000,
                });
              }
              
              success = true;
              addLog(`Transaction sent: ${tx.hash}`, 'success');
              break;
            } catch (e) {
              continue;
            }
          }
          
          if (!success || !tx) {
            throw new Error('All mint methods failed');
          }
          
          addLog(`Waiting for confirmation...`, 'info');
          
          try {
            const receipt = await tx.wait();
            
            if (receipt && receipt.status === 1) {
              mintSuccess = true;
              walletInfo.txHash = receipt.hash;
              addLog(`Success: ${receipt.hash}`, 'success');
            } else {
              throw new Error('Transaction reverted');
            }
          } catch (waitError) {
            throw new Error(`Wait error: ${waitError.message}`);
          }
          
        } catch (error) {
          addLog(`Mint error: ${error.message}`, 'error');
          retryCount++;
          
          if (retryCount > (autoRetry ? 3 : 0)) {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (mintSuccess) {
        walletInfo.status = 'success';
        successCount++;
        setMintStats(prev => ({ ...prev, success: prev.success + 1 }));
      } else {
        walletInfo.status = 'failed';
        walletInfo.error = 'Transaction failed';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
      
      setWallets([...updatedWallets]);
      
      if (i < updatedWallets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    setIsMinting(false);
    addLog('Mint process completed', 'success');
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
    setAllContracts([]);
    setSelectedContractIdx(0);
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'minting': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
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
              <p className="text-purple-100 text-sm">Mint NFT to multiple contracts</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 mt-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong>Warning:</strong> This is a real minting tool. Transactions are irreversible!
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">OpenSea Link / Contract</label>
                  <input
                    type="text"
                    value={config.launchpadUrl}
                    onChange={(e) => setConfig({ ...config, launchpadUrl: e.target.value })}
                    placeholder="https://opensea.io/... or 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                  />
                  {extractContractAddresses(config.launchpadUrl).length > 0 && (
                    <p className="text-xs text-green-400 mt-1">Found {extractContractAddresses(config.launchpadUrl).length} contracts</p>
                  )}
                </div>

                {allContracts.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Contract</label>
                    <select
                      value={selectedContractIdx}
                      onChange={(e) => switchContract(Number(e.target.value))}
                      disabled={isMinting}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                    >
                      {allContracts.map((c, idx) => (
                        <option key={idx} value={idx}>
                          Contract {idx + 1}: {c.address.slice(0, 10)}...
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
                    placeholder="https://eth-mainnet.g.alchemy.com/v2/..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Private Keys (max 10)</label>
                  <textarea
                    value={config.privateKeys}
                    onChange={(e) => setConfig({ ...config, privateKeys: e.target.value })}
                    placeholder="0xabc123...&#10;0xdef456..."
                    rows={4}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">{parsePrivateKeys(config.privateKeys).length}/10 valid</p>
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
                    checked={autoRetry}
                    onChange={(e) => setAutoRetry(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-white text-sm">Auto-retry (3x)</span>
                </label>
                
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
                <h2 className="text-xl font-semibold text-white mb-4">Wallet Status ({wallets.length})</h2>
                
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
                          {wallet.status === 'ready' ? 'Ready' : wallet.status === 'minting' ? 'Minting...' : wallet.status}
                        </p>
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
            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4">Mint Info</h2>
                
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
                </div>
              </div>
            )}
            
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4">Live Logs</h2>
              
              <div className="bg-slate-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No logs yet. Start by scanning.</p>
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
          <p>This is a real minting tool. Always verify contract addresses!</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
