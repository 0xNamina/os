import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

/**
 * Drop-in replacement for your current component.
 * Key fixes:
 *  - Robust chainId/symbol detection from RPC
 *  - ABI normalization with ethers.Interface
 *  - Smart mint arg builder + fallback attempts
 *  - EIP-1559 gas handling (maxFeePerGas/maxPriorityFeePerGas)
 */
const OpenSeaAutoMint = () => {
  // Optional: set your OpenSea API key here or via UI input
  const [OPENSEA_API_KEY, setOPENSEA_API_KEY] = useState('opensea_api_key_1b5d949c4b3344a5a482a28b60147390');

  const [config, setConfig] = useState({
    collectionUrl: '',
    contractAddress: '',
    rpcUrl: '',
    privateKeys: '',
    gasLevel: 'normal',
    mintQuantity: 1,
  });

  const [mintPhases, setMintPhases] = useState({
    public: true,
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

  // Attach ethers from window if present
  useEffect(() => {
    const timer = setInterval(() => {
      if (window.ethers) {
        ethersRef.current = window.ethers;
        addLog('✅ Ethers.js loaded', 'success');
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const scrollToBottom = () => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [logs]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((p) => [...p, { timestamp, message, type }]);
  };

  const parsePrivateKeys = (keys) =>
    keys
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && k.startsWith('0x'))
      .slice(0, 50);

  const extractContractFromUrl = (url) => {
    const openseaMatch = url?.match(/opensea\.io\/collection\/([^\/\?]+)/i);
    if (openseaMatch) return { type: 'collection', slug: openseaMatch[1] };
    const addressMatch = url?.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch) return { type: 'address', address: addressMatch[0] };
    return null;
  };

  const getOSChainSlug = (chainId) => ({
    1: 'ethereum',
    11155111: 'sepolia',
    137: 'polygon',
    42161: 'arbitrum',
    10: 'optimism',
    8453: 'base',
  }[chainId] || 'ethereum');

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
      const chainId = Number(network.chainId?.toString?.() ?? network.chainId);
      const chains = {
        1: { name: 'Ethereum Mainnet', symbol: 'ETH', explorer: 'etherscan.io' },
        5: { name: 'Goerli Testnet', symbol: 'ETH', explorer: 'goerli.etherscan.io' },
        11155111: { name: 'Sepolia', symbol: 'ETH', explorer: 'sepolia.etherscan.io' },
        137: { name: 'Polygon', symbol: 'MATIC', explorer: 'polygonscan.com' },
        42161: { name: 'Arbitrum One', symbol: 'ETH', explorer: 'arbiscan.io' },
        10: { name: 'Optimism', symbol: 'ETH', explorer: 'optimistic.etherscan.io' },
        8453: { name: 'Base', symbol: 'ETH', explorer: 'basescan.org' },
        33139: { name: 'ApeChain', symbol: 'APE', explorer: 'apescan.io' },
      };
      return { chainId, ...(chains[chainId] || { name: `Chain ${chainId}`, symbol: 'ETH', explorer: '' }) };
    } catch (e) {
      addLog(`❌ RPC chain detect failed: ${e.message}`, 'error');
      return { chainId: 0, name: 'Unknown', symbol: 'ETH', explorer: '' };
    }
  };

  const getGenericABI = () => [
    'function mint() payable',
    'function publicMint() payable',
    'function mint(uint256 quantity) payable',
    'function publicMint(uint256 quantity) payable',
    'function whitelistMint(bytes32[] proof) payable',
    'function allowlistMint(bytes32[] proof, uint256 quantity) payable',
    'function mintWithSignature(bytes signature, uint256 quantity) payable',
    'function mintPrice() view returns (uint256)',
    'function cost() view returns (uint256)',
    'function price() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
    'function paused() view returns (bool)',
    'function publicSaleActive() view returns (bool)',
  ];

  const fetchContractABI = async (address, chainId) => {
    // Use explorer if keys available, otherwise fallback
    const api = {
      1: 'https://api.etherscan.io/api',
      11155111: 'https://api-sepolia.etherscan.io/api',
      137: 'https://api.polygonscan.com/api',
      42161: 'https://api.arbiscan.io/api',
      10: 'https://api-optimistic.etherscan.io/api',
      8453: 'https://api.basescan.org/api',
    }[chainId];

    if (!api) {
      addLog('⚠️ Unsupported explorer for this chain. Using generic ABI.', 'warning');
      return getGenericABI();
    }
    const API_KEY = ''; // optional: put your key here

    try {
      const res = await fetch(`${api}?module=contract&action=getabi&address=${address}&apikey=${API_KEY}`);
      const data = await res.json();
      if (data && data.status === '1' && data.result) {
        addLog('✅ ABI fetched from explorer', 'success');
        const parsed = JSON.parse(data.result);
        if (parsed) return parsed;
      }
    } catch (e) {
      addLog(`⚠️ ABI fetch failed: ${e.message}`, 'warning');
    }
    // Final safety: always return a non-empty ABI
    addLog('📝 Using generic ABI', 'info');
    const generic = getGenericABI();
    return Array.isArray(generic) && generic.length ? generic : ['function mint()'];
};

  const detectMintFunction = (abi) => {
    const ethers = ethersRef.current;
    try {
      const iface = new ethers.Interface(abi && abi.length ? abi : getGenericABI());
      const funcs = Object.values(iface.functions);
      const candidates = funcs.filter((f) => {
        const n = f.name?.toLowerCase?.() || '';
        return n.includes('mint') || n.includes('claim');
      });
      if (candidates.length === 0) return { name: 'mint', params: [], hasQuantity: false, raw: null };

      const preferred =
        candidates.find((f) => /publicmint/i.test(f.name) && f.inputs.length === 1 && /uint/.test(f.inputs[0].type)) ||
        candidates.find((f) => /^mint$/i.test(f.name) && f.inputs.length === 1 && /uint/.test(f.inputs[0].type)) ||
        candidates.find((f) => /public/i.test(f.name) && f.inputs.length === 0) ||
        candidates[0];

      return {
        name: preferred.name,
        params: preferred.inputs.map((i) => i.type),
        hasQuantity: preferred.inputs.length === 1 && /uint/.test(preferred.inputs[0].type),
        raw: preferred,
      };
    } catch (e) {
      addLog(`⚠️ ABI parse failed: ${e.message}`, 'warning');
      return { name: 'mint', params: [], hasQuantity: false, raw: null };
    }
  };

  const getMintPrice = async (provider, address, abi) => {
    try {
      const ethers = ethersRef.current;
      const c = new ethers.Contract(address, abi, provider);
      for (const getter of ['mintPrice', 'cost', 'price', 'getMintPrice', 'publicPrice']) {
        try {
          if (typeof c[getter] === 'function') {
            const p = await c[getter]();
            return ethers.formatEther(p);
          }
        } catch {}
      }
      return '0';
    } catch {
      return '0';
    }
  };

  const checkContractStatus = async (provider, address, abi) => {
    try {
      const ethers = ethersRef.current;
      const c = new ethers.Contract(address, abi, provider);
      let paused = false;
      let publicSale = true;
      let supply = { current: 0, max: 0 };
      try { if (typeof c.paused === 'function') paused = await c.paused(); } catch {}
      try { if (typeof c.publicSaleActive === 'function') publicSale = await c.publicSaleActive(); } catch {}
      try {
        if (typeof c.totalSupply === 'function') {
          const total = await c.totalSupply();
          const max = typeof c.maxSupply === 'function' ? await c.maxSupply() : 0;
          supply = { current: Number(total), max: Number(max) };
        }
      } catch {}
      return { isPaused: paused, isPublicSaleActive: publicSale, supply };
    } catch {
      return { isPaused: false, isPublicSaleActive: true, supply: { current: 0, max: 0 } };
    }
  };

  const randomDelay = (min = 300, max = 800) => new Promise((r) => setTimeout(r, Math.random() * (max - min) + min));

  const scanWallets = async () => {
    if (!ethersRef.current) return addLog('❌ Ethers.js not loaded yet', 'error');
    if (!config.rpcUrl || !config.privateKeys) return addLog('❌ Isi RPC URL dan Private Keys', 'error');

    const extracted = extractContractFromUrl(config.collectionUrl || config.contractAddress);
    if (!extracted) return addLog('❌ URL OpenSea / contract address tidak valid', 'error');

    setIsScanning(true);
    addLog('🔍 Mulai scan wallet...', 'info');

    const keys = parsePrivateKeys(config.privateKeys);
    if (keys.length === 0) {
      setIsScanning(false);
      return addLog('❌ Tidak ada private key valid (harus mulai 0x)', 'error');
    }

    try {
      const ethers = ethersRef.current;
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const chainInfo = await detectChainFromRPC(config.rpcUrl);
      addLog(`🌐 Chain: ${chainInfo.name} (${chainInfo.symbol})`, 'info');

      let contractAddress;
      if (extracted.type === 'collection') {
        addLog(`🔎 Ambil alamat kontrak dari slug: ${extracted.slug} (fallback manual)`, 'warning');
        contractAddress = config.contractAddress;
        if (!contractAddress) throw new Error('Harap isi contractAddress karena OpenSea API tidak digunakan.');
      } else {
        contractAddress = extracted.address;
      }

      if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) throw new Error('Contract address tidak valid.');
      addLog(`📝 Contract: ${contractAddress}`, 'info');

      const seaportAddr = SEAPORT_ADDRESSES[chainInfo.chainId];
      if (seaportAddr && seaportAddr.toLowerCase() === contractAddress.toLowerCase()) {
        setSeaportDetected(true);
        addLog('⚡ Terdeteksi Seaport — drop ini tidak mint langsung (butuh order fulfillment).', 'warning');
      }

      addLog('📄 Fetch ABI...', 'info');
      const abi = await fetchContractABI(contractAddress, chainInfo.chainId);

      const mintFunc = detectMintFunction(abi);
      addLog(`🎯 Fungsi terdeteksi: ${mintFunc.name}(${mintFunc.params.join(', ')})`, 'info');

      addLog('💰 Ambil harga mint...', 'info');
      const price = await getMintPrice(provider, contractAddress, abi);
      addLog(`💰 Mint Price: ${price} ${chainInfo.symbol}`, price === '0' ? 'warning' : 'info');

      addLog('🔍 Cek status kontrak...', 'info');
      const status = await checkContractStatus(provider, contractAddress, abi);
      if (status.isPaused) addLog('⚠️ Kontrak paused', 'warning');
      if (!status.isPublicSaleActive) addLog('⚠️ Public sale tidak aktif', 'warning');
      if (status.supply.max > 0) addLog(`📊 Supply: ${status.supply.current}/${status.supply.max}`, 'info');

      setCollectionInfo({ contractAddress, chainInfo, abi, mintFunc, price, status });

      const scanned = [];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
          const wallet = new ethers.Wallet(key, provider);
          const address = wallet.address;
          addLog(`Scan ${i + 1}/${keys.length}: ${address.slice(0, 6)}...${address.slice(-4)}`, 'info');

          const balanceWei = await provider.getBalance(address);
          const balance = ethers.formatEther(balanceWei);

          let hasMinted = false;
          try {
            const c = new ethers.Contract(contractAddress, abi, provider);
            if (typeof c.balanceOf === 'function') {
              const nftBalance = await c.balanceOf(address);
              hasMinted = Number(nftBalance) > 0;
            }
          } catch {}

          // rough gas estimate
          let gasEstimate = '0.003';
          try {
            const c = new ethers.Contract(contractAddress, abi, provider);
            const feeData = await provider.getFeeData();
            const gasUnitPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');
            let gasLimit = 200000n;
            try {
              if (mintFunc.hasQuantity) {
                gasLimit = await c[mintFunc.name].estimateGas(
                  BigInt(config.mintQuantity),
                  { value: ethers.parseEther(price), from: address }
                );
              } else {
                gasLimit = await c[mintFunc.name].estimateGas({ value: ethers.parseEther(price), from: address });
              }
            } catch {}
            const gasCost = gasLimit * gasUnitPrice;
            gasEstimate = ethers.formatEther(gasCost);
          } catch {}

          scanned.push({ address, privateKey: key, balance, hasMinted, status: hasMinted ? 'already_minted' : 'ready', gasEstimate });
          if (advancedOptions.randomDelay) await randomDelay();
        } catch (e) {
          addLog(`❌ Error scan wallet ${i + 1}: ${e.message}`, 'error');
        }
      }

      setWallets(scanned);
      addLog(`✅ Scan selesai. ${scanned.length} wallet`, 'success');
      const ready = scanned.filter((w) => w.status === 'ready').length;
      addLog(ready ? `✅ ${ready} wallet siap mint` : '⚠️ Tidak ada wallet siap mint', ready ? 'success' : 'warning');
    } catch (e) {
      addLog(`❌ Scan gagal: ${e.message}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const buildMintArgs = (mintFunc) => {
    const args = [];
    for (const t of mintFunc.params) {
      if (/uint/.test(t)) args.push(BigInt(config.mintQuantity));
      else if (/bytes32\[\]|bytes\[\]/.test(t)) args.push([]);
      else if (/bytes/.test(t)) args.push('0x');
      else if (/address/.test(t)) args.push('0x0000000000000000000000000000000000000000');
      else args.push(0);
    }
    return args;
  };

  const executeMint = async (walletInfo, provider) => {
    const ethers = ethersRef.current;
    const { contractAddress, abi, mintFunc, price } = collectionInfo;
    const wallet = new ethers.Wallet(walletInfo.privateKey, provider);
    const c = new ethers.Contract(contractAddress, abi, wallet);

    const feeData = await provider.getFeeData();
    let maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1.5', 'gwei');

    if (config.gasLevel === 'high') maxFeePerGas = (BigInt(maxFeePerGas) * 130n) / 100n;
    if (config.gasLevel === 'low') maxFeePerGas = (BigInt(maxFeePerGas) * 85n) / 100n;

    const txOpts = {
      value: ethers.parseEther(price || '0'),
      gasLimit: 350000,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    addLog('📤 Sending transaction...', 'info');
    const args = buildMintArgs(mintFunc);
    let tx;

    try {
      tx = args.length ? await c[mintFunc.name](...args, txOpts) : await c[mintFunc.name](txOpts);
    } catch (primaryErr) {
      addLog('⚠️ Primary method failed, trying alternatives...', 'warning');
      const tries = [
        { name: 'mint', args: mintFunc.hasQuantity ? [BigInt(config.mintQuantity)] : [] },
        { name: 'publicMint', args: mintFunc.hasQuantity ? [BigInt(config.mintQuantity)] : [] },
        { name: 'claim', args: [] },
      ];
      let ok = false;
      for (const t of tries) {
        try {
          addLog(`Trying ${t.name}(${t.args.map((a) => a?.toString?.() ?? a).join(', ')})...`, 'info');
          tx = t.args.length ? await c[t.name](...t.args, txOpts) : await c[t.name](txOpts);
          ok = true;
          break;
        } catch {}
      }
      if (!ok) {
        try {
          addLog('Trying detected function with zero quantity...', 'info');
          tx = await c[mintFunc.name](0, txOpts);
        } catch (e) {
          throw new Error('All mint methods failed. Contract may be paused or wallet not eligible.');
        }
      }
    }

    addLog(`⏳ Confirming... TX: ${tx.hash}`, 'info');
    const rc = await tx.wait();
    if (rc.status !== 1) throw new Error('Transaction reverted');
    return tx.hash;
  };

  
  // --- OpenSea Launchpad / Seaport helpers ---
  const fetchOSListingsByCollection = async (slug, chainSlug, limit = 1) => {
    const url = `https://api.opensea.io/api/v2/listings/collection/${slug}?limit=${limit}&order_by=price&order_direction=asc`;
    const res = await fetch(url, { headers: { 'X-API-KEY': OPENSEA_API_KEY } });
    if (!res.ok) throw new Error(`OpenSea listings error: ${res.status}`);
    const data = await res.json();
    return data && data.listings ? data.listings : [];
  };

  const generateOSFulfillmentForListing = async (listing, taker, chainSlug) => {
    const url = `https://api.opensea.io/api/v2/listings/fulfillment_data`;
    const body = { listing, chain: chainSlug, fulfiller: { address: taker } };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': OPENSEA_API_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`fulfillment_data error: ${res.status} ${txt}`);
    }
    const data = await res.json();
    return data && data.fulfillment_data ? data.fulfillment_data : null;
  };

  const mintViaOpenSeaLaunchpad = async (slug, provider, wallet) => {
    const chainSlug = getOSChainSlug((await provider.getNetwork()).chainId);
    addLog(`🔎 Fetching OpenSea listings for ${slug} on ${chainSlug}...`, 'info');
    const listings = await fetchOSListingsByCollection(slug, chainSlug, 1);
    if (!listings.length) throw new Error('No listings found on OpenSea.');
    const listing = listings[0];
    addLog('🧾 Listing found, generating fulfillment...', 'info');
    const fulfill = await generateOSFulfillmentForListing(listing, wallet.address, chainSlug);
    const tx = fulfill?.transaction;
    if (!tx?.to || !tx?.data) throw new Error('Invalid fulfillment tx data.');
    const value = tx.value ? BigInt(tx.value) : 0n;
    addLog('📤 Sending Seaport fulfillment tx...', 'info');
    const sent = await wallet.sendTransaction({ to: tx.to, data: tx.data, value });
    addLog(`⏳ Confirming... TX: ${sent.hash}`, 'info');
    const rc = await sent.wait();
    if (rc.status !== 1) throw new Error('Fulfillment reverted');
    return sent.hash;
  };

  const startMinting = async () => {
    if (!ethersRef.current) return addLog('❌ Ethers.js not loaded yet', 'error');
    if (!wallets.length) return addLog('❌ Jalankan scan dulu', 'error');
    if (!collectionInfo) return addLog('❌ Collection info belum siap', 'error');
    if (seaportDetected && advancedOptions.useSeaport && !config.collectionUrl) {
      return addLog('❌ Seaport drop terdeteksi. Isi OpenSea collection URL agar bisa fulfill via API.', 'error');
    }

    const selected = Object.keys(mintPhases).filter((k) => mintPhases[k]);
    if (!selected.length) return addLog('❌ Pilih minimal satu phase mint', 'error');

    setIsMinting(true);
    setMintStats({ success: 0, failed: 0, total: wallets.length });
    addLog('🚀 Starting mint process...', 'info');

    const ethers = ethersRef.current;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const arr = [...wallets];
    let ok = 0, ko = 0;

    for (let i = 0; i < arr.length; i++) {
      const w = arr[i];
      w.status = 'minting';
      setWallets([...arr]);
      addLog(`\n==================================================`, 'info');
      addLog(`🔄 Wallet ${i + 1}/${arr.length}: ${w.address.slice(0, 6)}...${w.address.slice(-4)}`, 'info');

      if (w.hasMinted) {
        w.status = 'skipped';
        w.error = 'Already minted';
        setWallets([...arr]);
        addLog('⏭️ Skipped: Already has NFT', 'warning');
        ko++; setMintStats((p) => ({ ...p, failed: p.failed + 1 }));
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      const totalCost = (parseFloat(collectionInfo.price || '0') * config.mintQuantity) + parseFloat(w.gasEstimate || '0');
      if (parseFloat(w.balance) < totalCost) {
        w.status = 'failed';
        w.error = 'Insufficient balance';
        setWallets([...arr]);
        addLog(`❌ Failed: Need ${totalCost.toFixed(6)} ${collectionInfo.chainInfo?.symbol || ''}, have ${w.balance}`, 'error');
        ko++; setMintStats((p) => ({ ...p, failed: p.failed + 1 }));
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      let success = false, retry = 0, hash = null;
      const maxRetries = advancedOptions.autoRetry ? 3 : 0;

      while (!success && retry <= maxRetries) {
        if (retry) {
          addLog(`🔄 Retry ${retry}/${maxRetries}...`, 'warning');
          await new Promise((r) => setTimeout(r, 1200));
        }
        try {
          // If we have OpenSea API key + collection URL, try Seaport fulfillment first
          if (OPENSEA_API_KEY && config.collectionUrl) {
            const extracted = extractContractFromUrl(config.collectionUrl);
            if (extracted?.type === 'collection') {
              hash = await mintViaOpenSeaLaunchpad(extracted.slug, provider, new ethersRef.current.Wallet(w.privateKey, provider));
              success = true;
            }
          }
          if (!success) {
            hash = await executeMint(w, provider);
            success = true;
          }
          addLog(`✅ SUCCESS! TX: ${hash}`, 'success');
        } catch (e) {
          const msg = e?.message || 'Unknown error';
          addLog(`❌ Attempt ${retry + 1} failed: ${msg}`, 'error');
          if (/insufficient funds/i.test(msg) || /max supply|already minted/i.test(msg)) break;
          retry++;
        }
      }

      if (success) {
        w.status = 'success'; w.txHash = hash; ok++; setMintStats((p) => ({ ...p, success: p.success + 1 }));
      } else {
        w.status = 'failed'; w.error = 'Max retries reached'; ko++; setMintStats((p) => ({ ...p, failed: p.failed + 1 }));
      }
      setWallets([...arr]);

      if (i < arr.length - 1) {
        const delaySec = advancedOptions.randomDelay ? Math.floor(Math.random() * 3) + 3 : 5;
        addLog(`⏳ Waiting ${delaySec}s before next wallet...`, 'info');
        await new Promise((r) => setTimeout(r, delaySec * 1000));
      }
    }

    setIsMinting(false);
    addLog(`\n==================================================`, 'info');
    addLog('🎉 Minting process completed!', 'success');
    addLog(`📊 Final Results: ${ok} ✅ | ${ko} ❌ | ${arr.length} Total`, 'info');
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

  const getStatusText = (w) => {
    switch (w.status) {
      case 'ready': return 'Ready';
      case 'minting': return 'Minting...';
      case 'success': return w.txHash ? `${w.txHash.slice(0, 8)}...` : 'Success';
      case 'failed': return w.error || 'Failed';
      case 'skipped': return w.error || 'Skipped';
      case 'already_minted': return 'Already Minted';
      default: return 'Unknown';
    }
  };

  // Minimal UI wrapper so you can drop-in replace easily
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold">OpenSea Auto Mint — Fixed</h1>
        <p className="text-sm text-gray-300 mt-1">
          Deteksi chain/symbol otomatis, ABI normalisasi, argumen mint dinamis, gas EIP-1559, dan fallback yang lebih pintar.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
            <label className="block text-sm">OpenSea Collection URL / Contract Address</label>
            <input className="w-full bg-slate-900 rounded p-2 text-sm" placeholder="https://opensea.io/collection/..." value={config.collectionUrl} onChange={(e)=>setConfig({...config, collectionUrl:e.target.value})}/>
            <label className="block text-sm">Contract Address (optional jika URL langsung address)</label>
            <input className="w-full bg-slate-900 rounded p-2 text-sm" placeholder="0x..." value={config.contractAddress} onChange={(e)=>setConfig({...config, contractAddress:e.target.value})}/>
            <label className="block text-sm mt-2">RPC URL</label>
            <input className="w-full bg-slate-900 rounded p-2 text-sm" placeholder="https://..." value={config.rpcUrl} onChange={(e)=>setConfig({...config, rpcUrl:e.target.value})}/>
            <label className="block text-sm mt-2">Private Keys (satu per baris)</label>
            <textarea className="w-full bg-slate-900 rounded p-2 text-sm h-24" value={config.privateKeys} onChange={(e)=>setConfig({...config, privateKeys:e.target.value})}/>
            <label className="block text-sm mt-2">OpenSea API Key (opsional untuk Launchpad/Seaport)</label>
            <input className="w-full bg-slate-900 rounded p-2 text-sm" placeholder="opensea_api_key_..." value={OPENSEA_API_KEY} onChange={(e)=>setOPENSEA_API_KEY(e.target.value)}/>
            <div className="flex gap-2 items-center mt-2">
              <span className="text-sm">Gas:</span>
              <select className="bg-slate-900 rounded p-2 text-sm" value={config.gasLevel} onChange={(e)=>setConfig({...config, gasLevel:e.target.value})}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <span className="text-sm ml-4">Qty:</span>
              <input type="number" min="1" className="bg-slate-900 rounded p-2 text-sm w-20" value={config.mintQuantity} onChange={(e)=>setConfig({...config, mintQuantity: Number(e.target.value || 1)})}/>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={scanWallets} disabled={isScanning} className="bg-indigo-600 px-3 py-2 rounded disabled:opacity-50">Scan</button>
              <button onClick={startMinting} disabled={isMinting || !wallets.length} className="bg-emerald-600 px-3 py-2 rounded disabled:opacity-50">Start Minting</button>
            </div>
          </div>

          <div className="bg-slate-800/60 rounded-xl p-4">
            <div className="text-sm font-semibold mb-2">Logs</div>
            <div className="h-72 overflow-auto space-y-1 bg-slate-900/60 rounded p-2">
              {logs.map((log, i) => (
                <div key={i} className="text-xs text-gray-300">
                  <span className="text-gray-500">{log.timestamp} — </span>
                  <span className={
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'warning' ? 'text-yellow-400' : 'text-gray-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {wallets.length > 0 && (
          <div className="bg-slate-800/60 rounded-xl p-4 mt-4">
            <div className="text-sm font-semibold mb-2">Wallets</div>
            <div className="space-y-2">
              {wallets.map((w, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/60 rounded p-2 text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(w.status)}
                    <span className="font-mono">{w.address.slice(0,6)}...{w.address.slice(-4)}</span>
                  </div>
                  <div className="text-xs text-gray-300">{getStatusText(w)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {collectionInfo && (
          <div className="text-xs text-gray-400 mt-4">
            Chain: {collectionInfo.chainInfo?.name} • Token: {collectionInfo.chainInfo?.symbol} • Contract: {collectionInfo.contractAddress}
          </div>
        )}

        <div className="mt-6 text-center text-gray-400 text-xs">
          <p>Always test on testnet • Use burner wallets • Verify contracts</p>
        </div>
      </div>
    </div>
  );
};

export default OpenSeaAutoMint;
