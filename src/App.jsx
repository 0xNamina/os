import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, Scan, Zap, Shield, Activity } from 'lucide-react';

const OpenSeaAutoMint = () => {
  const [config, setConfig] = useState({
    collectionUrl: '',
    contractAddress: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'normal',
    mintQuantity: 1,
  });
  
  const [mintPhases, setMintPhases] = useState({
    public: false,
    whitelist: false,
    allowlist: false,
  });
  
  const [advancedOptions, setAdvancedOptions] = useState({
    autoRetry: true,
    randomDelay: true,
    useSeaport: true,
  });
  
  const [wallets, setWallets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintStats, setMintStats] = useState({ success: 0, failed: 0, total: 0 });
  const [collectionInfo, setCollectionInfo] = useState(null);
  const [seaportDetected, setSeaportDetected] = useState(false);
  
  const logsEndRef = useRef(null);
  const ethersRef = useRef(null);
  
  // Check if ethers is loaded
  useEffect(() => {
    const checkEthers = setInterval(() => {
      if (window.ethers) {
        ethersRef.current = window.ethers;
        addLog('✅ Ethers.js loaded successfully', 'success');
        clearInterval(checkEthers);
      }
    }, 100);
    return () => clearInterval(checkEthers);
  }, []);
  
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
      .slice(0, 20);
  };
  
  const extractContractFromUrl = (url) => {
    // Extract from OpenSea URL
    const openseaMatch = url.match(/opensea\.io\/collection\/([^\/\?]+)/);
    if (openseaMatch) {
      return { type: 'collection', slug: openseaMatch[1] };
    }
    // Direct contract address
    const addressMatch = url.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch) {
      return { type: 'address', address: addressMatch[0] };
    }
    return null;
  };
  
  const SEAPORT_ADDRESSES = {
    1: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    5: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    11155111: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    137: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    42161: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    10: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
    8453: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
  };
  
  const detectChainFromRPC = async (rpcUrl) => {
    try {
      const ethers = ethersRef.current;
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      // network.chainId may be BigInt or number
      const chainId = Number(network.chainId?.toString?.() ?? network.chainId);
      const chains = {
        1: { name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'etherscan.io' },
        5: { name: 'Goerli Testnet', symbol: 'ETH', explorer: 'goerli.etherscan.io' },
        11155111: { name: 'Sepolia Testnet', symbol: 'ETH', explorer: 'sepolia.etherscan.io' },
        137: { name: 'Polygon', symbol: 'MATIC', explorer: 'polygonscan.com' },
        42161: { name: 'Arbitrum One', symbol: 'ETH', explorer: 'arbiscan.io' },
        10: { name: 'Optimism', symbol: 'ETH', explorer: 'optimistic.etherscan.io' },
        8453: { name: 'Base', symbol: 'ETH', explorer: 'basescan.org' },
      };
      const chainInfo = chains[chainId] || { name: `Chain ID: ${chainId}`, symbol: 'ETH', explorer: 'etherscan.io' };
      return { ...chainInfo, chainId };
    } catch (error) {
      addLog(`❌ Failed to detect chain: ${error.message}`, 'error');
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0, explorer: 'etherscan.io' };
    }
  };
  
  const getGenericABI = () => {
    return [
      "function mint() public payable",
      "function publicMint() public payable",
      "function mint(uint256 quantity) public payable",
      "function publicMint(uint256 quantity) public payable",
      "function whitelistMint(bytes32[] proof) public payable",
      "function allowlistMint(bytes32[] proof, uint256 quantity) public payable",
      "function mintWithSignature(bytes signature, uint256 quantity) public payable",
      "function mintPrice() public view returns (uint256)",
      "function cost() public view returns (uint256)",
      "function price() public view returns (uint256)",
      "function totalSupply() public view returns (uint256)",
      "function maxSupply() public view returns (uint256)",
      "function balanceOf(address owner) public view returns (uint256)",
      "function paused() public view returns (bool)",
      "function publicSaleActive() public view returns (bool)",
    ];
  };
  
  const fetchContractABI = async (contractAddress, chainId) => {
    const apiUrls = {
      1: 'https://api.etherscan.io/api',
      5: 'https://api-goerli.etherscan.io/api',
      11155111: 'https://api-sepolia.etherscan.io/api',
      137: 'https://api.polygonscan.com/api',
      42161: 'https://api.arbiscan.io/api',
      10: 'https://api-optimistic.etherscan.io/api',
      8453: 'https://api.basescan.org/api',
    };
    const apiUrl = apiUrls[chainId];
    if (!apiUrl) {
      addLog('⚠️ Using generic ABI for this chain', 'warning');
      return getGenericABI();
    }

    // NOTE: API key placeholders intentionally left blank. If you want ABI resolution
    // from explorers, put your API keys here for production usage.
    const apiKeys = {
      1: '',
      137: '',
    };

    try {
      const response = await fetch(
        `${apiUrl}?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKeys[chainId] || ''}`
      );
      const data = await response.json();
      if (data.status === '1' && data.result) {
        addLog('✅ Fetched contract ABI from explorer', 'success');
        return JSON.parse(data.result);
      }
    } catch (error) {
      addLog(`⚠️ Could not fetch ABI: ${error.message}`, 'warning');
    }

    addLog('📝 Using generic ERC721 ABI', 'info');
    return getGenericABI();
  };
  
  // Normalize ABI and detect mint function more robustly using ethers.Interface
  const detectMintFunction = (abi) => {
    const ethers = ethersRef.current;
    try {
      const iface = new ethers.Interface(abi);
      const funcs = Object.values(iface.functions);
      // Filter mint/claim like functions
      const mintFuncs = funcs.filter(f => f.name && (f.name.toLowerCase().includes('mint') || f.name.toLowerCase().includes('claim')));
      if (mintFuncs.length === 0) {
        return { name: 'mint', params: [], hasQuantity: false, raw: null };
      }

      // Prefer functions that look like publicMint or mint with quantity
      const preferred = mintFuncs.find(f => /publicmint/i.test(f.name) && f.inputs.length === 1 && /uint/.test(f.inputs[0].type))
        || mintFuncs.find(f => /^mint$/i.test(f.name) && f.inputs.length === 1 && /uint/.test(f.inputs[0].type))
        || mintFuncs.find(f => /public/i.test(f.name) && f.inputs.length === 0)
        || mintFuncs[0];

      return {
        name: preferred.name,
        params: preferred.inputs.map(i => i.type),
        hasQuantity: preferred.inputs.length === 1 && /uint/.test(preferred.inputs[0].type),
        raw: preferred
      };
    } catch (error) {
      // If Interface fails (shouldn't), fall back to a basic guess
      addLog(`⚠️ ABI parse failed: ${error.message}`, 'warning');
      return { name: 'mint', params: [], hasQuantity: false, raw: null };
    }
  };
  
  const getMintPrice = async (provider, contractAddress, abi) => {
    try {
      const ethers = ethersRef.current;
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const priceGetters = ['mintPrice', 'cost', 'price', 'getMintPrice', 'publicPrice'];
      for (const getter of priceGetters) {
        try {
          if (typeof contract[getter] === 'function') {
            const price = await contract[getter]();
            return ethers.formatEther(price);
          }
        } catch (e) {
          continue;
        }
      }
      return '0';
    } catch (error) {
      return '0';
    }
  };
  
  const checkContractStatus = async (provider, contractAddress, abi) => {
    try {
      const ethers = ethersRef.current;
      const contract = new ethers.Contract(contractAddress, abi, provider);
      let isPaused = false;
      let isPublicSaleActive = true;
      let supply = { current: 0, max: 0 };
      try { if (typeof contract.paused === 'function') isPaused = await contract.paused(); } catch (e) {}
      try { if (typeof contract.publicSaleActive === 'function') isPublicSaleActive = await contract.publicSaleActive(); } catch (e) {}
      try {
        if (typeof contract.totalSupply === 'function') {
          const totalSupply = await contract.totalSupply();
          const maxSupply = typeof contract.maxSupply === 'function' ? await contract.maxSupply() : 0;
          supply = { current: Number(totalSupply), max: Number(maxSupply) };
        }
      } catch (e) {}
      return { isPaused, isPublicSaleActive, supply };
    } catch (error) {
      return { isPaused: false, isPublicSaleActive: true, supply: { current: 0, max: 0 } };
    }
  };
  
  const randomDelay = (min = 1000, max = 3000) => {
    return new Promise(resolve => 
      setTimeout(resolve, Math.random() * (max - min) + min)
    );
  };
  
  const scanWallets = async () => {
    if (!ethersRef.current) {
      addLog('❌ Ethers.js not loaded yet, please wait...', 'error');
      return;
    }
    if (!config.rpcUrl || !config.privateKeys) {
      addLog('❌ Please fill RPC URL and Private Keys', 'error');
      return;
    }

    const extracted = extractContractFromUrl(config.collectionUrl || config.contractAddress);
    if (!extracted) {
      addLog('❌ Invalid OpenSea URL or contract address', 'error');
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

    addLog(`📋 Found ${keys.length} wallet(s) to scan`, 'info');

    try {
      const ethers = ethersRef.current;
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      addLog('🔗 Connected to RPC...', 'info');

      const chainInfo = await detectChainFromRPC(config.rpcUrl);
      addLog(`🌐 Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');

      let contractAddress;
      if (extracted.type === 'collection') {
        addLog(`🔎 Fetching contract for collection: ${extracted.slug}`, 'info');
        addLog('⚠️ Note: OpenSea API requires authentication. Using fallback...', 'warning');
        contractAddress = config.contractAddress;
        if (!contractAddress || !contractAddress.startsWith('0x')) {
          addLog('❌ Please provide contract address manually', 'error');
          setIsScanning(false);
          return;
        }
      } else {
        contractAddress = extracted.address;
      }

      if (!contractAddress || contractAddress.length !== 42) {
        addLog('❌ Invalid contract address', 'error');
        setIsScanning(false);
        return;
      }

      addLog(`📝 Contract: ${contractAddress}`, 'info');

      // Check if Seaport
      const seaportAddr = SEAPORT_ADDRESSES[chainInfo.chainId];
      if (seaportAddr && contractAddress.toLowerCase() === seaportAddr.toLowerCase()) {
        setSeaportDetected(true);
        addLog('⚡ Seaport protocol detected!', 'info');
        addLog('💡 This requires order fulfillment instead of direct minting', 'warning');
      }

      addLog('📄 Fetching contract ABI...', 'info');
      const abi = await fetchContractABI(contractAddress, chainInfo.chainId);

      const mintFunc = detectMintFunction(abi);
      addLog(`🎯 Detected function: ${mintFunc.name}(${mintFunc.params.join(', ')})`, 'info');

      addLog('💰 Fetching mint price...', 'info');
      const price = await getMintPrice(provider, contractAddress, abi);
      addLog(`💰 Mint Price: ${price} ${chainInfo.symbol}`, price === '0' ? 'warning' : 'info');

      addLog('🔍 Checking contract status...', 'info');
      const status = await checkContractStatus(provider, contractAddress, abi);
      if (status.isPaused) addLog('⚠️ WARNING: Contract is paused!', 'warning');
      if (!status.isPublicSaleActive) addLog('⚠️ WARNING: Public sale is not active!', 'warning');
      if (status.supply.max > 0) addLog(`📊 Supply: ${status.supply.current}/${status.supply.max}`, 'info');

      setCollectionInfo({ contractAddress, chainInfo, abi, mintFunc, price, status });

      const scanned = [];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
          const wallet = new ethers.Wallet(key, provider);
          const address = wallet.address;
          addLog(`Scanning ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');

          const balanceWei = await provider.getBalance(address);
          const balance = ethers.formatEther(balanceWei);

          let hasMinted = false;
          try {
            const contract = new ethers.Contract(contractAddress, abi, provider);
            if (typeof contract.balanceOf === 'function') {
              const nftBalance = await contract.balanceOf(address);
              hasMinted = Number(nftBalance) > 0;
            }
          } catch (e) {}

          // Estimate gas more defensively
          let gasEstimate = '0.003';
          try {
            const contract = new ethers.Contract(contractAddress, abi, provider);
            const feeData = await provider.getFeeData();
            const gasUnitPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');

            let gasLimit = 200000n;
            try {
              if (mintFunc.hasQuantity) {
                gasLimit = await contract[mintFunc.name].estimateGas(
                  BigInt(config.mintQuantity),
                  { value: ethers.parseEther(price), from: address }
                );
              } else {
                gasLimit = await contract[mintFunc.name].estimateGas({ value: ethers.parseEther(price), from: address });
              }
            } catch (e) {
              // keep default gasLimit
            }

            const gasCost = gasLimit * gasUnitPrice;
            gasEstimate = ethers.formatEther(gasCost);
          } catch (e) {
            // fallback to default
          }

          scanned.push({ address, privateKey: key, balance, hasMinted, status: hasMinted ? 'already_minted' : 'ready', gasEstimate });

          if (advancedOptions.randomDelay) await randomDelay(300, 800);
          else await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          addLog(`❌ Error scanning wallet ${i + 1}: ${error.message}`, 'error');
          continue;
        }
      }

      setWallets(scanned);
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) ready`, 'success');

      const readyWallets = scanned.filter(w => w.status === 'ready').length;
      if (readyWallets === 0) addLog('⚠️ No wallets are ready to mint', 'warning');
      else addLog(`✅ ${readyWallets} wallet(s) ready to mint`, 'success');

      if (scanned.length > 0) setMintPhases({ ...mintPhases, public: true });
    } catch (error) {
      addLog(`❌ Scan failed: ${error.message}`, 'error');
    }
    setIsScanning(false);
  };
  
  // Build call arguments for mint function intelligently
  const buildMintArgs = (mintFunc) => {
    const args = [];
    for (const t of mintFunc.params) {
      if (/uint/.test(t)) {
        args.push(BigInt(config.mintQuantity));
      } else if (/bytes32\[\]|bytes\[\]/.test(t)) {
        args.push([]);
      } else if (/bytes/.test(t)) {
        // signature or data
        args.push('0x');
      } else if (/address/.test(t)) {
        // unlikely but provide zero
        args.push('0x0000000000000000000000000000000000000000');
      } else {
        // fallback zero
        args.push(0);
      }
    }
    return args;
  };
  
  const executeMint = async (walletInfo, provider) => {
    const ethers = ethersRef.current;
    const { contractAddress, abi, mintFunc, price, chainInfo } = collectionInfo;
    const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    const feeData = await provider.getFeeData();
    let gasUnitPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');
    let maxPriority = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1.5', 'gwei');

    if (config.gasLevel === 'high') {
      gasUnitPrice = (BigInt(gasUnitPrice) * 130n) / 100n;
      addLog(`⚡ Using high gas: ${ethers.formatUnits(gasUnitPrice, 'gwei')} Gwei`, 'info');
    } else if (config.gasLevel === 'low') {
      gasUnitPrice = (BigInt(gasUnitPrice) * 85n) / 100n;
      addLog(`🐌 Using low gas: ${ethers.formatUnits(gasUnitPrice, 'gwei')} Gwei`, 'info');
    } else {
      addLog(`⛽ Gas price: ${ethers.formatUnits(gasUnitPrice, 'gwei')} Gwei`, 'info');
    }

    const mintValue = ethers.parseEther(price || '0');

    // Build tx options (EIP-1559 friendly)
    const txOptions = {
      value: mintValue,
      gasLimit: 350000,
      maxFeePerGas: gasUnitPrice,
      maxPriorityFeePerGas: maxPriority,
    };

    addLog(`📤 Sending transaction...`, 'info');
    let tx;

    // Try using detected function with intelligent args
    const args = buildMintArgs(mintFunc);

    try {
      if (args.length > 0) {
        tx = await contract[mintFunc.name](...args, txOptions);
      } else {
        tx = await contract[mintFunc.name](txOptions);
      }
    } catch (primaryError) {
      addLog(`⚠️ Primary method failed, trying alternatives...`, 'warning');
      // fallback attempt list (try with/without quantity and simple claim)
      const fallbackList = [
        { name: 'mint', args: mintFunc.hasQuantity ? [BigInt(config.mintQuantity)] : [] },
        { name: 'publicMint', args: mintFunc.hasQuantity ? [BigInt(config.mintQuantity)] : [] },
        { name: 'claim', args: [] },
      ];

      let success = false;
      for (const f of fallbackList) {
        try {
          addLog(`Trying ${f.name}(${f.args.map(a => a?.toString?.() ?? a).join(', ')})...`, 'info');
          if (f.args.length > 0) tx = await contract[f.name](...f.args, txOptions);
          else tx = await contract[f.name](txOptions);
          success = true;
          break;
        } catch (e) {
          // continue trying
        }
      }

      if (!success) {
        // try a last resort: try the detected function with a zero-quantity (some contracts expect uint256 0)
        try {
          addLog('Trying detected function with zero quantity as last resort...', 'info');
          tx = await contract[mintFunc.name](0, txOptions);
        } catch (e) {
          throw new Error('All mint methods failed. Contract may be paused or wallet not eligible.');
        }
      }
    }

    addLog(`⏳ Confirming... TX: ${tx.hash}`, 'info');
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Transaction reverted');
    return tx.hash;
  };
  
  const startMinting = async () => {
    if (!ethersRef.current) { addLog('❌ Ethers.js not loaded yet', 'error'); return; }
    if (wallets.length === 0) { addLog('❌ Please scan wallets first', 'error'); return; }
    if (!collectionInfo) { addLog('❌ Collection info not loaded', 'error'); return; }
    if (seaportDetected && advancedOptions.useSeaport) {
      addLog('❌ Seaport minting requires order fulfillment (advanced feature)', 'error');
      addLog('💡 For Seaport drops, disable "Use Seaport" or use direct contract address', 'warning');
      return;
    }

    const selectedPhases = Object.keys(mintPhases).filter(k => mintPhases[k]);
    if (selectedPhases.length === 0) { addLog('❌ Please select at least one mint phase', 'error'); return; }

    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Starting mint process...', 'info');

    const ethers = ethersRef.current;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const updatedWallets = [...wallets];

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < updatedWallets.length; i++) {
      const walletInfo = updatedWallets[i];
      walletInfo.status = 'minting';
      setWallets([...updatedWallets]);

      addLog(`\n${'='.repeat(50)}`, 'info');
      addLog(`🔄 Wallet ${i + 1}/${updatedWallets.length}: ${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`, 'info');

      if (walletInfo.hasMinted) {
        walletInfo.status = 'skipped';
        walletInfo.error = 'Already minted';
        setWallets([...updatedWallets]);
        addLog(`⏭️ Skipped: Already has NFT`, 'warning');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const totalCost = (parseFloat(collectionInfo.price || '0') * config.mintQuantity) + parseFloat(walletInfo.gasEstimate || '0');
      if (parseFloat(walletInfo.balance) < totalCost) {
        walletInfo.status = 'failed';
        walletInfo.error = 'Insufficient balance';
        setWallets([...updatedWallets]);
        addLog(`❌ Failed: Need ${totalCost.toFixed(6)} ${collectionInfo.chainInfo.symbol}, have ${walletInfo.balance}`, 'error');
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      let mintSuccess = false;
      let retryCount = 0;
      let txHash = null;
      const maxRetries = advancedOptions.autoRetry ? 3 : 0;

      while (!mintSuccess && retryCount <= maxRetries) {
        if (retryCount > 0) {
          addLog(`🔄 Retry ${retryCount}/${maxRetries}...`, 'warning');
          await randomDelay(2000, 4000);
        }
        try {
          txHash = await executeMint(walletInfo, provider);
          mintSuccess = true;
          addLog(`✅ SUCCESS! TX: ${txHash}`, 'success');
        } catch (error) {
          const errorMsg = error.message || 'Unknown error';
          addLog(`❌ Attempt ${retryCount + 1} failed: ${errorMsg}`, 'error');
          if (errorMsg.includes('insufficient funds')) { addLog('💡 Insufficient funds - skipping retries', 'warning'); break; }
          if (errorMsg.includes('already minted') || errorMsg.includes('max supply')) { addLog('💡 Contract limit reached - skipping retries', 'warning'); break; }
          retryCount++;
        }
      }

      if (mintSuccess) {
        walletInfo.status = 'success';
        walletInfo.txHash = txHash;
        successCount++;
        setMintStats(prev => ({ ...prev, success: prev.success + 1 }));
      } else {
        walletInfo.status = 'failed';
        walletInfo.error = 'Max retries reached';
        failedCount++;
        setMintStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      }

      setWallets([...updatedWallets]);

      if (i < updatedWallets.length - 1) {
        const delaySeconds = advancedOptions.randomDelay ? Math.floor(Math.random() * 3) + 3 : 5;
        addLog(`⏳ Waiting ${delaySeconds}s before next wallet...`, 'info');
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    }

    setIsMinting(false);
    addLog(`\n${'='.repeat(50)}`, 'info');
    addLog('🎉 Minting process completed!', 'success');
    addLog(`📊 Final Results: ${successCount} ✅ | ${failedCount} ❌ | ${updatedWallets.length} Total`, 'info');
  };
  
  const clearAll = () => {
    setConfig({ collectionUrl: '', contractAddress: '', rpcUrl: '', privateKeys: '', gasLevel: 'normal', mintQuantity: 1 });
    setWallets([]);
    setLogs([]);
    setMintStats({ success: 0, failed: 0, total: 0 });
    setCollectionInfo(null);
    setSeaportDetected(false);
    setMintPhases({ public: false, whitelist: false, allowlist: false });
    addLog('🔄 Reset complete', 'info');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'minting': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
      case 'already_minted': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (wallet) => {
    switch (wallet.status) {
      case 'ready': return 'Ready';
      case 'minting': return 'Minting...';
      case 'success': return wallet.txHash ? `${wallet.txHash.slice(0, 8)}...` : 'Success';
      case 'failed': return wallet.error || 'Failed';
      case 'skipped': return wallet.error || 'Skipped';
      case 'already_minted': return 'Already Minted';
      default: return 'Unknown';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* UI omitted for brevity in canvas preview (same as original). Use updated logic above. */}
      <div className="max-w-7xl mx-auto p-6 bg-slate-800/40 rounded-2xl text-white">
        <h1 className="text-2xl font-bold">OpenSea Auto Mint Bot — Updated</h1>
        <p className="text-sm text-gray-300 mt-2">This component contains fixes for ABI normalization, robust gas handling, and dynamic mint argument building so the bot can better handle launchpad contracts and detect chain/symbol from RPC.</p>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
