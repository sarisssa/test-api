import 'dotenv/config';

type PlayerSeed = {
  label: string;
  phoneNumber: string;
  otpCode?: string;
};

type VerifyResponse = {
  message: string;
  token: string;
  user: {
    userId: string;
    phoneNumber: string;
    username?: string;
  };
};

const players: PlayerSeed[] = [
  {
    label: 'Player 1',
    phoneNumber: process.env.PLAYER_ONE_PHONE ?? '+15555550001',
  },
  {
    label: 'Player 2',
    phoneNumber: process.env.PLAYER_TWO_PHONE ?? '+15555550002',
  },
];

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const DEFAULT_OTP_CODE = process.env.TEST_PLAYER_OTP_CODE ?? '123456';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

async function postJson<T>(
  url: string,
  body: unknown,
  context: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Request failed: ${response.status} ${response.statusText} (${url}) - ${text}`
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response for ${context.action}: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

async function sendOtp(phoneNumber: string): Promise<void> {
  await postJson(
    `${API_BASE_URL}/auth/send-otp`,
    { phoneNumber },
    { action: 'send-otp', phoneNumber }
  );
}

async function verifyOtp(phoneNumber: string, code: string): Promise<VerifyResponse> {
  return await postJson<VerifyResponse>(
    `${API_BASE_URL}/auth/verify-otp`,
    { phoneNumber, code },
    { action: 'verify-otp', phoneNumber }
  );
}

async function createPlayer(seed: PlayerSeed) {
  const code = seed.otpCode ?? DEFAULT_OTP_CODE;

  console.log(`\n➡️  Creating ${seed.label} (${seed.phoneNumber})`);

  try {
    await sendOtp(seed.phoneNumber);
    console.log('   OTP send simulated (Twilio stub).');
  } catch (error) {
    console.error(`   Failed to send OTP for ${seed.label}:`, error);
    throw error;
  }

  try {
    const verifyResult = await verifyOtp(seed.phoneNumber, code);
    console.log(`   ✅ ${seed.label} authenticated.`);
    console.log(`      User ID: ${verifyResult.user.userId}`);
    console.log(`      Username: ${verifyResult.user.username ?? '(none)'}`);
    console.log(`      JWT: ${verifyResult.token}\n`);
    return verifyResult;
  } catch (error) {
    console.error(`   ❌ Failed to verify OTP for ${seed.label}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating test players via API OTP flow...');
  console.log(`   API base: ${API_BASE_URL}`);
  console.log(`   Using OTP code: ${DEFAULT_OTP_CODE}`);
  console.log(
    '   (Ensure USE_TWILIO_STUB=true in your API .env so the requests succeed without real SMS.)'
  );

  const results: VerifyResponse[] = [];

  for (const player of players) {
    try {
      const result = await createPlayer(player);
      results.push(result);
    } catch (error) {
      console.error(`   Aborting player creation due to error for ${player.label}.`);
      process.exitCode = 1;
      return;
    }
  }

  console.log('\n🎉 Finished creating players!');
  results.forEach((result, index) => {
    const seed = players[index];
    console.log(`${seed.label}:`);
    console.log(`   Phone: ${seed.phoneNumber}`);
    console.log(`   User ID: ${result.user.userId}`);
    console.log(`   JWT: ${result.token}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error creating test players:', error);
    process.exit(1);
  });
}
