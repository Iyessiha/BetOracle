import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ── 1. Smartbets Algorithm ──────────────────────────
function smartbetsPredict(p) {
  const hT = p.homeWins + p.homeDraws + p.homeLosses || 1;
  const aT = p.awayWins + p.awayDraws + p.awayLosses || 1;
  const hGF = p.homeGoalsF / hT, hGA = p.homeGoalsA / hT;
  const aGF = p.awayGoalsF / aT, aGA = p.awayGoalsA / aT;
  const xgH = (hGF + aGA) / 2, xgA = (aGF + hGA) / 2;
  const g = Math.round((xgH + xgA) * 10) / 10;
  const gg   = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-xgH)) * (1 - Math.exp(-xgA)) * 100)));
  const ov15 = Math.round(Math.min(95, Math.max(20, (1 - Math.exp(-(xgH + xgA))) * 70 + 15)));
  const ov25 = Math.round(Math.min(90, Math.max(10, (1 - Math.exp(-(xgH + xgA))) * 55 + 5)));
  const ov35 = Math.round(Math.min(80, Math.max(5,  (1 - Math.exp(-(xgH + xgA))) * 35)));
  const posAdj = ((p.homePosition ?? 10) - (p.awayPosition ?? 10)) * 0.5;
  let p1 = (p.homeWins / hT * 60) + (hGF - hGA) * 5 - posAdj;
  let p2 = (p.awayWins / aT * 60) + (aGF - hGA) * 5 + posAdj;
  let px = 100 - p1 - p2;
  const tot = Math.abs(p1) + Math.abs(px) + Math.abs(p2) || 100;
  p1 = Math.round(Math.max(5, Math.min(85, (p1 / tot) * 100)));
  p2 = Math.round(Math.max(5, Math.min(85, (p2 / tot) * 100)));
  px = 100 - p1 - p2;
  const scores = { "1": p1, "x": px, "2": p2, "1x": p1 + px, "2x": p2 + px };
  const picks = { ...scores, gg, ov15, ov25, ov35 };
  const result = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  const pick   = Object.entries(picks).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  return { g, gg, ov15, ov25, ov35, choice: Math.round(scores[result]), result, pick, p1, px, p2, xgH, xgA };
}

// ── 2. Kelly Criterion Helper ───────────────────────
function kellyStake(bankroll, odds, proba) {
  const b = odds;
  const p = proba;
  const vKelly = Math.max(0, p - (1 - p) / (b - 1));
  const vStakeRaw = bankroll * vKelly * 0.25;
  const vStake4th = Math.floor(vStakeRaw / 100) * 100;
  return {
    kelly_pct: Math.round(vKelly * 10000) / 100,
    stake_fcfa: Math.min(vStake4th, bankroll * 0.05),
    max_stake: bankroll * 0.05,
  };
}

// ── 3. Email & Domain Validation ────────────────────
const BLOCKED_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'yopmail.com', 'guerrillamail.com', 'trashmail.com'
]);

function isEmailValid(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!re.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  if (domain.length < 4) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;
  return true;
}

