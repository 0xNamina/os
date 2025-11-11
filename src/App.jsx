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
  
  // Auto-detect RPC chain when RPC URL changes
  useEffect(() => {
    if (config.rpcUrl && config.rpcUrl.includes('http')) {
      const detectChain = async () => {
        try {
          const chainInfo = await detectChainFromRPC(config.rpcUrl);
          addLog(`🌐 Auto-detected: ${chainInfo.name} (${chainInfo.symbol})`, 'success');
          
          if (collectionInfo) {
            setCollectionInfo(prev => ({
              ...prev,
              chainInfo
            }));
          }
        } catch (error) {
          console.log('Auto-detection failed:', error.message);
        }
      };
      
      detectChain();
    }
  }, [config.rpcUrl]);
  
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
    const openseaMatch = url.match(/opensea\.io\/collection\/([^\/\?]+)/);
    if (openseaMatch) {
      return { type: 'collection', slug: openseaMatch[1] };
    }
    
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
  
  // Enhanced chain detection
  const detectChainFromRPC = async (rpcUrl) => {
    try {
      const ethers = ethersRef.current;
      if (!ethers) {
        throw new Error('Ethers not loaded');
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      
      // Enhanced chain database with more networks
      const chains = {
        1: { name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'etherscan.io' },
        5: { name: 'Goerli Testnet', symbol: 'ETH', explorer: 'goerli.etherscan.io' },
        11155111: { name: 'Sepolia Testnet', symbol: 'ETH', explorer: 'sepolia.etherscan.io' },
        56: { name: 'BNB Smart Chain', symbol: 'BNB', explorer: 'bscscan.com' },
        97: { name: 'BNB Testnet', symbol: 'tBNB', explorer: 'testnet.bscscan.com' },
        137: { name: 'Polygon', symbol: 'MATIC', explorer: 'polygonscan.com' },
        80001: { name: 'Polygon Mumbai', symbol: 'MATIC', explorer: 'mumbai.polygonscan.com' },
        42161: { name: 'Arbitrum One', symbol: 'ETH', explorer: 'arbiscan.io' },
        421613: { name: 'Arbitrum Goerli', symbol: 'ETH', explorer: 'goerli.arbiscan.io' },
        10: { name: 'Optimism', symbol: 'ETH', explorer: 'optimistic.etherscan.io' },
        420: { name: 'Optimism Goerli', symbol: 'ETH', explorer: 'goerli-optimism.etherscan.io' },
        8453: { name: 'Base', symbol: 'ETH', explorer: 'basescan.org' },
        84531: { name: 'Base Goerli', symbol: 'ETH', explorer: 'goerli.basescan.org' },
        43114: { name: 'Avalanche', symbol: 'AVAX', explorer: 'snowtrace.io' },
        43113: { name: 'Avalanche Fuji', symbol: 'AVAX', explorer: 'testnet.snowtrace.io' },
        250: { name: 'Fantom', symbol: 'FTM', explorer: 'ftmscan.com' },
        4002: { name: 'Fantom Testnet', symbol: 'FTM', explorer: 'testnet.ftmscan.com' },
        100: { name: 'Gnosis', symbol: 'xDAI', explorer: 'gnosisscan.io' },
        1313161554: { name: 'Aurora', symbol: 'ETH', explorer: 'aurorascan.dev' },
        1666600000: { name: 'Harmony', symbol: 'ONE', explorer: 'explorer.harmony.one' },
        25: { name: 'Cronos', symbol: 'CRO', explorer: 'cronoscan.com' },
        338: { name: 'Cronos Testnet', symbol: 'TCRO', explorer: 'testnet.cronoscan.com' },
        1284: { name: 'Moonbeam', symbol: 'GLMR', explorer: 'moonscan.io' },
        1285: { name: 'Moonriver', symbol: 'MOVR', explorer: 'moonriver.moonscan.io' },
        1287: { name: 'Moonbase Alpha', symbol: 'DEV', explorer: 'moonbase.moonscan.io' },
        122: { name: 'Fuse', symbol: 'FUSE', explorer: 'explorer.fuse.io' },
        40: { name: 'Telos', symbol: 'TLOS', explorer: 'www.teloscan.io' },
        1088: { name: 'Metis', symbol: 'METIS', explorer: 'andromeda-explorer.metis.io' },
        288: { name: 'Boba', symbol: 'ETH', explorer: 'bobascan.com' },
        106: { name: 'Velas', symbol: 'VLX', explorer: 'evmexplorer.velas.com' },
        321: { name: 'KCC', symbol: 'KCS', explorer: 'explorer.kcc.io' },
        33139: { name: 'AIOZ Network', symbol: 'AIOZ', explorer: 'explorer.aioz.network' },
      };
      
      const chainInfo = chains[chainId] || { 
        name: `Chain ID: ${chainId}`, 
        symbol: 'ETH', 
        chainId,
        explorer: 'etherscan.io' 
      };
      
      return { ...chainInfo, chainId };
    } catch (error) {
      console.error('Chain detection error:', error);
      return { name: 'Unknown Chain', symbol: 'ETH', chainId: 0, explorer: 'etherscan.io' };
    }
  };
  
  const getGenericABI = () => {
    return [
      "function mint() public payable",
      "function mint(uint256 quantity) public payable",
      "function publicMint() public payable",
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
    const apiKeys = {
      1: '',
      137: '',
    };
    
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
  
  // Fixed mint function detection to handle ambiguous functions
  const detectMintFunction = (abi) => {
    const mintFunctions = abi.filter(item => 
      item.type === 'function' && 
      item.name && 
      (item.name.toLowerCase().includes('mint') || item.name === 'claim')
    );
    
    if (mintFunctions.length === 0) {
      return { name: 'mint', params: [], hasQuantity: false, payable: true };
    }
    
    // Priority order for public minting - prefer functions with quantity parameter
    const priorities = [
      { pattern: /^mint$/, preferredParams: 1, type: 'uint256' },
      { pattern: /^publicMint$/, preferredParams: 1, type: 'uint256' },
      { pattern: /^mint$/, preferredParams: 0, type: 'none' },
      { pattern: /^publicMint$/, preferredParams: 0, type: 'none' },
      { pattern: /^claim$/, preferredParams: 1, type: 'uint256' },
      { pattern: /^claim$/, preferredParams: 0, type: 'none' },
    ];
    
    for (const priority of priorities) {
      const matches = mintFunctions.filter(f => priority.pattern.test(f.name));
      
      for (const match of matches) {
        const params = match.inputs || [];
        
        if (params.length === priority.preferredParams) {
          if (priority.preferredParams === 1 && params[0]?.type === 'uint256') {
            return { 
              name: match.name, 
              params: params.map(p => p.type),
              hasQuantity: true,
              payable: match.stateMutability === 'payable' || match.payable
            };
          } else if (priority.preferredParams === 0) {
            return { 
              name: match.name, 
              params: [],
              hasQuantity: false,
              payable: match.stateMutability === 'payable' || match.payable
            };
          }
        }
      }
    }
    
    // Fallback to first mint function found
    const firstMint = mintFunctions[0];
    const params = firstMint.inputs || [];
    const hasQuantity = params.length === 1 && params[0]?.type === 'uint256';
    
    return {
      name: firstMint.name,
      params: params.map(p => p.type),
      hasQuantity,
      payable: firstMint.stateMutability === 'payable' || firstMint.payable
    };
  };
  
  const getMintPrice = async (provider, contractAddress, abi) => {
    try {
      const ethers = ethersRef.current;
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      const priceGetters = ['mintPrice', 'cost', 'price', 'getMintPrice', 'publicPrice'];
      
      for (const getter of priceGetters) {
        try {
          if (contract[getter]) {
            const price = await contract[getter]();
            if (price && price.toString() !== '0') {
              return ethers.formatEther(price);
            }
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
      
      try {
        isPaused = await contract.paused();
      } catch (e) {}
      
      try {
        isPublicSaleActive = await contract.publicSaleActive();
      } catch (e) {}
      
      try {
        const totalSupply = await contract.totalSupply();
        const maxSupply = await contract.maxSupply();
        supply = {
          current: Number(totalSupply),
          max: Number(maxSupply)
        };
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
      addLog(`💰 Payable: ${mintFunc.payable}`, 'info');
      
      addLog('💰 Fetching mint price...', 'info');
      const price = await getMintPrice(provider, contractAddress, abi);
      addLog(`💰 Mint Price: ${price} ${chainInfo.symbol}`, price === '0' ? 'warning' : 'info');
      
      addLog('🔍 Checking contract status...', 'info');
      const status = await checkContractStatus(provider, contractAddress, abi);
      
      if (status.isPaused) {
        addLog('⚠️ WARNING: Contract is paused!', 'warning');
      }
      if (!status.isPublicSaleActive) {
        addLog('⚠️ WARNING: Public sale is not active!', 'warning');
      }
      if (status.supply.max > 0) {
        addLog(`📊 Supply: ${status.supply.current}/${status.supply.max}`, 'info');
      }
      
      setCollectionInfo({
        contractAddress,
        chainInfo,
        abi,
        mintFunc,
        price,
        status,
      });
      
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
            const nftBalance = await contract.balanceOf(address);
            hasMinted = Number(nftBalance) > 0;
          } catch (e) {}
          
          let gasEstimate = '0.003';
          try {
            const contract = new ethers.Contract(contractAddress, abi, provider);
            const feeData = await provider.getFeeData();
            
            let gasLimit;
            if (mintFunc.hasQuantity) {
              gasLimit = await contract[mintFunc.name].estimateGas(
                config.mintQuantity,
                { 
                  value: mintFunc.payable ? ethers.parseEther(price || '0') : 0,
                  from: address 
                }
              );
            } else {
              gasLimit = await contract[mintFunc.name].estimateGas({
                value: mintFunc.payable ? ethers.parseEther(price || '0') : 0,
                from: address 
              });
            }
            
            const gasCost = gasLimit * feeData.gasPrice;
            gasEstimate = ethers.formatEther(gasCost);
          } catch (e) {
            gasEstimate = '0.005';
          }
          
          scanned.push({
            address,
            privateKey: key,
            balance,
            hasMinted,
            status: hasMinted ? 'already_minted' : 'ready',
            gasEstimate,
          });
          
          if (advancedOptions.randomDelay) {
            await randomDelay(300, 800);
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
        } catch (error) {
          addLog(`❌ Error scanning wallet ${i + 1}: ${error.message}`, 'error');
          continue;
        }
      }
      
      setWallets(scanned);
      addLog(`✅ Scan complete! ${scanned.length} wallet(s) ready`, 'success');
      
      const readyWallets = scanned.filter(w => w.status === 'ready').length;
      if (readyWallets === 0) {
        addLog('⚠️ No wallets are ready to mint', 'warning');
      } else {
        addLog(`✅ ${readyWallets} wallet(s) ready to mint`, 'success');
      }
      
      if (scanned.length > 0) {
        setMintPhases({ ...mintPhases, public: true });
      }
      
    } catch (error) {
      addLog(`❌ Scan failed: ${error.message}`, 'error');
    }
    
    setIsScanning(false);
  };
  
  // FIXED: Enhanced executeMint function to handle ambiguous functions
  const executeMint = async (walletInfo, provider) => {
    const ethers = ethersRef.current;
    const { contractAddress, abi, mintFunc, price, chainInfo } = collectionInfo;
    
    const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    const feeData = await provider.getFeeData();
    let gasPrice = feeData.gasPrice;
    
    if (config.gasLevel === 'high') {
      gasPrice = (gasPrice * 130n) / 100n;
      addLog(`⚡ Using high gas: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
    } else if (config.gasLevel === 'low') {
      gasPrice = (gasPrice * 85n) / 100n;
      addLog(`🐌 Using low gas: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
    } else {
      addLog(`⛽ Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`, 'info');
    }
    
    const mintValue = mintFunc.payable ? ethers.parseEther(price || '0') : 0;
    
    const txOptions = {
      value: mintValue,
      gasPrice: gasPrice,
      gasLimit: 350000,
    };
    
    addLog(`📤 Sending transaction...`, 'info');
    
    let tx;
    
    // Enhanced function selection to avoid ambiguity
    try {
      // First, try to call the specific function with exact parameters
      const contractWithSigner = contract.connect(wallet);
      
      if (mintFunc.hasQuantity) {
        // For functions with quantity parameter
        addLog(`Calling ${mintFunc.name} with quantity: ${config.mintQuantity}`, 'info');
        tx = await contractWithSigner[mintFunc.name](config.mintQuantity, txOptions);
      } else {
        // For functions without parameters
        addLog(`Calling ${mintFunc.name} without parameters`, 'info');
        tx = await contractWithSigner[mintFunc.name](txOptions);
      }
    } catch (primaryError) {
      addLog(`⚠️ Primary method failed: ${primaryError.message}`, 'warning');
      addLog(`🔄 Trying alternative methods...`, 'info');
      
      // Enhanced fallback with better error handling
      const fallbackMethods = [
        // Try with quantity first
        { name: 'mint', hasQty: true, payable: true },
        { name: 'publicMint', hasQty: true, payable: true },
        { name: 'claim', hasQty: true, payable: true },
        
        // Then without quantity
        { name: 'mint', hasQty: false, payable: true },
        { name: 'publicMint', hasQty: false, payable: true },
        { name: 'claim', hasQty: false, payable: true },
        
        // Try without payment if payable methods fail
        { name: 'mint', hasQty: true, payable: false },
        { name: 'publicMint', hasQty: true, payable: false },
        { name: 'claim', hasQty: true, payable: false },
        { name: 'mint', hasQty: false, payable: false },
        { name: 'publicMint', hasQty: false, payable: false },
        { name: 'claim', hasQty: false, payable: false },
      ];
      
      let success = false;
      for (const method of fallbackMethods) {
        try {
          addLog(`Trying ${method.name}(${method.hasQty ? config.mintQuantity : ''})${method.payable ? ' payable' : ' free'}...`, 'info');
          
          const methodTxOptions = { ...txOptions };
          if (!method.payable) {
            methodTxOptions.value = 0;
          }
          
          if (method.hasQty) {
            tx = await contract[method.name](config.mintQuantity, methodTxOptions);
          } else {
            tx = await contract[method.name](methodTxOptions);
          }
          
          success = true;
          addLog(`✅ Success with ${method.name}`, 'success');
          break;
        } catch (methodError) {
          const errorMsg = methodError.message.toLowerCase();
          // Don't log common expected errors to reduce noise
          if (!errorMsg.includes('insufficient funds') && 
              !errorMsg.includes('already minted') &&
              !errorMsg.includes('not started') &&
              !errorMsg.includes('ended')) {
            addLog(`❌ ${method.name} failed: ${methodError.shortMessage || methodError.message}`, 'error');
          }
          continue;
        }
      }
      
      if (!success) {
        throw new Error('All mint methods failed. Contract may be paused or wallet not eligible.');
      }
    }
    
    addLog(`⏳ Confirming... TX: ${tx.hash}`, 'info');
    
    const receipt = await tx.wait();
    
    if (receipt.status !== 1) {
      // Try to get revert reason
      let revertReason = 'Transaction reverted';
      try {
        // Simulate the transaction to get revert reason
        const result = await provider.call({
          to: contractAddress,
          data: tx.data,
          from: walletInfo.address,
          value: mintValue
        });
        
        if (result && result !== '0x') {
          revertReason = `Reverted with data: ${result}`;
        }
      } catch (simError) {
        revertReason = simError.reason || simError.message;
      }
      throw new Error(revertReason);
    }
    
    return tx.hash;
  };
  
  const startMinting = async () => {
    if (!ethersRef.current) {
      addLog('❌ Ethers.js not loaded yet', 'error');
      return;
    }
    
    if (wallets.length === 0) {
      addLog('❌ Please scan wallets first', 'error');
      return;
    }
    
    if (!collectionInfo) {
      addLog('❌ Collection info not loaded', 'error');
      return;
    }
    
    if (seaportDetected && advancedOptions.useSeaport) {
      addLog('❌ Seaport minting requires order fulfillment (advanced feature)', 'error');
      addLog('💡 For Seaport drops, disable "Use Seaport" or use direct contract address', 'warning');
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
      
      const totalCost = (parseFloat(collectionInfo.price || '0') * config.mintQuantity) + parseFloat(walletInfo.gasEstimate);
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
          
          if (errorMsg.includes('insufficient funds')) {
            addLog('💡 Insufficient funds - skipping retries', 'warning');
            break;
          }
          
          if (errorMsg.includes('already minted') || errorMsg.includes('max supply')) {
            addLog('💡 Contract limit reached - skipping retries', 'warning');
            break;
          }
          
          if (errorMsg.includes('revert')) {
            addLog('💡 Transaction reverted - check contract status', 'warning');
            // Don't retry on revert as it will likely fail again
            break;
          }
          
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
        const delaySeconds = advancedOptions.randomDelay 
          ? Math.floor(Math.random() * 3) + 3
          : 5;
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
    setConfig({
      collectionUrl: '',
      contractAddress: '',
      rpcUrl: '',
      privateKeys: '',
      gasLevel: 'normal',
      mintQuantity: 1,
    });
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
      case 'ready':
        return 'Ready';
      case 'minting':
        return 'Minting...';
      case 'success':
        return wallet.txHash ? `${wallet.txHash.slice(0, 8)}...` : 'Success';
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 rounded-t-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-10 h-10 text-yellow-300" />
              <div>
                <h1 className="text-3xl font-bold text-white">OpenSea Auto Mint Bot v2</h1>
                <p className="text-purple-100 text-sm">Production-Ready • Multi-Wallet • Smart Detection</p>
              </div>
            </div>
            <Shield className="w-8 h-8 text-green-300" />
          </div>
        </div>
        
        {/* Security Warning */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4 mt-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <strong className="block mb-1">🔒 Security Notice:</strong>
              <ul className="space-y-1 list-disc list-inside">
                <li>Private keys stored in memory only (never saved)</li>
                <li>Always verify contract addresses before minting</li>
                <li>Test with small amounts first on testnet</li>
                <li>Transactions are irreversible - use at your own risk</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
                <Activity className="w-6 h-6 text-purple-400" />
                Configuration
              </h2>
              
              <div className="space-y-4">
                {/* Collection URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    OpenSea Collection URL or Contract Address
                  </label>
                  <input
                    type="text"
                    value={config.collectionUrl}
                    onChange={(e) => setConfig({ ...config, collectionUrl: e.target.value })}
                    placeholder="https://opensea.io/collection/... or 0x..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  />
                  {extractContractFromUrl(config.collectionUrl) && (
                    <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      URL detected successfully
                    </p>
                  )}
                </div>
                
                {/* Contract Address Override */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Contract Address (Manual Override)
                  </label>
                  <input
                    type="text"
                    value={config.contractAddress}
                    onChange={(e) => setConfig({ ...config, contractAddress: e.target.value })}
                    placeholder="0x... (leave empty to auto-detect)"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    💡 Use this if auto-detection fails
                  </p>
                </div>
                
                {/* RPC URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    RPC URL 
                    {collectionInfo && (
                      <span className="text-purple-400 ml-2">
                        ({collectionInfo.chainInfo.name} - {collectionInfo.chainInfo.symbol})
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={config.rpcUrl}
                    onChange={(e) => setConfig({ ...config, rpcUrl: e.target.value })}
                    placeholder="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Chain will auto-detect when valid RPC is provided
                  </p>
                </div>
                
                {/* Private Keys */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Private Keys (max 20, one per line)
                  </label>
                  <textarea
                    value={config.privateKeys}
                    onChange={(e) => setConfig({ ...config, privateKeys: e.target.value })}
                    placeholder="0xabc123...&#10;0xdef456...&#10;0xghi789..."
                    rows={5}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm transition"
                  />
                  <p className="text-xs text-gray-400 mt-1 flex items-center justify-between">
                    <span>All keys must start with 0x</span>
                    <span className="text-purple-400 font-semibold">
                      {parsePrivateKeys(config.privateKeys).length}/20 valid
                    </span>
                  </p>
                </div>
                
                {/* Settings Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Gas Level</label>
                    <select
                      value={config.gasLevel}
                      onChange={(e) => setConfig({ ...config, gasLevel: e.target.value })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    >
                      <option value="low">🐌 Low (-15%)</option>
                      <option value="normal">⚡ Normal</option>
                      <option value="high">🚀 High (+30%)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Mint Quantity</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={config.mintQuantity}
                      onChange={(e) => setConfig({ ...config, mintQuantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    />
                  </div>
                </div>
                
                {/* Scan Button */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={scanWallets}
                    disabled={isScanning || isMinting}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed shadow-lg"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Scanning Wallets...
                      </>
                    ) : (
                      <>
                        <Scan className="w-5 h-5" />
                        Scan & Analyze
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Advanced Options */}
              {wallets.length > 0 && (
                <>
                  <div className="mt-6 pt-6 border-t border-slate-700">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Mint Phase Selection
                    </label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={mintPhases.public}
                          onChange={(e) => setMintPhases({ ...mintPhases, public: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white font-medium">Public Mint</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={mintPhases.whitelist}
                          onChange={(e) => setMintPhases({ ...mintPhases, whitelist: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white font-medium">Whitelist</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={mintPhases.allowlist}
                          onChange={(e) => setMintPhases({ ...mintPhases, allowlist: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white font-medium">Allowlist</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-gray-300 mb-3">
                      Advanced Options
                    </label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={advancedOptions.autoRetry}
                          onChange={(e) => setAdvancedOptions({ ...advancedOptions, autoRetry: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white text-sm">Auto-Retry (3x)</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={advancedOptions.randomDelay}
                          onChange={(e) => setAdvancedOptions({ ...advancedOptions, randomDelay: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white text-sm">Random Delays</span>
                      </label>
                      
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-700/30 px-4 py-2 rounded-lg hover:bg-slate-700/50 transition">
                        <input
                          type="checkbox"
                          checked={advancedOptions.useSeaport}
                          onChange={(e) => setAdvancedOptions({ ...advancedOptions, useSeaport: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-white text-sm">Seaport Protocol</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
              
              {/* Action Buttons */}
              {wallets.length > 0 && (
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={startMinting}
                    disabled={isMinting || wallets.filter(w => w.status === 'ready').length === 0}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3.5 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed shadow-lg"
                  >
                    {isMinting ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        Minting in Progress...
                      </>
                    ) : (
                      <>
                        <Zap className="w-6 h-6" />
                        Start Minting ({wallets.filter(w => w.status === 'ready').length} ready)
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={clearAll}
                    disabled={isMinting || isScanning}
                    className="px-6 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-700 text-white py-3.5 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
            
            {/* Wallet Status Panel */}
            {wallets.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="w-6 h-6 text-purple-400" />
                    Wallet Status
                  </span>
                  <span className="text-sm text-gray-400">
                    {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                  </span>
                </h2>
                
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {wallets.map((wallet, idx) => (
                    <div 
                      key={idx} 
                      className={`bg-slate-700/30 rounded-lg p-4 flex items-center justify-between border-l-4 transition ${
                        wallet.status === 'success' ? 'border-green-500' :
                        wallet.status === 'failed' ? 'border-red-500' :
                        wallet.status === 'minting' ? 'border-blue-500' :
                        wallet.status === 'skipped' ? 'border-yellow-500' :
                        'border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(wallet.status)}
                        <div className="flex-1">
                          <p className="text-white font-mono text-sm font-semibold">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            Balance: {parseFloat(wallet.balance).toFixed(4)} {collectionInfo?.chainInfo.symbol || 'ETH'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${
                          wallet.status === 'success' ? 'text-green-400' :
                          wallet.status === 'failed' ? 'text-red-400' :
                          wallet.status === 'minting' ? 'text-blue-400' :
                          wallet.status === 'skipped' ? 'text-yellow-400' :
                          'text-gray-400'
                        }`}>
                          {getStatusText(wallet)}
                        </p>
                        {wallet.txHash && collectionInfo && (
                          <a
                            href={`https://${collectionInfo.chainInfo.explorer}/tx/${wallet.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-purple-400 hover:text-purple-300 transition"
                          >
                            View TX →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Stats */}
                {mintStats.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
                    <div className="text-center bg-green-500/10 rounded-lg p-3">
                      <p className="text-3xl font-bold text-green-400">{mintStats.success}</p>
                      <p className="text-xs text-gray-400 mt-1">Success</p>
                    </div>
                    <div className="text-center bg-red-500/10 rounded-lg p-3">
                      <p className="text-3xl font-bold text-red-400">{mintStats.failed}</p>
                      <p className="text-xs text-gray-400 mt-1">Failed</p>
                    </div>
                    <div className="text-center bg-purple-500/10 rounded-lg p-3">
                      <p className="text-3xl font-bold text-purple-400">{mintStats.total}</p>
                      <p className="text-xs text-gray-400 mt-1">Total</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Collection Info */}
            {collectionInfo && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">💎</span>
                  Collection Info
                </h2>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-gray-400 text-sm">Contract:</span>
                    <span className="text-white font-mono text-xs text-right">
                      {collectionInfo.contractAddress.slice(0, 6)}...{collectionInfo.contractAddress.slice(-4)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Chain:</span>
                    <span className="text-white font-semibold text-sm">{collectionInfo.chainInfo.name}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Mint Price:</span>
                    <span className="text-purple-400 font-bold">
                      {collectionInfo.price} {collectionInfo.chainInfo.symbol}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Est. Gas:</span>
                    <span className="text-white font-semibold text-sm">
                      ~{wallets[0]?.gasEstimate || '0.003'} {collectionInfo.chainInfo.symbol}
                    </span>
                  </div>
                  
                  <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="text-gray-400 text-sm font-semibold">Total per Mint:</span>
                    <span className="text-green-400 font-bold">
                      {(parseFloat(collectionInfo.price || '0') * config.mintQuantity + parseFloat(wallets[0]?.gasEstimate || '0.003')).toFixed(6)} {collectionInfo.chainInfo.symbol}
                    </span>
                  </div>
                  
                  {collectionInfo.mintFunc && (
                    <div className="pt-2 border-t border-slate-700">
                      <span className="text-gray-400 text-xs block mb-1">Mint Function:</span>
                      <span className="text-white font-mono text-xs bg-slate-900/50 px-2 py-1 rounded">
                        {collectionInfo.mintFunc.name}({collectionInfo.mintFunc.params.join(', ')})
                      </span>
                      <span className="text-gray-400 text-xs block mt-1">
                        Payable: {collectionInfo.mintFunc.payable ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  
                  {collectionInfo.status.supply.max > 0 && (
                    <div className="pt-2 border-t border-slate-700">
                      <span className="text-gray-400 text-xs block mb-2">Supply:</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-900/50 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${(collectionInfo.status.supply.current / collectionInfo.status.supply.max) * 100}%` }}
                          />
                        </div>
                        <span className="text-white text-xs font-semibold">
                          {collectionInfo.status.supply.current}/{collectionInfo.status.supply.max}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {collectionInfo.status.isPaused && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 mt-2">
                      <p className="text-red-400 text-xs font-semibold">⚠️ Contract is PAUSED</p>
                    </div>
                  )}
                  
                  {!collectionInfo.status.isPublicSaleActive && (
                    <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-2 mt-2">
                      <p className="text-yellow-400 text-xs font-semibold">⚠️ Public sale NOT active</p>
                    </div>
                  )}
                  
                  {seaportDetected && (
                    <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-2 mt-2">
                      <p className="text-blue-400 text-xs font-semibold">ℹ️ Seaport protocol detected</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Live Logs */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📜</span>
                Live Logs
              </h2>
              
              <div className="bg-slate-900/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                {logs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-2">No logs yet</p>
                    <p className="text-gray-600 text-xs">Configure settings and scan wallets to begin</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-gray-500 flex-shrink-0 select-none">[{log.timestamp}]</span>
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
        
        {/* Footer */}
        <div className="mt-6 text-center text-gray-400 text-sm pb-4 space-y-2">
          <p className="flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Real minting tool - Transactions are irreversible
          </p>
          <p className="text-xs">Always verify contracts • Test on testnet first • Use burner wallets</p>
          <p className="text-xs text-purple-400 mt-3">Made with 💜 for the NFT community • Production Ready v2.0</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
