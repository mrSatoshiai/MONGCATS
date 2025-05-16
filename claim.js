// claim.js – Ethers v5 문법 기준으로 수정, 로딩 메시지 영어화 등

// 전역 RPC 요청 스로틀 (이 부분은 ethers 버전과 무관)
if (window.ethereum?.request) {
  const _origRequest = window.ethereum.request.bind(window.ethereum);
  let _lastRequestTime = 0;
  window.ethereum.request = async (args) => {
      const now = Date.now();
      const elapsedTime = now - _lastRequestTime;
      const throttleTime = 700;
      if (elapsedTime < throttleTime) {
          await new Promise(r => setTimeout(r, throttleTime - elapsedTime));
      }
      _lastRequestTime = Date.now();
      return _origRequest(args);
  };
}

let _lastSendTime = 0;
async function safeSend(fn) {
  const now = Date.now();
  const elapsedTime = now - _lastSendTime;
  const throttleTime = 700;
  if (elapsedTime < throttleTime) {
      await new Promise(r => setTimeout(r, throttleTime - elapsedTime));
  }
  _lastSendTime = Date.now();
  return fn();
}

async function waitRc(hash, max = 15, gap = 1500) {
  if (!signer) throw new Error("Signer not available for getTransactionReceipt"); // signer는 wallet.js에서 설정
  for (let i = 0; i < max; i++) {
      try {
          if (typeof showLoading === 'function') {
              showLoading(`Verifying transaction... (${i + 1}/${max}) TX: ${hash.slice(0,10)}`);
          }
          const rc = await signer.provider.getTransactionReceipt(hash); // provider는 Ethers v5 Web3Provider 인스턴스여야 함
          if (rc) return rc;
          await new Promise(r => setTimeout(r, gap));
      } catch (err) {
          const msg = err.data?.message || err.message || "";
          if (msg.includes("25/second") || (err.info?.error?.code === -32007) || (err.error?.code === -32007) ) {
              console.warn(`waitRc: RPC limit, waiting 5s (attempt ${i + 1}/${max})`);
              if (typeof showLoading === 'function') showLoading(`RPC request limit, retrying... (${i + 1}/${max})`);
              await new Promise(r => setTimeout(r, 5000));
              continue;
          }
          console.error(`waitRc: Error (attempt ${i + 1}/${max})`, err);
          throw err;
      }
  }
  throw Error("⏳ Transaction receipt timeout for " + hash.slice(0, 10) + "...");
}

function bigIntReplacer(key, value) {
  if (typeof value === 'bigint') return value.toString() + 'n'; // BigInt는 Ethers v5에서 BigNumber로 처리됨
  return value;
}

let _slotMachineAbi = null;
let __slot = null; // Contract 인스턴스 캐시
let deployAddrCache = null;
let _cachedAbiJsonStringForSlot = null;

async function loadContractAbi() {
  if (_slotMachineAbi) return _slotMachineAbi;
  try {
      const response = await fetch("./SlotMachineABI.json"); // 경로 확인 필요
      if (!response.ok) throw new Error(`HTTP error ${response.status} fetching ABI`);
      const artifact = await response.json();
      if (!artifact.abi) throw new Error("ABI key not found in artifact");
      _slotMachineAbi = artifact.abi;
      console.log("[ABI Loader] SlotMachine ABI loaded successfully.");
      return _slotMachineAbi;
  } catch (error) {
      console.error("❌ Failed to load SlotMachine ABI:", error);
      if (typeof hideLoading === 'function') hideLoading();
      alert("Failed to load contract ABI. Please refresh or contact support.");
      return null;
  }
}

async function getSlot() {
  // signer는 wallet.js에서 Ethers v5 기준으로 생성된 Signer 인스턴스여야 함
  if (!signer) throw new Error("🦊 Wallet not connected (signer not ready)");
  
  const loadedFullAbi = await loadContractAbi();
  if (!loadedFullAbi) throw Error("ABI not loaded.");

  let addr = window.__SLOT_ADDR__; // window 전역 변수 (wallet.js에서 설정)
  if (!addr) {
      if (!deployAddrCache) {
          try {
              const deployInfoResponse = await fetch("./deploy.json"); // 경로 확인 필요
              if (!deployInfoResponse.ok) throw new Error(`HTTP error ${deployInfoResponse.status} fetching deploy.json`);
              const deployInfo = await deployInfoResponse.json();
              if (!deployInfo.SlotMachine) throw new Error("SlotMachine address not in deploy.json");
              deployAddrCache = deployInfo.SlotMachine;
          } catch (e) { throw Error("Failed to get contract address from deploy.json: " + e.message); }
      }
      addr = deployAddrCache;
  }

  // Ethers v5: ethers.utils.isAddress 사용
  if (!addr || !ethers.utils.isAddress(addr)) {
      throw new Error("Invalid SlotMachine address: " + String(addr));
  }

  const newAbiJsonString = JSON.stringify(loadedFullAbi);
  // Ethers v5: Contract 인스턴스의 주소는 .address로 접근
  if (!__slot || __slot.address !== addr || _cachedAbiJsonStringForSlot !== newAbiJsonString) {
      console.log("[getSlot] Creating/Recreating SlotMachine instance. Address:", addr);
      __slot = new ethers.Contract(addr, loadedFullAbi, signer);
      _cachedAbiJsonStringForSlot = newAbiJsonString;
  }
  return __slot;
}

