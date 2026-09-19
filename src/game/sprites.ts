function shade(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((value >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((value >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((value & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createCarSprite(color: string, model = 'veloce') {
  const canvas = document.createElement('canvas');
  canvas.width = 248;
  canvas.height = 136;
  const ctx = canvas.getContext('2d')!;
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  const poly = (points: number[], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i], points[i + 1]);
      else ctx.lineTo(points[i], points[i + 1]);
    }
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = '#0d0b1ab0';
  ctx.beginPath();
  ctx.ellipse(124, 124, 115, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(20, 83, 27, 40, '#10101a');
  rect(201, 83, 27, 40, '#10101a');
  rect(23, 86, 5, 34, '#35303c');
  rect(219, 86, 5, 34, '#35303c');
  const roof = model === 'comet' ? 7 : model === 'vector' ? 17 : 12;
  poly([17, 69, 29, 54, 41, 34, 62, roof, 184, roof, 205, 34, 218, 54, 231, 69, 231, 109, 220, 119, 28, 119, 17, 109], '#160f20');
  poly([24, 68, 38, 53, 48, 33, 65, roof + 4, 181, roof + 4, 198, 33, 211, 54, 225, 68, 224, 107, 214, 114, 34, 114, 24, 105], shade(color, 0.78));
  poly([65, roof + 4, 181, roof + 4, 190, roof + 12, 56, roof + 12], shade(color, 1.32));
  poly([69, roof + 9, 178, roof + 9, 197, 55, 50, 55], '#252132');
  poly([73, roof + 12, 175, roof + 12, 187, 42, 58, 42], '#53415a');
  poly([76, roof + 13, 173, roof + 13, 178, roof + 19, 72, roof + 19], '#937080');
  for (let y = roof + 22; y < 55; y += 6) {
    const inset = Math.max(0, 54 - y) * 0.44;
    rect(50 + inset, y, 147 - inset * 2, 3, '#171925');
    rect(52 + inset, y + 3, 143 - inset * 2, 1, '#786070');
  }
  poly([35, 60, 55, 55, 193, 55, 213, 60, 226, 76, 225, 108, 23, 108, 23, 76], color);
  poly([24, 75, 38, 62, 49, 63, 43, 103, 25, 103], shade(color, 1.16));
  poly([199, 63, 211, 62, 225, 76, 224, 103, 205, 103], shade(color, 0.75));
  rect(51, 61, 145, 17, shade(color, 0.85));
  for (let i = 0; i < 4; i++) {
    rect(55, 62 + i * 4, 137, 2, '#402333');
    rect(58, 64 + i * 4, 131, 1, shade(color, 1.1));
  }
  rect(25, 78, 198, 3, shade(color, 1.35));
  rect(26, 84, 196, 20, '#452233');
  rect(30, 86, 64, 13, '#ff7469');
  rect(154, 86, 64, 13, '#ff7469');
  rect(31, 88, 62, 3, '#ffba8b');
  rect(155, 88, 62, 3, '#ffba8b');
  rect(32, 95, 60, 2, '#b03349');
  rect(156, 95, 60, 2, '#b03349');
  for (let i = 0; i < 7; i++) {
    rect(36 + i * 9, 86, 2, 13, '#7d35467a');
    rect(160 + i * 9, 86, 2, 13, '#7d35467a');
  }
  rect(98, 85, 52, 19, '#251e2b');
  rect(108, 93, 31, 11, '#e7d3b5');
  rect(111, 96, 25, 2, '#685162');
  rect(116, 99, 16, 2, '#685162');
  rect(119, 84, 9, 5, '#e4c499');
  rect(24, 106, 200, 4, shade(color, 0.65));
  rect(29, 110, 190, 7, '#25212d');
  rect(34, 110, 181, 2, '#78606a');
  rect(40, 116, 15, 7, '#aaa0a8');
  rect(193, 116, 15, 7, '#aaa0a8');
  rect(43, 118, 9, 4, '#211b28');
  rect(196, 118, 9, 4, '#211b28');
  if (model !== 'vector') {
    rect(41, 68, 5, 11, '#592333');
    rect(203, 68, 5, 11, '#592333');
    rect(13, 62, 222, 6, shade(color, 0.59));
    rect(16, 60, 216, 4, shade(color, 1.15));
    rect(16, 64, 216, 1, '#fac0ac');
  }
  rect(23, 48, 17, 7, shade(color, 0.92));
  rect(208, 48, 17, 7, shade(color, 0.8));
  return canvas;
}

export function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, flip: boolean) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale((flip ? -1 : 1) * size / 100, size / 100);
  ctx.fillStyle = '#171322';
  ctx.beginPath();
  ctx.moveTo(-5, 0); ctx.lineTo(3, 0); ctx.lineTo(17, -73);
  ctx.lineTo(25, -126); ctx.lineTo(20, -127); ctx.lineTo(9, -76);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4d2943';
  for (let i = 0; i < 12; i++) ctx.fillRect(1 + i * 1.6, -i * 10, 4, 3);
  const fronds = [
    [21, -124, -8, -147, -36, -144, -57, -126, -31, -134, -5, -135],
    [20, -124, 0, -159, -25, -164, -39, -152, -18, -154, 0, -138],
    [22, -126, 34, -161, 53, -169, 66, -165, 46, -150, 32, -128],
    [22, -125, 54, -148, 80, -142, 98, -125, 72, -132, 51, -132],
    [22, -126, 56, -125, 72, -105, 78, -83, 61, -108, 43, -115],
    [20, -127, -9, -120, -22, -101, -25, -83, -10, -109, 6, -116],
  ];
  for (const points of fronds) {
    ctx.fillStyle = '#151223';
    ctx.beginPath();
    points.forEach((value, i) => { if (i % 2 === 0) i === 0 ? ctx.moveTo(value, points[i + 1]) : ctx.lineTo(value, points[i + 1]); });
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function drawPine(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#101625';
  ctx.fillRect(x - size * 0.035, y - size, size * 0.07, size);
  for (let i = 0; i < 4; i++) {
    const top = y - size * (1.65 - i * 0.28);
    const width = size * (0.23 + i * 0.1);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + width, top + size * 0.68);
    ctx.lineTo(x - width, top + size * 0.68); ctx.closePath(); ctx.fill();
  }
}

export function drawCactus(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, flip: boolean) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale((flip ? -1 : 1) * size / 100, size / 100);
  ctx.fillStyle = '#0d1f18';
  ctx.fillRect(-9, -118, 18, 118);
  ctx.fillRect(-7, -124, 14, 8);
  ctx.fillRect(-38, -80, 30, 13);
  ctx.fillRect(-38, -110, 13, 32);
  ctx.fillRect(-36, -116, 9, 8);
  ctx.fillRect(10, -52, 26, 12);
  ctx.fillRect(23, -88, 13, 38);
  ctx.fillRect(25, -94, 9, 8);
  ctx.fillStyle = '#1c3a2c';
  ctx.fillRect(-5, -114, 2, 114);
  ctx.fillRect(2, -114, 2, 114);
  ctx.fillRect(-34, -106, 2, 28);
  ctx.fillRect(28, -84, 2, 30);
  ctx.fillStyle = '#7fe3b9';
  ctx.fillRect(-34, -119, 3, 3);
  ctx.fillRect(28, -97, 3, 3);
  ctx.fillRect(-2, -127, 4, 3);
  ctx.fillStyle = '#13251d';
  ctx.beginPath();
  ctx.ellipse(4, 2, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}