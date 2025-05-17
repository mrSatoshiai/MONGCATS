// ui.js – 버튼 레이블 변경

function setupInsertButtons() {
  if (typeof insertButtons !== 'undefined' && Array.isArray(insertButtons)) {
      insertButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
      insertButtons.length = 0;
  }

  const options = [
      // 무료 스핀 레이블 변경: 10회 / 3시간마다
      { label: 'Claim Free Spins (10 spins / 3 hours)', type: 'free', plays: 10 }, // plays도 10으로 변경
      // 유료 스핀 레이블 및 옵션 변경: 0.1 MON으로 30회
      { label: 'Buy 30 Games (0.1 $MON)', type: 'paid', plays: 30, price: '0.1' } 
      // 나머지 유료 옵션은 컨트랙트에서 지원한다면 유지, 아니면 제거
  ];

  options.forEach((opt, idx) => {
      const btn = createButton(opt.label);
      btn.position(width / 2 - 125, 280 + idx * 45); // 옵션 수에 따라 Y 간격 조절 필요할 수 있음
      btn.size(250, 35);
      btn.mousePressed(async () => {
          if (globalIsLoading) return;
          if (!isConnected) return alert("🦊 Please connect your wallet first.");

          if (opt.type === 'free') {
              if (typeof claimFreeSpins === 'function') {
                  await claimFreeSpins(); // claim.js (내부에서 playCredits, gameStarted 업데이트)
              } else { console.error("claimFreeSpins function is not defined."); }
          } else { // 'paid'
              if (typeof buyPlays === 'function') {
                  await buyPlays(opt.plays, opt.price); // claim.js (내부에서 playCredits, gameStarted 업데이트)
              } else { console.error("buyPlays function is not defined."); }
          }
          // UI 업데이트는 main.js의 hideLoading() 또는 draw() 로직에 의해 일관되게 처리됨.
      });
      if (Array.isArray(insertButtons)) insertButtons.push(btn);
  });
}

// ... (setupSpinAndResetButtons, drawInsertCoinScreen, drawGameScreen, drawResultText, drawScoreBreakdown 함수는 이전과 동일) ...
function setupSpinAndResetButtons() {
spinButton = createButton('SPIN');
spinButton.position(width / 2 - 40, BTN_Y);
spinButton.size(80, 40);
spinButton.mousePressed(async () => {
  if (globalIsLoading) return;
  if (!isConnected) return alert("🦊 Please connect your wallet first.");
  if (playCredits <= 0) {
      alert("🎰 Please insert coins! (No credits to spin)");
      return;
  }
  if (spinning) return;
  if (typeof startSpin === 'function') {
      await startSpin(); 
  } else {
      console.error("startSpin function is not defined.");
  }
  if(!globalIsLoading && typeof hideLoading === 'function') hideLoading();
});
spinButton.hide();

resetButton = createButton('← Back to Insert Coin');
resetButton.position(width / 2 - 100, BTN_Y);
resetButton.size(200, 40);
resetButton.mousePressed(() => {
  if (globalIsLoading) return;
  if (typeof restoreDefaultLayout === 'function') { 
      restoreDefaultLayout();
  } else {
      console.error("restoreDefaultLayout function is not defined.");
      gameStarted = false; result = '';
      if (spinButton?.hide) spinButton.hide();
      if (resetButton?.hide) resetButton.hide();
      if (Array.isArray(insertButtons)) insertButtons.forEach(b => {if(b?.show)b.show()});
  }
});
resetButton.hide();
}

function drawInsertCoinScreen() {
fill(0);
textSize(20); textAlign(CENTER, CENTER);
text("🎰 INSERT COIN TO PLAY 🎰", width / 2, 90);

textSize(13); textAlign(CENTER, TOP);
text(
  "MONG points earned in the game are paid out as $tMONG tokens on the Monad testnet,\n" +
  "and they will be converted 1:1 into $MONG utility tokens issued on the future Monad mainnet.\n\n" +
  "Additionally, the top 1,000 $tMONG holders will be eligible for a PFP NFT airdrop.",
  width / 2, 130
);
}