async function parseSeeds(rc) {
  const slot = await getSlot();
  // Ethers v5: ev = slot.interface.events["FreeSeedsGranted"] 또는 getEvent
  const evFragment = slot.interface.getEvent("FreeSeedsGranted");
  if (!evFragment) throw new Error("Event 'FreeSeedsGranted' not found in ABI.");
  
  const contractAddress = slot.address.toLowerCase(); // Ethers v5
  
  const log = rc.logs.find(l => {
      if (l.address.toLowerCase() !== contractAddress) return false;
      try {
          // 로그의 토픽과 ABI의 이벤트 시그니처 토픽을 비교
          // Ethers v5의 EventFragment는 .format()이 없으므로, 직접 토픽을 가져오거나,
          // parseLog를 시도하고 에러를 잡는 방식으로 필터링.
          // 더 간단하게는, 로그가 여러 개가 아니라면, 인터페이스로 디코딩 시도 후 에러 처리.
          // 여기서는 decodeEventLog를 사용할 것이므로, 토픽 직접 비교는 생략 가능.
          return true; // 일단 주소만 맞으면 후보로 간주
      } catch (e) { return false; }
  });

  if (!log) throw Error("Log for event 'FreeSeedsGranted' not found in receipt.");
  if (!log.data || log.data === "0x" || log.data.length < 10) throw Error(`Invalid log.data for FreeSeedsGranted: ${log.data}.`);

  try {
      // Ethers v5: slot.interface.decodeEventLog(eventFragment, data, topics)
      const decodedLog = slot.interface.decodeEventLog(evFragment, log.data, log.topics);
      const seedsArray = decodedLog.seeds || (Array.isArray(decodedLog) && decodedLog.length > 1 ? decodedLog[1] : undefined); // Ethers v5는 이름으로 접근
      
      if (!Array.isArray(seedsArray)) throw new Error("Failed to decode 'seeds' array from FreeSeedsGranted event.");
      // BigNumber를 string으로 변환
      return seedsArray.map(bn => bn.toString());
  } catch (error) { console.error("[parseSeeds] Error decoding event:", error); throw error; }
}


let isClaimFree = false, lastFree = 0;
let isBuying = false, lastBuy = 0;
let isClaimToken = false, lastToken = 0;

async function claimFreeSpins() {
  if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') {
      console.error("showLoading or hideLoading function is not available."); return;
  }
  if (globalIsLoading) return; // main.js의 전역 변수

  if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;

  const now = Date.now();
  if (isClaimFree || (now - lastFree < 1000)) {
      console.log("Claim free spins throttled"); return;
  }
  isClaimFree = true; lastFree = now;
  showLoading("Requesting free spins...");

  try {
      const slotContract = await getSlot();
      showLoading("Waiting for transaction signature... (Free Spins)");
      const tx = await safeSend(() => slotContract.claimFreeSpins());
      showLoading(`Processing free spins transaction... TX: ${tx.hash.slice(0, 10)}`);
      const rc = await waitRc(tx.hash);
      if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);

      showLoading("Processing seed information...");
      const seeds = await parseSeeds(rc);

      if (!playerSession) throw new Error("playerSession is not defined"); // main.js의 전역 변수
      playerSession.wallet = walletAddress; // main.js/wallet.js의 전역 변수
      
      const newSeedObjects = seeds.map(v => ({ value: v, used: false, score: 0 }));
      playerSession.seeds = (playerSession.seeds?.filter(s => s.used) || []).concat(newSeedObjects);

      if (typeof saveSession === 'function') saveSession(); // session.js

      playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) +
                    (playerSession.paidSeeds?.filter(s => !s.used).length || 0); // main.js의 전역 변수

      alert("🎰 Free spins claimed! You've got " + seeds.length + " new spins.");

      if (playCredits > 0 && (playerSession.seeds.some(s=>!s.used) || playerSession.paidSeeds.some(s=>!s.used))) {
          gameStarted = true; // main.js의 전역 변수
      }
  } catch (e) {
      alert("Failed to claim free spins: " + (e.reason || e.data?.message || e.message || "Unknown error."));
      console.error("claimFreeSpins error:", e);
  } finally {
      isClaimFree = false;
      hideLoading(); // main.js의 함수
  }
}

