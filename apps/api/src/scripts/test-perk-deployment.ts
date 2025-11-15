/**
 * Test script for perk deployment functionality
 * 
 * This script demonstrates how to test the perk deployment WebSocket action.
 * It can be used as a reference for integration testing.
 * 
 * Prerequisites:
 * - Two users with active WebSocket connections
 * - Users must have perks in their inventory
 * - An active match in 'in_progress' status
 */

import WebSocket from 'ws';

interface DeployPerkRequest {
  action: 'deploy_perk';
  payload: {
    matchId: string;
    perkId: string;
    targetPlayerId?: string;
    targetTicker?: string;
  };
}

interface DeployPerkResponse {
  ok: boolean;
  action: string;
  matchId?: string;
  perkId?: string;
  error?: string;
}

/**
 * Example test scenario for deploying a perk
 */
async function testPerkDeployment(
  ws: WebSocket,
  matchId: string,
  perkId: string,
  targetPlayerId?: string,
  targetTicker?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request: DeployPerkRequest = {
      action: 'deploy_perk',
      payload: {
        matchId,
        perkId,
        ...(targetPlayerId && { targetPlayerId }),
        ...(targetTicker && { targetTicker }),
      },
    };

    const timeout = setTimeout(() => {
      reject(new Error('Perk deployment timed out'));
    }, 5000);

    ws.once('message', (data: WebSocket.Data) => {
      clearTimeout(timeout);
      const response: DeployPerkResponse = JSON.parse(data.toString());
      
      console.log('Received response:', response);

      if (response.ok && response.action === 'deploy_perk') {
        console.log(`✅ Perk ${perkId} deployed successfully!`);
        resolve();
      } else {
        reject(new Error(`Failed to deploy perk: ${response.error}`));
      }
    });

    console.log('Sending perk deployment request:', request);
    ws.send(JSON.stringify(request));
  });
}

/**
 * Example: Deploy ICE perk to freeze opponent's asset
 */
async function deployIcePerk(
  ws: WebSocket,
  matchId: string,
  opponentId: string,
  ticker: string
): Promise<void> {
  console.log(`\n🧊 Deploying ICE perk on ${ticker} for opponent ${opponentId}`);
  await testPerkDeployment(ws, matchId, 'ICE', opponentId, ticker);
}

/**
 * Example: Deploy WIPE perk to remove all active perks
 */
async function deployWipePerk(
  ws: WebSocket,
  matchId: string
): Promise<void> {
  console.log('\n🧹 Deploying WIPE perk');
  await testPerkDeployment(ws, matchId, 'WIPE');
}

/**
 * Example: Deploy JUICED perk to apply 2x leverage to own asset
 */
async function deployJuicedPerk(
  ws: WebSocket,
  matchId: string,
  userId: string,
  ticker: string
): Promise<void> {
  console.log(`\n⚡ Deploying JUICED perk on own asset ${ticker}`);
  await testPerkDeployment(ws, matchId, 'JUICED', userId, ticker);
}

/**
 * Test scenario: Deploy multiple perks in sequence
 */
async function testMultiplePerkDeployments(): Promise<void> {
  const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws/match-gateway';
  const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
  const MATCH_ID = process.env.MATCH_ID || '';
  const USER_ID = process.env.USER_ID || '';
  const OPPONENT_ID = process.env.OPPONENT_ID || '';

  if (!AUTH_TOKEN || !MATCH_ID || !USER_ID || !OPPONENT_ID) {
    console.error('❌ Missing required environment variables:');
    console.error('   WS_URL, AUTH_TOKEN, MATCH_ID, USER_ID, OPPONENT_ID');
    process.exit(1);
  }

  const ws = new WebSocket(`${WS_URL}?token=${AUTH_TOKEN}`);

  ws.on('open', async () => {
    console.log('✅ WebSocket connected');

    try {
      // Deploy first perk: ICE on opponent's AAPL
      await deployIcePerk(ws, MATCH_ID, OPPONENT_ID, 'AAPL');
      
      // Wait a bit before next deployment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Deploy second perk: JUICED on own TSLA
      await deployJuicedPerk(ws, MATCH_ID, USER_ID, 'TSLA');
      
      // Wait a bit before next deployment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Deploy third perk: WIPE to clear all perks
      await deployWipePerk(ws, MATCH_ID);

      console.log('\n✅ All perks deployed successfully!');
      
      // Try to deploy a 4th perk (should fail with limit reached)
      console.log('\n🧪 Testing deployment limit (should fail)...');
      await deployIcePerk(ws, MATCH_ID, OPPONENT_ID, 'NVDA');
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error:', error.message);
      }
    } finally {
      ws.close();
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
  });

  // Listen for broadcasts
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'perk_deployed') {
        console.log('📢 Broadcast received: Perk deployed', {
          perkId: message.perkId,
          targetPlayerId: message.targetPlayerId,
          targetTicker: message.targetTicker,
        });
      }
    } catch (error) {
      // Ignore parse errors for non-JSON messages
    }
  });
}

/**
 * Test error cases
 */
async function testErrorCases(): Promise<void> {
  const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws/match-gateway';
  const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
  const MATCH_ID = process.env.MATCH_ID || '';

  console.log('\n🧪 Testing error cases...\n');

  const ws = new WebSocket(`${WS_URL}?token=${AUTH_TOKEN}`);

  ws.on('open', async () => {
    try {
      // Test 1: Deploy perk that doesn't exist in inventory
      console.log('Test 1: Deploy perk not in inventory');
      try {
        await testPerkDeployment(ws, MATCH_ID, 'NONEXISTENT_PERK');
      } catch (error) {
        console.log('✅ Expected error:', (error as Error).message);
      }

      // Test 2: Deploy perk to invalid match
      console.log('\nTest 2: Deploy perk to invalid match');
      try {
        await testPerkDeployment(ws, 'invalid-match-id', 'ICE');
      } catch (error) {
        console.log('✅ Expected error:', (error as Error).message);
      }

      // Test 3: Missing required fields
      console.log('\nTest 3: Missing required fields');
      ws.send(JSON.stringify({
        action: 'deploy_perk',
        payload: {
          matchId: MATCH_ID,
          // Missing perkId
        },
      }));

    } catch (error) {
      console.error('❌ Test error:', error);
    } finally {
      ws.close();
    }
  });
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testType = process.argv[2] || 'deployment';
  
  if (testType === 'errors') {
    testErrorCases().catch(console.error);
  } else {
    testMultiplePerkDeployments().catch(console.error);
  }
}

export {
  testPerkDeployment,
  deployIcePerk,
  deployWipePerk,
  deployJuicedPerk,
  testMultiplePerkDeployments,
  testErrorCases,
};