function drawGameScreen() {
fill(0);
textAlign(CENTER, CENTER); textSize(24);
text(`Score: ${typeof score !== 'undefined' ? score : 0}`, width / 2, 60);
text(`Credits: ${typeof playCredits !== 'undefined' ? playCredits : 0}`, width / 2, 95);

const reelSpacing = 50;
const startX  = (width - (3 * reelWidth + 2 * reelSpacing)) / 2;

if (!reels || !slotImages || slotImages.length === 0) {
  for (let i = 0; i < 3; i++) {
      const xPos = startX + i * (reelWidth + reelSpacing);
      fill(220); noStroke(); rect(xPos, 150, reelWidth, reelHeight, 20);
  }
  return;
}

for (let i = 0; i < 3; i++) {
  const xPos = startX + i * (reelWidth + reelSpacing);
  const reel = reels[i];

  if (!reel || typeof reel.finalIndex === 'undefined' || !reel.spinSequence) {
      fill(200); noStroke(); rect(xPos, 150, reelWidth, reelHeight, 20);
      continue;
  }

  let currentSymbolToDisplay;
  let upperSymbolToDisplay;
  let yPositionOffset = reel.y;

  if (reel.spinSpeeds && reel.spinSpeeds.length === 0) { 
      const finalImgIndex = reel.finalIndex;
      if (finalImgIndex >= 0 && finalImgIndex < totalImages && slotImages[finalImgIndex]?.width > 0) {
          currentSymbolToDisplay = slotImages[finalImgIndex];
      }
      const prevImgIndex = (finalImgIndex - 1 + totalImages) % totalImages;
      if (prevImgIndex >= 0 && prevImgIndex < totalImages && slotImages[prevImgIndex]?.width > 0) {
          upperSymbolToDisplay = slotImages[prevImgIndex];
      }
      yPositionOffset = 0; 

      push();
      translate(xPos, 150);
      noFill(); stroke(0); strokeWeight(2);
      drawingContext.beginPath();
      drawingContext.roundRect(0, 0, reelWidth, reelHeight, 20);
      drawingContext.clip();
          if (currentSymbolToDisplay) image(currentSymbolToDisplay, 0, 0, reelWidth, reelHeight);
          else { fill(220); noStroke(); rect(0, 0, reelWidth, reelHeight); }
          if (upperSymbolToDisplay) image(upperSymbolToDisplay, 0, -reelHeight, reelWidth, reelHeight);
          else { fill(200); noStroke(); rect(0, -reelHeight, reelWidth, reelHeight); }
      pop();

  } else if (reel.spinSpeeds && reel.spinSpeeds.length > 0) { 
      const currentSeqOffset = reel.offset % reel.spinSequence.length;
      const currentSymbolIndexInDb = reel.spinSequence[currentSeqOffset];
      if (currentSymbolIndexInDb >= 0 && currentSymbolIndexInDb < totalImages && slotImages[currentSymbolIndexInDb]?.width > 0) {
          currentSymbolToDisplay = slotImages[currentSymbolIndexInDb];
      }
      const upperSymbolVisualIndex = (currentSymbolIndexInDb - 1 + totalImages) % totalImages;
      if (upperSymbolVisualIndex >= 0 && upperSymbolVisualIndex < totalImages && slotImages[upperSymbolVisualIndex]?.width > 0) {
          upperSymbolToDisplay = slotImages[upperSymbolVisualIndex];
      }

      push();
      translate(xPos, 150);
      noFill(); stroke(0); strokeWeight(2);
      drawingContext.beginPath();
      drawingContext.roundRect(0, 0, reelWidth, reelHeight, 20);
      drawingContext.clip();
          if (currentSymbolToDisplay) image(currentSymbolToDisplay, 0, yPositionOffset, reelWidth, reelHeight);
          else { fill(220); noStroke(); rect(0, yPositionOffset, reelWidth, reelHeight); }
          if (upperSymbolToDisplay) image(upperSymbolToDisplay, 0, yPositionOffset - reelHeight, reelWidth, reelHeight);
          else { fill(200); noStroke(); rect(0, yPositionOffset - reelHeight, reelWidth, reelHeight); }
      pop();
  } else { 
      fill(210); noStroke(); rect(xPos, 150, reelWidth, reelHeight, 20);
  }

  push();
  noFill(); stroke(0); strokeWeight(3);
  rect(xPos, 150, reelWidth, reelHeight, 20);
  pop();
}
}

function drawResultText() {
if (typeof result === 'undefined' || result === '') return;
fill(0);
textAlign(CENTER, CENTER); textSize(20);
text(result, width / 2, 370); 
}

function drawScoreBreakdown() {
if (!scoreBreakdown || scoreBreakdown.length === 0) return;

const t = 35, inner = 6, outer = 20;
const blocksWidths = scoreBreakdown.map(({ count }) => count * t + (count - 1) * inner + 50);
const totalW = blocksWidths.reduce((a, b) => a + b, 0) + (scoreBreakdown.length > 1 ? (scoreBreakdown.length - 1) * outer : 0);
let currentX = width / 2 - totalW / 2;
const yPos = 410; 

scoreBreakdown.forEach(({ imgIndex, base, multiplier, count }, idx) => {
  for (let j = 0; j < count; j++) {
    const x = currentX + j * (t + inner);
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.roundRect(x, yPos, t, t, 8);
    drawingContext.clip();
    if (imgIndex >=0 && imgIndex < slotImages.length && slotImages[imgIndex]?.width > 0) {
      image(slotImages[imgIndex], x, yPos, t, t);
    } else {
      fill(230); noStroke(); rect(x, yPos, t, t);
    }
    drawingContext.restore();
    stroke(0); strokeWeight(2); noFill();
    rect(x, yPos, t, t, 8);
    pop();
  }

  const labelX = currentX + count * t + (count > 0 ? (count - 1) * inner : 0) + 8;
  fill(0); noStroke();
  textAlign(LEFT, CENTER); textSize(12);
  text(`${base}${multiplier > 1 ? ` × ${multiplier}` : ''}`, labelX, yPos + t / 2);
  
  currentX += blocksWidths[idx] + outer;
});
}