// ── 4. Webhook HMAC-SHA256 Verification ─────────────
function verifyHmacSignature(rawBody, signature, secret) {
  if (!secret) return true;
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const digest = hmac.digest('hex').toLowerCase();
  const cleanSig = signature.replace(/^sha256=/i, '').trim().toLowerCase();
  const bufA = Buffer.from(digest);
  const bufB = Buffer.from(cleanSig);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════

describe('🔮 Oracle Algorithm & Prediction Logic', () => {
  test('Calculates consistent probabilities summing to 100', () => {
    const stats = {
      homeWins: 12, homeDraws: 4, homeLosses: 2,
      homeGoalsF: 32, homeGoalsA: 10,
      awayWins: 5, awayDraws: 5, awayLosses: 8,
      awayGoalsF: 18, awayGoalsA: 26,
      homePosition: 2, awayPosition: 14,
    };

    const res = smartbetsPredict(stats);

    assert.ok(res.p1 >= 5 && res.p1 <= 85, 'p1 should be bounded between 5 and 85');
    assert.ok(res.p2 >= 5 && res.p2 <= 85, 'p2 should be bounded between 5 and 85');
    assert.strictEqual(res.p1 + res.px + res.p2, 100, 'Sum of p1, px, p2 must equal 100');
    assert.ok(res.xgH > res.xgA, 'Home team should have higher xG than away team');
    assert.ok(res.p1 > res.p2, 'Strong home team should have higher p1 than p2');
    assert.ok(['1', '1x'].includes(res.result), 'Expected 1 or 1X result');
  });

  test('Handles balanced fixtures without throwing or NaN', () => {
    const stats = {
      homeWins: 6, homeDraws: 6, homeLosses: 6,
      homeGoalsF: 20, homeGoalsA: 20,
      awayWins: 6, awayDraws: 6, awayLosses: 6,
      awayGoalsF: 20, awayGoalsA: 20,
      homePosition: 10, awayPosition: 10,
    };

    const res = smartbetsPredict(stats);

    assert.strictEqual(Number.isNaN(res.p1), false);
    assert.strictEqual(Number.isNaN(res.px), false);
    assert.strictEqual(Number.isNaN(res.p2), false);
    assert.strictEqual(res.p1 + res.px + res.p2, 100);
  });
});

describe('💰 Kelly Criterion Bankroll Management', () => {
  test('Calculates positive stake for positive expected value (+EV)', () => {
    const bankroll = 100000; // 100,000 FCFA
    const odds = 2.00;
    const proba = 0.60; // 60% chance for 2.00 odds = +EV

    const res = kellyStake(bankroll, odds, proba);

    assert.strictEqual(res.kelly_pct, 20); // (0.6 - 0.4) = 0.20 = 20%
    assert.ok(res.stake_fcfa > 0, 'Stake should be positive');
    assert.ok(res.stake_fcfa <= res.max_stake, 'Stake must respect 5% max bankroll cap');
  });

  test('Returns zero stake for negative expected value (-EV)', () => {
    const bankroll = 100000;
    const odds = 1.80;
    const proba = 0.40; // 40% chance for 1.80 odds = -EV

    const res = kellyStake(bankroll, odds, proba);

    assert.strictEqual(res.kelly_pct, 0);
    assert.strictEqual(res.stake_fcfa, 0);
  });
});

describe('🛡️ Security & Input Validation', () => {
  test('Validates legitimate user email addresses', () => {
    assert.strictEqual(isEmailValid('parieur@gmail.com'), true);
    assert.strictEqual(isEmailValid('yessiha@monweinfinity.com'), true);
    assert.strictEqual(isEmailValid('client+vip@betoracl.com'), true);
  });

  test('Rejects disposable and malformed email addresses', () => {
    assert.strictEqual(isEmailValid('spammer@mailinator.com'), false);
    assert.strictEqual(isEmailValid('bot@tempmail.com'), false);
    assert.strictEqual(isEmailValid('fake@yopmail.com'), false);
    assert.strictEqual(isEmailValid('invalid-email'), false);
    assert.strictEqual(isEmailValid(''), false);
    assert.strictEqual(isEmailValid(null), false);
  });

  test('Verifies HMAC-SHA256 signature for webhook security', () => {
    const secret = 'test_gp_secret_key_12345';
    const payload = JSON.stringify({ event: 'payment.completed', data: { reference: 'BOP-100' } });
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    assert.strictEqual(verifyHmacSignature(payload, hmac, secret), true);
    assert.strictEqual(verifyHmacSignature(payload, `sha256=${hmac}`, secret), true);
    assert.strictEqual(verifyHmacSignature(payload, 'wrong_signature', secret), false);
    assert.strictEqual(verifyHmacSignature('tampered_payload', hmac, secret), false);
  });
});