async function buyPlays(count, eth) {
  if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') return;
  if (globalIsLoading) return;

  if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;
  const now = Date.now();
  if (isBuying || (now - lastBuy < 1000)) {
      console.log("Buy plays throttled"); return;
  }
  isBuying = true; lastBuy = now;
  showLoading(`Purchasing ${count} plays...`);

  try {
      const slotContract = await getSlot();
      showLoading("Waiting for transaction signature... (Buy Plays)");
      const txOptions = {};
      // Ethers v5: ethers.utils.parseEther
      const tx = await safeSend(() => slotContract.buyPlays(count, { ...txOptions, value: ethers.utils.parseEther(eth) }));
      showLoading(`Processing purchase transaction... TX: ${tx.hash.slice(0, 10)}`);
      const rc = await waitRc(tx.hash);
      if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);

      showLoading("Processing seed information...");
      const seeds = await parseSeeds(rc);
      if (!playerSession) throw new Error("playerSession is not defined");

      playerSession.paidSeeds = playerSession.paidSeeds || [];
      playerSession.paidSeeds.push(...seeds.map(v => ({ value: v, used: false, score: 0 })));

      if (typeof saveSession === 'function') saveSession();

      playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) +
                    (playerSession.paidSeeds?.filter(s => !s.used).length || 0);

      alert("💰 Plays purchased! You've got " + seeds.length + " new spins.");
      if (playCredits > 0 && (playerSession.seeds.some(s=>!s.used) || playerSession.paidSeeds.some(s=>!s.used))) {
          gameStarted = true;
      }
  } catch (e) {
      alert("Failed to purchase plays: " + (e.reason || e.data?.message || e.message || "Unknown error."));
      console.error("buyPlays error:", e);
  } finally {
      isBuying = false;
      hideLoading();
  }
}

async function claimTokens() {
  if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') return;
  if (globalIsLoading) return;

  if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;
  const now = Date.now();
  if (isClaimToken || (now - lastToken < 1000)) {
      console.log("Claim tokens throttled"); return;
  }
  isClaimToken = true; lastToken = now;
  showLoading("Preparing to claim tokens...");

  const allSeedsInSession = [...(playerSession?.seeds || []), ...(playerSession?.paidSeeds || [])];
  const lastUsedSeedObject = [...allSeedsInSession].reverse().find(s => s.used);

  if (!lastUsedSeedObject || !lastUsedSeedObject.value) {
      alert("No used seeds found to claim. Please play the game first.");
      isClaimToken = false;
      hideLoading();
      return;
  }
  const seedValueForContract = ethers.BigNumber.from(lastUsedSeedObject.value); // Ethers v5: BigNumber 사용

  try {
      if (score === 0) {
          alert("No score to claim (UI score is 0).");
          isClaimToken = false;
          hideLoading();
          return;
      }
      const slotContract = await getSlot();

      showLoading("Verifying claim eligibility...");
      try {
          // Ethers v5: ethers.utils.isAddress
          if (walletAddress && ethers.utils.isAddress(walletAddress)) {
              const viewResult = await slotContract.getCalculatedTotalScoreForClaim(walletAddress, seedValueForContract);
              // Ethers v5: BigNumber.toString()
              console.log("[ClaimTokens] DEBUG: Score from view:", viewResult.calculatedScore.toString(), "Seeds:", viewResult.seedsConsideredCount.toString());
              if (viewResult.calculatedScore.isZero() && score > 0) { // Ethers v5: .isZero()
                   console.warn("[ClaimTokens] DEBUG: Contract view 0, UI score > 0.");
              }
          }
      } catch (viewError) { console.warn("[ClaimTokens] DEBUG: View fn error:", viewError); }
      
      // Ethers v5: callStatic을 직접 메서드처럼 호출하거나, contract.callStatic.methodName()
      await slotContract.callStatic.claimTokensBySeed(seedValueForContract);
      
      showLoading("Waiting for transaction signature... (Claim Tokens)");
      const tx = await safeSend(() => slotContract.claimTokensBySeed(seedValueForContract));
      showLoading(`Processing token claim... TX: ${tx.hash.slice(0, 10)}`);
      const rc = await waitRc(tx.hash);
      if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);

      const claimedScoreEstimate = score;
      alert(`✅ ${claimedScoreEstimate} $tMONG claimed! (TX: ${tx.hash.slice(0, 10)}...)`);

      playerSession = { wallet: walletAddress, seeds: [], paidSeeds: [], totalScore: 0 };
      score = 0;
      playCredits = 0;
      if (typeof saveSession === 'function') saveSession();
      gameStarted = false;

      showLoading("Updating balance information...");
      if (typeof fetchAndUpdateTokenInfo === 'function') {
          await fetchAndUpdateTokenInfo();
      }
      
      if (typeof restoreDefaultLayout === 'function') {
           restoreDefaultLayout();
      } else {
          hideLoading();
      }

  } catch (e) {
      let errorMessage = "Token claim failed: ";
      if (e.reason) errorMessage += e.reason; // Contract revert reason
      else if (e.error?.message) errorMessage += e.error.message; // Ethers specific error
      else if (e.data?.message) errorMessage += e.data.message; // Provider RPC error
      else if (e.message) errorMessage += e.message;
      else errorMessage += "Unknown error.";
      alert(errorMessage);
      console.error("[claimTokens] Error:", e);
  } finally {
      isClaimToken = false;
      if (typeof hideLoading === 'function' && globalIsLoading) {
           hideLoading();
      }
  }
}